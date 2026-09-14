import assert from "node:assert/strict";
import test, { before, after } from "node:test";
import { chromium, expect } from "@playwright/test";
import { prisma } from "@/lib/db";

// Requires the local dev server, as do the existing customer-auth HTTP tests.
const base = process.env.AUTH_TEST_BASE_URL ?? "http://localhost:3000";
const suffix = `review-http-${Date.now()}-${process.pid}`;
let cookie = "", userId = "", listingId = "", otherOrderId = "";
const orderIds: string[] = [];
let delivered: { id: string; itemId: string }, pending: { id: string; itemId: string };
let reviewId = "";

async function request(path: string, method = "GET", body?: unknown, auth = true, headers: Record<string, string> = {}) {
  return fetch(`${base}${path}`, { method, headers: {
    ...(auth ? { Cookie: cookie } : {}), ...(body === undefined ? {} : { "Content-Type": "application/json" }), ...headers,
  }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
}
const endpoint = (order: { id: string; itemId: string }) => `/api/orders/${order.id}/items/${order.itemId}/review`;

before(async () => {
  const phone = `978${String(Date.now()).slice(-7)}`;
  const sent = await request("/api/auth/otp/send", "POST", { phone }, false);
  const otp = await sent.json();
  assert.equal(sent.status, 200, "Development OTP request failed");
  assert.ok(otp.developmentOtp, "These tests require a development server with development OTPs");
  const login = await request("/api/auth/otp/verify", "POST", { phone, otp: otp.developmentOtp }, false);
  assert.equal(login.status, 200);
  cookie = login.headers.getSetCookie().map((value) => value.split(";")[0]).join("; ");
  userId = (await prisma.user.findUniqueOrThrow({ where: { phone } })).id;
  listingId = (await prisma.bikePartListing.create({ data: {
    name: suffix, slug: suffix, brand: "Honda", category: "Engine", price: 100, stock: 10,
    rating: 5, deliveryDaysMin: 2, deliveryDaysMax: 4,
  } })).id;
  for (const status of ["DELIVERED", "PACKED", "DELIVERED"] as const) {
    const order = await prisma.order.create({ data: {
      buyerId: orderIds.length === 2 ? null : userId,
      customerName: "HTTP Review Customer", customerPhone: phone,
      itemsTotal: 100, amount: 100, paymentStatus: "PAID", status,
      deliveryAddress: { area: "Camp", city: "Pune", pincode: "411001" },
      items: { create: { listingId, productName: suffix, quantity: 1, unitPrice: 100 } },
    }, include: { items: true } });
    orderIds.push(order.id);
    const entry = { id: order.id, itemId: order.items[0].id };
    if (orderIds.length === 1) delivered = entry;
    else if (orderIds.length === 2) pending = entry;
    else otherOrderId = order.id;
  }
});

test("review mutations require a customer session, including when an admin cookie is supplied", async () => {
  assert.equal((await request(endpoint(delivered), "POST", { rating: 5 }, false)).status, 401);
  assert.equal((await request("/api/reviews/missing", "PATCH", { rating: 5 }, false, { Cookie: "bikeparts_admin_session=irrelevant" })).status, 401);
});

test("HTTP rejects cross-origin requests, malformed JSON, and overlarge bodies", async () => {
  assert.equal((await request(endpoint(delivered), "POST", { rating: 5 }, true, { Origin: "https://untrusted.example" })).status, 403);
  const malformed = await fetch(`${base}${endpoint(delivered)}`, { method: "POST", headers: { Cookie: cookie, "Content-Type": "application/json" }, body: "{" });
  assert.equal(malformed.status, 400);
  assert.equal((await request(endpoint(delivered), "POST", { rating: 5, reviewText: "x".repeat(17000) })).status, 413);
});

test("HTTP enforces delivered ownership, line item binding, integer validation, and immutable product identity", async () => {
  assert.equal((await request(endpoint(pending), "POST", { rating: 5 })).status, 409);
  assert.equal((await request(`/api/orders/${otherOrderId}/items/${delivered.itemId}/review`, "POST", { rating: 5 })).status, 404);
  assert.equal((await request(endpoint({ id: delivered.id, itemId: pending.itemId }), "POST", { rating: 5 })).status, 404);
  assert.equal((await request(endpoint(delivered), "POST", { rating: 4.5 })).status, 400);
  assert.equal((await request(endpoint(delivered), "POST", { rating: 5, listingId: "arbitrary" })).status, 400);
});

test("order history exposes server-derived review eligibility and purchase IDs", async () => {
  const data = await (await request("/api/orders")).json();
  const item = data.orders.find((o: { id: string }) => o.id === delivered.id).items[0];
  assert.equal(item.id, delivered.itemId); assert.equal(item.listingId, listingId);
  assert.equal(item.canReview, true); assert.equal(item.review, null);
  assert.equal(data.orders.find((o: { id: string }) => o.id === pending.id).items[0].canReview, false);
});

test("customer can create/edit from the actual order UI and product details show the verified review", async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    await context.addCookies(cookie.split("; ").map((pair) => {
      const index = pair.indexOf("=");
      return { name: pair.slice(0, index), value: pair.slice(index + 1), url: base };
    }));
    const page = await context.newPage();
    await page.addInitScript(({ orderId }) => {
      if (!sessionStorage.getItem("review-test-initialized")) {
        sessionStorage.setItem("bikeparts_view", JSON.stringify({ screen: "order", orderId }));
        sessionStorage.setItem("review-test-initialized", "true");
      }
    }, { orderId: delivered.id.slice(-8) });
    await page.goto(base, { waitUntil: "domcontentloaded" });
    const editor = page.getByRole("region", { name: `Review ${suffix}`, exact: true });
    await expect(editor.getByText("Rate this product", { exact: true })).toBeVisible({ timeout: 60000 });
    await editor.getByRole("radio", { name: "4 stars", exact: true }).check();
    await editor.getByLabel("Review text (optional)").fill("Exact fit. <script>alert('safe text')</script>");
    await editor.getByRole("button", { name: "Submit review" }).click();
    await expect(editor.getByText("Your review", { exact: true })).toBeVisible();
    await editor.getByRole("button", { name: "Edit Review" }).click();
    await editor.getByRole("radio", { name: "3 stars", exact: true }).check();
    await editor.getByLabel("Review text (optional)").fill("Good fit after adjustment.");
    await editor.getByRole("button", { name: "Save review" }).click();
    await expect(editor.getByText("Good fit after adjustment.", { exact: true })).toBeVisible();
    reviewId = (await prisma.productReview.findFirstOrThrow({ where: { orderItemId: delivered.itemId } })).id;

    await page.evaluate((name) => sessionStorage.setItem("bikeparts_view", JSON.stringify({ screen: "product", name })), suffix);
    await page.reload({ waitUntil: "domcontentloaded" });
    const reviews = page.getByRole("region", { name: "Customer reviews", exact: true });
    await expect(reviews.getByText("Based on 1 verified purchase", { exact: true })).toBeVisible({ timeout: 30000 });
    await expect(reviews.getByText("Good fit after adjustment.", { exact: true })).toBeVisible();
    await expect(reviews.getByText("Verified Purchase", { exact: true })).toBeVisible();
    await expect(reviews.getByText("HTTP Review Customer", { exact: true })).toHaveCount(0);
    await page.setViewportSize({ width: 390, height: 844 });
    await expect(reviews).toBeVisible();

    await page.evaluate(() => sessionStorage.setItem("bikeparts_view", JSON.stringify({ screen: "home" })));
    await page.reload({ waitUntil: "domcontentloaded" });
    const card = page.locator("article").filter({ has: page.getByRole("heading", { name: suffix, exact: true }) }).first();
    await expect(card.getByText("3.0 (1)", { exact: true })).toBeVisible({ timeout: 30000 });
    await expect(card.getByText("2-4 days", { exact: true })).toBeVisible();
    await context.close();
  } finally { await browser.close(); }
});

test("HTTP duplicate review is rejected, edits cannot rebind, and public payload remains private", async () => {
  assert.ok(reviewId, "Browser test must create a review first");
  assert.equal((await request(endpoint(delivered), "POST", { rating: 5 })).status, 409);
  assert.equal((await request(`/api/reviews/${reviewId}`, "PATCH", { rating: 5, orderItemId: pending.itemId })).status, 400);
  const data = await (await request(`/api/products/${listingId}/reviews`, "GET", undefined, false)).json();
  assert.equal(data.ratingAverage, 3); assert.equal(data.ratingCount, 1);
  assert.equal(data.reviews[0].userId, undefined); assert.equal(data.reviews[0].orderId, undefined);
  assert.equal(data.reviews[0].customerName, "Verified Customer");
});

after(async () => {
  if (listingId) await prisma.productReview.deleteMany({ where: { listingId } });
  await prisma.order.deleteMany({ where: { id: { in: orderIds } } });
  if (listingId) await prisma.bikePartListing.delete({ where: { id: listingId } });
  if (userId) {
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (user?.phone) await prisma.customerOtpChallenge.deleteMany({ where: { phone: user.phone } });
    await prisma.user.delete({ where: { id: userId } });
  }
  await prisma.$disconnect();
});
