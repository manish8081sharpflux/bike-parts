import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";

export type PaymentConfirmationStatus = "confirmed" | "already_paid" | "not_payable";

export type ConfirmOrderPaymentInput = {
  orderId: string;
  razorpayOrderId: string;
  razorpayPaymentId?: string;
  razorpaySignature?: string;
  buyerId?: string;
  source?: "verify" | "webhook";
};

/**
 * Atomically claims an unpaid reservation for payment. This transition is
 * mutually exclusive with releaseOrderStock's PENDING + stockReserved claim.
 */
export async function confirmOrderPayment(
  input: ConfirmOrderPaymentInput,
  db: Prisma.TransactionClient | typeof prisma = prisma
): Promise<PaymentConfirmationStatus> {
  const run = async (tx: Prisma.TransactionClient): Promise<PaymentConfirmationStatus> => {
    const where: Prisma.OrderWhereInput = {
      id: input.orderId,
      razorpayOrderId: input.razorpayOrderId,
      paymentStatus: "PENDING",
      status: "PENDING",
      stockReserved: true,
      ...(input.buyerId ? { buyerId: input.buyerId } : {}),
    };
    const claimed = await tx.order.updateMany({
      where,
      data: {
        paymentStatus: "PAID",
        status: "PAID",
        ...(input.razorpayPaymentId ? { razorpayPaymentId: input.razorpayPaymentId } : {}),
        ...(input.razorpaySignature ? { razorpaySignature: input.razorpaySignature } : {}),
      },
    });

    if (claimed.count === 1) {
      await tx.orderEvent.create({
        data: {
          orderId: input.orderId,
          type: "PAYMENT_CONFIRMED",
          message: `${input.source === "webhook" ? "Payment captured via webhook" : "Payment captured"} (${input.razorpayPaymentId ?? "unknown"})`,
        },
      });
      return "confirmed";
    }

    const order = await tx.order.findUnique({ where: { id: input.orderId } });
    if (!order) return "not_payable";
    if (order.paymentStatus === "PAID") return "already_paid";

    const existingReconciliation = await tx.orderEvent.findFirst({
      where: { orderId: input.orderId, type: "PAYMENT_RECONCILIATION_REQUIRED" },
      select: { id: true },
    });
    if (!existingReconciliation) {
      await tx.orderEvent.create({
        data: {
          orderId: input.orderId,
          type: "PAYMENT_RECONCILIATION_REQUIRED",
          message: `Razorpay reported payment ${input.razorpayPaymentId ?? "unknown"} for a checkout that is no longer payable.`,
        },
      });
    }
    return "not_payable";
  };

  if (db === prisma) return prisma.$transaction(run);
  return run(db);
}
