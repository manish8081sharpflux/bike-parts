/**
 * Pure-logic tests for the Shiprocket provider — authentication, token
 * caching, refresh-on-401, and definite-vs-uncertain error classification —
 * all against a mocked `fetch`, no live Shiprocket account or network
 * access required (see the final report's "requires real dashboard
 * credentials" section for what these tests deliberately cannot verify).
 */
import assert from "node:assert/strict";
import test, { before, beforeEach, after } from "node:test";
import {
  isShiprocketConfigured,
  ShippingProviderError,
  getShiprocketToken,
  resetShiprocketTokenCacheForTests,
  peekShiprocketTokenCacheForTests,
  checkServiceability,
  createForwardShipment,
  assignAwb,
  trackByAwb,
} from "@/lib/shipping/providers/shiprocket";

const originalFetch = global.fetch;
const originalEnv = {
  email: process.env.SHIPROCKET_EMAIL,
  password: process.env.SHIPROCKET_PASSWORD,
  pickup: process.env.SHIPROCKET_PICKUP_LOCATION,
};

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

before(() => {
  process.env.SHIPROCKET_EMAIL = "ops@example.com";
  process.env.SHIPROCKET_PASSWORD = "test-password";
  process.env.SHIPROCKET_PICKUP_LOCATION = "Warehouse";
});

beforeEach(() => {
  resetShiprocketTokenCacheForTests();
});

after(() => {
  global.fetch = originalFetch;
  process.env.SHIPROCKET_EMAIL = originalEnv.email;
  process.env.SHIPROCKET_PASSWORD = originalEnv.password;
  process.env.SHIPROCKET_PICKUP_LOCATION = originalEnv.pickup;
});

test("isShiprocketConfigured requires all three variables", () => {
  assert.equal(isShiprocketConfigured(), true);
  const saved = process.env.SHIPROCKET_PICKUP_LOCATION;
  delete process.env.SHIPROCKET_PICKUP_LOCATION;
  assert.equal(isShiprocketConfigured(), false);
  process.env.SHIPROCKET_PICKUP_LOCATION = saved;
});

// 1. Shiprocket authentication
test("authentication posts credentials and returns the token", async () => {
  let calls = 0;
  global.fetch = (async (url: string, init: RequestInit) => {
    calls += 1;
    assert.ok(String(url).endsWith("/v1/external/auth/login"));
    const body = JSON.parse(String(init.body));
    assert.equal(body.email, "ops@example.com");
    assert.equal(body.password, "test-password");
    return jsonResponse({ token: "tok-123" });
  }) as typeof fetch;

  const token = await getShiprocketToken();
  assert.equal(token, "tok-123");
  assert.equal(calls, 1);
});

// 2. token caching — a second call must not re-authenticate
test("token is cached — a second call does not re-authenticate", async () => {
  let calls = 0;
  global.fetch = (async () => {
    calls += 1;
    return jsonResponse({ token: "tok-cached" });
  }) as typeof fetch;

  const first = await getShiprocketToken();
  const second = await getShiprocketToken();
  assert.equal(first, "tok-cached");
  assert.equal(second, "tok-cached");
  assert.equal(calls, 1, "only one login request for two token reads");
  assert.equal(peekShiprocketTokenCacheForTests()?.token, "tok-cached");
});

// 3. expired/unauthorized token refresh
test("a 401 on an API call forces exactly one re-authentication and retries the request", async () => {
  let loginCalls = 0;
  let apiCalls = 0;
  global.fetch = (async (url: string, init: RequestInit) => {
    const path = String(url);
    if (path.endsWith("/v1/external/auth/login")) {
      loginCalls += 1;
      return jsonResponse({ token: `tok-${loginCalls}` });
    }
    apiCalls += 1;
    // First API call: the cached token is stale server-side -> 401.
    // Second API call (after forced re-login): succeeds.
    if (apiCalls === 1) {
      assert.equal(init.headers && (init.headers as Record<string, string>).Authorization, "Bearer tok-1");
      return jsonResponse({ message: "Unauthorized" }, 401);
    }
    assert.equal(init.headers && (init.headers as Record<string, string>).Authorization, "Bearer tok-2");
    return jsonResponse({
      tracking_data: { shipment_track: [{ current_status: "DELIVERED" }], track_url: "https://track.example/1" },
    });
  }) as typeof fetch;

  const result = await trackByAwb("AWB123");
  assert.equal(result.rawStatus, "DELIVERED");
  assert.equal(loginCalls, 2, "the first login plus one forced re-login after the 401");
  assert.equal(apiCalls, 2, "the original request plus one retry with the fresh token");
});

// 4. serviceability response parsing
test("serviceability response is normalized into provider-neutral courier options", async () => {
  global.fetch = (async (url: string) => {
    const path = String(url);
    if (path.endsWith("/v1/external/auth/login")) return jsonResponse({ token: "tok" });
    assert.ok(path.includes("/v1/external/courier/serviceability/"));
    assert.ok(path.includes("pickup_postcode=800001"));
    assert.ok(path.includes("delivery_postcode=110001"));
    return jsonResponse({
      data: {
        available_courier_companies: [
          { courier_company_id: 10, courier_name: "Delhivery", rate: 82, etd: "3 days" },
          { courier_company_id: 20, courier_name: "Blue Dart", rate: 105, estimated_delivery_days: 2 },
        ],
      },
    });
  }) as typeof fetch;

  const options = await checkServiceability({ pickupPincode: "800001", deliveryPincode: "110001", weightKg: 1.2, cod: false });
  assert.equal(options.length, 2);
  assert.deepEqual(options[0], { courierCompanyId: "10", courierName: "Delhivery", rate: 82, estimatedDeliveryDays: 3, raw: options[0].raw });
  assert.deepEqual(options[1], { courierCompanyId: "20", courierName: "Blue Dart", rate: 105, estimatedDeliveryDays: 2, raw: options[1].raw });
});

// 5a. definite failure — a well-formed rejection (400) never marked uncertain
test("a definite provider rejection (400) is not classified as uncertain", async () => {
  global.fetch = (async (url: string) => {
    if (String(url).endsWith("/v1/external/auth/login")) return jsonResponse({ token: "tok" });
    return jsonResponse({ message: "Invalid pickup location" }, 400);
  }) as typeof fetch;

  await assert.rejects(
    createForwardShipment({
      referenceId: "order-1",
      pickup: { contactName: "W", contactPhone: "9000000000", line1: "L1", city: "Patna", pincode: "800001" },
      drop: { contactName: "C", contactPhone: "9000000001", line1: "L2", city: "Delhi", pincode: "110001" },
      package: { weightKg: 1, lengthCm: 10, breadthCm: 10, heightCm: 10 },
      items: [{ name: "Part", sku: null, quantity: 1, unitPrice: 100 }],
      declaredValue: 100,
      codAmount: 0,
    }),
    (error: unknown) => {
      assert.ok(error instanceof ShippingProviderError);
      assert.equal(error.uncertain, false);
      assert.equal(error.status, 400);
      return true;
    }
  );
});

// 5b. uncertain failure — a network interruption after a mutation
test("a network interruption is classified as uncertain", async () => {
  global.fetch = (async () => {
    throw new Error("ECONNRESET");
  }) as typeof fetch;

  await assert.rejects(getShiprocketToken(), (error: unknown) => {
    assert.ok(error instanceof ShippingProviderError);
    assert.equal(error.uncertain, true);
    return true;
  });
});

// 5c. uncertain failure — a 500 after a mutation
test("a 5xx provider error is classified as uncertain", async () => {
  global.fetch = (async (url: string) => {
    if (String(url).endsWith("/v1/external/auth/login")) return jsonResponse({ token: "tok" });
    return jsonResponse({ message: "Internal error" }, 500);
  }) as typeof fetch;

  await assert.rejects(assignAwb("shipment-1"), (error: unknown) => {
    assert.ok(error instanceof ShippingProviderError);
    assert.equal(error.uncertain, true);
    assert.equal(error.status, 500);
    return true;
  });
});

// A response missing the shipment id is treated as uncertain, never a clean success.
test("a create-shipment response with no order id is treated as uncertain", async () => {
  global.fetch = (async (url: string) => {
    if (String(url).endsWith("/v1/external/auth/login")) return jsonResponse({ token: "tok" });
    return jsonResponse({ status: "NEW" }); // no order_id
  }) as typeof fetch;

  await assert.rejects(
    createForwardShipment({
      referenceId: "order-2",
      pickup: { contactName: "W", contactPhone: "9000000000", line1: "L1", city: "Patna", pincode: "800001" },
      drop: { contactName: "C", contactPhone: "9000000001", line1: "L2", city: "Delhi", pincode: "110001" },
      package: { weightKg: 1, lengthCm: 10, breadthCm: 10, heightCm: 10 },
      items: [{ name: "Part", sku: null, quantity: 1, unitPrice: 100 }],
      declaredValue: 100,
      codAmount: 0,
    }),
    (error: unknown) => {
      assert.ok(error instanceof ShippingProviderError);
      assert.equal(error.uncertain, true);
      return true;
    }
  );
});
