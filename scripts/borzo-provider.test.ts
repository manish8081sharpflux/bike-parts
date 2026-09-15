/**
 * Pure-logic tests for the Borzo provider — auth header, GET vs POST
 * request shape, definite-vs-uncertain error classification, and response
 * normalization — all against a mocked `fetch`, no live Borzo account or
 * network access required. See the final report's "waiting for Borzo
 * test-account verification" section for what these tests deliberately
 * cannot verify: the full point-level `delivery.status` vocabulary and the
 * webhook/callback contract, neither of which is guessed here.
 */
import assert from "node:assert/strict";
import test, { before, after } from "node:test";
import {
  isBorzoConfigured,
  BorzoRequestError,
  calculateDelivery,
  createDeliveryOrder,
  fetchDeliveryStatus,
  getCourier,
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

// 1. Borzo auth header
test("every request carries X-DV-Auth-Token, and GET requests never send a body", async () => {
  let sawMethod = "";
  let sawAuthHeader: string | null = null;
  let sawBody: unknown;
  global.fetch = (async (url: string | URL, init: RequestInit) => {
    sawMethod = init.method ?? "GET";
    sawAuthHeader = (init.headers as Record<string, string>)["X-DV-Auth-Token"];
    sawBody = init.body;
    assert.ok(String(url).includes("/orders?order_id=42"));
    return jsonResponse({ is_successful: true, orders: [{ order_id: 42, status: "active", points: [{}, {}] }] });
  }) as typeof fetch;

  await fetchDeliveryStatus("42");
  assert.equal(sawMethod, "GET");
  assert.equal(sawAuthHeader, "test-token");
  assert.equal(sawBody, undefined, "a GET request must never carry a JSON body");
});

// 3. calculate delivery success
test("calculateDelivery posts the auth header and points, and normalizes every fee field (null, never 0, when absent)", async () => {
  global.fetch = (async (url: string, init: RequestInit) => {
    assert.ok(String(url).endsWith("/calculate-order"));
    assert.equal(init.method, "POST");
    const body = JSON.parse(String(init.body));
    assert.equal(body.points.length, 2);
    assert.equal(body.points[0].contact_person.phone, pickup.contactPhone);
    return jsonResponse({ is_successful: true, order: { delivery_fee_amount: 82, payment_amount: 90, weight_fee_amount: 8 } });
  }) as typeof fetch;

  const quote = await calculateDelivery({ pickup, drop, matter: "Brake Pads x2" });
  assert.equal(quote.deliveryFeeAmount, 82);
  assert.equal(quote.paymentAmount, 90);
  assert.equal(quote.weightFeeAmount, 8);
  // Borzo genuinely didn't return these — must stay null, never fabricated as 0.
  assert.equal(quote.insuranceAmount, null);
  assert.equal(quote.codFeeAmount, null);
  assert.equal(quote.returnFeeAmount, null);
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
test("createDeliveryOrder normalizes the order id, status, and drop point's tracking url without assuming courier data", async () => {
  global.fetch = (async (url: string, init: RequestInit) => {
    assert.ok(String(url).endsWith("/create-order"));
    assert.equal(init.method, "POST");
    return jsonResponse({
      is_successful: true,
      order: {
        order_id: 12345,
        status: "new",
        status_description: "Waiting for a courier",
        points: [{ point_id: 1 }, { point_id: 2, tracking_url: "https://borzodelivery.com/track/12345" }],
      },
    });
  }) as typeof fetch;

  const result = await createDeliveryOrder({ pickup, drop, matter: "Brake Pads x2", totalWeightKg: 1.5 });
  assert.equal(result.borzoOrderId, "12345");
  assert.equal(result.status, "new");
  assert.equal(result.statusDescription, "Waiting for a courier");
  assert.equal(result.trackingUrl, "https://borzodelivery.com/track/12345");
  assert.ok(!("courierName" in result), "courier data never comes from create-order/orders — only from getCourier");
});

// 8. is_return_point excluded when picking the drop point (Part 8: do not assume a fixed array position)
test("findDropPoint (via normalizeOrder) skips a point flagged is_return_point and picks the real drop", async () => {
  global.fetch = (async () =>
    jsonResponse({
      is_successful: true,
      order: {
        order_id: 7,
        status: "active",
        points: [
          { point_id: 1, tracking_url: "https://example.test/pickup" },
          { point_id: 2, tracking_url: "https://example.test/drop", delivery: { status: "arrived at drop-off" } },
          { point_id: 3, tracking_url: "https://example.test/return-leg", is_return_point: true },
        ],
      },
    })) as typeof fetch;

  const result = await fetchDeliveryStatus("7");
  assert.equal(result.trackingUrl, "https://example.test/drop");
  assert.equal(result.pointDeliveryStatus, "arrived at drop-off");
});

test("createDeliveryOrder throws (uncertain) when Borzo's response has no order id", async () => {
  global.fetch = (async () => jsonResponse({ is_successful: true, order: { status: "new" } })) as typeof fetch;

  await assert.rejects(createDeliveryOrder({ pickup, drop, matter: "x" }), (error: unknown) => {
    assert.ok(error instanceof BorzoRequestError);
    assert.equal(error.uncertain, true);
    return true;
  });
});

// 2. GET /orders?order_id=... / 3. correct order selected by ID
test("fetchDeliveryStatus uses GET /orders?order_id= and picks the matching order out of several", async () => {
  global.fetch = (async (url: string, init: RequestInit) => {
    assert.equal(init.method, "GET");
    assert.ok(String(url).includes("/orders"));
    assert.ok(String(url).includes("order_id=555"));
    return jsonResponse({
      is_successful: true,
      orders: [
        { order_id: 111, status: "completed", points: [{}, {}] },
        { order_id: 555, status: "active", points: [{}, { tracking_url: "https://borzodelivery.com/track/555" }] },
        { order_id: 999, status: "new", points: [{}, {}] },
      ],
    });
  }) as typeof fetch;

  const result = await fetchDeliveryStatus("555");
  assert.equal(result.borzoOrderId, "555");
  assert.equal(result.status, "active");
  assert.equal(result.trackingUrl, "https://borzodelivery.com/track/555", "must not blindly use orders[0]");
});

// 13. missing tracking URL is handled gracefully (null, never fabricated)
test("fetchDeliveryStatus returns null tracking url when Borzo doesn't provide one", async () => {
  global.fetch = (async () => jsonResponse({ is_successful: true, orders: [{ order_id: 1, status: "active", points: [{}, {}] }] })) as typeof fetch;

  const result = await fetchDeliveryStatus("1");
  assert.equal(result.trackingUrl, null);
});

test("fetchDeliveryStatus throws (uncertain) when no order in the response matches the requested id", async () => {
  global.fetch = (async () => jsonResponse({ is_successful: true, orders: [] })) as typeof fetch;

  await assert.rejects(fetchDeliveryStatus("1"), (error: unknown) => {
    assert.ok(error instanceof BorzoRequestError);
    assert.equal(error.uncertain, true);
    return true;
  });
});

// 4. GET /courier?order_id=... / 5. rider name / 6. rider phone / 7. rider photo / 8. rider lat/lng
test("getCourier uses GET /courier?order_id= and normalizes a real assigned courier", async () => {
  global.fetch = (async (url: string, init: RequestInit) => {
    assert.equal(init.method, "GET");
    assert.ok(String(url).includes("/courier"));
    assert.ok(String(url).includes("order_id=12345"));
    return jsonResponse({
      is_successful: true,
      courier: {
        courier_id: 72384,
        name: "Name",
        surname: "Surname",
        phone: "918880000001",
        photo_url: "https://borzodelivery.com/photo/72384.jpg",
        latitude: "28.6210537",
        longitude: "77.0817532",
      },
    });
  }) as typeof fetch;

  const courier = await getCourier("12345");
  assert.equal(courier.courierId, "72384");
  assert.equal(courier.name, "Name Surname");
  assert.equal(courier.phone, "918880000001");
  assert.equal(courier.photoUrl, "https://borzodelivery.com/photo/72384.jpg");
  assert.equal(courier.latitude, 28.6210537);
  assert.equal(courier.longitude, 77.0817532);
});

// 9. missing rider
test("getCourier returns the no-courier shape (never throws) when Borzo has no courier assigned yet", async () => {
  global.fetch = (async () => jsonResponse({ is_successful: true, courier: null })) as typeof fetch;

  const courier = await getCourier("1");
  assert.deepEqual(courier, { courierId: null, name: null, phone: null, photoUrl: null, latitude: null, longitude: null });
});

// 10. missing coordinates — a courier can be assigned without a live position yet
test("getCourier never reports a real position from only one of latitude/longitude", async () => {
  global.fetch = (async () => jsonResponse({ is_successful: true, courier: { courier_id: 1, name: "Name", latitude: "28.6" } })) as typeof fetch;

  const courier = await getCourier("1");
  assert.equal(courier.latitude, null);
  assert.equal(courier.longitude, null);
  assert.equal(courier.name, "Name", "the courier itself is still real even without a live position");
});

// 10. cancellation
test("cancelDelivery posts the order id and reports success", async () => {
  global.fetch = (async (url: string, init: RequestInit) => {
    assert.ok(String(url).endsWith("/cancel-order"));
    assert.equal(init.method, "POST");
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

// 19. network timeout / uncertainty
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

// 18. uncertain create (5xx)
test("a 5xx Borzo error is classified as uncertain", async () => {
  global.fetch = (async () => jsonResponse({ message: "Internal error" }, 500)) as typeof fetch;

  await assert.rejects(cancelDelivery("1"), (error: unknown) => {
    assert.ok(error instanceof BorzoRequestError);
    assert.equal(error.uncertain, true);
    assert.equal(error.status, 500);
    return true;
  });
});

// 16. malformed tracking URL — this provider layer only ever passes through
// whatever string Borzo returns; app/home's safeTrackingUrl (scripts/order-tracking.test.ts)
// is what actually rejects an unsafe scheme before rendering. Confirmed here
// that a non-URL string is still passed through faithfully, never silently
// dropped or "fixed" into something that wasn't really returned.
test("a non-empty tracking_url string is passed through as-is, whatever its shape", async () => {
  global.fetch = (async () =>
    jsonResponse({ is_successful: true, orders: [{ order_id: 1, status: "active", points: [{}, { tracking_url: "not-a-real-url" }] }] })) as typeof fetch;

  const result = await fetchDeliveryStatus("1");
  assert.equal(result.trackingUrl, "not-a-real-url");
});
