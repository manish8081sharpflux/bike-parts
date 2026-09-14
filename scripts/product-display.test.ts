import test from "node:test";
import assert from "node:assert/strict";
import { buildGalleryImages, formatDeliveryEstimate, getProductDisplayMeta } from "../app/home/utils";

function product(overrides = {}) {
  return {
    id: "p1",
    name: "Test Brake Pad",
    brand: "Honda",
    category: "Brake System",
    price: "500",
    gstRate: 18,
    image: "/assets/main.jpg",
    images: [],
    stock: 5,
    description: "",
    sku: null,
    oemPartNumber: null,
    productType: null,
    specifications: [],
    compatibleVehicles: [],
    features: [],
    searchTags: [],
    material: null,
    finish: null,
    packIncludes: null,
    weightKg: null,
    warrantyMonths: null,
    countryOfOrigin: null,
    rating: null,
    deliveryDaysMin: null,
    deliveryDaysMax: null,
    offerLabel: null,
    compatibleModels: [],
    ...overrides,
  };
}

// --- Part A: gallery images come only from the product's own fields ---

test("gallery: main image plus 3 gallery images returns 4 unique entries, main first", () => {
  const p = product({ image: "/main.jpg", images: ["/back.jpg", "/side.jpg", "/box.jpg"] });
  assert.deepEqual(buildGalleryImages(p), ["/main.jpg", "/back.jpg", "/side.jpg", "/box.jpg"]);
});

test("gallery: only a main image returns a single-entry array (caller hides the strip)", () => {
  const p = product({ image: "/main.jpg", images: [] });
  assert.deepEqual(buildGalleryImages(p), ["/main.jpg"]);
});

test("gallery: a duplicate URL (main image re-listed in the gallery) is deduplicated", () => {
  const p = product({ image: "/main.jpg", images: ["/main.jpg", "/side.jpg"] });
  assert.deepEqual(buildGalleryImages(p), ["/main.jpg", "/side.jpg"]);
});

test("gallery: never includes another product's images — only this product's own fields are read", () => {
  const p = product({ image: "/only-mine.jpg", images: ["/mine-2.jpg"] });
  const gallery = buildGalleryImages(p);
  assert.ok(gallery.every((url) => url.includes("mine")));
});

// --- Part B: delivery estimate formatting ---

test("delivery: min and max both set, different values, shows a range", () => {
  assert.equal(formatDeliveryEstimate(3, 5), "3-5 days");
});

test("delivery: min and max equal collapses to a single value", () => {
  assert.equal(formatDeliveryEstimate(3, 3), "3 days");
});

test("delivery: min only shows an open-ended 'From N days'", () => {
  assert.equal(formatDeliveryEstimate(3, null), "From 3 days");
});

test("delivery: max only shows an open-ended 'Up to N days'", () => {
  assert.equal(formatDeliveryEstimate(null, 5), "Up to 5 days");
});

test("delivery: neither set returns null — never a fabricated fallback like '2-3 days'", () => {
  assert.equal(formatDeliveryEstimate(null, null), null);
});

// --- Part C: no synthetic ratings ---

test("rating: a real product.rating is returned as-is", () => {
  const products = [product({ name: "A", rating: 4.5 })];
  assert.equal(getProductDisplayMeta(products, products[0]).rating, 4.5);
});

test("rating: null product.rating stays null — no synthetic fallback value", () => {
  const products = [product({ name: "A", rating: null })];
  assert.equal(getProductDisplayMeta(products, products[0]).rating, null);
});

test("rating: no synthetic rating is derived from product index or name length", () => {
  // Multiple unrated products at different catalog positions and with very
  // different name lengths must ALL come back null — none of the old
  // `4.1 + ((index + name.length) % 5) / 10` style fabrication.
  const products = [
    product({ name: "A", rating: null }),
    product({ name: "A Much Longer Product Name Than The First", rating: null }),
    product({ name: "Zzz", rating: null }),
  ];
  for (const p of products) {
    assert.equal(getProductDisplayMeta(products, p).rating, null);
  }
});

test("delivery estimate is also never fabricated from product index when both fields are unset", () => {
  const products = [
    product({ name: "A", deliveryDaysMin: null, deliveryDaysMax: null }),
    product({ name: "B", deliveryDaysMin: null, deliveryDaysMax: null }),
    product({ name: "C", deliveryDaysMin: null, deliveryDaysMax: null }),
  ];
  for (const p of products) {
    assert.equal(getProductDisplayMeta(products, p).deliveryDays, null);
  }
});

// --- Part D/E: optional fields never produce undefined/NaN artifacts ---

test("getProductDisplayMeta never returns NaN/undefined for rating or deliveryDays on a fully-blank product", () => {
  const p = product({ rating: null, deliveryDaysMin: null, deliveryDaysMax: null });
  const meta = getProductDisplayMeta([p], p);
  assert.equal(meta.rating, null);
  assert.equal(meta.deliveryDays, null);
  assert.notEqual(meta.rating, undefined);
  assert.notEqual(meta.deliveryDays, undefined);
  assert.ok(!Number.isNaN(meta.rating));
});
