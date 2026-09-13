import assert from "node:assert/strict";
import { randomInt } from "node:crypto";
import test, { after } from "node:test";
import { PrismaClient } from "@prisma/client";

const baseUrl = process.env.AUTH_TEST_BASE_URL ?? "http://localhost:3000";
const prisma = new PrismaClient();
const phones = new Set();
let sequence = 0;

function phone() {
  const value = `9876${String(Date.now()).slice(-5)}${String(sequence++ % 10)}`;
  phones.add(value);
  return value;
}

async function request(path, options = {}) {
  return fetch(`${baseUrl}${path}`, options);
}

async function sendOtp(phoneNumber, ip = `auth-test-${randomInt(1, 1_000_000)}`) {
  const response = await request("/api/auth/otp/send", {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-forwarded-for": ip },
    body: JSON.stringify({ phone: phoneNumber }),
  });
  const data = await response.json();
  assert.equal(response.status, 200, JSON.stringify(data));
  assert.match(data.developmentOtp, /^\d{4}$/);
  return data.developmentOtp;
}

async function verifyOtp(phoneNumber, otp, ip = `auth-test-${randomInt(1, 1_000_000)}`) {
  const response = await request("/api/auth/otp/verify", {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-forwarded-for": ip },
    body: JSON.stringify({ phone: phoneNumber, otp }),
  });
  return { response, data: await response.json() };
}

function cookieFrom(response) {
  return response.headers.getSetCookie?.()[0]?.split(";")[0] ?? "";
}

async function login(phoneNumber) {
  const otp = await sendOtp(phoneNumber);
  const result = await verifyOtp(phoneNumber, otp);
  assert.equal(result.response.status, 200, JSON.stringify(result.data));
  return cookieFrom(result.response);
}

test("valid OTP creates a session and session survives refresh", async () => {
  const customerPhone = phone();
  const cookie = await login(customerPhone);
  const response = await request("/api/auth/session", { headers: { Cookie: cookie } });
  const data = await response.json();
  assert.equal(response.status, 200);
  assert.equal(data.authenticated, true);
  assert.equal(data.user.phone, customerPhone);
});

test("wrong, expired, reused, and sixth OTP attempts are rejected", async () => {
  const wrongPhone = phone();
  const otp = await sendOtp(wrongPhone);
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const result = await verifyOtp(wrongPhone, "000000");
    assert.equal(result.response.status, 400);
  }
  assert.equal((await verifyOtp(wrongPhone, otp)).response.status, 400);

  const expiredPhone = phone();
  const expiredOtp = await sendOtp(expiredPhone);
  await prisma.customerOtpChallenge.update({
    where: { phone: expiredPhone },
    data: { expiresAt: new Date(Date.now() - 1000) },
  });
  assert.equal((await verifyOtp(expiredPhone, expiredOtp)).response.status, 400);

  const reusedPhone = phone();
  const reusedOtp = await sendOtp(reusedPhone);
  const first = await verifyOtp(reusedPhone, reusedOtp);
  assert.equal(first.response.status, 200);
  assert.equal((await verifyOtp(reusedPhone, reusedOtp)).response.status, 400);
});

test("resend cooldown and Redis-backed request limits are enforced", async () => {
  const resendPhone = phone();
  await sendOtp(resendPhone);
  const second = await request("/api/auth/otp/send", {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-forwarded-for": "cooldown-test" },
    body: JSON.stringify({ phone: resendPhone }),
  });
  assert.equal(second.status, 429);

  const sharedIp = `rate-limit-${Date.now()}`;
  const sends = await Promise.all(Array.from({ length: 11 }, () => sendOtp(phone(), sharedIp).catch((error) => error)));
  assert.ok(sends.some((result) => result instanceof Error));

  const verifyPhone = phone();
  const verifyOtpValue = await sendOtp(verifyPhone);
  const verifyResults = await Promise.all(
    Array.from({ length: 11 }, () => verifyOtp(verifyPhone, "000000", `verify-limit-${Date.now()}`))
  );
  assert.ok(verifyResults.some(({ response }) => response.status === 429));
  void verifyOtpValue;
});

test("concurrent verification consumes one OTP only", async () => {
  const customerPhone = phone();
  const otp = await sendOtp(customerPhone);
  const results = await Promise.all([verifyOtp(customerPhone, otp), verifyOtp(customerPhone, otp)]);
  assert.deepEqual(results.map(({ response }) => response.status).sort(), [200, 400]);
});

test("orders and mutations require session ownership", async () => {
  const customerAPhone = phone();
  const customerBPhone = phone();
  const cookieA = await login(customerAPhone);
  await login(customerBPhone);
  const userA = await prisma.user.findUniqueOrThrow({ where: { phone: customerAPhone } });
  const userB = await prisma.user.findUniqueOrThrow({ where: { phone: customerBPhone } });
  const orderB = await prisma.order.create({
    data: {
      buyerId: userB.id,
      customerName: "Test B",
      customerPhone: customerBPhone,
      deliveryAddress: {},
      itemsTotal: 100,
      amount: 100,
    },
  });
  const ordersA = await request("/api/orders", { headers: { Cookie: cookieA } });
  const ordersData = await ordersA.json();
  assert.equal(ordersA.status, 200);
  assert.equal(ordersData.orders.some((order) => order.id === orderB.id), false);

  const cancel = await request(`/api/orders/${orderB.id}/cancel`, { method: "POST", headers: { Cookie: cookieA } });
  assert.equal(cancel.status, 404);
  const refund = await request(`/api/orders/${orderB.id}/refund`, {
    method: "POST",
    headers: { Cookie: cookieA, "Content-Type": "application/json" },
    body: JSON.stringify({ reason: "not mine" }),
  });
  assert.equal(refund.status, 404);

  const checkout = await request("/api/checkout", {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: cookieA },
    body: JSON.stringify({ customerName: "Test A", deliveryAddress: {}, items: [] }),
  });
  assert.notEqual(checkout.status, 401);

  const logout = await request("/api/auth/logout", { method: "POST", headers: { Cookie: cookieA } });
  assert.equal(logout.status, 200);
  assert.equal((await request("/api/orders", { headers: { Cookie: cookieA } })).status, 401);
  assert.ok(userA.id !== userB.id);
});

test("unauthenticated orders are rejected", async () => {
  assert.equal((await request("/api/orders")).status, 401);
});

after(async () => {
  await prisma.order.deleteMany({ where: { customerPhone: { in: [...phones] } } });
  await prisma.customerOtpChallenge.deleteMany({ where: { phone: { in: [...phones] } } });
  await prisma.user.deleteMany({ where: { phone: { in: [...phones] } } });
  await prisma.$disconnect();
});
