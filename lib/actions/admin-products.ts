"use server";

import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { requireAdminAction } from "@/lib/auth/require-admin";
import { readProductDetails } from "@/lib/products/product-details";
import { syncListingSearch } from "@/lib/search/meilisearch-http";
import type { ListingStatus } from "@prisma/client";

const LISTING_STATUSES: ListingStatus[] = ["DRAFT", "ACTIVE", "RESERVED", "SOLD", "ARCHIVED"];

// Uploaded product photos land in public/uploads, served at /uploads/<file> —
// same as any other file under public/, no extra route or storage service needed.
const UPLOAD_DIR = path.join(process.cwd(), "public", "uploads");
const MAX_UPLOAD_BYTES = 8 * 1024 * 1024; // 8MB

// Uploaded files land in public/uploads and are served back out completely
// publicly, at whatever extension they're saved with. The extension used to
// come straight from the client-supplied filename — so a file named
// "x.html" or "x.svg" (SVG can carry a <script>) would be saved and served
// as-is, opening stored-XSS/phishing hosted on this app's own origin. Now
// the saved extension is derived from the actual (browser-reported) MIME
// type against this allowlist instead, and anything outside it is rejected
// — the client filename is never trusted for what gets written to disk.
const ALLOWED_IMAGE_TYPES: Record<string, string> = {
  "image/jpeg": ".jpg",
  "image/png": ".png",
  "image/webp": ".webp",
  "image/gif": ".gif",
};

/** Saves one uploaded image to public/uploads and returns its public URL, or null if the field was left empty. */
async function saveUploadedImage(file: FormDataEntryValue | null): Promise<string | null> {
  if (!(file instanceof File) || file.size === 0 || !file.name) {
    return null;
  }
  if (file.size > MAX_UPLOAD_BYTES) {
    throw new Error(`"${file.name}" is larger than 8MB — please upload a smaller image.`);
  }
  const ext = ALLOWED_IMAGE_TYPES[file.type];
  if (!ext) {
    throw new Error(`"${file.name}" isn't a supported image type — use JPG, PNG, WEBP, or GIF.`);
  }

  await mkdir(UPLOAD_DIR, { recursive: true });
  const filename = `${randomUUID()}${ext}`;
  const buffer = Buffer.from(await file.arrayBuffer());
  await writeFile(path.join(UPLOAD_DIR, filename), buffer);

  return `/uploads/${filename}`;
}

/** Saves every non-empty file under a (possibly multi-value) form field. */
async function saveUploadedImages(formData: FormData, key: string): Promise<string[]> {
  const files = formData.getAll(key);
  const saved = await Promise.all(files.map((file) => saveUploadedImage(file)));
  return saved.filter((url): url is string => url !== null);
}

function slugify(name: string) {
  return (
    name
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/(^-|-$)/g, "") || "part"
  );
}

async function uniqueSlug(base: string, ignoreId?: string) {
  let slug = base;
  let attempt = 1;

  while (
    await prisma.bikePartListing.findFirst({
      where: { slug, ...(ignoreId ? { id: { not: ignoreId } } : {}) },
      select: { id: true },
    })
  ) {
    slug = `${base}-${attempt++}`;
  }

  return slug;
}

/** Splits a textarea's contents on commas and/or newlines into trimmed, non-empty entries. */
function readList(formData: FormData, key: string): string[] {
  return String(formData.get(key) ?? "")
    .split(/[\n,]/)
    .map((entry) => entry.trim())
    .filter(Boolean);
}

/** Reads an optional numeric field, returning null for blank input rather than 0/NaN. */
function readOptionalNumber(formData: FormData, key: string): number | null {
  const raw = String(formData.get(key) ?? "").trim();
  if (!raw) {
    return null;
  }
  const value = Number(raw);
  if (!Number.isFinite(value)) throw new Error(key + " must be a valid number.");
  return value;
}

function readOptionalText(formData: FormData, key: string): string | null {
  return String(formData.get(key) ?? "").trim() || null;
}

async function readProductForm(formData: FormData) {
  const name = String(formData.get("name") ?? "").trim();
  const brand = String(formData.get("brand") ?? "").trim();
  const category = String(formData.get("category") ?? "").trim();
  const description = String(formData.get("description") ?? "").trim();
  const priceRaw = String(formData.get("price") ?? "");
  const gstRateRaw = String(formData.get("gstRate") ?? "").trim();
  const gstRate = Number(gstRateRaw);
  if (!gstRateRaw || !Number.isFinite(gstRate) || gstRate < 0 || gstRate > 100) {
    throw new Error("GST must be a valid percentage between 0 and 100.");
  }
  const stockRaw = String(formData.get("stock") ?? "0");
  const typedImageUrl = String(formData.get("imageUrl") ?? "").trim() || null;
  const uploadedImageUrl = await saveUploadedImage(formData.get("imageFile"));
  const imageUrl = uploadedImageUrl ?? typedImageUrl;
  const statusRaw = String(formData.get("status") ?? "ACTIVE");

  const price = Number(priceRaw);
  const stock = Number(stockRaw);
  const status = LISTING_STATUSES.includes(statusRaw as ListingStatus)
    ? (statusRaw as ListingStatus)
    : "ACTIVE";

  if (!name || !brand || !category) {
    throw new Error("Name, brand, and category are required.");
  }
  if (!Number.isFinite(price) || price < 0) {
    throw new Error("Price must be a valid non-negative number.");
  }
  // The `price` column is Decimal(10,2) — anything ≥ 10^8 overflows it.
  // Without this check the Prisma write throws a raw Postgres
  // "numeric field overflow" error straight to the admin (internal schema
  // details like "precision 10, scale 2" included) instead of a clean,
  // actionable message.
  if (price >= 100_000_000) {
    throw new Error("Price must be less than ₹10,00,00,000.");
  }
  if (!Number.isInteger(stock) || stock < 0) {
    throw new Error("Stock must be a valid non-negative number.");
  }
  // The `stock` column is a 32-bit int — same overflow concern as price.
  if (stock > 2_147_483_647) {
    throw new Error("Stock is too large — must be 2,147,483,647 or less.");
  }

  const details = readProductDetails(formData);

  const weightKg = readOptionalNumber(formData, "weightKg");
  if (weightKg !== null && weightKg < 0) {
    throw new Error("Weight must be a non-negative number.");
  }
  // `weightKg` is Decimal(6,3) — overflows at 10^3.
  if (weightKg !== null && weightKg >= 1000) {
    throw new Error("Weight must be less than 1000 kg.");
  }

  const warrantyMonths = readOptionalNumber(formData, "warrantyMonths");
  if (warrantyMonths !== null && (!Number.isInteger(warrantyMonths) || warrantyMonths < 0)) {
    throw new Error("Warranty must be a non-negative whole number.");
  }

  const uploadedGalleryUrls = await saveUploadedImages(formData, "imageFiles");

  return {
    name,
    brand,
    category,
    description,
    price,
    gstRate,
    stock,
    imageUrl,
    images: [...readList(formData, "images"), ...uploadedGalleryUrls],
    ...details,
    productType: readOptionalText(formData, "productType"),
    oemPartNumber: readOptionalText(formData, "oemPartNumber"),
    searchTags: [...new Set(readList(formData, "searchTags"))],
    searchSynced: false,
    sku: readOptionalText(formData, "sku"),
    material: readOptionalText(formData, "material"),
    finish: readOptionalText(formData, "finish"),
    packIncludes: details.packageContents.join(", ") || null,
    weightKg,
    warrantyMonths: warrantyMonths !== null ? Math.round(warrantyMonths) : null,
    countryOfOrigin: readOptionalText(formData, "countryOfOrigin"),
    offerLabel: readOptionalText(formData, "offerLabel"),
    compatibleModels: [...new Set(details.compatibleVehicles.map((vehicle) => vehicle.model))],
    status,
  };
}

export async function createProductAction(formData: FormData) {
  await requireAdminAction();

  try {
    const data = await readProductForm(formData);
    const slug = await uniqueSlug(slugify(data.name));

    const listing = await prisma.bikePartListing.create({
      data: { ...data, slug },
    });
    if (await syncListingSearch(listing)) {
      await prisma.bikePartListing.update({ where: { id: listing.id }, data: { searchSynced: true } });
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not create product.";
    redirect(`/admin/products/new?error=${encodeURIComponent(message)}`);
  }

  revalidatePath("/admin/products");
  redirect("/admin/products");
}

export async function updateProductAction(id: string, formData: FormData) {
  await requireAdminAction();

  try {
    const data = await readProductForm(formData);
    const slug = await uniqueSlug(slugify(data.name), id);

    const listing = await prisma.bikePartListing.update({
      where: { id },
      data: { ...data, slug },
    });
    if (await syncListingSearch(listing)) {
      await prisma.bikePartListing.update({ where: { id }, data: { searchSynced: true } });
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not update product.";
    redirect(`/admin/products/${id}?error=${encodeURIComponent(message)}`);
  }

  revalidatePath("/admin/products");
  redirect("/admin/products");
}

export async function deleteProductAction(id: string) {
  await requireAdminAction();
  const listing = await prisma.bikePartListing.findUnique({ where: { id } });

  try {
    await prisma.bikePartListing.delete({ where: { id } });
  } catch {
    // If the listing has order history it can't be hard-deleted (onDelete: Restrict
    // is not set here, but we still guard); archive instead so past orders stay intact.
    // Also swallow this one — e.g. a double-click firing two deletes for the
    // same row means this fallback update has nothing left to archive
    // either, which would otherwise surface as an unhandled server error.
    await prisma.bikePartListing
      .update({ where: { id }, data: { status: "ARCHIVED" } })
      .catch(() => {});
  }

  if (listing) {
    const remaining = await prisma.bikePartListing.findUnique({ where: { id } });
    await syncListingSearch(remaining ?? { ...listing, status: "ARCHIVED" });
  }
  revalidatePath("/admin/products");
}
