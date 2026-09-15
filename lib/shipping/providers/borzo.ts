/**
 * Borzo provider implementation — local, same-city courier delivery
 * (Pune-to-Pune only for now — see checkLocalDeliveryEligibility in
 * lib/shipping/service.ts). A fundamentally different shape from
 * Shiprocket's create→AWB→pickup flow: Borzo has no AWB/label concept at
 * all, so it is never routed through createShipment/assignAwb/
 * schedulePickup — see the separate quoteLocalDelivery/createLocalDelivery/
 * trackLocalDelivery/cancelLocalDelivery functions in
 * lib/shipping/service.ts.
 *
 * Built against Borzo's documented Business API v1.8
 * (https://borzodelivery.com/in/business-api/doc), confirmed directly from
 * that page before writing this file:
 *
 *   POST /calculate-order   — price/ETA quote, no order created
 *   POST /create-order      — creates a real delivery order
 *   POST /cancel-order      — cancels an existing order (order_id only)
 *   POST /orders            — "List of orders"; used here to re-fetch one
 *                              order's current status by id
 *
 * Auth: `X-DV-Auth-Token: BORZO_API_TOKEN` header on every request — a
 * static account secret, not a session token, so (unlike Shiprocket) there
 * is no login step or token cache here.
 *
 * NOT verified from the live docs and therefore NOT guessed here — the
 * public doc page truncated before rendering these sections despite
 * several attempts to fetch them in full (see the final report):
 *   - The complete "Delivery statuses" (point-level) enumeration. Only the
 *     confirmed order-level statuses (new/available/active/delayed/
 *     completed/cancelled — see mapBorzoStatusToOrderStatus in
 *     status-mapping.ts) are relied on as ground truth; point-level status
 *     strings are used only as a best-effort, clearly-flagged
 *     OUT_FOR_DELIVERY hint.
 *   - Webhook/callback registration, payload shape, and signature
 *     verification ("order-callback"/"delivery-callback" sections exist in
 *     the docs but their content never rendered in any fetch attempt). Per
 *     the task's own instruction not to guess a webhook contract, no
 *     webhook endpoint is implemented — manual "Refresh Tracking" (polling
 *     /orders) is the only supported path, exactly as the task allows.
 *   - The exact filter parameter(s) POST /orders accepts. `order_id` is
 *     used as the most conservative, minimal guess — verify against a real
 *     test-account response before relying on this in production.
 *   - The exact `vehicle_type_id` to use for a bike-parts-sized parcel in
 *     the India market — deliberately omitted from every request below so
 *     Borzo applies its own documented default (8) rather than this app
 *     guessing a specific vehicle class; override via BORZO_VEHICLE_TYPE_ID
 *     once confirmed against the dashboard.
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

type BorzoOrder = {
  order_id?: number | string;
  order_name?: string;
  status?: string;
  delivery_fee_amount?: number;
  payment_amount?: number;
  points?: Array<{ point_id?: number; tracking_url?: string | null; status?: string }>;
  courier?: { courier_id?: number; name?: string; surname?: string; phone?: string; photo_url?: string } | null;
};

type BorzoResponse = {
  is_successful?: boolean;
  errors?: Array<{ message?: string } | string>;
  order?: BorzoOrder;
  orders?: BorzoOrder[];
};

/**
 * Internal HTTP wrapper every Borzo call goes through. Never logs the auth
 * token or request/response bodies (which may carry customer PII) —
 * thrown errors only ever surface a status code and Borzo's own
 * (credential-free) error messages.
 */
async function borzoFetch(path: string, body: Record<string, unknown>): Promise<BorzoResponse> {
  assertBorzoConfigured();
  const token = process.env.BORZO_API_TOKEN!;

  let res: Response;
  try {
    res = await fetch(`${getBaseUrl()}${path}`, {
      method: "POST",
      signal: AbortSignal.timeout(Number(process.env.BORZO_HTTP_TIMEOUT_MS ?? DEFAULT_TIMEOUT_MS)),
      headers: {
        "Content-Type": "application/json",
        "X-DV-Auth-Token": token,
      },
      body: JSON.stringify(body),
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

export type BorzoDeliveryInput = {
  pickup: ShippingAddress;
  drop: ShippingAddress;
  /** Free-text description of the parcel contents — required by Borzo (`matter`), max 5000 chars. */
  matter: string;
  totalWeightKg?: number;
};

export type BorzoQuoteResult = {
  deliveryFeeAmount: number;
  paymentAmount: number;
  raw: unknown;
};

/** POST /calculate-order — a price/ETA quote; never creates a real delivery. */
export async function calculateDelivery(input: BorzoDeliveryInput): Promise<BorzoQuoteResult> {
  const response = await borzoFetch("/calculate-order", {
    matter: input.matter.slice(0, MAX_MATTER_LENGTH),
    ...(input.totalWeightKg ? { total_weight_kg: Math.round(input.totalWeightKg) } : {}),
    ...vehicleTypeOverride(),
    points: [point(input.pickup), point(input.drop)],
  });
  const order = response.order ?? {};
  return {
    deliveryFeeAmount: Number(order.delivery_fee_amount ?? 0),
    paymentAmount: Number(order.payment_amount ?? 0),
    raw: response,
  };
}

export type BorzoOrderResult = {
  borzoOrderId: string;
  status: string;
  trackingUrl: string | null;
  courierName: string | null;
  courierPhone: string | null;
  raw: unknown;
};

function normalizeOrder(order: BorzoOrder, response: unknown, fallbackId?: string): BorzoOrderResult {
  const orderId = order.order_id != null ? String(order.order_id) : fallbackId ?? "";
  const dropPoint = order.points?.[1];
  const courier = order.courier;
  return {
    borzoOrderId: orderId,
    status: String(order.status ?? "unknown"),
    trackingUrl: dropPoint?.tracking_url ?? null,
    courierName: courier ? [courier.name, courier.surname].filter(Boolean).join(" ") || null : null,
    courierPhone: courier?.phone ?? null,
    raw: response,
  };
}

/** POST /create-order — creates a real delivery order. Throws (uncertain) if Borzo's response has no order id, since a real booking may have been created without us being able to record it. */
export async function createDeliveryOrder(input: BorzoDeliveryInput): Promise<BorzoOrderResult> {
  const response = await borzoFetch("/create-order", {
    matter: input.matter.slice(0, MAX_MATTER_LENGTH),
    ...(input.totalWeightKg ? { total_weight_kg: Math.round(input.totalWeightKg) } : {}),
    ...vehicleTypeOverride(),
    points: [point(input.pickup), point(input.drop)],
  });
  const order = response.order;
  if (!order?.order_id) {
    throw new BorzoRequestError("Borzo returned no order identifier; reconciliation is required.", { uncertain: true });
  }
  return normalizeOrder(order, response);
}

/** POST /orders — re-fetches one order's current status/courier/tracking by id. See the file header note: the exact filter parameter name is an educated, unverified guess. */
export async function fetchDeliveryStatus(borzoOrderId: string): Promise<BorzoOrderResult> {
  const response = await borzoFetch("/orders", { order_id: Number(borzoOrderId) });
  const order = response.order ?? response.orders?.[0];
  if (!order) {
    throw new BorzoRequestError("Borzo returned no order for this id.", { uncertain: true });
  }
  return normalizeOrder(order, response, borzoOrderId);
}

/** POST /cancel-order — only meaningful before pickup; Borzo rejects cancellation past that point with a definite (non-uncertain) error. */
export async function cancelDelivery(borzoOrderId: string): Promise<{ cancelled: boolean; raw: unknown }> {
  const response = await borzoFetch("/cancel-order", { order_id: Number(borzoOrderId) });
  return { cancelled: true, raw: response };
}
