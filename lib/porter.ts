/**
 * Porter Partner API wrapper.
 *
 * Porter's delivery API is a business-partner integration — the exact base
 * URL, auth header, and payload shape depend on the partner agreement Porter
 * gives you, and can differ from what's below. This wrapper is built against
 * Porter's commonly documented Partner API v1 shape (quote → create → track)
 * as a working starting point:
 *
 *   POST {PORTER_API_BASE_URL}/v1/get_quote
 *   POST {PORTER_API_BASE_URL}/v1/orders/create
 *   GET  {PORTER_API_BASE_URL}/v1/orders/{order_id}
 *   POST {PORTER_API_BASE_URL}/v1/orders/{order_id}/cancel
 *   Auth: `x-api-key: PORTER_API_KEY` header
 *
 * If your Porter partner docs specify different paths/fields, adjust the
 * constants and payload builders below — the rest of the app (admin routes,
 * order model) does not need to change.
 */

const DEFAULT_BASE_URL = "https://pfe-apigw-uat.porter.in";

export type PorterAddress = {
  contactName: string;
  contactPhone: string;
  line1: string;
  line2?: string;
  city: string;
  pincode: string;
  lat?: number;
  lng?: number;
};

export type PorterOrderResult = {
  porterOrderId: string;
  status: string;
  trackingUrl: string | null;
  raw: unknown;
};

export function isPorterConfigured() {
  return Boolean(process.env.PORTER_API_KEY);
}

function getBaseUrl() {
  return process.env.PORTER_API_BASE_URL?.replace(/\/$/, "") || DEFAULT_BASE_URL;
}

function getApiKey() {
  const key = process.env.PORTER_API_KEY;
  if (!key) {
    throw new Error("Porter is not configured. Set PORTER_API_KEY in .env.local.");
  }
  return key;
}

async function porterFetch(path: string, init: RequestInit) {
  const apiKey = getApiKey();
  const res = await fetch(`${getBaseUrl()}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      ...(process.env.PORTER_CLIENT_ID
        ? { "x-client-id": process.env.PORTER_CLIENT_ID }
        : {}),
      ...init.headers,
    },
  });

  const text = await res.text();
  let json: unknown = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = { raw: text };
  }

  if (!res.ok) {
    throw new Error(
      `Porter API error (${res.status} ${res.statusText}): ${text || "no response body"}`
    );
  }

  return json;
}

/** Requests a delivery quote (fare estimate) for a pickup → drop pair. */
export async function getPorterQuote(params: {
  pickup: PorterAddress;
  drop: PorterAddress;
}) {
  return porterFetch("/v1/get_quote", {
    method: "POST",
    body: JSON.stringify({
      pickup_details: { address: formatAddress(params.pickup) },
      drop_details: { address: formatAddress(params.drop) },
    }),
  });
}

/** Creates a delivery order with Porter for a paid marketplace order. */
export async function createPorterDelivery(params: {
  orderId: string;
  pickup: PorterAddress;
  drop: PorterAddress;
  amount: number;
  instructions?: string;
}): Promise<PorterOrderResult> {
  const response = (await porterFetch("/v1/orders/create", {
    method: "POST",
    body: JSON.stringify({
      request_id: params.orderId,
      pickup_details: { address: formatAddress(params.pickup) },
      drop_details: { address: formatAddress(params.drop) },
      cash_amount: 0,
      additional_comments: params.instructions ?? `Deep Automobiles order ${params.orderId}`,
    }),
  })) as Record<string, unknown>;

  const porterOrderId = String(
    response.order_id ?? response.id ?? response.request_id ?? ""
  );

  return {
    porterOrderId,
    status: String(response.status ?? "created"),
    trackingUrl:
      (response.tracking_url as string | undefined) ??
      (porterOrderId ? `${getBaseUrl()}/track/${porterOrderId}` : null),
    raw: response,
  };
}

/** Fetches the latest status for a Porter delivery order. */
export async function getPorterDeliveryStatus(porterOrderId: string) {
  const response = (await porterFetch(`/v1/orders/${encodeURIComponent(porterOrderId)}`, {
    method: "GET",
  })) as Record<string, unknown>;

  return {
    status: String(response.status ?? "unknown"),
    raw: response,
  };
}

/** Cancels a Porter delivery order (e.g. when the marketplace order is cancelled). */
export async function cancelPorterDelivery(porterOrderId: string) {
  return porterFetch(`/v1/orders/${encodeURIComponent(porterOrderId)}/cancel`, {
    method: "POST",
  });
}

function formatAddress(address: PorterAddress) {
  return {
    name: address.contactName,
    phone: address.contactPhone,
    line1: address.line1,
    line2: address.line2 ?? "",
    city: address.city,
    pincode: address.pincode,
    lat: address.lat,
    lng: address.lng,
  };
}
