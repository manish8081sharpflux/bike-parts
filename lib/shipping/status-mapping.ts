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
