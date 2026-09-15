import type { OrderStatus } from "@prisma/client";

/**
 * Centralized Shiprocket → internal OrderStatus mapping for FORWARD
 * shipments — the one function every tracking-refresh code path calls (see
 * lib/order-delivery-state.ts's applyShippingStatus). Shiprocket's tracking
 * API (`GET /v1/external/courier/track/awb/{awb}`) returns a
 * `current_status` string; the values below are Shiprocket's own documented
 * status vocabulary. An unmatched status returns null — the raw string is
 * still stored (Order.shippingStatus), but the order's own status is never
 * advanced on a guess.
 *
 * Shiprocket statuses handled here:
 *   NEW, PICKUP GENERATED, PICKUP SCHEDULED, PICKUP QUEUED  -> not mapped (still PACKED/PAID locally; nothing to advance to yet)
 *   PICKED UP, IN TRANSIT, SHIPPED                          -> SHIPPED
 *   OUT FOR DELIVERY                                        -> OUT_FOR_DELIVERY
 *   DELIVERED                                                -> DELIVERED
 *   CANCELED / CANCELLED                                     -> CANCELLED
 *   RTO INITIATED / RTO DELIVERED / UNDELIVERED / PICKUP EXCEPTION -> not mapped (needs manual admin attention; see reconcile-shipping.ts)
 */
export function mapShiprocketStatusToOrderStatus(raw: string): OrderStatus | null {
  const value = raw.toLowerCase().trim();

  if (value.includes("rto") || value.includes("undelivered") || value.includes("exception")) return null;
  if (value.includes("cancel")) return "CANCELLED";
  if (value.includes("out for delivery")) return "OUT_FOR_DELIVERY";
  if (value === "delivered" || value.includes("delivered")) return "DELIVERED";
  if (value.includes("in transit") || value.includes("picked up") || value.includes("shipped")) return "SHIPPED";
  return null;
}

/** Same idea, applied to a reverse (return pickup) shipment — true once Shiprocket reports the item actually collected from the customer or delivered back to the warehouse. */
export function isShiprocketReversePickedUp(raw: string): boolean {
  const value = raw.toLowerCase().trim();
  if (value.includes("rto") || value.includes("undelivered") || value.includes("exception")) return false;
  return value.includes("picked up") || value.includes("delivered") || value.includes("in transit");
}

/**
 * Centralized Borzo → internal OrderStatus mapping for local Pune
 * deliveries — see lib/order-delivery-state.ts's applyShippingStatus and
 * lib/shipping/providers/borzo.ts's file header for exactly which parts of
 * Borzo's status vocabulary are confirmed vs. best-effort.
 *
 * Confirmed order-level Borzo statuses (from borzodelivery.com/in/business-api/doc):
 *   new, available                 -> not mapped (order just created/open for a courier, nothing to advance to yet)
 *   delayed                        -> not mapped (still in progress; never regresses status)
 *   active                         -> SHIPPED (a courier is working the order — Borzo's own docs don't
 *                                     expose a picked-up/en-route split at the order level; see the
 *                                     hints below for a finer OUT_FOR_DELIVERY signal)
 *   completed                      -> DELIVERED
 *   cancelled                      -> CANCELLED
 *
 * The drop point's `delivery.status` (hints.pointStatuses) and whether a
 * courier is reporting a real live position (hints.courierHasLiveLocation)
 * are both confirmed real signals — see borzo.ts's BorzoOrderResult and
 * getCourier — but the exact enumeration of possible point-level status
 * strings has not been confirmed from official docs, so only a
 * conservative substring match against a few known phrases is used as an
 * OUT_FOR_DELIVERY upgrade over the coarser "active" order status.
 * Anything unrecognized simply isn't upgraded — it never crashes and never
 * regresses the order.
 */
export function mapBorzoStatusToOrderStatus(
  raw: string,
  hints: { pointStatuses?: string[]; courierHasLiveLocation?: boolean } = {}
): OrderStatus | null {
  const value = raw.toLowerCase().trim();
  if (value === "cancelled") return "CANCELLED";
  if (value === "completed") return "DELIVERED";

  const points = (hints.pointStatuses ?? []).map((point) => point.toLowerCase().trim());
  if (points.some((point) => point.includes("deliver"))) return "DELIVERED";
  if (value === "active") {
    if (hints.courierHasLiveLocation) return "OUT_FOR_DELIVERY";
    if (points.some((point) => point.includes("arrived") || point.includes("start") || point.includes("pickup") || point.includes("picked"))) {
      return "OUT_FOR_DELIVERY";
    }
    return "SHIPPED";
  }
  return null;
}
