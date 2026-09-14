import assert from "node:assert/strict";
import test, { after } from "node:test";
import { prisma } from "@/lib/db";
import { createProductReview, editProductReview, getProductReviews, getRatingSummaries, ReviewError, validateReview } from "@/lib/reviews/service";
import { compareProductRatings, EMPTY_RATING } from "@/lib/reviews/types";
import { getStorefrontProducts, mapListingToProduct } from "@/lib/storefront-catalog";
import { createProduct, updateProduct } from "@/lib/actions/admin-products-core";
import { markReturnReceived, requestReturn, approveReturn } from "@/lib/order-return-state";

const suffix = `review-test-${Date.now()}-${process.pid}`;
const users: string[] = [], orders: string[] = [], listings: string[] = [];

async function purchase(options: { userId?: string; listingId?: string; status?: "DELIVERED" | "PACKED" } = {}) {
  const userId = options.userId ?? (await prisma.user.create({ data: { name: "Private Name", email: `${suffix}-${users.length}@example.invalid` } })).id;
  if (!options.userId) users.push(userId);
  const listingId = options.listingId ?? (await prisma.bikePartListing.create({ data: {
    name: `${suffix}-${listings.length}`, slug: `${suffix}-${listings.length}`, brand: "Test", category: "Engine", price: 100, rating: 5,
  } })).id;
  if (!options.listingId) listings.push(listingId);
  const order = await prisma.order.create({ data: {
    buyerId: userId, customerName: "Private Name", customerPhone: "0000000000", itemsTotal: 100, amount: 100,
    deliveryAddress: {}, paymentStatus: "PAID", status: options.status ?? "DELIVERED",
    items: { create: { listingId, productName: "Test part", unitPrice: 100, quantity: 1 } },
  }, include: { items: true } });
  orders.push(order.id);
  return { userId, listingId, orderId: order.id, itemId: order.items[0].id };
}

const isError = (status: number) => (error: unknown) => error instanceof ReviewError && error.status === status;

test("delivered buyer can review; purchase relations come from the order item", async () => {
  const p = await purchase();
  const review = await createProductReview(p.userId, p.orderId, p.itemId, { rating: 4, reviewText: "  Exact fit.  " });
  assert.equal(review.rating, 4); assert.equal(review.reviewText, "Exact fit.");
  assert.equal(review.listingId, p.listingId); assert.equal(review.orderId, p.orderId);
  assert.equal(review.orderItemId, p.itemId); assert.equal(review.userId, p.userId);
});

test("undelivered order cannot be reviewed", async () => {
  const p = await purchase({ status: "PACKED" });
  await assert.rejects(createProductReview(p.userId, p.orderId, p.itemId, { rating: 4 }), isError(409));
});

test("another customer cannot review the purchase", async () => {
  const p = await purchase(), other = await purchase();
  await assert.rejects(createProductReview(other.userId, p.orderId, p.itemId, { rating: 4 }), isError(404));
});

test("item from a different order and arbitrary items are rejected", async () => {
  const p = await purchase(), other = await purchase({ userId: p.userId });
  await assert.rejects(createProductReview(p.userId, p.orderId, other.itemId, { rating: 4 }), isError(404));
  await assert.rejects(createProductReview(p.userId, p.orderId, "missing-item", { rating: 4 }), isError(404));
});

test("client cannot inject a product, order, or user identity", async () => {
  const p = await purchase();
  for (const field of ["listingId", "orderId", "orderItemId", "userId"]) {
    await assert.rejects(createProductReview(p.userId, p.orderId, p.itemId, { rating: 4, [field]: "forged" }), isError(400));
  }
});

test("legacy items without a listing cannot be reviewed", async () => {
  const p = await purchase();
  await prisma.orderItem.update({ where: { id: p.itemId }, data: { listingId: null } });
  await assert.rejects(createProductReview(p.userId, p.orderId, p.itemId, { rating: 4 }), isError(404));
});

test("concurrent duplicate submissions create exactly one review", async () => {
  const p = await purchase();
  const results = await Promise.allSettled([1, 2].map(() => createProductReview(p.userId, p.orderId, p.itemId, { rating: 4 })));
  assert.equal(results.filter((r) => r.status === "fulfilled").length, 1);
  const rejected = results.find((r) => r.status === "rejected");
  assert.ok(rejected?.status === "rejected" && isError(409)(rejected.reason));
  assert.equal(await prisma.productReview.count({ where: { orderItemId: p.itemId } }), 1);
});

test("same product purchased again can receive another review", async () => {
  const p = await purchase(), again = await purchase({ userId: p.userId, listingId: p.listingId });
  await createProductReview(p.userId, p.orderId, p.itemId, { rating: 5 });
  await createProductReview(again.userId, again.orderId, again.itemId, { rating: 3 });
  assert.equal(await prisma.productReview.count({ where: { userId: p.userId, listingId: p.listingId } }), 2);
});

for (const rating of [0, -1, 6, 4.5, "5", null, undefined, NaN, Infinity]) {
  test(`reject invalid rating ${String(rating)}`, () => assert.throws(() => validateReview({ rating }), isError(400)));
}

test("review text is optional, trimmed, bounded and strictly typed", () => {
  assert.deepEqual(validateReview({ rating: 1 }), { rating: 1, reviewText: null });
  assert.deepEqual(validateReview({ rating: 5, reviewText: "   " }), { rating: 5, reviewText: null });
  assert.equal(validateReview({ rating: 5, reviewText: "a".repeat(2000) }).reviewText?.length, 2000);
  assert.throws(() => validateReview({ rating: 5, reviewText: "a".repeat(2001) }), isError(400));
  assert.throws(() => validateReview({ rating: 5, reviewText: 42 }), isError(400));
});

test("database independently enforces integer range and purchase uniqueness", async () => {
  const p = await purchase();
  const review = await createProductReview(p.userId, p.orderId, p.itemId, { rating: 4 });
  await assert.rejects(prisma.productReview.update({ where: { id: review.id }, data: { rating: 6 } }));
  const duplicate = { ...review, id: undefined };
  await assert.rejects(prisma.productReview.create({ data: duplicate }), (e: unknown) => (e as { code: string }).code === "P2002");
});

test("customer edit preserves purchase binding and updates only review content", async () => {
  const p = await purchase();
  const original = await createProductReview(p.userId, p.orderId, p.itemId, { rating: 5 });
  const edited = await editProductReview(p.userId, original.id, { rating: 2, reviewText: "Updated fit feedback" });
  for (const key of ["id", "userId", "orderId", "orderItemId", "listingId"] as const) assert.equal(edited[key], original[key]);
  assert.equal(edited.createdAt.getTime(), original.createdAt.getTime());
  assert.ok(edited.updatedAt >= original.updatedAt); assert.equal(edited.rating, 2);
  await assert.rejects(editProductReview(p.userId, original.id, { rating: 4, listingId: "other" }), isError(400));
});

test("another customer cannot edit a review", async () => {
  const p = await purchase(), other = await purchase();
  const review = await createProductReview(p.userId, p.orderId, p.itemId, { rating: 5 });
  await assert.rejects(editProductReview(other.userId, review.id, { rating: 1 }), isError(404));
  assert.equal((await prisma.productReview.findUniqueOrThrow({ where: { id: review.id } })).rating, 5);
});

test("aggregates are accurate, update on edit, and legacy listing.rating has no effect", async () => {
  const p = await purchase(), other = await purchase({ listingId: p.listingId });
  const review = await createProductReview(p.userId, p.orderId, p.itemId, { rating: 5 });
  await createProductReview(other.userId, other.orderId, other.itemId, { rating: 3 });
  assert.deepEqual((await getRatingSummaries([p.listingId])).get(p.listingId), { ratingAverage: 4, ratingCount: 2 });
  await editProductReview(p.userId, review.id, { rating: 1 });
  assert.deepEqual((await getRatingSummaries([p.listingId])).get(p.listingId), { ratingAverage: 2, ratingCount: 2 });
  const products = await getStorefrontProducts();
  assert.equal(products.find((item) => item.id === p.listingId)?.ratingAverage, 2);
});

test("unreviewed products expose null average and zero count despite old manual ratings", async () => {
  const p = await purchase();
  const listing = await prisma.bikePartListing.findUniqueOrThrow({ where: { id: p.listingId } });
  const product = mapListingToProduct(listing);
  assert.equal(product.ratingAverage, null); assert.equal(product.ratingCount, 0);
  assert.equal((await getRatingSummaries([p.listingId])).get(p.listingId), undefined);
  const page = await getProductReviews(p.listingId);
  assert.equal(page.ratingAverage, null); assert.equal(page.ratingCount, 0); assert.deepEqual(page.reviews, []);
});

test("rating sort uses averages then counts and places unrated products last", () => {
  const rated = [EMPTY_RATING, { ratingAverage: 4.8, ratingCount: 2 }, { ratingAverage: 4.8, ratingCount: 150 }, { ratingAverage: 5, ratingCount: 1 }];
  assert.deepEqual(rated.sort(compareProductRatings).map((r) => r.ratingCount), [1, 150, 2, 0]);
});

test("public reviews are bounded, cursor-paginated, and contain no customer or purchase identifiers", async () => {
  const p = await purchase();
  for (let i = 0; i < 12; i++) {
    const item = i === 0 ? p : await purchase({ userId: p.userId, listingId: p.listingId });
    await createProductReview(item.userId, item.orderId, item.itemId, { rating: 4, reviewText: "Fits well" });
  }
  const first = await getProductReviews(p.listingId);
  assert.equal(first.reviews.length, 10); assert.equal(first.ratingCount, 12); assert.ok(first.nextCursor);
  const second = await getProductReviews(p.listingId, first.nextCursor!);
  assert.equal(second.reviews.length, 2); assert.equal(second.nextCursor, null);
  assert.equal(new Set([...first.reviews, ...second.reviews].map((r) => r.id)).size, 12);
  const json = JSON.stringify(first);
  for (const secret of [p.userId, p.orderId, p.itemId, "Private Name", "0000000000", "@example.invalid", "email", "phone"]) assert.ok(!json.includes(secret));
  await assert.rejects(getProductReviews(p.listingId, "invalid"), isError(400));
});

test("unpublished product reviews are not publicly readable", async () => {
  const p = await purchase();
  await prisma.bikePartListing.update({ where: { id: p.listingId }, data: { status: "ARCHIVED" } });
  await assert.rejects(getProductReviews(p.listingId), isError(404));
});

test("return/receipt/refund keeps reviews and averages; returned purchase can still be edited", async () => {
  const p = await purchase();
  const review = await createProductReview(p.userId, p.orderId, p.itemId, { rating: 3 });
  await requestReturn(p.orderId, "Poor fit"); await approveReturn(p.orderId, "Accepted");
  await prisma.order.update({ where: { id: p.orderId }, data: { returnStatus: "PICKED_UP" } });
  await markReturnReceived(p.orderId, "Received", "DAMAGED");
  await prisma.order.update({ where: { id: p.orderId }, data: { paymentStatus: "REFUNDED", refundStatus: "REFUNDED" } });
  await editProductReview(p.userId, review.id, { rating: 2, reviewText: "Returned due to fit" });
  const result = await getProductReviews(p.listingId);
  assert.equal(result.ratingAverage, 2); assert.equal(result.ratingCount, 1); assert.equal(result.reviews[0].returned, true);
});

test("admin create/update cannot inject manual or customer ratings", async () => {
  const form = new FormData();
  for (const [key, value] of Object.entries({ name: `${suffix}-admin`, brand: "Test", category: "Engine", price: "100", gstRate: "18", stock: "2", status: "DRAFT", rating: "5", ratingAverage: "5", ratingCount: "100" })) form.set(key, value);
  const listing = await createProduct(form); listings.push(listing.id);
  await updateProduct(listing.id, form);
  const result = await prisma.bikePartListing.findUniqueOrThrow({ where: { id: listing.id } });
  assert.equal(result.rating, null);
  assert.equal(await prisma.productReview.count({ where: { listingId: listing.id } }), 0);
});

after(async () => {
  await prisma.productReview.deleteMany({ where: { listingId: { in: listings } } });
  await prisma.order.deleteMany({ where: { id: { in: orders } } });
  await prisma.bikePartListing.deleteMany({ where: { id: { in: listings } } });
  await prisma.user.deleteMany({ where: { id: { in: users } } });
  await prisma.$disconnect();
});
