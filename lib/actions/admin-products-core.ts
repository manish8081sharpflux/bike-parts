/**
 * Core product create/update/delete logic — validation, image upload
 * orchestration, and the DB write. Deliberately NOT a "use server" module:
 * admin-products.ts (which is) only re-exports the auth-gated *Action
 * wrappers around these, never these directly. Since nothing here has
 * "use server", these functions can never be assigned a Server Action ID
 * reachable from the client, regardless of what imports them later —
 * requireAdminAction() staying mandatory for every real entry point isn't
 * just a convention, it's structurally the only way in.
 *
 * The split also means this logic — which needs no Next.js request context
 * (requireAdminAction's cookies() does) — can be exercised directly in
 * tests. See scripts/product-image-storage.test.ts.
 */
import { prisma } from "@/lib/db";
import { readProductDetails } from "@/lib/products/product-details";
import { deleteListingSearchDocument, syncListingSearch } from "@/lib/search/meilisearch-http";
import {
  deleteOwnedProductImagesByUrl,
  deleteProductImagesByKey,
  uploadProductImage,
  uploadProductImages,
  type UploadedImage,
} from "@/lib/storage/product-images";
import { assertGalleryCountWithinLimit } from "@/lib/storage/image-validation";
import type { ListingStatus } from "@prisma/client";

const LISTING_STATUSES: ListingStatus[] = ["DRAFT", "ACTIVE", "RESERVED", "SOLD", "ARCHIVED"];

/** Counts non-empty files under a (possibly multi-value) form field, without reading their contents yet. */
function countFiles(formData: FormData, key: string): number {
  return formData.getAll(key).filter((entry) => entry instanceof File && entry.size > 0).length;
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

function readProductForm(formData: FormData) {
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

  return {
    name,
    brand,
    category,
    description,
    price,
    gstRate,
    stock,
    imageUrl: typedImageUrl,
    images: readList(formData, "images"),
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

/**
 * Validate, upload images, write the DB row — with orphan cleanup on any
 * failure along the way. Caller (createProductAction) is responsible for
 * the admin-auth check.
 */
export async function createProduct(formData: FormData) {
  // Uploaded main image + gallery photos for a newly created product, in
  // case product creation fails and they need to be cleaned up as orphans.
  let uploadedMain: UploadedImage | null = null;
  let uploadedGallery: UploadedImage[] = [];

  const data = readProductForm(formData);
  assertGalleryCountWithinLimit(data.images.length + countFiles(formData, "imageFiles"));

  try {
    uploadedMain = await uploadProductImage(formData.get("imageFile"));
    uploadedGallery = await uploadProductImages(formData.getAll("imageFiles"));
  } catch (uploadError) {
    if (uploadedMain) await deleteProductImagesByKey([uploadedMain.key]);
    throw uploadError;
  }

  const imageUrl = uploadedMain?.url ?? data.imageUrl;
  const images = [...data.images, ...uploadedGallery.map((image) => image.url)];
  const slug = await uniqueSlug(slugify(data.name));

  let listing;
  try {
    listing = await prisma.bikePartListing.create({
      data: { ...data, imageUrl, images, slug },
    });
  } catch (dbError) {
    const orphanKeys = [...(uploadedMain ? [uploadedMain.key] : []), ...uploadedGallery.map((image) => image.key)];
    await deleteProductImagesByKey(orphanKeys);
    throw dbError;
  }

  if (await syncListingSearch(listing)) {
    await prisma.bikePartListing.update({ where: { id: listing.id }, data: { searchSynced: true } });
  }

  return listing;
}

/** Caller (updateProductAction) is responsible for the admin-auth check. */
export async function updateProduct(id: string, formData: FormData) {
  let uploadedMain: UploadedImage | null = null;
  let uploadedGallery: UploadedImage[] = [];

  const existing = await prisma.bikePartListing.findUniqueOrThrow({ where: { id } });
  const data = readProductForm(formData);
  assertGalleryCountWithinLimit(data.images.length + countFiles(formData, "imageFiles"));

  // Upload whatever new images were submitted before touching the DB or
  // the old images at all — if this fails, the product keeps its
  // existing images untouched.
  try {
    uploadedMain = await uploadProductImage(formData.get("imageFile"));
    uploadedGallery = await uploadProductImages(formData.getAll("imageFiles"));
  } catch (uploadError) {
    if (uploadedMain) await deleteProductImagesByKey([uploadedMain.key]);
    throw uploadError;
  }

  const imageUrl = uploadedMain?.url ?? data.imageUrl;
  const images = [...data.images, ...uploadedGallery.map((image) => image.url)];
  const slug = await uniqueSlug(slugify(data.name), id);

  let listing;
  try {
    listing = await prisma.bikePartListing.update({
      where: { id },
      data: { ...data, imageUrl, images, slug },
    });
  } catch (dbError) {
    // DB write failed — the newly uploaded images are orphans (the old,
    // still-referenced ones are untouched since we haven't gotten here).
    const orphanKeys = [...(uploadedMain ? [uploadedMain.key] : []), ...uploadedGallery.map((image) => image.key)];
    await deleteProductImagesByKey(orphanKeys);
    throw dbError;
  }

  // DB write succeeded — now it's safe to best-effort clean up whichever
  // old, owned images are no longer referenced by the updated product.
  const removedUrls = [
    ...(existing.imageUrl && existing.imageUrl !== imageUrl ? [existing.imageUrl] : []),
    ...existing.images.filter((url) => !images.includes(url)),
  ];
  await deleteOwnedProductImagesByUrl(removedUrls);

  if (await syncListingSearch(listing)) {
    await prisma.bikePartListing.update({ where: { id }, data: { searchSynced: true } });
  }

  return listing;
}

/** Caller (deleteProductAction) is responsible for the admin-auth check. */
export async function deleteProduct(id: string) {
  const listing = await prisma.bikePartListing.findUnique({ where: { id } });

  let hardDeleted = false;
  try {
    await prisma.bikePartListing.delete({ where: { id } });
    hardDeleted = true;
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

  if (hardDeleted) {
    // The row is gone for good — just make sure search stops returning it.
    // Never attempt to sync an "archived copy" after a real delete.
    await deleteListingSearchDocument(id);
  } else if (listing) {
    // Hard-delete failed (order history references it) and it was archived
    // instead — sync that ARCHIVED status so search removes it too, and
    // record whether that desired state was actually reached (see
    // searchSynced's semantics: true here means "confirmed removed from
    // search", not "was ever added").
    const archived = await prisma.bikePartListing.findUnique({ where: { id } });
    if (archived) {
      const synced = await syncListingSearch(archived);
      await prisma.bikePartListing.update({ where: { id }, data: { searchSynced: synced } }).catch(() => {});
    }
  }

  // Only clean up images once the listing is actually gone — an archived
  // (not deleted) product still shows its images in past-order history.
  // Best-effort and never blocks on failure: the DB state above is already final.
  if (hardDeleted && listing) {
    const ownedUrls = [listing.imageUrl, ...listing.images].filter((url): url is string => Boolean(url));
    await deleteOwnedProductImagesByUrl(ownedUrls).catch((error) => {
      console.error("[admin-products] product image cleanup failed for", id, error);
    });
  }
}
