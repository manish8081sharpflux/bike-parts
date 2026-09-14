/**
 * Shiprocket provider implementation — the only concrete shipping provider
 * this app talks to today. Nothing outside lib/shipping/ should import from
 * this file directly; go through lib/shipping/service.ts instead, so a
 * second provider could be added later without touching the rest of the
 * app (order state machines, admin actions, UI).
 *
 * Built against Shiprocket's documented External API v1
 * (https://apiv2.shiprocket.in/v1/external/...), the stable, long-standing
 * shape:
 *
 *   POST /v1/external/auth/login
 *   GET  /v1/external/courier/serviceability/
 *   POST /v1/external/orders/create/adhoc
 *   POST /v1/external/orders/create/return
 *   POST /v1/external/courier/assign/awb
 *   POST /v1/external/courier/generate/pickup
 *   GET  /v1/external/courier/track/awb/{awb}
 *   GET  /v1/external/courier/track/shipment/{shipment_id}
 *   POST /v1/external/orders/cancel
 *
 * Field names below match Shiprocket's documented request/response shapes.
 * Some fields are account-specific (in particular `pickup_location`, which
 * must exactly match a pickup address already configured in the Shiprocket
 * dashboard) and cannot be verified without live account credentials — see
 * the final report's "requires real dashboard credentials" section.
 */
import type {
  AwbResult,
  CancelShipmentResult,
  CheckServiceabilityInput,
  CourierOption,
  CreateShipmentInput,
  CreateShipmentResult,
  PickupResult,
  ReverseShipmentInput,
  ShippingAddress,
  TrackingResult,
} from "../types";

const DEFAULT_BASE_URL = "https://apiv2.shiprocket.in";
const DEFAULT_TIMEOUT_MS = 15_000;
// Shiprocket doesn't return an explicit expiry in the login response; its
// tokens are documented to last ~10 days. Cached conservatively short of
// that so a redeploy/long-lived process re-authenticates well before the
// token could actually expire server-side, while still avoiding a fresh
// login on every request (see getShiprocketToken).
const TOKEN_TTL_MS = 9 * 24 * 60 * 60 * 1000;

export class ShippingProviderError extends Error {
  /** True when the request's outcome is unknown — a network interruption, timeout, or 5xx after a mutation may have actually succeeded on the provider's side. Callers must never treat this the same as a definite rejection (see lib/shipping/service.ts). */
  uncertain: boolean;
  status?: number;
  provider: "SHIPROCKET";

  constructor(message: string, options: { uncertain: boolean; status?: number }) {
    super(message);
    this.name = "ShippingProviderError";
    this.uncertain = options.uncertain;
    this.status = options.status;
    this.provider = "SHIPROCKET";
  }
}

function getBaseUrl() {
  return (process.env.SHIPROCKET_API_BASE_URL || DEFAULT_BASE_URL).replace(/\/$/, "");
}

export function isShiprocketConfigured() {
  return Boolean(
    process.env.SHIPROCKET_EMAIL && process.env.SHIPROCKET_PASSWORD && process.env.SHIPROCKET_PICKUP_LOCATION
  );
}

export function assertShiprocketConfigured() {
  if (!isShiprocketConfigured()) {
    throw new Error(
      "Shiprocket is not configured. Set SHIPROCKET_EMAIL, SHIPROCKET_PASSWORD, and SHIPROCKET_PICKUP_LOCATION in .env.local."
    );
  }
}

// Module-level token cache — one login is reused across every request from
// this process until it's close to expiry or the API reports it invalid.
// Never persisted to disk/DB and never logged.
let cachedToken: { token: string; expiresAt: number } | null = null;
// Coalesces concurrent callers onto a single in-flight login instead of
// firing one login request per concurrent caller when the cache is cold.
let pendingLogin: Promise<string> | null = null;

/** Test-only hook — clears the in-memory token cache so each test starts cold. Never called from application code. */
export function resetShiprocketTokenCacheForTests() {
  cachedToken = null;
  pendingLogin = null;
}

/** Test-only hook — reads the cache without triggering a login, so tests can assert caching behavior. Never called from application code. */
export function peekShiprocketTokenCacheForTests() {
  return cachedToken;
}

async function authenticate(): Promise<string> {
  const email = process.env.SHIPROCKET_EMAIL;
  const password = process.env.SHIPROCKET_PASSWORD;
  if (!email || !password) {
    throw new Error("Shiprocket is not configured. Set SHIPROCKET_EMAIL and SHIPROCKET_PASSWORD in .env.local.");
  }

  let res: Response;
  try {
    res = await fetch(`${getBaseUrl()}/v1/external/auth/login`, {
      method: "POST",
      signal: AbortSignal.timeout(Number(process.env.SHIPROCKET_HTTP_TIMEOUT_MS ?? DEFAULT_TIMEOUT_MS)),
      headers: { "Content-Type": "application/json" },
      // Never logged — see the catch blocks below, which only ever surface
      // status codes and Shiprocket's own (credential-free) error messages.
      body: JSON.stringify({ email, password }),
    });
  } catch {
    throw new ShippingProviderError("Shiprocket authentication outcome is uncertain.", { uncertain: true });
  }

  const text = await res.text();
  let json: unknown = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = null;
  }

  if (!res.ok) {
    // Auth failures are always definite — there is no shipment mutation in
    // flight yet that could have "maybe succeeded".
    throw new ShippingProviderError(`Shiprocket authentication failed (${res.status}).`, {
      uncertain: false,
      status: res.status,
    });
  }

  const token = (json as { token?: string } | null)?.token;
  if (!token) {
    throw new ShippingProviderError("Shiprocket authentication response did not include a token.", {
      uncertain: false,
    });
  }
  return token;
}

/** Returns a cached token when one is fresh, otherwise authenticates once (coalescing concurrent callers) and caches the result. Never authenticates per-request. */
export async function getShiprocketToken(forceRefresh = false): Promise<string> {
  if (!forceRefresh && cachedToken && cachedToken.expiresAt > Date.now()) {
    return cachedToken.token;
  }
  if (!forceRefresh && pendingLogin) {
    return pendingLogin;
  }

  pendingLogin = authenticate()
    .then((token) => {
      cachedToken = { token, expiresAt: Date.now() + TOKEN_TTL_MS };
      return token;
    })
    .finally(() => {
      pendingLogin = null;
    });

  return pendingLogin;
}

function isUncertainStatus(status: number) {
  // 5xx and 408 (request timeout) mean Shiprocket's own state is unknown to
  // us — never safe to assume the mutation didn't happen. Everything else
  // (400/401/403/404/422/429) is a definite, well-formed rejection.
  return status >= 500 || status === 408;
}

/**
 * Internal HTTP wrapper every Shiprocket call goes through — attaches the
 * cached bearer token, retries exactly once on a 401 (forcing a fresh
 * login, since the cached token may have been invalidated server-side
 * before our local TTL expired), enforces a timeout, and classifies every
 * failure as definite or uncertain. Never includes the token or request
 * body (which may carry customer PII) in a thrown error message.
 */
async function shiprocketFetch(path: string, init: RequestInit & { retryOn401?: boolean } = {}): Promise<unknown> {
  assertShiprocketConfigured();
  const { retryOn401 = true, ...requestInit } = init;
  const token = await getShiprocketToken();

  let res: Response;
  try {
    res = await fetch(`${getBaseUrl()}${path}`, {
      ...requestInit,
      signal: requestInit.signal ?? AbortSignal.timeout(Number(process.env.SHIPROCKET_HTTP_TIMEOUT_MS ?? DEFAULT_TIMEOUT_MS)),
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
        ...requestInit.headers,
      },
    });
  } catch {
    // Network failure / timeout / connection reset — the request may or may
    // not have reached Shiprocket, and if it was a mutation it may have
    // already taken effect. See lib/shipping/service.ts for how this
    // propagates into a reconciliation-required state instead of a retry.
    throw new ShippingProviderError("Shiprocket request outcome is uncertain.", { uncertain: true });
  }

  if (res.status === 401 && retryOn401) {
    await getShiprocketToken(true);
    return shiprocketFetch(path, { ...init, retryOn401: false });
  }

  const text = await res.text();
  let json: unknown = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = null;
  }

  if (!res.ok) {
    const message = (json as { message?: string } | null)?.message;
    throw new ShippingProviderError(
      `Shiprocket API error (${res.status}${message ? `: ${message}` : ""}).`,
      { uncertain: isUncertainStatus(res.status), status: res.status }
    );
  }

  return json;
}

function formatIndianAddressLine(address: ShippingAddress) {
  return [address.line1, address.line2].filter(Boolean).join(", ");
}

/** GET serviceability — normalizes Shiprocket's available_courier_companies into provider-neutral CourierOption[]. */
export async function checkServiceability(input: CheckServiceabilityInput): Promise<CourierOption[]> {
  const params = new URLSearchParams({
    pickup_postcode: input.pickupPincode,
    delivery_postcode: input.deliveryPincode,
    weight: String(input.weightKg),
    cod: input.cod ? "1" : "0",
  });
  const response = (await shiprocketFetch(`/v1/external/courier/serviceability/?${params.toString()}`, {
    method: "GET",
  })) as { data?: { available_courier_companies?: Array<Record<string, unknown>> } };

  const companies = response.data?.available_courier_companies ?? [];
  return companies.map((company) => ({
    courierCompanyId: String(company.courier_company_id ?? ""),
    courierName: String(company.courier_name ?? "Unknown courier"),
    rate: Number(company.rate ?? company.freight_charge ?? 0),
    estimatedDeliveryDays:
      typeof company.estimated_delivery_days === "number"
        ? company.estimated_delivery_days
        : parseEtdDays(company.etd as string | undefined),
    raw: company,
  }));
}

function parseEtdDays(etd: string | undefined): number | null {
  if (!etd) return null;
  // Shiprocket's `etd` is often a date/time string ("2026-09-18 18:00:00")
  // rather than a day count — only surface a number when one is actually
  // present in the string, never guess.
  const match = /(\d+)\s*day/i.exec(etd);
  return match ? Number(match[1]) : null;
}

/** POST orders/create/adhoc — creates a forward shipment for a paid order. */
export async function createForwardShipment(input: CreateShipmentInput): Promise<CreateShipmentResult> {
  const pickupLocation = process.env.SHIPROCKET_PICKUP_LOCATION;
  if (!pickupLocation) {
    throw new Error("SHIPROCKET_PICKUP_LOCATION is not configured.");
  }

  const response = (await shiprocketFetch("/v1/external/orders/create/adhoc", {
    method: "POST",
    body: JSON.stringify({
      order_id: input.referenceId,
      order_date: new Date().toISOString().slice(0, 16).replace("T", " "),
      pickup_location: pickupLocation,
      billing_customer_name: input.drop.contactName,
      billing_last_name: "",
      billing_address: formatIndianAddressLine(input.drop),
      billing_city: input.drop.city,
      billing_pincode: input.drop.pincode,
      billing_state: input.drop.state || input.drop.city,
      billing_country: "India",
      billing_email: "customer@deepautomobiles.example",
      billing_phone: input.drop.contactPhone,
      shipping_is_billing: true,
      order_items: input.items.map((item) => ({
        name: item.name,
        sku: item.sku ?? item.name,
        units: item.quantity,
        selling_price: item.unitPrice,
      })),
      payment_method: input.codAmount > 0 ? "COD" : "Prepaid",
      sub_total: input.declaredValue,
      length: input.package.lengthCm,
      breadth: input.package.breadthCm,
      height: input.package.heightCm,
      weight: input.package.weightKg,
    }),
  })) as Record<string, unknown>;

  return normalizeCreateShipmentResponse(response);
}

/** POST orders/create/return — reverse shipment for a return, pickup = customer, drop = warehouse. Only the returned items/quantities are ever sent (see ReverseShipmentInput). */
export async function createReverseShipment(input: ReverseShipmentInput): Promise<CreateShipmentResult> {
  const response = (await shiprocketFetch("/v1/external/orders/create/return", {
    method: "POST",
    body: JSON.stringify({
      order_id: input.referenceId,
      order_date: new Date().toISOString().slice(0, 16).replace("T", " "),
      pickup_customer_name: input.pickup.contactName,
      pickup_last_name: "",
      pickup_address: formatIndianAddressLine(input.pickup),
      pickup_city: input.pickup.city,
      pickup_state: input.pickup.state || input.pickup.city,
      pickup_country: "India",
      pickup_pincode: input.pickup.pincode,
      pickup_email: "customer@deepautomobiles.example",
      pickup_phone: input.pickup.contactPhone,
      shipping_customer_name: input.drop.contactName,
      shipping_address: formatIndianAddressLine(input.drop),
      shipping_city: input.drop.city,
      shipping_state: input.drop.state || input.drop.city,
      shipping_country: "India",
      shipping_pincode: input.drop.pincode,
      shipping_email: "warehouse@deepautomobiles.example",
      shipping_phone: input.drop.contactPhone,
      order_items: input.items.map((item) => ({
        name: item.name,
        sku: item.sku ?? item.name,
        units: item.quantity,
        selling_price: item.unitPrice,
        qc_enable: false,
      })),
      payment_method: "Prepaid",
      sub_total: input.declaredValue,
      length: input.package.lengthCm,
      breadth: input.package.breadthCm,
      height: input.package.heightCm,
      weight: input.package.weightKg,
    }),
  })) as Record<string, unknown>;

  return normalizeCreateShipmentResponse(response);
}

function normalizeCreateShipmentResponse(response: Record<string, unknown>): CreateShipmentResult {
  const shippingOrderId = response.order_id != null ? String(response.order_id) : "";
  if (!shippingOrderId) {
    // A response with no order id is exactly the "provider result is
    // missing an identifier" case — callers must treat this as uncertain,
    // never as a clean success (see lib/shipping/service.ts).
    throw new ShippingProviderError("Shiprocket returned no order identifier; reconciliation is required.", {
      uncertain: true,
    });
  }
  return {
    provider: "SHIPROCKET",
    shippingOrderId,
    shippingShipmentId: response.shipment_id != null ? String(response.shipment_id) : null,
    status: String(response.status ?? "NEW"),
    raw: response,
  };
}

/** POST courier/assign/awb — generates (or fetches, if already assigned) the AWB for a shipment. */
export async function assignAwb(shippingShipmentId: string, courierCompanyId?: string): Promise<AwbResult> {
  const response = (await shiprocketFetch("/v1/external/courier/assign/awb", {
    method: "POST",
    body: JSON.stringify({
      shipment_id: Number(shippingShipmentId),
      ...(courierCompanyId ? { courier_id: Number(courierCompanyId) } : {}),
    }),
  })) as { response?: { data?: Record<string, unknown> } };

  const data = response.response?.data;
  const awbCode = data?.awb_code != null ? String(data.awb_code) : "";
  if (!awbCode) {
    throw new ShippingProviderError("Shiprocket returned no AWB code; reconciliation is required.", {
      uncertain: true,
    });
  }
  return {
    awbCode,
    courierName: String(data?.courier_name ?? "Unknown courier"),
    courierCompanyId: data?.courier_company_id != null ? String(data.courier_company_id) : null,
    raw: response,
  };
}

/** POST courier/generate/pickup — schedules a pickup for one or more shipments. */
export async function generatePickup(shippingShipmentId: string): Promise<PickupResult> {
  const response = (await shiprocketFetch("/v1/external/courier/generate/pickup", {
    method: "POST",
    body: JSON.stringify({ shipment_id: [Number(shippingShipmentId)] }),
  })) as { pickup_status?: number; response?: Record<string, unknown> };

  return {
    status: response.response?.pickup_scheduled_date ? "SCHEDULED" : String(response.pickup_status ?? "UNKNOWN"),
    raw: response,
  };
}

/** GET courier/track/awb/{awb} (preferred once an AWB exists) or track/shipment/{id} otherwise. */
export async function trackByAwb(awbCode: string): Promise<TrackingResult> {
  const response = (await shiprocketFetch(`/v1/external/courier/track/awb/${encodeURIComponent(awbCode)}`, {
    method: "GET",
  })) as { tracking_data?: { shipment_track?: Array<Record<string, unknown>>; track_url?: string } };

  const latest = response.tracking_data?.shipment_track?.[0];
  return {
    rawStatus: String(latest?.current_status ?? "UNKNOWN"),
    trackingUrl: response.tracking_data?.track_url ? String(response.tracking_data.track_url) : null,
    raw: response,
  };
}

export async function trackByShipmentId(shippingShipmentId: string): Promise<TrackingResult> {
  const response = (await shiprocketFetch(`/v1/external/courier/track/shipment/${encodeURIComponent(shippingShipmentId)}`, {
    method: "GET",
  })) as { tracking_data?: { shipment_track?: Array<Record<string, unknown>>; track_url?: string } };

  const latest = response.tracking_data?.shipment_track?.[0];
  return {
    rawStatus: String(latest?.current_status ?? "UNKNOWN"),
    trackingUrl: response.tracking_data?.track_url ? String(response.tracking_data.track_url) : null,
    raw: response,
  };
}

/** POST orders/cancel — only meaningful before a shipment has actually been picked up; Shiprocket rejects cancellation past that point with a definite (non-uncertain) error. */
export async function cancelOrder(shippingOrderId: string): Promise<CancelShipmentResult> {
  const response = (await shiprocketFetch("/v1/external/orders/cancel", {
    method: "POST",
    body: JSON.stringify({ ids: [Number(shippingOrderId)] }),
  })) as { message?: string; status_code?: number };

  return { cancelled: true, raw: response };
}
