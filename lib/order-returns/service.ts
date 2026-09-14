import { Prisma, type ShippingProvider } from "@prisma/client";
import { z } from "zod";
import { prisma } from "@/lib/db";
import type { ReturnCondition } from "@/lib/order-return-state";
import { isShiprocketReversePickedUp } from "@/lib/shipping/status-mapping";

export class PartialReturnError extends Error {
  constructor(message: string, public status: number) { super(message); }
}

const lineSchema = z.object({
  orderItemId: z.string().min(1),
  quantity: z.number().int().min(1),
});

const requestSchema = z.object({
  reason: z.string().trim().min(1).max(500),
  items: z.array(lineSchema).min(1).max(50),
}).strict();

/**
 * Customer-initiated item/quantity-level return request. Mirrors
 * createProductReview's exact "lock the order through the insert" pattern
 * (see lib/reviews/service.ts) so ownership, delivery state, and remaining
 * returnable quantity are all re-verified inside the same transaction that
 * creates the OrderReturnItem rows — a second concurrent request for the
 * same item blocks on the OrderItem row lock below instead of racing past
 * this one's read of "already returned" quantity.
 *
 * Deliberately independent of the legacy whole-order return flow (see
 * order-return-state.ts) — but blocked while that flow has an unresolved
 * request in progress on this order (anything other than NONE/REJECTED),
 * since the old flow restores stock and refunds for the *entire* order and
 * running both at once on the same items could double-restock or
 * double-refund. Old orders that never touch the new flow are unaffected.
 */
export async function requestPartialReturn(userId: string, orderId: string, input: unknown) {
  const parsed = requestSchema.safeParse(input);
  if (!parsed.success) {
    throw new PartialReturnError("Select at least one item with a valid quantity and provide a reason.", 400);
  }
  const { reason, items } = parsed.data;

  const orderItemIds = [...new Set(items.map((line) => line.orderItemId))];
  if (orderItemIds.length !== items.length) {
    throw new PartialReturnError("Each item can only appear once per return request.", 400);
  }
  // Lock rows in a stable order across concurrent requests touching
  // overlapping item sets, so two transactions can't deadlock waiting on
  // each other's locks in opposite orders.
  const sortedItemIds = [...orderItemIds].sort();

  return prisma.$transaction(async (tx) => {
    const orders = await tx.$queryRaw<Array<{ id: string; status: string; returnStatus: string }>>`
      SELECT "id", "status", "returnStatus" FROM "Order" WHERE "id" = ${orderId} AND "buyerId" = ${userId} FOR UPDATE`;
    const order = orders[0];
    if (!order) throw new PartialReturnError("Order not found.", 404);
    if (order.status !== "DELIVERED") throw new PartialReturnError("Only delivered orders can be returned.", 409);
    if (!["NONE", "REJECTED"].includes(order.returnStatus)) {
      throw new PartialReturnError("This order already has a whole-order return in progress. Contact support to return individual items.", 409);
    }

    const orderItems = await tx.$queryRaw<Array<{ id: string; quantity: number }>>(
      Prisma.sql`SELECT "id", "quantity" FROM "OrderItem" WHERE "id" IN (${Prisma.join(sortedItemIds)}) AND "orderId" = ${orderId} FOR UPDATE`
    );
    if (orderItems.length !== sortedItemIds.length) {
      throw new PartialReturnError("One or more items do not belong to this order.", 404);
    }

    const alreadyReturnedRows = await tx.$queryRaw<Array<{ orderItemId: string; returned: bigint }>>(
      Prisma.sql`
        SELECT ori."orderItemId" AS "orderItemId", COALESCE(SUM(ori."quantity"), 0) AS "returned"
        FROM "OrderReturnItem" ori
        JOIN "OrderReturn" r ON r.id = ori."returnId"
        WHERE ori."orderItemId" IN (${Prisma.join(sortedItemIds)}) AND r.status != 'REJECTED'
        GROUP BY ori."orderItemId"`
    );
    const alreadyReturned = new Map(alreadyReturnedRows.map((row) => [row.orderItemId, Number(row.returned)]));
    const purchasedById = new Map(orderItems.map((row) => [row.id, row.quantity]));

    for (const line of items) {
      const purchased = purchasedById.get(line.orderItemId) ?? 0;
      const returned = alreadyReturned.get(line.orderItemId) ?? 0;
      const remaining = purchased - returned;
      if (line.quantity > remaining) {
        throw new PartialReturnError(
          remaining <= 0
            ? "This item has already been fully returned."
            : `Only ${remaining} unit(s) of this item can still be returned.`,
          409
        );
      }
    }

    const created = await tx.orderReturn.create({
      data: {
        orderId,
        reason,
        items: { create: items.map((line) => ({ orderItemId: line.orderItemId, quantity: line.quantity })) },
      },
    });

    await tx.orderEvent.create({
      data: {
        orderId,
        type: "PARTIAL_RETURN_REQUESTED",
        message: `Return #${created.id.slice(-6)} requested for ${items.length} item(s) — ${reason}`,
      },
    });

    return created;
  });
}

export async function approvePartialReturn(returnId: string, adminNote: string) {
  return prisma.$transaction(async (tx) => {
    const claim = await tx.orderReturn.updateMany({
      where: { id: returnId, status: "REQUESTED" },
      data: { status: "APPROVED", adminNote: adminNote || null, approvedAt: new Date() },
    });
    if (claim.count !== 1) return false;
    const ret = await tx.orderReturn.findUniqueOrThrow({ where: { id: returnId }, select: { orderId: true } });
    await tx.orderEvent.create({
      data: { orderId: ret.orderId, type: "PARTIAL_RETURN_APPROVED", message: `Return #${returnId.slice(-6)} approved${adminNote ? ` — ${adminNote}` : ""}` },
    });
    return true;
  });
}

/** Rejecting a return does not permanently consume returnable quantity — REJECTED rows are excluded from the "already returned" sum above, so the customer can request the same units again. */
export async function rejectPartialReturn(returnId: string, adminNote: string) {
  return prisma.$transaction(async (tx) => {
    const claim = await tx.orderReturn.updateMany({
      where: { id: returnId, status: "REQUESTED" },
      data: { status: "REJECTED", adminNote },
    });
    if (claim.count !== 1) return false;
    const ret = await tx.orderReturn.findUniqueOrThrow({ where: { id: returnId }, select: { orderId: true } });
    await tx.orderEvent.create({
      data: { orderId: ret.orderId, type: "PARTIAL_RETURN_REJECTED", message: `Return #${returnId.slice(-6)} rejected — ${adminNote}` },
    });
    return true;
  });
}

/** Same CREATING-placeholder claim pattern as claimReturnShippingDispatch (order-return-state.ts), scoped to one OrderReturn so two returns on the same order never collide on a single shipment. */
export async function claimPartialReturnShippingDispatch(returnId: string) {
  const claim = await prisma.orderReturn.updateMany({
    where: { id: returnId, status: "APPROVED", shippingOrderId: null },
    data: {
      shippingOrderId: "CREATING",
      shippingAttemptedAt: new Date(),
      shippingReconciliationRequired: false,
      shippingLastError: null,
    },
  });
  return claim.count === 1;
}

export type PartialReturnShipmentResult = {
  provider: ShippingProvider;
  shippingOrderId: string;
  shippingShipmentId: string | null;
  awbCode: string | null;
  courierName: string | null;
  status: string;
  trackingUrl: string | null;
};

export async function completePartialReturnShippingDispatch(returnId: string, result: PartialReturnShipmentResult) {
  return prisma.$transaction(async (tx) => {
    const completed = await tx.orderReturn.updateMany({
      where: { id: returnId, shippingOrderId: "CREATING" },
      data: {
        status: "PICKUP_SCHEDULED",
        shippingProvider: result.provider,
        shippingOrderId: result.shippingOrderId,
        shippingShipmentId: result.shippingShipmentId,
        shippingAwbCode: result.awbCode,
        shippingCourierName: result.courierName,
        shippingStatus: result.status,
        shippingTrackingUrl: result.trackingUrl,
        shippingReconciliationRequired: false,
        shippingLastError: null,
      },
    });
    if (completed.count !== 1) return false;
    const ret = await tx.orderReturn.findUniqueOrThrow({ where: { id: returnId }, select: { orderId: true } });
    await tx.orderEvent.create({
      data: {
        orderId: ret.orderId,
        type: "PARTIAL_RETURN_SHIPMENT_CREATED",
        message: `Return #${returnId.slice(-6)} shipment created via ${result.provider} (order ${result.shippingOrderId}${result.awbCode ? `, AWB ${result.awbCode}` : ""})`,
      },
    });
    return true;
  });
}

/** Same definite-vs-uncertain split as failReturnShippingDispatch — an uncertain outcome leaves shippingOrderId at "CREATING" (blocking retries) and flags shippingReconciliationRequired for manual verification. */
export async function failPartialReturnShippingDispatch(returnId: string, failureMessage: string, uncertain: boolean) {
  await prisma.$transaction(async (tx) => {
    const ret = await tx.orderReturn.findUniqueOrThrow({ where: { id: returnId }, select: { orderId: true } });
    if (uncertain) {
      await tx.orderReturn.updateMany({
        where: { id: returnId, shippingOrderId: "CREATING" },
        data: { shippingStatus: "RECONCILIATION_REQUIRED", shippingReconciliationRequired: true, shippingLastError: failureMessage },
      });
      await tx.orderEvent.create({
        data: { orderId: ret.orderId, type: "PARTIAL_RETURN_SHIPMENT_RECONCILIATION_REQUIRED", message: `Return #${returnId.slice(-6)} — ${failureMessage}` },
      });
    } else {
      await tx.orderReturn.updateMany({
        where: { id: returnId, shippingOrderId: "CREATING" },
        data: { shippingOrderId: null, shippingStatus: null, shippingLastError: failureMessage },
      });
      await tx.orderEvent.create({
        data: { orderId: ret.orderId, type: "PARTIAL_RETURN_SHIPMENT_CREATE_FAILED", message: `Return #${returnId.slice(-6)} — ${failureMessage}` },
      });
    }
  });
}

export async function applyPartialReturnShippingStatus(returnId: string, rawStatus: string) {
  return prisma.$transaction(async (tx) => {
    await tx.orderReturn.update({ where: { id: returnId }, data: { shippingStatus: rawStatus } });

    if (!isShiprocketReversePickedUp(rawStatus)) return { transitioned: false };

    const transitioned = await tx.orderReturn.updateMany({
      where: { id: returnId, status: "PICKUP_SCHEDULED" },
      data: { status: "PICKED_UP" },
    });
    if (transitioned.count === 1) {
      const ret = await tx.orderReturn.findUniqueOrThrow({ where: { id: returnId }, select: { orderId: true } });
      await tx.orderEvent.create({
        data: { orderId: ret.orderId, type: "PARTIAL_RETURN_PICKED_UP", message: `Return #${returnId.slice(-6)} picked up (shipping status "${rawStatus}")` },
      });
    }
    return { transitioned: transitioned.count === 1 };
  });
}

/**
 * Restores stock only for the exact returned quantity of each line item —
 * never the item's full purchased quantity. Each OrderReturnItem is claimed
 * individually via its own `stockRestored` guard (mirroring
 * Order.returnStockRestored) so a repeated "mark received" call, or this
 * function somehow running twice, can never double-increment stock.
 */
async function restorePartialReturnStock(returnId: string, tx: Prisma.TransactionClient) {
  const items = await tx.orderReturnItem.findMany({
    where: { returnId, stockRestored: false },
    select: { id: true, quantity: true, orderItem: { select: { listingId: true } } },
  });
  let restoredCount = 0;
  for (const item of items) {
    const claim = await tx.orderReturnItem.updateMany({ where: { id: item.id, stockRestored: false }, data: { stockRestored: true } });
    if (claim.count !== 1) continue;
    if (item.orderItem.listingId) {
      await tx.bikePartListing.update({ where: { id: item.orderItem.listingId }, data: { stock: { increment: item.quantity } } });
    }
    restoredCount += 1;
  }
  return restoredCount;
}

/**
 * Admin confirms the returned item(s) are physically back at the warehouse.
 * `condition` applies to the whole OrderReturn (acceptable per Part 10 since
 * every item on one return request ships back together) — only RESELLABLE
 * ever restores stock, and only for the quantities actually recorded on this
 * return's OrderReturnItem rows. Refund amount is computed strictly from
 * those quantities times each item's *historical* OrderItem.unitPrice, never
 * current BikePartListing.price, and the refund request itself is claimed
 * inside this same transaction so "mark received" and "refund requested"
 * happen atomically together.
 */
export async function markPartialReturnReceived(returnId: string, adminNote: string, condition: ReturnCondition) {
  return prisma.$transaction(async (tx) => {
    const claim = await tx.orderReturn.updateMany({
      where: { id: returnId, status: { in: ["PICKED_UP", "PICKUP_SCHEDULED"] } },
      data: { status: "RECEIVED", adminNote: adminNote || null, receivedAt: new Date(), condition },
    });
    if (claim.count !== 1) return { received: false, stockRestoredCount: 0 };

    const ret = await tx.orderReturn.findUniqueOrThrow({ where: { id: returnId }, select: { orderId: true } });

    await tx.orderEvent.create({
      data: {
        orderId: ret.orderId,
        type: "PARTIAL_RETURN_RECEIVED",
        message: `Return #${returnId.slice(-6)} received at warehouse — condition: ${condition === "RESELLABLE" ? "resellable" : "damaged / not restocked"}${adminNote ? ` — ${adminNote}` : ""}`,
      },
    });

    const stockRestoredCount = condition === "RESELLABLE" ? await restorePartialReturnStock(returnId, tx) : 0;

    const lines = await tx.orderReturnItem.findMany({
      where: { returnId },
      select: { quantity: true, orderItem: { select: { unitPrice: true } } },
    });
    const refundAmount = lines.reduce((sum, line) => sum + Number(line.orderItem.unitPrice) * line.quantity, 0);
    await requestPartialRefundInTransaction(tx, returnId, refundAmount);

    return { received: true, stockRestoredCount };
  });
}

async function requestPartialRefundInTransaction(tx: Prisma.TransactionClient, returnId: string, amount: number) {
  const claim = await tx.orderReturn.updateMany({
    where: { id: returnId, refundStatus: { in: ["NONE", "FAILED"] } },
    data: { refundStatus: "REQUESTED", refundAmount: amount, refundFailureReason: null, refundReconciliationRequired: false },
  });
  if (claim.count !== 1) return false;
  const ret = await tx.orderReturn.findUniqueOrThrow({ where: { id: returnId }, select: { orderId: true } });
  await tx.orderEvent.create({
    data: { orderId: ret.orderId, type: "PARTIAL_REFUND_REQUESTED", message: `Refund of Rs.${amount.toFixed(2)} requested for return #${returnId.slice(-6)}.` },
  });
  return true;
}

export type PartialRefundClaimResult = { claimed: boolean; paymentId?: string; amount?: number };

/**
 * Claims a requested per-return refund for Razorpay processing. Re-verifies,
 * inside the same transaction, that this refund plus every other
 * PROCESSING/REFUNDED refund already recorded against sibling OrderReturns
 * on the same order does not exceed that order's total paid amount — belt
 * and suspenders on top of the structural guarantee that per-item refund
 * amounts can never exceed per-item purchase totals (see
 * requestPartialReturn's over-return check).
 */
export async function claimPartialRefundRequest(returnId: string, adminNote: string): Promise<PartialRefundClaimResult> {
  return prisma.$transaction(async (tx) => {
    const ret = await tx.orderReturn.findUnique({
      where: { id: returnId },
      include: { order: { select: { id: true, paymentStatus: true, razorpayPaymentId: true, amount: true } } },
    });
    if (!ret || ret.refundStatus !== "REQUESTED" || ret.order.paymentStatus !== "PAID" || !ret.order.razorpayPaymentId || ret.refundAmount === null) {
      return { claimed: false };
    }

    const siblingTotals = await tx.orderReturn.aggregate({
      where: { orderId: ret.orderId, id: { not: returnId }, refundStatus: { in: ["PROCESSING", "REFUNDED"] } },
      _sum: { refundAmount: true },
    });
    const alreadyRefunded = Number(siblingTotals._sum.refundAmount ?? 0);
    if (alreadyRefunded + Number(ret.refundAmount) > Number(ret.order.amount) + 0.01) {
      return { claimed: false };
    }

    const claim = await tx.orderReturn.updateMany({
      where: { id: returnId, refundStatus: "REQUESTED" },
      data: { refundStatus: "PROCESSING", adminNote: adminNote || ret.adminNote, refundAttemptedAt: new Date(), refundFailureReason: null, refundReconciliationRequired: false },
    });
    if (claim.count !== 1) return { claimed: false };

    await tx.orderEvent.create({
      data: { orderId: ret.orderId, type: "PARTIAL_REFUND_PROCESSING", message: `Refund for return #${returnId.slice(-6)} claimed for provider processing.` },
    });
    return { claimed: true, paymentId: ret.order.razorpayPaymentId, amount: Number(ret.refundAmount) };
  });
}

/** Never overwrites another return's razorpayRefundId — each OrderReturn has its own column, unlike the single Order.razorpayRefundId the legacy whole-order flow shares across every refund attempt. */
export async function markPartialRefundSucceeded(returnId: string, refundId: string) {
  return prisma.$transaction(async (tx) => {
    const updated = await tx.orderReturn.updateMany({
      where: { id: returnId, refundStatus: "PROCESSING" },
      data: { refundStatus: "REFUNDED", razorpayRefundId: refundId, refundProcessedAt: new Date(), refundFailureReason: null, refundReconciliationRequired: false },
    });
    if (updated.count !== 1) return false;
    const ret = await tx.orderReturn.findUniqueOrThrow({ where: { id: returnId }, select: { orderId: true } });
    await tx.orderEvent.create({
      data: { orderId: ret.orderId, type: "PARTIAL_REFUND_COMPLETED", message: `Refund completed via Razorpay (${refundId}) for return #${returnId.slice(-6)}.` },
    });
    return true;
  });
}

export async function markPartialRefundFailed(returnId: string, reason: string) {
  return prisma.$transaction(async (tx) => {
    const updated = await tx.orderReturn.updateMany({
      where: { id: returnId, refundStatus: "PROCESSING" },
      data: { refundStatus: "REQUESTED", refundFailureReason: reason, refundReconciliationRequired: false },
    });
    if (updated.count !== 1) return false;
    const ret = await tx.orderReturn.findUniqueOrThrow({ where: { id: returnId }, select: { orderId: true } });
    await tx.orderEvent.create({
      data: { orderId: ret.orderId, type: "PARTIAL_REFUND_FAILED", message: `Refund failed before provider acceptance for return #${returnId.slice(-6)} — ${reason}` },
    });
    return true;
  });
}

export async function markPartialRefundNeedsReconciliation(returnId: string, reason: string) {
  return prisma.$transaction(async (tx) => {
    const updated = await tx.orderReturn.updateMany({
      where: { id: returnId, refundStatus: "PROCESSING" },
      data: { refundFailureReason: reason, refundReconciliationRequired: true },
    });
    if (updated.count !== 1) return false;
    const ret = await tx.orderReturn.findUniqueOrThrow({ where: { id: returnId }, select: { orderId: true } });
    await tx.orderEvent.create({
      data: { orderId: ret.orderId, type: "PARTIAL_REFUND_RECONCILIATION_REQUIRED", message: `Return #${returnId.slice(-6)} — ${reason}` },
    });
    return true;
  });
}

/** Read-only remaining-returnable-quantity lookup for display (order history, admin order detail) — not used for the transactional over-return check itself, which re-derives this under row locks (see requestPartialReturn). */
export async function getReturnableQuantities(orderId: string): Promise<Map<string, number>> {
  const [items, rows] = await Promise.all([
    prisma.orderItem.findMany({ where: { orderId }, select: { id: true, quantity: true } }),
    prisma.orderReturnItem.findMany({
      where: { orderItem: { orderId }, orderReturn: { status: { not: "REJECTED" } } },
      select: { orderItemId: true, quantity: true },
    }),
  ]);
  const returned = new Map<string, number>();
  for (const row of rows) returned.set(row.orderItemId, (returned.get(row.orderItemId) ?? 0) + row.quantity);
  return new Map(items.map((item) => [item.id, item.quantity - (returned.get(item.id) ?? 0)]));
}
