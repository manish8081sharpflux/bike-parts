import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";

export type RefundRequestResult = "requested" | "already_requested" | "not_refundable";
export type RefundClaimResult = {
  claimed: boolean;
  paymentId?: string;
  amount?: number;
};

async function requestRefundInTransaction(
  tx: Prisma.TransactionClient,
  orderId: string,
  reason: string
): Promise<RefundRequestResult> {
  const claim = await tx.order.updateMany({
    where: {
      id: orderId,
      paymentStatus: "PAID",
      refundStatus: { in: ["NONE", "REJECTED"] },
    },
    data: {
      refundStatus: "REQUESTED",
      refundReason: reason,
      refundAdminNote: null,
      refundRequestedAt: new Date(),
      refundFailureReason: null,
      refundReconciliationRequired: false,
    },
  });

  if (claim.count !== 1) {
    const current = await tx.order.findUnique({ where: { id: orderId }, select: { refundStatus: true } });
    return current?.refundStatus === "REQUESTED" ? "already_requested" : "not_refundable";
  }

  const order = await tx.order.findUniqueOrThrow({ where: { id: orderId }, select: { amount: true } });
  await tx.order.update({ where: { id: orderId }, data: { refundAmount: order.amount } });
  await tx.orderEvent.create({
    data: { orderId, type: "REFUND_REQUESTED", message: `Refund requested — ${reason}` },
  });
  return "requested";
}

export async function requestRefund(orderId: string, reason: string, db: Prisma.TransactionClient | typeof prisma = prisma) {
  if (db === prisma) return prisma.$transaction((tx) => requestRefundInTransaction(tx, orderId, reason));
  return requestRefundInTransaction(db, orderId, reason);
}

export async function claimRefundRequest(orderId: string, adminNote: string): Promise<RefundClaimResult> {
  return prisma.$transaction(async (tx) => {
    const order = await tx.order.findUnique({ where: { id: orderId } });
    if (!order || order.paymentStatus !== "PAID" || order.refundStatus !== "REQUESTED" || !order.razorpayPaymentId) {
      return { claimed: false };
    }

    const claim = await tx.order.updateMany({
      where: { id: orderId, paymentStatus: "PAID", refundStatus: "REQUESTED" },
      data: {
        refundStatus: "PROCESSING",
        refundAdminNote: adminNote || null,
        refundAttemptedAt: new Date(),
        refundFailureReason: null,
        refundReconciliationRequired: false,
      },
    });
    if (claim.count !== 1) return { claimed: false };

    await tx.orderEvent.create({
      data: { orderId, type: "REFUND_PROCESSING", message: "Refund request claimed for provider processing." },
    });
    return {
      claimed: true,
      paymentId: order.razorpayPaymentId,
      amount: Number(order.refundAmount ?? order.amount),
    };
  });
}

export async function markRefundSucceeded(orderId: string, refundId: string) {
  return prisma.$transaction(async (tx) => {
    const updated = await tx.order.updateMany({
      where: { id: orderId, paymentStatus: "PAID", refundStatus: "PROCESSING" },
      data: {
        refundStatus: "REFUNDED",
        paymentStatus: "REFUNDED",
        status: "CANCELLED",
        razorpayRefundId: refundId,
        refundProcessedAt: new Date(),
        refundFailureReason: null,
        refundReconciliationRequired: false,
      },
    });
    if (updated.count !== 1) return false;
    await tx.orderEvent.create({
      data: { orderId, type: "REFUND_COMPLETED", message: `Refund completed via Razorpay (${refundId}).` },
    });
    return true;
  });
}

export async function markRefundFailed(orderId: string, reason: string) {
  return prisma.$transaction(async (tx) => {
    const updated = await tx.order.updateMany({
      where: { id: orderId, paymentStatus: "PAID", refundStatus: "PROCESSING" },
      data: { refundStatus: "REQUESTED", refundFailureReason: reason, refundReconciliationRequired: false },
    });
    if (updated.count !== 1) return false;
    await tx.orderEvent.create({
      data: { orderId, type: "REFUND_FAILED", message: `Refund failed before provider acceptance — ${reason}` },
    });
    return true;
  });
}

export async function markRefundNeedsReconciliation(orderId: string, reason: string) {
  return prisma.$transaction(async (tx) => {
    const updated = await tx.order.updateMany({
      where: { id: orderId, paymentStatus: "PAID", refundStatus: "PROCESSING" },
      data: { refundFailureReason: reason, refundReconciliationRequired: true },
    });
    if (updated.count !== 1) return false;
    await tx.orderEvent.create({
      data: { orderId, type: "REFUND_RECONCILIATION_REQUIRED", message: reason },
    });
    return true;
  });
}

export async function markProviderRefundCreated(orderId: string, refundId: string) {
  return prisma.$transaction(async (tx) => {
    const updated = await tx.order.updateMany({
      where: { id: orderId, paymentStatus: "PAID", refundStatus: "PROCESSING" },
      data: { razorpayRefundId: refundId },
    });
    return updated.count === 1;
  });
}
