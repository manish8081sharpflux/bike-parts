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
 * Same idea as isShiprocketReversePickedUp, for a Borzo return pickup — a
 * delivery order where the customer's address is the pickup point and the
 * warehouse is the drop (see createBorzoReturnPickupAction). "completed"
 * means it has genuinely arrived back at the warehouse; a point-level
 * pickup/arrival phrase is the same conservative, best-effort signal used
 * for forward OUT_FOR_DELIVERY detection (see mapBorzoStatusToOrderStatus) —
 * "active" alone is not treated as picked up, since Borzo's order-level
 * status doesn't otherwise distinguish "courier assigned" from "already at
 * the customer's door."
 */
export function isBorzoReversePickedUp(raw: string, pointStatuses: string[] = []): boolean {
  const value = raw.toLowerCase().trim();
  if (value === "cancelled") return false;
  if (value === "completed") return true;
  const points = pointStatuses.map((point) => point.toLowerCase().trim());
  return points.some((point) => point.includes("picked") || point.includes("pickup") || point.includes("arrived") || point.includes("deliver"));
}

/**
 * Centralized Borzo → internal OrderStatus mapping for local Pune
 * deliveries — see lib/order-delivery-state.ts's applyShippingStatus and
 * lib/shipping/providers/borzo.ts's file header for exactly which parts of
 * Borzo's status vocabulary are confirmed vs. best-effort.
 *
 * Confirmed order-level Borzo statuses (from borzodelivery.com/in/business-api/doc):
 *   new, available                 -> not mapped (order just created/open for a courier, nothing to advance to yet)
 *   delayed                        -> not mapped (still in progress; never regresses status — the raw
 *                                     string is still stored on the order and shown as-is by
 *                                     lib/order-tracking.ts's shipmentStatus, so "Delayed" already
 *                                     surfaces to the customer without any extra handling here)
 *   active                         -> not mapped by itself (see below — Borzo's docs don't expose a
 *                                     picked-up/en-route split at the order level, so "active" alone
 *                                     only means "a courier has the job", not "the parcel has moved")
 *   completed                      -> DELIVERED
 *   cancelled                      -> CANCELLED
 *
 * The one real, confirmed sub-signal comes from the DROP point's own
 * `delivery.status` (hints.pointStatuses — see borzo.ts's normalizeOrder,
 * which reads this from the drop point only; the pickup point's `delivery`
 * field has been observed as structurally null on every real order checked
 * — Borzo does not expose a separate pickup-point status at all). Two
 * values have been observed directly from live sandbox orders:
 *   "planned"          — order created, drop scheduled, nothing moving yet
 *   "courier_departed" — the courier has left the pickup point WITH the
 *                         package, headed to the drop
 * There is no distinct "picked up but not yet departed" signal to observe —
 * for a same-city Borzo trip, picking up and departing appear to be the
 * same real-world moment, so "courier_departed" is treated as the single
 * ground-truth trigger for OUT_FOR_DELIVERY (skipping an intermediate
 * SHIPPED that nothing in Borzo's data would ever actually satisfy).
 * "courier_arrived" and a "finished" drop status are not yet confirmed from
 * a live response but follow the exact naming convention already observed
 * ("courier_departed"), so they're included as the same kind of
 * conservative, best-effort upgrade the "arrived"/"pickup"/"picked"
 * phrases already were. Anything unrecognized simply isn't upgraded — it
 * never crashes and never regresses the order.
 *
 * A courier merely reporting a live GPS position is deliberately NOT
 * treated as proof of departure — a courier can be assigned and already
 * broadcasting a position while still travelling TO the pickup point, so
 * "has GPS" alone previously caused a false-positive jump straight to
 * OUT_FOR_DELIVERY before the parcel had actually left the shop.
 */
export function mapBorzoStatusToOrderStatus(
  raw: string,
  hints: { pointStatuses?: string[] } = {}
): OrderStatus | null {
  const value = raw.toLowerCase().trim();
  if (value === "cancelled") return "CANCELLED";
  if (value === "completed") return "DELIVERED";

  const points = (hints.pointStatuses ?? []).map((point) => point.toLowerCase().trim());
  if (points.some((point) => point.includes("deliver") || point.includes("finish"))) return "DELIVERED";
  if (value === "active") {
    if (points.some((point) => point.includes("arrived") || point.includes("start") || point.includes("pickup") || point.includes("picked") || point.includes("depart"))) {
      return "OUT_FOR_DELIVERY";
    }
    // A courier is assigned and working the job, but nothing confirms the
    // parcel has actually left the shop yet — stay at the order's current
    // status ("Preparing") rather than guessing "Shipped" prematurely.
    return null;
  }
  return null;
}
