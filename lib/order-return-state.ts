import { prisma } from "@/lib/db";
import { requestRefund } from "@/lib/order-refund-state";

export type ReturnRequestResult = "requested" | "already_requested" | "not_returnable";

/**
 * Customer-initiated return request. Only makes sense once an order has
 * actually been delivered — for anything still in flight, cancellation
 * (see order-delivery-state.ts) is the right action, not a return.
 * REJECTED can be requested again, same as the refund flow it feeds into.
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
 * Atomically claims an approved return for reverse-pickup dispatch, mirroring
 * claimPorterDispatch's "DISPATCHING" placeholder pattern (see
 * order-delivery-state.ts) so a double-click can't create two Porter orders
 * for the same return.
 */
export async function claimReturnPickupDispatch(orderId: string) {
  const claim = await prisma.order.updateMany({
    where: { id: orderId, returnStatus: "APPROVED", returnPorterOrderId: null },
    data: { returnPorterOrderId: "DISPATCHING" },
  });
  return claim.count === 1;
}

export async function completeReturnPickupDispatch(
  orderId: string,
  result: { porterOrderId: string; status: string; trackingUrl: string | null }
) {
  return prisma.$transaction(async (tx) => {
    const completed = await tx.order.updateMany({
      where: { id: orderId, returnPorterOrderId: "DISPATCHING" },
      data: {
        returnStatus: "PICKUP_SCHEDULED",
        returnPorterOrderId: result.porterOrderId,
        returnPorterStatus: result.status,
        returnPorterTrackingUrl: result.trackingUrl,
      },
    });
    if (completed.count !== 1) return false;
    await tx.orderEvent.create({
      data: { orderId, type: "RETURN_PICKUP_DISPATCHED", message: `Return pickup dispatched via Porter (order ${result.porterOrderId})` },
    });
    return true;
  });
}

export async function failReturnPickupDispatch(orderId: string, failureMessage: string) {
  await prisma.$transaction(async (tx) => {
    await tx.order.updateMany({
      where: { id: orderId, returnPorterOrderId: "DISPATCHING" },
      data: { returnPorterOrderId: null, returnPorterStatus: null },
    });
    await tx.orderEvent.create({
      data: { orderId, type: "RETURN_PICKUP_DISPATCH_FAILED", message: failureMessage },
    });
  });
}

/** Applies a raw Porter status string for the reverse-pickup shipment — moves PICKUP_SCHEDULED to PICKED_UP once Porter reports the item collected/delivered (back to the warehouse). */
export async function applyReturnPorterStatus(orderId: string, rawStatus: string) {
  return prisma.$transaction(async (tx) => {
    await tx.order.update({ where: { id: orderId }, data: { returnPorterStatus: rawStatus } });

    const value = rawStatus.toLowerCase().trim();
    const isPickedUp =
      value.includes("delivered") || value.includes("completed") || value.includes("complete");
    if (!isPickedUp) return { transitioned: false };

    const transitioned = await tx.order.updateMany({
      where: { id: orderId, returnStatus: "PICKUP_SCHEDULED" },
      data: { returnStatus: "PICKED_UP" },
    });
    if (transitioned.count === 1) {
      await tx.orderEvent.create({
        data: { orderId, type: "RETURN_PICKED_UP", message: `Return picked up (Porter status "${rawStatus}")` },
      });
    }
    return { transitioned: transitioned.count === 1 };
  });
}

/**
 * Admin confirms the returned item is physically back at the warehouse.
 * Allowed from PICKED_UP (the normal path) or PICKUP_SCHEDULED (a manual
 * fallback for when Porter's tracking doesn't reliably report pickup) —
 * automatically kicks off the existing refund flow so the money side reuses
 * the same tested Razorpay approve/reject code a cancellation refund does.
 */
export async function markReturnReceived(orderId: string, adminNote: string) {
  return prisma.$transaction(async (tx) => {
    const claim = await tx.order.updateMany({
      where: { id: orderId, returnStatus: { in: ["PICKED_UP", "PICKUP_SCHEDULED"] } },
      data: { returnStatus: "RECEIVED", returnAdminNote: adminNote || null, returnReceivedAt: new Date() },
    });
    if (claim.count !== 1) return false;
    await tx.orderEvent.create({
      data: { orderId, type: "RETURN_RECEIVED", message: `Return received at warehouse${adminNote ? ` — ${adminNote}` : ""}` },
    });
    await requestRefund(orderId, "Product returned and received", tx);
    return true;
  });
}
