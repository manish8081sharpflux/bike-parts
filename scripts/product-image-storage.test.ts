import assert from "node:assert/strict";
import test, { after } from "node:test";
import { prisma } from "@/lib/db";
import {
  MAX_GALLERY_IMAGES,
  MAX_IMAGE_BYTES,
  MAX_IMAGE_MB,
  PRODUCT_FORM_BODY_LIMIT_BYTES,
  assertGalleryCountWithinLimit,
  validateImageUpload,
} from "@/lib/storage/image-validation";
import { deriveOwnedObjectKey, generateProductImageKey } from "@/lib/storage/keys";
import {
  deleteOwnedProductImageByUrl,
  deleteProductImageByKey,
  setStorageBackendForTests,
  uploadProductImage,
  uploadProductImages,
  type StorageBackend,
} from "@/lib/storage/product-images";
import { createProduct, deleteProduct, updateProduct } from "@/lib/actions/admin-products-core";
import nextConfig from "../next.config";

// --- Minimal, valid magic-byte signatures (padded to the 12-byte minimum the
// signature check reads) — enough to pass validateImageUpload without a real
// decodable image. ---
const JPEG_BYTES = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 0, 0, 0, 0, 0, 0, 0]);
const PNG_BYTES = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);
const WEBP_BYTES = new Uint8Array([
  ...[0x52, 0x49, 0x46, 0x46], // "RIFF"
  0, 0, 0, 0,
  ...[0x57, 0x45, 0x42, 0x50], // "WEBP"
]);
const HTML_BYTES = new TextEncoder().encode("<html><body>not an image</body></html>");

function file(name: string, type: string, bytes: Uint8Array): File {
  return new File([bytes as unknown as BlobPart], name, { type });
}

test("validateImageUpload accepts a valid JPEG", () => {
  const result = validateImageUpload({ name: "a.jpg", type: "image/jpeg", size: JPEG_BYTES.length }, JPEG_BYTES);
  assert.equal(result.ok, true);
  if (result.ok) assert.equal(result.ext, ".jpg");
});

test("validateImageUpload accepts a valid PNG", () => {
  const result = validateImageUpload({ name: "a.png", type: "image/png", size: PNG_BYTES.length }, PNG_BYTES);
  assert.equal(result.ok, true);
  if (result.ok) assert.equal(result.ext, ".png");
});

test("validateImageUpload accepts a valid WebP", () => {
  const result = validateImageUpload({ name: "a.webp", type: "image/webp", size: WEBP_BYTES.length }, WEBP_BYTES);
  assert.equal(result.ok, true);
  if (result.ok) assert.equal(result.ext, ".webp");
});

test("validateImageUpload rejects an oversized file", () => {
  const result = validateImageUpload(
    { name: "big.jpg", type: "image/jpeg", size: MAX_IMAGE_BYTES + 1 },
    JPEG_BYTES
  );
  assert.equal(result.ok, false);
  if (!result.ok) assert.ok(result.error.includes(`${MAX_IMAGE_MB}MB`));
});

test("valid image bytes exactly at the size limit are accepted", () => {
  const bytes = new Uint8Array(MAX_IMAGE_BYTES);
  bytes.set(JPEG_BYTES);
  assert.equal(validateImageUpload({ name: "limit.jpg", type: "image/jpeg", size: bytes.length }, bytes).ok, true);
});

test("maximum image payload leaves multipart headroom under the configured action limit", () => {
  assert.equal(nextConfig.experimental?.serverActions?.bodySizeLimit, PRODUCT_FORM_BODY_LIMIT_BYTES);
  assert.ok((1 + MAX_GALLERY_IMAGES) * MAX_IMAGE_BYTES <= PRODUCT_FORM_BODY_LIMIT_BYTES * 0.75);
});

test("validateImageUpload rejects SVG outright", () => {
  const svg = new TextEncoder().encode("<svg><script>alert(1)</script></svg>");
  const result = validateImageUpload({ name: "a.svg", type: "image/svg+xml", size: svg.length }, svg);
  assert.equal(result.ok, false);
});

test("validateImageUpload rejects HTML disguised as a JPEG", () => {
  const result = validateImageUpload({ name: "a.jpg", type: "image/jpeg", size: HTML_BYTES.length }, HTML_BYTES);
  assert.equal(result.ok, false);
});

test("validateImageUpload rejects an empty file", () => {
  const empty = new Uint8Array(0);
  const result = validateImageUpload({ name: "a.jpg", type: "image/jpeg", size: 0 }, empty);
  assert.equal(result.ok, false);
});

test("assertGalleryCountWithinLimit rejects too many gallery images", () => {
  assert.doesNotThrow(() => assertGalleryCountWithinLimit(MAX_GALLERY_IMAGES));
  assert.throws(() => assertGalleryCountWithinLimit(MAX_GALLERY_IMAGES + 1));
});

test("generateProductImageKey never uses the client filename and can't escape its prefix", () => {
  const key = generateProductImageKey(".jpg");
  assert.match(key, /^products\/\d{4}\/\d{2}\/[0-9a-f-]{36}\.jpg$/);
});

test("deriveOwnedObjectKey only matches our own configured base URL", () => {
  const base = "https://images.example.com";
  assert.equal(deriveOwnedObjectKey(`${base}/products/2026/01/x.jpg`, base), "products/2026/01/x.jpg");
  assert.equal(deriveOwnedObjectKey("https://evil.example.com/products/x.jpg", base), null);
  assert.equal(deriveOwnedObjectKey(`${base}/../../etc/passwd`, base), null);
  assert.equal(deriveOwnedObjectKey("/uploads/legacy.jpg", base), null);
  for (const key of ["backups/db.jpg", "private/file.jpg", "avatars/user.jpg", "products/../private/a.jpg", "/products/a.jpg"]) {
    assert.equal(deriveOwnedObjectKey(`${base}/${key}`, base), null, key);
  }
  assert.equal(deriveOwnedObjectKey(`${base}.evil.example/products/a.jpg`, base), null);
  assert.equal(deriveOwnedObjectKey(`${base}/catalog/products/a.jpg`, `${base}/catalog`), "products/a.jpg");
});

// --- Fake in-memory storage backend for lifecycle tests — no real S3/R2
// credentials or network calls involved. ---
function createFakeBackend() {
  const store = new Map<string, Uint8Array>();
  const deletedKeys: string[] = [];
  let failNextPut = false;
  let putCount = 0;

  const backend: StorageBackend = {
    async put(ext, bytes) {
      putCount++;
      if (failNextPut) {
        failNextPut = false;
        throw new Error("simulated upload failure");
      }
      const key = `products/${putCount}${ext}`;
      store.set(key, bytes);
      return { key, url: `https://fake-bucket.example.com/${key}` };
    },
    async remove(key) {
      store.delete(key);
      deletedKeys.push(key);
    },
    ownedKeyForUrl(url) {
      return deriveOwnedObjectKey(url, "https://fake-bucket.example.com");
    },
  };

  return {
    backend,
    store,
    deletedKeys,
    get putCount() { return putCount; },
    failNextPut: () => {
      failNextPut = true;
    },
  };
}

test("uploadProductImage: success stores bytes under the fake backend and returns key+url", async (t) => {
  const fake = createFakeBackend();
  setStorageBackendForTests(fake.backend);
  t.after(() => setStorageBackendForTests(null));

  const result = await uploadProductImage(file("photo.jpg", "image/jpeg", JPEG_BYTES));
  assert.ok(result);
  assert.equal(fake.store.has(result!.key), true);
  assert.equal(result!.url, `https://fake-bucket.example.com/${result!.key}`);
});

test("uploadProductImage: returns null for an empty field", async (t) => {
  const fake = createFakeBackend();
  setStorageBackendForTests(fake.backend);
  t.after(() => setStorageBackendForTests(null));

  assert.equal(await uploadProductImage(null), null);
  assert.equal(await uploadProductImage(""), null);
  assert.equal(await uploadProductImage(new File([], "")), null);
  assert.equal(fake.putCount, 0);
});

test("uploadProductImage rejects an actual zero-byte File before calling storage", async (t) => {
  const fake = createFakeBackend();
  setStorageBackendForTests(fake.backend);
  t.after(() => setStorageBackendForTests(null));
  await assert.rejects(() => uploadProductImage(new File([], "empty.jpg", { type: "image/jpeg" })), /empty/i);
  assert.equal(fake.putCount, 0);
});

test("uploadProductImages: a bad file mid-batch cleans up the earlier successful uploads in that batch", async (t) => {
  const fake = createFakeBackend();
  setStorageBackendForTests(fake.backend);
  t.after(() => setStorageBackendForTests(null));

  await assert.rejects(() =>
    uploadProductImages([
      file("good.jpg", "image/jpeg", JPEG_BYTES),
      file("bad.jpg", "image/jpeg", HTML_BYTES), // wrong signature — validation fails
    ])
  );
  assert.equal(fake.store.size, 0, "the earlier successful upload must not be left as an orphan");
});

test("deleteProductImageByKey never throws, even when the backend fails", async (t) => {
  setStorageBackendForTests({
    async put() {
      throw new Error("unused");
    },
    async remove() {
      throw new Error("backend is down");
    },
    ownedKeyForUrl() {
      return null;
    },
  });
  t.after(() => setStorageBackendForTests(null));

  await assert.doesNotReject(() => deleteProductImageByKey("some/key.jpg"));
});

test("deleteOwnedProductImageByUrl never deletes a URL outside our own base URL", async (t) => {
  const fake = createFakeBackend();
  fake.store.set("products/1.jpg", JPEG_BYTES);
  setStorageBackendForTests(fake.backend);
  t.after(() => setStorageBackendForTests(null));

  await deleteOwnedProductImageByUrl("https://someone-elses-bucket.example.com/products/1.jpg");
  assert.equal(fake.store.has("products/1.jpg"), true, "an unrelated host's URL must never be deleted");

  await deleteOwnedProductImageByUrl("https://fake-bucket.example.com/products/1.jpg");
  assert.equal(fake.store.has("products/1.jpg"), false, "our own product image should be deleted");
});

test("deleteOwnedProductImageByUrl never calls remove for same-domain non-product paths", async (t) => {
  const fake = createFakeBackend();
  setStorageBackendForTests(fake.backend);
  t.after(() => setStorageBackendForTests(null));
  for (const key of ["backups/db.jpg", "private/file.jpg", "avatars/user.jpg", "products/../private/file.jpg"]) {
    await deleteOwnedProductImageByUrl(`https://fake-bucket.example.com/${key}`);
  }
  await deleteOwnedProductImageByUrl("/uploads/legacy.jpg");
  assert.deepEqual(fake.deletedKeys, []);
});

// --- Full create/update/delete lifecycle, against the real dev database
// but with the fake backend standing in for R2 — no filesystem writes and
// no real storage credentials required. ---

const productIds: string[] = [];

function productForm(overrides: Record<string, string> = {}): FormData {
  const formData = new FormData();
  formData.set("name", overrides.name ?? "Test Brake Pad");
  formData.set("brand", overrides.brand ?? "Honda");
  formData.set("category", overrides.category ?? "Brake System");
  formData.set("price", overrides.price ?? "500");
  formData.set("gstRate", overrides.gstRate ?? "18");
  formData.set("stock", overrides.stock ?? "5");
  if (overrides.imageUrl !== undefined) formData.set("imageUrl", overrides.imageUrl);
  if (overrides.images !== undefined) formData.set("images", overrides.images);
  return formData;
}

for (const uploadedCount of [0, 2, MAX_GALLERY_IMAGES]) {
  test(`gallery limits cover ${uploadedCount} uploaded files combined with URLs, excluding main image`, async (t) => {
    const fake = createFakeBackend();
    setStorageBackendForTests(fake.backend);
    t.after(() => setStorageBackendForTests(null));
    const urls = Array.from({ length: MAX_GALLERY_IMAGES - uploadedCount }, (_, i) => `https://external.example/${i}.jpg`);
    const form = productForm({ images: urls.join("\n") });
    form.set("imageFile", file("main.jpg", "image/jpeg", JPEG_BYTES));
    for (let i = 0; i < uploadedCount; i++) form.append("imageFiles", file(`${i}.jpg`, "image/jpeg", JPEG_BYTES));
    const listing = await createProduct(form);
    productIds.push(listing.id);
    assert.equal(listing.images.length, MAX_GALLERY_IMAGES);
    assert.ok(listing.imageUrl);

    // One additional gallery entry must fail before any further storage writes,
    // for both create and update, whether it is a URL or a file.
    if (uploadedCount === 0) form.set("images", [...urls, "https://external.example/extra.jpg"].join("\n"));
    else form.append("imageFiles", file("extra.jpg", "image/jpeg", JPEG_BYTES));
    const putsBefore = fake.putCount;
    await assert.rejects(() => createProduct(form), /gallery images/);
    await assert.rejects(() => updateProduct(listing.id, form), /gallery images/);
    assert.equal(fake.putCount, putsBefore);
  });
}

test("createProduct: successful upload stores the fake backend's URL on the product", async (t) => {
  const fake = createFakeBackend();
  setStorageBackendForTests(fake.backend);
  t.after(() => setStorageBackendForTests(null));

  const formData = productForm();
  formData.set("imageFile", file("main.jpg", "image/jpeg", JPEG_BYTES));

  const listing = await createProduct(formData);
  productIds.push(listing.id);

  assert.match(listing.imageUrl ?? "", /^https:\/\/fake-bucket\.example\.com\//);
});

test("createProduct: rejects zero and negative price", async () => {
  await assert.rejects(() => createProduct(productForm({ price: "0" })), /greater than 0/);
  await assert.rejects(() => createProduct(productForm({ price: "-5" })), /greater than 0/);
});

test("createProduct: rejects delivery days where min is greater than max", async () => {
  const formData = productForm();
  formData.set("deliveryDaysMin", "10");
  formData.set("deliveryDaysMax", "3");
  await assert.rejects(() => createProduct(formData), /cannot be greater than maximum/);
});

test("createProduct: accepts a brand-new, previously unused category and subcategory with no code change", async (t) => {
  const fake = createFakeBackend();
  setStorageBackendForTests(fake.backend);
  t.after(() => setStorageBackendForTests(null));

  const formData = productForm({ name: "Test Side Stand", category: "Stands" });
  formData.set("productType", "Side Stand");
  const listing = await createProduct(formData);
  productIds.push(listing.id);
  assert.equal(listing.category, "Stands");
  assert.equal(listing.productType, "Side Stand");
});

test("createProduct then updateProduct: round-trips dynamic specifications, features, and package contents unmodified", async (t) => {
  const fake = createFakeBackend();
  setStorageBackendForTests(fake.backend);
  t.after(() => setStorageBackendForTests(null));

  const formData = productForm({ name: "Test Battery", category: "Electrical" });
  formData.set("productType", "Battery");
  formData.set("specifications", JSON.stringify([
    { name: "Voltage", value: "12V" },
    { name: "Capacity", value: "5Ah" },
    { name: "Battery Type", value: "Maintenance Free" },
  ]));
  formData.set("features", JSON.stringify([{ value: "Long life" }, { value: "Leak proof" }]));
  formData.set("packageContents", JSON.stringify([{ quantity: "1", product: "Battery" }, { quantity: "1", product: "User Manual" }]));

  const listing = await createProduct(formData);
  productIds.push(listing.id);
  assert.deepEqual(listing.specifications, [
    { name: "Voltage", value: "12V" },
    { name: "Capacity", value: "5Ah" },
    { name: "Battery Type", value: "Maintenance Free" },
  ]);
  assert.deepEqual(listing.features, ["Long life", "Leak proof"]);
  assert.equal(listing.packIncludes, "1 X Battery, 1 X User Manual");

  const updateForm = productForm({ name: "Test Battery Updated", category: "Electrical" });
  updateForm.set("specifications", JSON.stringify([{ name: "Voltage", value: "24V" }]));
  const updated = await updateProduct(listing.id, updateForm);
  assert.deepEqual(updated.specifications, [{ name: "Voltage", value: "24V" }]);
});

test("createProduct: rejects a duplicate SKU, updateProduct rejects reusing another product's SKU", async (t) => {
  const fake = createFakeBackend();
  setStorageBackendForTests(fake.backend);
  t.after(() => setStorageBackendForTests(null));

  const withSku = productForm({ name: "SKU Holder" });
  withSku.set("sku", "DUP-SKU-1");
  const firstWithSku = await createProduct(withSku);
  productIds.push(firstWithSku.id);

  const dupe = productForm({ name: "SKU Dupe" });
  dupe.set("sku", "DUP-SKU-1");
  await assert.rejects(() => createProduct(dupe), /already used by another product/);

  const second = await createProduct(productForm({ name: "SKU Other" }));
  productIds.push(second.id);
  const updateForm = productForm({ name: "SKU Other" });
  updateForm.set("sku", "DUP-SKU-1");
  await assert.rejects(() => updateProduct(second.id, updateForm), /already used by another product/);
});

test("createProduct: upload failure leaves no product row behind", async (t) => {
  const fake = createFakeBackend();
  setStorageBackendForTests(fake.backend);
  t.after(() => setStorageBackendForTests(null));

  const formData = productForm({ name: "Should Not Exist" });
  formData.set("imageFile", file("bad.jpg", "image/jpeg", HTML_BYTES));

  await assert.rejects(() => createProduct(formData));

  const found = await prisma.bikePartListing.findFirst({ where: { name: "Should Not Exist" } });
  assert.equal(found, null);
});

test("createProduct: DB failure after a successful upload cleans up the new object as an orphan", async (t) => {
  const fake = createFakeBackend();
  setStorageBackendForTests(fake.backend);
  t.after(() => setStorageBackendForTests(null));

  const originalCreate = prisma.bikePartListing.create;
  // @ts-expect-error monkeypatched for this test only, restored in t.after
  prisma.bikePartListing.create = async () => {
    throw new Error("simulated DB failure");
  };
  t.after(() => {
    prisma.bikePartListing.create = originalCreate;
  });

  const formData = productForm();
  formData.set("imageFile", file("main.jpg", "image/jpeg", JPEG_BYTES));

  await assert.rejects(() => createProduct(formData));
  assert.equal(fake.store.size, 0, "the uploaded image must be cleaned up when the DB write fails");
});

test("updateProduct: replacing the main image uploads the new one, updates the DB, then cleans up the old owned image", async (t) => {
  const fake = createFakeBackend();
  setStorageBackendForTests(fake.backend);
  t.after(() => setStorageBackendForTests(null));

  const created = await createProduct((() => {
    const formData = productForm({ name: "Replace Me" });
    formData.set("imageFile", file("old.jpg", "image/jpeg", JPEG_BYTES));
    return formData;
  })());
  productIds.push(created.id);
  const oldImageUrl = created.imageUrl!;
  assert.equal(fake.store.size, 1);

  const updateForm = productForm({ name: "Replace Me" });
  updateForm.set("imageFile", file("new.png", "image/png", PNG_BYTES));
  const updated = await updateProduct(created.id, updateForm);

  assert.notEqual(updated.imageUrl, oldImageUrl);
  assert.equal(fake.store.size, 1, "old image should be cleaned up, only the new one remains");
  assert.equal(fake.store.has(deriveKeyFromFakeUrl(updated.imageUrl!)), true);
});

test("updateProduct: DB failure after uploading a replacement preserves the old image and cleans up the new one", async (t) => {
  const fake = createFakeBackend();
  setStorageBackendForTests(fake.backend);
  t.after(() => setStorageBackendForTests(null));

  const created = await createProduct((() => {
    const formData = productForm({ name: "Preserve Me" });
    formData.set("imageFile", file("old.jpg", "image/jpeg", JPEG_BYTES));
    return formData;
  })());
  productIds.push(created.id);
  const oldImageUrl = created.imageUrl!;

  const originalUpdate = prisma.bikePartListing.update;
  // @ts-expect-error monkeypatched for this test only, restored in t.after
  prisma.bikePartListing.update = async () => {
    throw new Error("simulated DB failure");
  };
  t.after(() => {
    prisma.bikePartListing.update = originalUpdate;
  });

  const updateForm = productForm({ name: "Preserve Me" });
  updateForm.set("imageFile", file("new.png", "image/png", PNG_BYTES));
  await assert.rejects(() => updateProduct(created.id, updateForm));

  const stillThere = await prisma.bikePartListing.findUniqueOrThrow({ where: { id: created.id } });
  assert.equal(stillThere.imageUrl, oldImageUrl, "old image must still be referenced after a failed DB update");
  assert.equal(fake.store.size, 1, "only the (still-referenced) old image should remain in the bucket");
});

test("deleteProduct: hard delete attempts cleanup of owned product images", async (t) => {
  const fake = createFakeBackend();
  setStorageBackendForTests(fake.backend);
  t.after(() => setStorageBackendForTests(null));

  const created = await createProduct((() => {
    const formData = productForm({ name: "Delete Me" });
    formData.set("imageFile", file("gone.jpg", "image/jpeg", JPEG_BYTES));
    return formData;
  })());
  assert.equal(fake.store.size, 1);

  await deleteProduct(created.id);

  assert.equal(fake.store.size, 0, "owned image should be cleaned up once the product is hard-deleted");
  const found = await prisma.bikePartListing.findUnique({ where: { id: created.id } });
  assert.equal(found, null);
});

function deriveKeyFromFakeUrl(url: string): string {
  return url.slice("https://fake-bucket.example.com/".length);
}

after(async () => {
  if (productIds.length) {
    await prisma.bikePartListing.deleteMany({ where: { id: { in: productIds } } }).catch(() => {});
  }
});
