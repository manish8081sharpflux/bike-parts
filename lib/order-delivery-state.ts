import { prisma } from "@/lib/db";
import { requestRefund } from "@/lib/order-refund-state";
import type { OrderStatus } from "@prisma/client";

// The customer-facing name for each status the Activity log ever records —
// mirrors the STATUS_OPTIONS labels in the admin dropdown
// (app/admin/(dashboard)/orders/[id]/page.tsx) so the log reads the same
// friendly name shown elsewhere, instead of the raw DB enum value.
export const ORDER_STATUS_LABELS: Partial<Record<OrderStatus, string>> = {
  PACKED: "Preparing",
  OUT_FOR_DELIVERY: "Out for Delivery",
  DELIVERED: "Delivered",
  CANCELLED: "Cancelled",
};

export function mapPorterStatusToOrderStatus(raw: string): OrderStatus | null {
  const value = raw.toLowerCase().trim();
  if (value.includes("cancel")) return "CANCELLED";
  if (
    value.includes("out_for_delivery") ||
    value.includes("out for delivery") ||
    value.includes("in_transit") ||
    value.includes("in transit") ||
    value.includes("transit") ||
    value.includes("ongoing") ||
    value.includes("picked") ||
    value.includes("arrived")
  ) return "OUT_FOR_DELIVERY";
  if (value === "delivered" || value.includes("completed") || value.includes("complete")) return "DELIVERED";
  return null;
}

export async function cancelAdminOrderBeforeDispatch(orderId: string, adminNote: string) {
  return prisma.$transaction(async (tx) => {
    const claim = await tx.order.updateMany({
      where: { id: orderId, porterOrderId: null, status: { in: ["PENDING", "PAID", "PACKED"] } },
      data: { status: "CANCELLED", adminNote: adminNote || undefined },
    });
    if (claim.count !== 1) return { cancelled: false, refundRequested: false };
    const order = await tx.order.findUniqueOrThrow({ where: { id: orderId } });
    await tx.orderEvent.create({ data: { orderId, type: "STATUS_CHANGE", message: `Status changed to ${ORDER_STATUS_LABELS.CANCELLED}${adminNote ? ` — ${adminNote}` : ""}` } });
    let refundRequested = false;
    if (order.paymentStatus === "PAID" && order.refundStatus === "NONE") {
      const result = await requestRefund(orderId, "Order cancelled by admin", tx);
      refundRequested = result === "requested" || result === "already_requested";
    }
    return { cancelled: true, refundRequested };
  });
}

export async function applyPorterStatus(orderId: string, rawStatus: string) {
  return prisma.$transaction(async (tx) => {
    const mapped = mapPorterStatusToOrderStatus(rawStatus);
    await tx.order.update({ where: { id: orderId }, data: { porterStatus: rawStatus } });
    if (!mapped) return { mappedStatus: null, transitioned: false };

    const allowedPrevious: Record<string, OrderStatus[]> = {
      OUT_FOR_DELIVERY: ["PAID", "PACKED", "SHIPPED"],
      DELIVERED: ["PAID", "PACKED", "SHIPPED", "OUT_FOR_DELIVERY"],
      CANCELLED: ["PAID", "PACKED", "SHIPPED", "OUT_FOR_DELIVERY"],
    };
    const transitioned = await tx.order.updateMany({
      where: { id: orderId, status: { in: allowedPrevious[mapped] ?? [] } },
      data: { status: mapped },
    });
    if (transitioned.count === 1) {
      await tx.orderEvent.create({ data: { orderId, type: "STATUS_CHANGE", message: `Status changed to ${ORDER_STATUS_LABELS[mapped] ?? mapped} (Porter status "${rawStatus}")` } });
    }
    return { mappedStatus: mapped, transitioned: transitioned.count === 1 };
  });
}

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
