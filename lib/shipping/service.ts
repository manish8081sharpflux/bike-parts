/**
 * Generic shipping service — the ONLY module the rest of the app (order
 * state machines, admin actions, UI) should import for shipping
 * functionality. Nothing outside lib/shipping/ should import from
 * lib/shipping/providers/* directly.
 *
 * Two provider "shapes" exist side by side, deliberately not forced into
 * one abstraction (see Part 5 of the Borzo integration task):
 *
 *  - Long-haul / pan-India forward shipments and reverse returns —
 *    Shiprocket's create→AWB→pickup flow (createShipment/assignAwb/
 *    schedulePickup/createReverseShipment/checkServiceability/
 *    trackShipment/cancelShipment). These always use Shiprocket regardless
 *    of SHIPPING_PROVIDER, so non-local orders keep shipping normally even
 *    once Borzo is configured as the default for local Pune deliveries —
 *    Shiprocket has no equivalent for what SHIPPING_PROVIDER=BORZO would
 *    otherwise gate.
 *  - Local, same-city delivery — Borzo's quote→create→track→cancel flow
 *    (quoteLocalDelivery/createLocalDelivery/trackLocalDelivery/
 *    cancelLocalDelivery), only ever offered for Pune-to-Pune orders (see
 *    lib/shipping/pune-eligibility.ts). Borzo has no AWB/label concept, so
 *    it is never routed through the Shiprocket-shaped functions above.
 *
 * getConfiguredProvider()/SHIPPING_PROVIDER pick which provider is treated
 * as the store's "primary/default" for admin-dashboard messaging — it does
 * NOT gate which of the two flows above is callable; that's determined by
 * which flow's functions you call and (for Borzo) Pune eligibility.
 *
 * Order/OrderReturn's shippingProvider column stores the provider name
 * per-shipment specifically so historical shipments (including
 * pre-Shiprocket-migration "PORTER" rows — see the Prisma ShippingProvider
 * enum and the migration note on Order.shippingProvider) remain
 * distinguishable forever.
 */
import * as shiprocket from "./providers/shiprocket";
import * as borzo from "./providers/borzo";
import { checkLocalDeliveryEligibility as checkPuneEligibility, type LocalDeliveryEligibility } from "./pune-eligibility";
import type {
  AwbResult,
  CancelShipmentResult,
  CheckServiceabilityInput,
  CourierOption,
  CreateShipmentInput,
  CreateShipmentResult,
  LocalDeliveryInput,
  LocalDeliveryQuote,
  LocalDeliveryResult,
  PickupResult,
  ReverseShipmentInput,
  ShippingProvider,
  TrackingResult,
} from "./types";

export { ShippingProviderError } from "./providers/shiprocket";
export { BorzoRequestError } from "./providers/borzo";
export * from "./types";
export { normalizeCityName } from "./pune-eligibility";
export type { LocalDeliveryEligibility } from "./pune-eligibility";

function resolveProvider(): ShippingProvider {
  const configured = (process.env.SHIPPING_PROVIDER || "SHIPROCKET").toUpperCase();
  if (configured !== "SHIPROCKET" && configured !== "BORZO") {
    throw new Error(`Unsupported SHIPPING_PROVIDER "${configured}". Only SHIPROCKET and BORZO are implemented today.`);
  }
  return configured as ShippingProvider;
}

/** The store's configured "primary/default" provider — informational (admin dashboard, health), not a gate on which flow below is callable. */
export function getConfiguredProvider(): ShippingProvider {
  return resolveProvider();
}

/** True when at least one provider (Shiprocket for long-haul, Borzo for local) is usable. */
export function isShippingConfigured(): boolean {
  return shiprocket.isShiprocketConfigured() || borzo.isBorzoConfigured();
}

export function isShiprocketConfigured(): boolean {
  return shiprocket.isShiprocketConfigured();
}

export function assertShippingConfigured(): void {
  shiprocket.assertShiprocketConfigured();
}

export async function checkServiceability(input: CheckServiceabilityInput): Promise<CourierOption[]> {
  return shiprocket.checkServiceability(input);
}

/** Creates a long-haul forward shipment for a paid order via Shiprocket. */
export async function createShipment(input: CreateShipmentInput): Promise<CreateShipmentResult> {
  return shiprocket.createForwardShipment(input);
}

/** Creates a reverse shipment for a return — pickup = customer address, drop = warehouse. Only ever pass the returned items/quantities, never the full order (see lib/order-returns/service.ts). Always Shiprocket — Borzo returns are not implemented yet (see Part 20 of the Borzo integration task). */
export async function createReverseShipment(input: ReverseShipmentInput): Promise<CreateShipmentResult> {
  return shiprocket.createReverseShipment(input);
}

export async function assignAwb(shippingShipmentId: string, courierCompanyId?: string): Promise<AwbResult> {
  return shiprocket.assignAwb(shippingShipmentId, courierCompanyId);
}

export async function schedulePickup(shippingShipmentId: string): Promise<PickupResult> {
  return shiprocket.generatePickup(shippingShipmentId);
}

/** Tracks a Shiprocket shipment, preferring the AWB (the provider's tracking granularity is per-AWB, not per-order) and falling back to the shipment id if no AWB exists yet. Only ever call this for a shippingProvider === "SHIPROCKET" row — use trackLocalDelivery for BORZO rows. */
export async function trackShipment(identifiers: { awbCode?: string | null; shippingShipmentId?: string | null }): Promise<TrackingResult> {
  if (identifiers.awbCode) return shiprocket.trackByAwb(identifiers.awbCode);
  if (identifiers.shippingShipmentId) return shiprocket.trackByShipmentId(identifiers.shippingShipmentId);
  throw new Error("trackShipment requires an AWB code or a shipment id.");
}

/** Only attempt when the shipment's state actually allows cancellation (see the admin action for the exact allowed states) — Shiprocket itself will also reject a cancellation past pickup. Only for shippingProvider === "SHIPROCKET" rows — use cancelLocalDelivery for BORZO rows. */
export async function cancelShipment(shippingOrderId: string): Promise<CancelShipmentResult> {
  return shiprocket.cancelOrder(shippingOrderId);
}

// ---------------------------------------------------------------------------
// Local (same-city) delivery — Borzo, Pune-to-Pune only for now. Deliberately
// a separate flow shape from the Shiprocket functions above (Part 5) — no
// AWB, an explicit quote-before-booking step, and idempotency enforced by
// the caller via the same shippingOrderId claim pattern used everywhere
// else (see lib/order-delivery-state.ts).
// ---------------------------------------------------------------------------

export function isBorzoConfigured(): boolean {
  return borzo.isBorzoConfigured();
}

export function assertBorzoConfigured(): void {
  borzo.assertBorzoConfigured();
}

/** Pure, server-side eligibility check — both the warehouse and the customer's address must be Pune. Never trust a client-supplied "is this Pune" flag. */
export function checkLocalDeliveryEligibility(warehouseCity: string | null | undefined, customerCity: string | null | undefined, customerPincode?: string | null): LocalDeliveryEligibility {
  return checkPuneEligibility(warehouseCity, customerCity, customerPincode);
}

/** A price/fee quote from Borzo — never creates a real delivery. Only ever shows amounts the provider actually returned (see LocalDeliveryQuote's doc comments) — never fabricated. */
export async function quoteLocalDelivery(input: LocalDeliveryInput): Promise<LocalDeliveryQuote> {
  const result = await borzo.calculateDelivery(input);
  return {
    provider: "BORZO",
    deliveryFeeAmount: result.deliveryFeeAmount,
    paymentAmount: result.paymentAmount,
    estimatedDeliveryAt: null, // Borzo's calculate-order response doesn't return an absolute ETA timestamp in what's confirmed from the docs — never guessed here.
    raw: result.raw,
  };
}

/**
 * A courier lookup failure (no courier assigned yet, or a transient error)
 * must never fail the surrounding create/track call — the order/tracking
 * result is still real and valid on its own. Logged, never surfaced to the
 * caller; the caller simply sees "no courier info yet" (see Part 4/14).
 */
async function safeGetCourier(borzoOrderId: string): Promise<borzo.BorzoCourierResult> {
  try {
    return await borzo.getCourier(borzoOrderId);
  } catch (error) {
    console.error("[shipping] Borzo courier lookup failed for order", borzoOrderId, error);
    return { courierId: null, name: null, phone: null, photoUrl: null, latitude: null, longitude: null };
  }
}

function toLocalDeliveryResult(order: borzo.BorzoOrderResult, courier: borzo.BorzoCourierResult): LocalDeliveryResult {
  return {
    provider: "BORZO",
    shippingOrderId: order.borzoOrderId,
    status: order.status,
    statusDescription: order.statusDescription,
    pointDeliveryStatus: order.pointDeliveryStatus,
    trackingUrl: order.trackingUrl,
    waybillUrl: order.waybillUrl,
    deliveryFeeAmount: order.deliveryFeeAmount,
    courierId: courier.courierId,
    courierName: courier.name,
    courierPhone: courier.phone,
    courierPhotoUrl: courier.photoUrl,
    courierLatitude: courier.latitude,
    courierLongitude: courier.longitude,
    pickupLatitude: order.pickupLatitude,
    pickupLongitude: order.pickupLongitude,
    dropLatitude: order.dropLatitude,
    dropLongitude: order.dropLongitude,
    distanceMeters: order.distanceMeters,
    raw: order.raw,
  };
}

/** Creates a real Borzo delivery order, then checks (best-effort) whether a courier has already been assigned. */
export async function createLocalDelivery(input: LocalDeliveryInput): Promise<LocalDeliveryResult> {
  const result = await borzo.createDeliveryOrder(input);
  const courier = await safeGetCourier(result.borzoOrderId);
  return toLocalDeliveryResult(result, courier);
}

/** Re-fetches a Borzo delivery's current order status and real assigned courier/rider (if any) via the documented GET /orders and GET /courier endpoints. */
export async function trackLocalDelivery(borzoOrderId: string): Promise<LocalDeliveryResult> {
  const result = await borzo.fetchDeliveryStatus(borzoOrderId);
  const courier = await safeGetCourier(borzoOrderId);
  return toLocalDeliveryResult(result, courier);
}

/** Cancels a Borzo delivery — only meaningful before pickup; Borzo itself rejects cancellation past that point with a definite (non-uncertain) error. */
export async function cancelLocalDelivery(borzoOrderId: string): Promise<CancelShipmentResult> {
  return borzo.cancelDelivery(borzoOrderId);
}
