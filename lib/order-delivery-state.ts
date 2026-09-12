import { prisma } from "@/lib/db";
import { requestRefund } from "@/lib/order-refund-state";

export async function claimPorterDispatch(orderId: string) {
  return prisma.$transaction(async (tx) => {
    const claim = await tx.order.updateMany({
      where: {
        id: orderId,
        porterOrderId: null,
        paymentStatus: "PAID",
        status: { in: ["PAID", "PACKED"] },
      },
      data: {
        porterOrderId: "DISPATCHING",
        porterStatus: "DISPATCHING",
        porterAttemptedAt: new Date(),
        porterReconciliationRequired: false,
        porterLastError: null,
      },
    });
    if (claim.count === 1) {
      await tx.orderEvent.create({ data: { orderId, type: "PORTER_DISPATCH_REQUESTED", message: "Porter dispatch claimed." } });
    }
    return claim.count === 1;
  });
}

export async function cancelCustomerOrder(orderId: string, buyerId: string) {
  return prisma.$transaction(async (tx) => {
    const order = await tx.order.findUnique({ where: { id: orderId } });
    if (!order) return { cancelled: false, refundRequested: false };
    const cancelled = await tx.order.updateMany({
      where: { id: orderId, buyerId, porterOrderId: null, status: { in: ["PENDING", "PAID"] } },
      data: { status: "CANCELLED" },
    });
    if (cancelled.count !== 1) return { cancelled: false, refundRequested: false };
    await tx.orderEvent.create({ data: { orderId, type: "STATUS_CHANGE", message: "Order cancelled by customer." } });
    let refundRequested = false;
    if (order.paymentStatus === "PAID" && order.refundStatus !== "REFUNDED") {
      const result = await requestRefund(orderId, "Cancelled by customer", tx);
      refundRequested = result === "requested" || result === "already_requested";
    }
    return { cancelled: true, refundRequested };
  });
}
