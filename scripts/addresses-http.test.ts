/**
 * HTTP-level address/checkout security tests — hits a real running server
 * (same convention as scripts/customer-auth.test.mjs) because ownership
 * enforcement lives behind getCustomerSession(), which reads the request's
 * cookies via next/headers and can't be exercised by importing the route
 * handlers directly outside of a real request. Requires `pnpm dev` (or an
 * equivalent server) already running — override the target with
 * AUTH_TEST_BASE_URL if it's not on the default port.
 */
import assert from "node:assert/strict";
import test, { after } from "node:test";
import { PrismaClient } from "@prisma/client";

const baseUrl = process.env.AUTH_TEST_BASE_URL ?? "http://localhost:3000";
const prisma = new PrismaClient();
const phones = new Set<string>();
let sequence = 0;

function phone() {
  const value = `9765${String(Date.now()).slice(-5)}${String(sequence++ % 10)}`;
  phones.add(value);
  return value;
}

async function request(path: string, options: RequestInit = {}) {
  return fetch(`${baseUrl}${path}`, options);
}

function cookieFrom(response: Response) {
  return response.headers.getSetCookie?.()[0]?.split(";")[0] ?? "";
}

async function login(phoneNumber: string) {
  const sendRes = await request("/api/auth/otp/send", {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-forwarded-for": `addr-test-${phoneNumber}` },
    body: JSON.stringify({ phone: phoneNumber }),
  });
  const sendData = await sendRes.json();
  assert.equal(sendRes.status, 200, JSON.stringify(sendData));

  const verifyRes = await request("/api/auth/otp/verify", {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-forwarded-for": `addr-test-${phoneNumber}` },
    body: JSON.stringify({ phone: phoneNumber, otp: sendData.developmentOtp }),
  });
  const verifyData = await verifyRes.json();
  assert.equal(verifyRes.status, 200, JSON.stringify(verifyData));
  return cookieFrom(verifyRes);
}

const validAddress = (overrides: Record<string, unknown> = {}) => ({
  label: "Home",
  contactName: "HTTP Test",
  phone: "9123456780",
  flatNo: "H.No. 9",
  floor: "",
  area: "Camp",
  landmark: "",
  city: "Pune",
  pincode: "411001",
  ...overrides,
});

test("address endpoints require authentication", async () => {
  assert.equal((await request("/api/addresses")).status, 401);
  assert.equal(
    (await request("/api/addresses", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(validAddress()),
    })).status,
    401
  );
  assert.equal((await request("/api/addresses/does-not-exist", { method: "PATCH" })).status, 401);
  assert.equal((await request("/api/addresses/does-not-exist", { method: "DELETE" })).status, 401);
});

test("a customer can create, list, and edit only their own address", async () => {
  const cookie = await login(phone());
  const createRes = await request("/api/addresses", {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: cookie },
    body: JSON.stringify(validAddress()),
  });
  const created = await createRes.json();
  assert.equal(createRes.status, 201, JSON.stringify(created));
  assert.equal(created.address.userId, undefined); // never leaked to the client
  assert.equal(created.address.contactName, "HTTP Test");

  const listRes = await request("/api/addresses", { headers: { Cookie: cookie } });
  const list = await listRes.json();
  assert.equal(listRes.status, 200);
  assert.ok(list.addresses.some((a: { id: string }) => a.id === created.address.id));

  const patchRes = await request(`/api/addresses/${created.address.id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", Cookie: cookie },
    body: JSON.stringify(validAddress({ city: "Nashik" })),
  });
  const patched = await patchRes.json();
  assert.equal(patchRes.status, 200, JSON.stringify(patched));
  assert.equal(patched.address.city, "Nashik");
});

test("concurrent first-address POSTs both return 201 with exactly one default", async () => {
  const cookie = await login(phone());
  const responses = await Promise.all(["A-1", "B-1"].map((flatNo) =>
    request("/api/addresses", {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: cookie },
      body: JSON.stringify(validAddress({ flatNo })),
    })
  ));
  for (const response of responses) {
    assert.equal(response.status, 201, await response.text());
  }
  const listRes = await request("/api/addresses", { headers: { Cookie: cookie } });
  assert.equal(listRes.status, 200);
  const { addresses } = await listRes.json();
  assert.equal(addresses.length, 2);
  assert.equal(addresses.filter((row: { isDefault: boolean }) => row.isDefault).length, 1);
  assert.deepEqual(addresses.map((row: { flatNo: string }) => row.flatNo).sort(), ["A-1", "B-1"]);
});

test("cross-user address read/edit/delete are all rejected", async () => {
  const cookieA = await login(phone());
  const cookieB = await login(phone());

  const createRes = await request("/api/addresses", {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: cookieA },
    body: JSON.stringify(validAddress()),
  });
  const addressA = (await createRes.json()).address;

  // B's own list never contains A's address.
  const listB = await (await request("/api/addresses", { headers: { Cookie: cookieB } })).json();
  assert.equal(listB.addresses.some((a: { id: string }) => a.id === addressA.id), false);

  // B editing A's address id is rejected as not-found, not as a permission error
  // that would confirm the id belongs to someone else.
  const patchRes = await request(`/api/addresses/${addressA.id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", Cookie: cookieB },
    body: JSON.stringify(validAddress({ city: "Hacked" })),
  });
  assert.equal(patchRes.status, 404);

  const deleteRes = await request(`/api/addresses/${addressA.id}`, {
    method: "DELETE",
    headers: { Cookie: cookieB },
  });
  assert.equal(deleteRes.status, 404);

  // A's address must be completely unaffected by B's attempts.
  const stillA = await prisma.address.findUniqueOrThrow({ where: { id: addressA.id } });
  assert.equal(stillA.city, "Pune");
});

test("checkout rejects an addressId that belongs to a different customer, without reserving stock or creating an order", async () => {
  const phoneA = phone();
  const phoneB = phone();
  const cookieA = await login(phoneA);
  const cookieB = await login(phoneB);

  const createRes = await request("/api/addresses", {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: cookieA },
    body: JSON.stringify(validAddress()),
  });
  const addressA = (await createRes.json()).address;

  const listing = await prisma.bikePartListing.create({
    data: {
      name: `Checkout HTTP Test ${Date.now()}`,
      slug: `checkout-http-test-${Date.now()}`,
      brand: "Test",
      category: "Test",
      price: 500,
      stock: 3,
    },
  });

  const ordersBefore = await prisma.order.count({ where: { customerPhone: phoneB } });

  const checkoutRes = await request("/api/checkout", {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: cookieB },
    body: JSON.stringify({ addressId: addressA.id, items: [{ id: listing.id, quantity: 1 }] }),
  });
  assert.ok([400, 404].includes(checkoutRes.status), `expected rejection, got ${checkoutRes.status}`);

  const ordersAfter = await prisma.order.count({ where: { customerPhone: phoneB } });
  assert.equal(ordersAfter, ordersBefore);

  const stockAfter = await prisma.bikePartListing.findUniqueOrThrow({ where: { id: listing.id } });
  assert.equal(stockAfter.stock, 3);

  await prisma.bikePartListing.delete({ where: { id: listing.id } });
});

after(async () => {
  await prisma.order.deleteMany({ where: { customerPhone: { in: [...phones] } } });
  const users = await prisma.user.findMany({ where: { phone: { in: [...phones] } } });
  await prisma.address.deleteMany({ where: { userId: { in: users.map((u) => u.id) } } });
  await prisma.customerOtpChallenge.deleteMany({ where: { phone: { in: [...phones] } } });
  await prisma.user.deleteMany({ where: { phone: { in: [...phones] } } });
  await prisma.$disconnect();
});
