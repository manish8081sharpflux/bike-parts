import { Prisma, type ShippingProvider } from "@prisma/client";
import { prisma } from "@/lib/db";
import { requestRefund } from "@/lib/order-refund-state";

export type ReturnRequestResult = "requested" | "already_requested" | "not_returnable";

/**
 * Customer-initiated return request. Only makes sense once an order has
 * actually been delivered — for anything still in flight, cancellation
 * (see order-delivery-state.ts) is the right action, not a return.
 * REJECTED can be requested again, same as the refund flow it feeds into.
 *
 * This whole-order flow is legacy — see the ReturnStatus doc comment in
 * schema.prisma. New return requests should go through
 * lib/order-returns/service.ts (item/quantity-level); this module is kept
 * only so pre-existing in-flight whole-order returns can finish.
 */
export async function requestReturn(orderId: string, reason: string): Promise<ReturnRequestResult> {
  return prisma.$transaction(async (tx) => {
    const claim = await tx.order.updateMany({
      where: {
        id: orderId,
        status: "DELIVERED",
        returnStatus: { in: ["NONE", "REJECTED"] },
      },
      data: {
        returnStatus: "REQUESTED",
        returnReason: reason,
        returnAdminNote: null,
        returnRequestedAt: new Date(),
      },
    });

    if (claim.count !== 1) {
      const current = await tx.order.findUnique({ where: { id: orderId }, select: { returnStatus: true } });
      return current?.returnStatus === "REQUESTED" ? "already_requested" : "not_returnable";
    }

    await tx.orderEvent.create({
      data: { orderId, type: "RETURN_REQUESTED", message: `Return requested — ${reason}` },
    });
    return "requested";
  });
}

export async function approveReturn(orderId: string, adminNote: string) {
  return prisma.$transaction(async (tx) => {
    const claim = await tx.order.updateMany({
      where: { id: orderId, returnStatus: "REQUESTED" },
      data: { returnStatus: "APPROVED", returnAdminNote: adminNote || null },
    });
    if (claim.count !== 1) return false;
    await tx.orderEvent.create({
      data: { orderId, type: "RETURN_APPROVED", message: `Return approved${adminNote ? ` — ${adminNote}` : ""}` },
    });
    return true;
  });
}

export async function rejectReturn(orderId: string, adminNote: string) {
  return prisma.$transaction(async (tx) => {
    const claim = await tx.order.updateMany({
      where: { id: orderId, returnStatus: "REQUESTED" },
      data: { returnStatus: "REJECTED", returnAdminNote: adminNote },
    });
    if (claim.count !== 1) return false;
    await tx.orderEvent.create({
      data: { orderId, type: "RETURN_REJECTED", message: `Return request rejected — ${adminNote}` },
    });
    return true;
  });
}

/**
 * Atomically claims an approved return for reverse-shipment creation,
 * mirroring claimShippingDispatch's "CREATING" placeholder pattern (see
 * order-delivery-state.ts) so a double-click can't create two shipments for
 * the same return. Also blocked while a prior attempt's outcome is still
 * uncertain (returnShippingOrderId stays "CREATING" in that case — see
 * failReturnShippingDispatch) so a retry can never race a shipment that may
 * have already been created on the provider's side.
 */
export async function claimReturnShippingDispatch(orderId: string) {
  const claim = await prisma.order.updateMany({
    where: { id: orderId, returnStatus: "APPROVED", returnShippingOrderId: null },
    data: {
      returnShippingOrderId: "CREATING",
      returnShippingAttemptedAt: new Date(),
      returnShippingReconciliationRequired: false,
      returnShippingLastError: null,
    },
  });
  return claim.count === 1;
}

export type ReturnShipmentResult = {
  provider: ShippingProvider;
  shippingOrderId: string;
  shippingShipmentId: string | null;
  awbCode: string | null;
  courierName: string | null;
  status: string;
  trackingUrl: string | null;
};

export async function completeReturnShippingDispatch(orderId: string, result: ReturnShipmentResult) {
  return prisma.$transaction(async (tx) => {
    const completed = await tx.order.updateMany({
      where: { id: orderId, returnShippingOrderId: "CREATING" },
      data: {
        returnStatus: "PICKUP_SCHEDULED",
        returnShippingProvider: result.provider,
        returnShippingOrderId: result.shippingOrderId,
        returnShippingShipmentId: result.shippingShipmentId,
        returnShippingAwbCode: result.awbCode,
        returnShippingCourierName: result.courierName,
        returnShippingStatus: result.status,
        returnShippingTrackingUrl: result.trackingUrl,
        returnShippingReconciliationRequired: false,
        returnShippingLastError: null,
      },
    });
    if (completed.count !== 1) return false;
    await tx.orderEvent.create({
      data: {
        orderId,
        type: "RETURN_SHIPMENT_CREATED",
        message: `Return shipment created via ${result.provider} (order ${result.shippingOrderId}${result.awbCode ? `, AWB ${result.awbCode}` : ""})`,
      },
    });
    return true;
  });
}

/**
 * Mirrors dispatchOrderAction's exact definite-vs-uncertain split for the
 * forward shipment (see admin-orders.ts), applied to the reverse shipment:
 *
 * - Definite failure (the provider clearly rejected the request before
 *   creating anything): clear the claim so it can be retried, and record why.
 * - Uncertain failure (timeout/ECONNRESET/socket interruption, or a
 *   response missing a shipment id — the shipment may have actually been
 *   created): do NOT clear the claim. returnShippingOrderId stays "CREATING"
 *   (blocking claimReturnShippingDispatch's WHERE clause from ever matching
 *   again) and returnShippingReconciliationRequired is set so an operator
 *   has to verify with the provider directly before anything can be
 *   retried — never automatic.
 */
export async function failReturnShippingDispatch(orderId: string, failureMessage: string, uncertain: boolean) {
  await prisma.$transaction(async (tx) => {
    if (uncertain) {
      await tx.order.updateMany({
        where: { id: orderId, returnShippingOrderId: "CREATING" },
        data: {
          returnShippingStatus: "RECONCILIATION_REQUIRED",
          returnShippingReconciliationRequired: true,
          returnShippingLastError: failureMessage,
        },
      });
      await tx.orderEvent.create({
        data: { orderId, type: "RETURN_SHIPMENT_RECONCILIATION_REQUIRED", message: failureMessage },
      });
    } else {
      await tx.order.updateMany({
        where: { id: orderId, returnShippingOrderId: "CREATING" },
        data: { returnShippingOrderId: null, returnShippingStatus: null, returnShippingLastError: failureMessage },
      });
      await tx.orderEvent.create({
        data: { orderId, type: "RETURN_SHIPMENT_CREATE_FAILED", message: failureMessage },
      });
    }
  });
}

/**
 * Applies a raw shipping-provider status string for the reverse shipment —
 * moves PICKUP_SCHEDULED to PICKED_UP once the provider reports the item
 * collected from the customer. `pickedUp` is precomputed by the caller
 * (isShiprocketReversePickedUp or isBorzoReversePickedUp — see
 * lib/shipping/status-mapping.ts) since each provider's status vocabulary
 * differs; this function only ever applies the one shared transition rule.
 */
export async function applyReturnShippingStatus(orderId: string, rawStatus: string, pickedUp: boolean) {
  return prisma.$transaction(async (tx) => {
    await tx.order.update({ where: { id: orderId }, data: { returnShippingStatus: rawStatus } });

    if (!pickedUp) return { transitioned: false };

    const transitioned = await tx.order.updateMany({
      where: { id: orderId, returnStatus: "PICKUP_SCHEDULED" },
      data: { returnStatus: "PICKED_UP" },
    });
    if (transitioned.count === 1) {
      await tx.orderEvent.create({
        data: { orderId, type: "RETURN_PICKED_UP", message: `Return picked up (shipping status "${rawStatus}")` },
      });
    }
    return { transitioned: transitioned.count === 1 };
  });
}

/**
 * Increments BikePartListing.stock for every line item on this order that
 * still resolves to a live listing — only ever called for a RESELLABLE
 * return (see markReturnReceived), never automatically. Guarded by
 * returnStockRestored, claimed atomically in the same transaction as the
 * rest of markReturnReceived, so neither a repeated click nor a retried
 * request can restore stock twice for the same return.
 */
async function restoreReturnedStock(orderId: string, tx: Prisma.TransactionClient): Promise<boolean> {
  const claim = await tx.order.updateMany({
    where: { id: orderId, returnStockRestored: false },
    data: { returnStockRestored: true },
  });
  if (claim.count !== 1) return false;

  const items = await tx.orderItem.findMany({
    where: { orderId, listingId: { not: null } },
    select: { listingId: true, quantity: true },
  });
  for (const item of items) {
    // listingId is non-null by the query above; Prisma's type still allows
    // null since it can't express that filter in the return type.
    if (!item.listingId) continue;
    await tx.bikePartListing.update({
      where: { id: item.listingId },
      data: { stock: { increment: item.quantity } },
    });
  }
  await tx.orderEvent.create({
    data: {
      orderId,
      type: "RETURN_STOCK_RESTORED",
      message: `Stock restored for ${items.length} item(s) — condition: resellable.`,
    },
  });
  return true;
}

export type ReturnCondition = "RESELLABLE" | "DAMAGED";

/**
 * Admin confirms the returned item is physically back at the warehouse.
 * Allowed from PICKED_UP (the normal path) or PICKUP_SCHEDULED (a manual
 * fallback for when the provider's tracking doesn't reliably report pickup)
 * — automatically kicks off the existing refund flow so the money side
 * reuses the same tested Razorpay approve/reject code a cancellation
 * refund does.
 *
 * `condition` is a required, explicit admin choice — a returned part may be
 * resellable, damaged, opened, or scrap, so stock is never restored
 * automatically. Only RESELLABLE ever increases BikePartListing.stock (see
 * restoreReturnedStock), and only once (returnStockRestored guards repeats).
 */
export async function markReturnReceived(orderId: string, adminNote: string, condition: ReturnCondition) {
  return prisma.$transaction(async (tx) => {
    const claim = await tx.order.updateMany({
      where: { id: orderId, returnStatus: { in: ["PICKED_UP", "PICKUP_SCHEDULED"] } },
      data: {
        returnStatus: "RECEIVED",
        returnAdminNote: adminNote || null,
        returnReceivedAt: new Date(),
        returnCondition: condition,
      },
    });
    if (claim.count !== 1) return { received: false, stockRestored: false };

    await tx.orderEvent.create({
      data: {
        orderId,
        type: "RETURN_RECEIVED",
        message: `Return received at warehouse — condition: ${condition === "RESELLABLE" ? "resellable" : "damaged / not restocked"}${adminNote ? ` — ${adminNote}` : ""}`,
      },
    });

    const stockRestored = condition === "RESELLABLE" ? await restoreReturnedStock(orderId, tx) : false;

    await requestRefund(orderId, "Product returned and received", tx);
    return { received: true, stockRestored };
  });
}
