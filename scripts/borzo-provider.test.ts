/**
 * Pure-logic tests for the Borzo provider — auth header, definite-vs-
 * uncertain error classification, and response normalization — all against
 * a mocked `fetch`, no live Borzo account or network access required (see
 * the final report's "requires Borzo production API approval" section for
 * what these tests deliberately cannot verify: the full point-level status
 * vocabulary and the webhook/callback contract, neither of which ever
 * rendered from the public docs despite repeated fetch attempts).
 */
import assert from "node:assert/strict";
import test, { before, after } from "node:test";
import {
  isBorzoConfigured,
  BorzoRequestError,
  calculateDelivery,
  createDeliveryOrder,
  fetchDeliveryStatus,
  cancelDelivery,
} from "@/lib/shipping/providers/borzo";

const originalFetch = global.fetch;
const originalEnv = { token: process.env.BORZO_API_TOKEN };

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

const pickup = { contactName: "Warehouse", contactPhone: "9000000000", line1: "L1", city: "Pune", pincode: "411001" };
const drop = { contactName: "Customer", contactPhone: "9000000001", line1: "L2", city: "Pune", pincode: "411002" };

before(() => {
  process.env.BORZO_API_TOKEN = "test-token";
});

after(() => {
  global.fetch = originalFetch;
  process.env.BORZO_API_TOKEN = originalEnv.token;
});

// 2. Borzo not configured
test("isBorzoConfigured is false without a token", () => {
  assert.equal(isBorzoConfigured(), true);
  const saved = process.env.BORZO_API_TOKEN;
  delete process.env.BORZO_API_TOKEN;
  assert.equal(isBorzoConfigured(), false);
  process.env.BORZO_API_TOKEN = saved;
});

// 3. calculate delivery success
test("calculateDelivery posts the auth header and points, and normalizes the fee", async () => {
  let sawAuthHeader: string | null = null;
  global.fetch = (async (url: string, init: RequestInit) => {
    assert.ok(String(url).endsWith("/calculate-order"));
    sawAuthHeader = (init.headers as Record<string, string>)["X-DV-Auth-Token"];
    const body = JSON.parse(String(init.body));
    assert.equal(body.points.length, 2);
    assert.equal(body.points[0].contact_person.phone, pickup.contactPhone);
    return jsonResponse({ is_successful: true, order: { delivery_fee_amount: 82, payment_amount: 82 } });
  }) as typeof fetch;

  const quote = await calculateDelivery({ pickup, drop, matter: "Brake Pads x2" });
  assert.equal(quote.deliveryFeeAmount, 82);
  assert.equal(sawAuthHeader, "test-token");
});

// 4. calculate delivery failure — a well-formed Borzo rejection is definite
test("calculateDelivery treats is_successful:false as a definite rejection", async () => {
  global.fetch = (async () => jsonResponse({ is_successful: false, errors: [{ message: "Address not serviceable" }] })) as typeof fetch;

  await assert.rejects(calculateDelivery({ pickup, drop, matter: "x" }), (error: unknown) => {
    assert.ok(error instanceof BorzoRequestError);
    assert.equal(error.uncertain, false);
    assert.match(error.message, /Address not serviceable/);
    return true;
  });
});

// 5. create Borzo delivery
test("createDeliveryOrder normalizes the order id, courier, and tracking url", async () => {
  global.fetch = (async () =>
    jsonResponse({
      is_successful: true,
      order: {
        order_id: 12345,
        status: "new",
        points: [{ point_id: 1 }, { point_id: 2, tracking_url: "https://borzodelivery.com/track/12345" }],
        courier: null,
      },
    })) as typeof fetch;

  const result = await createDeliveryOrder({ pickup, drop, matter: "Brake Pads x2", totalWeightKg: 1.5 });
  assert.equal(result.borzoOrderId, "12345");
  assert.equal(result.status, "new");
  assert.equal(result.trackingUrl, "https://borzodelivery.com/track/12345");
  assert.equal(result.courierName, null, "no courier assigned yet — never fabricated");
});

// 17. no fake AWB for Borzo / missing rider fields — courier is only ever populated when Borzo actually returns one
test("a create-order response with no courier assigned yet leaves courier fields null, never fabricated", async () => {
  global.fetch = (async () =>
    jsonResponse({ is_successful: true, order: { order_id: 999, status: "new", points: [{}, {}], courier: null } })) as typeof fetch;

  const result = await createDeliveryOrder({ pickup, drop, matter: "x" });
  assert.equal(result.courierName, null);
  assert.equal(result.courierPhone, null);
});

test("createDeliveryOrder throws (uncertain) when Borzo's response has no order id", async () => {
  global.fetch = (async () => jsonResponse({ is_successful: true, order: { status: "new" } })) as typeof fetch;

  await assert.rejects(createDeliveryOrder({ pickup, drop, matter: "x" }), (error: unknown) => {
    assert.ok(error instanceof BorzoRequestError);
    assert.equal(error.uncertain, true);
    return true;
  });
});

// 7. track Borzo delivery — real courier/rider fields populated when Borzo returns them
test("fetchDeliveryStatus normalizes a real assigned courier's name and phone", async () => {
  global.fetch = (async () =>
    jsonResponse({
      is_successful: true,
      order: {
        order_id: 12345,
        status: "active",
        points: [{}, { tracking_url: "https://borzodelivery.com/track/12345" }],
        courier: { name: "Rahul", surname: "Sharma", phone: "9123456780" },
      },
    })) as typeof fetch;

  const result = await fetchDeliveryStatus("12345");
  assert.equal(result.status, "active");
  assert.equal(result.courierName, "Rahul Sharma");
  assert.equal(result.courierPhone, "9123456780");
});

// 13. missing tracking URL is handled gracefully (null, never fabricated)
test("fetchDeliveryStatus returns null tracking url when Borzo doesn't provide one", async () => {
  global.fetch = (async () =>
    jsonResponse({ is_successful: true, order: { order_id: 1, status: "active", points: [{}, {}], courier: null } })) as typeof fetch;

  const result = await fetchDeliveryStatus("1");
  assert.equal(result.trackingUrl, null);
});

// 10. cancellation
test("cancelDelivery posts the order id and reports success", async () => {
  global.fetch = (async (url: string, init: RequestInit) => {
    assert.ok(String(url).endsWith("/cancel-order"));
    const body = JSON.parse(String(init.body));
    assert.equal(body.order_id, 555);
    return jsonResponse({ is_successful: true });
  }) as typeof fetch;

  const result = await cancelDelivery("555");
  assert.equal(result.cancelled, true);
});

// 11. invalid Borzo token — a definite auth failure (Borzo has no session/refresh step, unlike Shiprocket)
test("an invalid-token (401) response is a definite failure, not uncertain", async () => {
  global.fetch = (async () => jsonResponse({ message: "Unauthorized" }, 401)) as typeof fetch;

  await assert.rejects(fetchDeliveryStatus("1"), (error: unknown) => {
    assert.ok(error instanceof BorzoRequestError);
    assert.equal(error.uncertain, false);
    assert.equal(error.status, 401);
    return true;
  });
});

// 12. network timeout
test("a network failure is classified as uncertain", async () => {
  global.fetch = (async () => {
    throw new Error("ECONNRESET");
  }) as typeof fetch;

  await assert.rejects(calculateDelivery({ pickup, drop, matter: "x" }), (error: unknown) => {
    assert.ok(error instanceof BorzoRequestError);
    assert.equal(error.uncertain, true);
    return true;
  });
});

test("a 5xx Borzo error is classified as uncertain", async () => {
  global.fetch = (async () => jsonResponse({ message: "Internal error" }, 500)) as typeof fetch;

  await assert.rejects(cancelDelivery("1"), (error: unknown) => {
    assert.ok(error instanceof BorzoRequestError);
    assert.equal(error.uncertain, true);
    assert.equal(error.status, 500);
    return true;
  });
});
