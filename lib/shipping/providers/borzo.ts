/**
 * Borzo provider implementation — local, same-city courier delivery
 * (Pune-to-Pune only for now — see checkLocalDeliveryEligibility in
 * lib/shipping/pune-eligibility.ts). A fundamentally different shape from
 * Shiprocket's create→AWB→pickup flow: Borzo has no AWB/label concept at
 * all, so it is never routed through createShipment/assignAwb/
 * schedulePickup — see the separate quoteLocalDelivery/createLocalDelivery/
 * trackLocalDelivery/cancelLocalDelivery functions in
 * lib/shipping/service.ts.
 *
 * Built against Borzo's official Business API v1.8
 * (https://borzodelivery.com/in/business-api/doc):
 *
 *   POST /calculate-order   — price/fee quote, no order created
 *   POST /create-order      — creates a real delivery order
 *   GET  /orders             — look up one or more orders (order_id filter)
 *   GET  /courier            — the real assigned courier/rider for an order
 *   POST /cancel-order      — cancels an existing order (order_id only)
 *
 * Auth: `X-DV-Auth-Token: BORZO_API_TOKEN` header on every request — a
 * static account secret, not a session token, so (unlike Shiprocket) there
 * is no login step or token cache here. HTTPS only — see assertHttpsBaseUrl.
 *
 * Deliberately NOT implemented, per this task's own "do not guess" rule:
 *   - Webhooks/callbacks — the callback URL setup, payload shape, and
 *     signature/verification method have not been confirmed against the
 *     current dashboard Integration section. Admin's manual "Refresh
 *     Tracking" (GET /orders + GET /courier) is the supported fallback
 *     until that contract is verified.
 *   - COD (taking_amount/buyout_amount/cod_fee_amount/etc.) — checkout in
 *     this app is prepaid via Razorpay only; no COD payload has been
 *     constructed or verified.
 *   - Borzo-side return-pickup — is_return_point/return_fee_amount are
 *     read defensively (see findDropPoint) but no reverse-delivery flow is
 *     built against them yet.
 *   - The full enumeration of point-level `delivery.status` strings — the
 *     field itself is confirmed, but only a conservative substring match
 *     against a few known phrases is used (see status-mapping.ts); an
 *     unrecognized value is never treated as a crash or a silent guess.
 */
import type { ShippingAddress } from "../types";

const DEFAULT_BASE_URL = "https://robotapitest-in.borzodelivery.com/api/business/1.8";
const DEFAULT_TIMEOUT_MS = 15_000;
// Borzo's documented max length for the `matter` (shipment contents) field.
const MAX_MATTER_LENGTH = 5000;
const MAX_ADDRESS_LENGTH = 350;

export class BorzoRequestError extends Error {
  /** True when the request's outcome is unknown — a network interruption, timeout, or 5xx after a mutation may have actually succeeded on Borzo's side. Callers must never treat this the same as a definite rejection. */
  uncertain: boolean;
  status?: number;
  provider: "BORZO";

  constructor(message: string, options: { uncertain: boolean; status?: number }) {
    super(message);
    this.name = "BorzoRequestError";
    this.uncertain = options.uncertain;
    this.status = options.status;
    this.provider = "BORZO";
  }
}

function getBaseUrl() {
  return (process.env.BORZO_API_BASE_URL || DEFAULT_BASE_URL).replace(/\/$/, "");
}

/** Never send the account token anywhere but Borzo's own HTTPS API. */
function assertHttpsBaseUrl(url: string) {
  if (!url.startsWith("https://")) {
    throw new Error("BORZO_API_BASE_URL must be an https:// URL.");
  }
}

export function isBorzoConfigured() {
  return Boolean(process.env.BORZO_API_TOKEN);
}

export function assertBorzoConfigured() {
  if (!isBorzoConfigured()) {
    throw new Error("Borzo is not configured. Set BORZO_API_TOKEN in .env.local.");
  }
}

function isUncertainStatus(status: number) {
  return status >= 500 || status === 408;
}

/** One entry of Borzo's documented `points[]` array — pickup/drop/(future) return points on an order. Only the fields this app actually reads are typed; see the file header for what's deliberately unused. */
type BorzoPoint = {
  point_id?: number;
  address?: string;
  latitude?: string | number;
  longitude?: string | number;
  contact_person?: { name?: string; phone?: string };
  tracking_url?: string | null;
  delivery?: { status?: string };
  is_return_point?: boolean;
  /** Real driving distance (meters) from the previous point — confirmed from a live test-account response; 0 on the first point. */
  previous_point_driving_distance_meters?: number;
};

type BorzoOrder = {
  order_id?: number | string;
  order_name?: string;
  status?: string;
  status_description?: string;
  payment_amount?: number;
  delivery_fee_amount?: number;
  weight_fee_amount?: number;
  insurance_amount?: number;
  cod_fee_amount?: number;
  return_fee_amount?: number;
  waybill_document_url?: string | null;
  points?: BorzoPoint[];
};

type BorzoCourier = {
  courier_id?: number | string;
  name?: string;
  surname?: string;
  middlename?: string | null;
  phone?: string;
  photo_url?: string | null;
  latitude?: string | number;
  longitude?: string | number;
};

type BorzoResponse = {
  is_successful?: boolean;
  errors?: Array<{ message?: string } | string>;
  order?: BorzoOrder;
  orders?: BorzoOrder[];
  courier?: BorzoCourier | null;
};

type BorzoRequestOptions = {
  method: "GET" | "POST";
  path: string;
  query?: Record<string, string | number | undefined>;
  body?: Record<string, unknown>;
};

/**
 * Internal HTTP wrapper every Borzo call goes through — supports both GET
 * (query-string filters, e.g. /orders, /courier) and POST (JSON body, e.g.
 * /calculate-order, /create-order, /cancel-order). Never logs the auth
 * token or request/response bodies (which may carry customer PII) —
 * thrown errors only ever surface a status code and Borzo's own
 * (credential-free) error messages.
 */
async function borzoRequest({ method, path, query, body }: BorzoRequestOptions): Promise<BorzoResponse> {
  assertBorzoConfigured();
  const baseUrl = getBaseUrl();
  assertHttpsBaseUrl(baseUrl);
  const token = process.env.BORZO_API_TOKEN!;

  const url = new URL(`${baseUrl}${path}`);
  if (query) {
    for (const [key, value] of Object.entries(query)) {
      if (value !== undefined) url.searchParams.set(key, String(value));
    }
  }

  let res: Response;
  try {
    res = await fetch(url, {
      method,
      signal: AbortSignal.timeout(Number(process.env.BORZO_HTTP_TIMEOUT_MS ?? DEFAULT_TIMEOUT_MS)),
      headers: {
        ...(method === "POST" ? { "Content-Type": "application/json" } : {}),
        "X-DV-Auth-Token": token,
      },
      // A GET request never carries a JSON body — Borzo's GET endpoints
      // (orders, courier) are filtered entirely through the query string.
      ...(method === "POST" ? { body: JSON.stringify(body ?? {}) } : {}),
    });
  } catch {
    throw new BorzoRequestError("Borzo request outcome is uncertain.", { uncertain: true });
  }

  const text = await res.text();
  let json: BorzoResponse | null = null;
  try {
    json = text ? (JSON.parse(text) as BorzoResponse) : null;
  } catch {
    json = null;
  }

  if (!res.ok) {
    throw new BorzoRequestError(`Borzo API error (${res.status}).`, {
      uncertain: isUncertainStatus(res.status),
      status: res.status,
    });
  }

  if (json?.is_successful === false) {
    // A well-formed rejection (e.g. address not serviceable, invalid
    // payload) — always definite, Borzo has told us exactly what's wrong.
    const message = Array.isArray(json.errors)
      ? json.errors.map((error) => (typeof error === "string" ? error : error.message ?? "Unknown error")).join("; ")
      : "Borzo rejected the request.";
    throw new BorzoRequestError(message, { uncertain: false, status: res.status });
  }

  return json ?? {};
}

function point(address: ShippingAddress) {
  return {
    address: [address.line1, address.line2, address.city, address.pincode].filter(Boolean).join(", ").slice(0, MAX_ADDRESS_LENGTH),
    contact_person: { name: address.contactName, phone: address.contactPhone },
  };
}

function vehicleTypeOverride() {
  const raw = process.env.BORZO_VEHICLE_TYPE_ID;
  return raw ? { vehicle_type_id: Number(raw) } : {};
}

/** A number only when Borzo actually returned one — collapsing "field absent" into 0 would show a fabricated fee/amount. */
function realNumber(value: unknown): number | null {
  if (value == null) return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

export type BorzoDeliveryInput = {
  pickup: ShippingAddress;
  drop: ShippingAddress;
  /** Free-text description of the parcel contents — required by Borzo (`matter`), max 5000 chars. */
  matter: string;
  totalWeightKg?: number;
};

export type BorzoQuoteResult = {
  /** Total amount Borzo would actually charge — may differ from deliveryFeeAmount once weight/insurance/COD fees are added. Null when Borzo didn't return one. */
  paymentAmount: number | null;
  deliveryFeeAmount: number | null;
  weightFeeAmount: number | null;
  insuranceAmount: number | null;
  codFeeAmount: number | null;
  returnFeeAmount: number | null;
  raw: unknown;
};

/** POST /calculate-order — a price/fee quote; never creates a real delivery. Every field is null (never 0) when Borzo's response genuinely omits it. */
export async function calculateDelivery(input: BorzoDeliveryInput): Promise<BorzoQuoteResult> {
  const response = await borzoRequest({
    method: "POST",
    path: "/calculate-order",
    body: {
      matter: input.matter.slice(0, MAX_MATTER_LENGTH),
      ...(input.totalWeightKg ? { total_weight_kg: Math.round(input.totalWeightKg) } : {}),
      ...vehicleTypeOverride(),
      points: [point(input.pickup), point(input.drop)],
    },
  });
  const order = response.order ?? {};
  return {
    paymentAmount: realNumber(order.payment_amount),
    deliveryFeeAmount: realNumber(order.delivery_fee_amount),
    weightFeeAmount: realNumber(order.weight_fee_amount),
    insuranceAmount: realNumber(order.insurance_amount),
    codFeeAmount: realNumber(order.cod_fee_amount),
    returnFeeAmount: realNumber(order.return_fee_amount),
    raw: response,
  };
}

export type BorzoOrderResult = {
  borzoOrderId: string;
  status: string;
  statusDescription: string | null;
  /** The real drop point's `delivery.status`, if Borzo returned one — a confirmed field (see the file header), used only as an additional, conservative signal by status-mapping.ts, never as ground truth on its own. */
  pointDeliveryStatus: string | null;
  trackingUrl: string | null;
  /** A real document URL only — see Part 20; optionally surfaced in Admin, never required for the local-delivery workflow. */
  waybillUrl: string | null;
  /** The real, committed delivery fee for this booking — null when Borzo genuinely didn't return one, never fabricated. Distinct from the pre-booking estimate in calculateDelivery/BorzoQuoteResult. */
  deliveryFeeAmount: number | null;
  /** Real, Borzo-geocoded pickup/drop coordinates — confirmed from a live test-account response (points[].latitude/longitude). Never derived from a pincode or city center. Both null unless both are present. */
  pickupLatitude: number | null;
  pickupLongitude: number | null;
  dropLatitude: number | null;
  dropLongitude: number | null;
  /** Borzo's own real driving-distance estimate (meters) from pickup to drop — points[1].previous_point_driving_distance_meters, confirmed from a live test-account response. Null when not returned. */
  distanceMeters: number | null;
  raw: unknown;
};

/**
 * Picks the customer drop point out of an order's `points[]` — for the
 * normal 2-point forward order, points[0] is pickup and points[1] is the
 * drop, but this does not assume that fixed position: `is_return_point`
 * (confirmed field) is used to exclude any return leg first, and the last
 * remaining point is treated as the drop. See Part 8.
 */
function findDropPoint(points?: BorzoPoint[]): BorzoPoint | undefined {
  if (!points || points.length === 0) return undefined;
  const forwardPoints = points.filter((p) => p.is_return_point !== true);
  const candidates = forwardPoints.length > 0 ? forwardPoints : points;
  return candidates[candidates.length - 1];
}

/** The complement of findDropPoint — whichever forward point isn't the drop. For the normal 2-point order this is the pickup (points[0]), found the same non-positional way. */
function findPickupPoint(points: BorzoPoint[] | undefined, dropPoint: BorzoPoint | undefined): BorzoPoint | undefined {
  if (!points || points.length === 0) return undefined;
  const forwardPoints = points.filter((p) => p.is_return_point !== true);
  const candidates = forwardPoints.length > 0 ? forwardPoints : points;
  return candidates.find((p) => p !== dropPoint) ?? candidates[0];
}

/** A latitude/longitude pair only when BOTH are real, finite numbers — a stray single coordinate is never a real position. */
function realLatLng(lat: unknown, lng: unknown): { lat: number; lng: number } | null {
  const latitude = realNumber(lat);
  const longitude = realNumber(lng);
  return latitude != null && longitude != null ? { lat: latitude, lng: longitude } : null;
}

function normalizeOrder(order: BorzoOrder, response: unknown, fallbackId?: string): BorzoOrderResult {
  const orderId = order.order_id != null ? String(order.order_id) : fallbackId ?? "";
  const dropPoint = findDropPoint(order.points);
  const pickupPoint = findPickupPoint(order.points, dropPoint);
  const pickupLatLng = realLatLng(pickupPoint?.latitude, pickupPoint?.longitude);
  const dropLatLng = realLatLng(dropPoint?.latitude, dropPoint?.longitude);
  return {
    borzoOrderId: orderId,
    status: String(order.status ?? "unknown"),
    statusDescription: order.status_description ?? null,
    pointDeliveryStatus: dropPoint?.delivery?.status ?? null,
    trackingUrl: dropPoint?.tracking_url ?? null,
    waybillUrl: order.waybill_document_url ?? null,
    deliveryFeeAmount: realNumber(order.delivery_fee_amount),
    pickupLatitude: pickupLatLng?.lat ?? null,
    pickupLongitude: pickupLatLng?.lng ?? null,
    dropLatitude: dropLatLng?.lat ?? null,
    dropLongitude: dropLatLng?.lng ?? null,
    distanceMeters: realNumber(dropPoint?.previous_point_driving_distance_meters),
    raw: response,
  };
}

/** POST /create-order — creates a real delivery order. Throws (uncertain) if Borzo's response has no order id, since a real booking may have been created without us being able to record it. Never returns courier/rider data — that only ever comes from the dedicated GET /courier lookup (see getCourier). */
export async function createDeliveryOrder(input: BorzoDeliveryInput): Promise<BorzoOrderResult> {
  const response = await borzoRequest({
    method: "POST",
    path: "/create-order",
    body: {
      matter: input.matter.slice(0, MAX_MATTER_LENGTH),
      ...(input.totalWeightKg ? { total_weight_kg: Math.round(input.totalWeightKg) } : {}),
      ...vehicleTypeOverride(),
      points: [point(input.pickup), point(input.drop)],
    },
  });
  const order = response.order;
  if (!order?.order_id) {
    throw new BorzoRequestError("Borzo returned no order identifier; reconciliation is required.", { uncertain: true });
  }
  return normalizeOrder(order, response);
}

/** GET /orders?order_id=<id> — the documented way to look up an order's current state. Matches the specific order_id in the response rather than blindly trusting orders[0], since Borzo may return more than one row. */
export async function fetchDeliveryStatus(borzoOrderId: string): Promise<BorzoOrderResult> {
  const response = await borzoRequest({ method: "GET", path: "/orders", query: { order_id: borzoOrderId } });
  const candidates = response.orders ?? (response.order ? [response.order] : []);
  const order = candidates.find((candidate) => String(candidate.order_id) === String(borzoOrderId)) ?? candidates[0];
  if (!order) {
    throw new BorzoRequestError("Borzo returned no order matching this id.", { uncertain: true });
  }
  return normalizeOrder(order, response, borzoOrderId);
}

export type BorzoCourierResult = {
  courierId: string | null;
  name: string | null;
  phone: string | null;
  photoUrl: string | null;
  /** Only present while a courier is actually assigned and Borzo is reporting a live position — see the file header and Part 7. Never derived from an address, pincode, or city center. */
  latitude: number | null;
  longitude: number | null;
};

const NO_COURIER: BorzoCourierResult = { courierId: null, name: null, phone: null, photoUrl: null, latitude: null, longitude: null };

/** GET /courier?order_id=<id> — the real assigned courier/rider, when one exists. Returns the "no courier" shape (never throws) when Borzo has nothing to report yet — a courier not being assigned yet is a normal, expected state, not an error. */
export async function getCourier(borzoOrderId: string): Promise<BorzoCourierResult> {
  const response = await borzoRequest({ method: "GET", path: "/courier", query: { order_id: borzoOrderId } });
  const courier = response.courier;
  if (!courier) return NO_COURIER;
  const lat = realNumber(courier.latitude);
  const lng = realNumber(courier.longitude);
  return {
    courierId: courier.courier_id != null ? String(courier.courier_id) : null,
    name: [courier.name, courier.surname].filter(Boolean).join(" ") || null,
    phone: courier.phone ?? null,
    photoUrl: courier.photo_url ?? null,
    // Only meaningful together — a latitude without a longitude (or vice
    // versa) is not a real position.
    latitude: lat != null && lng != null ? lat : null,
    longitude: lat != null && lng != null ? lng : null,
  };
}

/** POST /cancel-order — only meaningful before pickup; Borzo rejects cancellation past that point with a definite (non-uncertain) error. */
export async function cancelDelivery(borzoOrderId: string): Promise<{ cancelled: boolean; raw: unknown }> {
  const response = await borzoRequest({ method: "POST", path: "/cancel-order", body: { order_id: Number(borzoOrderId) } });
  return { cancelled: true, raw: response };
}
