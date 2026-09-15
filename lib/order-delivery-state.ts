import { prisma } from "@/lib/db";
import { requestRefund } from "@/lib/order-refund-state";
import { mapShiprocketStatusToOrderStatus } from "@/lib/shipping/status-mapping";
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

export async function cancelAdminOrderBeforeDispatch(orderId: string, adminNote: string) {
  return prisma.$transaction(async (tx) => {
    const claim = await tx.order.updateMany({
      where: { id: orderId, shippingOrderId: null, status: { in: ["PENDING", "PAID", "PACKED"] } },
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

export type ProviderTrackingFields = {
  shippingStatus?: string;
  shippingTrackingUrl?: string | null;
  shippingCourierName?: string | null;
  deliveryExecutiveName?: string | null;
  deliveryExecutivePhone?: string | null;
  shippingLastUpdatedAt?: Date;
};

/**
 * Shared core for every provider's tracking-refresh path (Shiprocket, Borzo,
 * and the legacy Porter branch in admin-orders.ts) — writes whatever
 * provider-specific fields the caller passes, then applies the one standard
 * allowed-previous-state transition guard and logs exactly one STATUS_CHANGE
 * event, all in a single transaction. Centralizing the transition rules
 * here (rather than reimplementing them per provider) is what the app's
 * "don't duplicate status logic" rule calls for — each provider only ever
 * needs to supply its own raw-status mapper and field set.
 */
export async function applyProviderTrackingUpdate(
  orderId: string,
  mapped: OrderStatus | null,
  rawStatus: string,
  providerLabel: string,
  fields: ProviderTrackingFields
) {
  return prisma.$transaction(async (tx) => {
    await tx.order.update({ where: { id: orderId }, data: fields });
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
      await tx.orderEvent.create({ data: { orderId, type: "STATUS_CHANGE", message: `Status changed to ${ORDER_STATUS_LABELS[mapped] ?? mapped} (${providerLabel} status "${rawStatus}")` } });
    }
    return { mappedStatus: mapped, transitioned: transitioned.count === 1 };
  });
}

/**
 * Applies a raw Shiprocket status string for the FORWARD shipment. Only
 * ever called for a Shiprocket-backed order (see refreshDeliveryStatusAction
 * in admin-orders.ts, which branches on shippingProvider — the legacy
 * Porter and Borzo paths use their own mappers and call
 * applyProviderTrackingUpdate directly, since each provider's status
 * vocabulary and available fields differ).
 */
export async function applyShippingStatus(orderId: string, rawStatus: string) {
  const mapped = mapShiprocketStatusToOrderStatus(rawStatus);
  return applyProviderTrackingUpdate(orderId, mapped, rawStatus, "shipping", { shippingStatus: rawStatus });
}

/**
 * Atomically claims a PAID/PACKED order for forward-shipment creation —
 * shippingOrderId: "CREATING" is the placeholder that blocks a second
 * concurrent claim (mirrors the return-side claim pattern in
 * order-return-state.ts / lib/order-returns/service.ts) so a double-click
 * can never create two shipments for the same order.
 */
export async function claimShippingDispatch(orderId: string) {
  return prisma.$transaction(async (tx) => {
    const claim = await tx.order.updateMany({
      where: {
        id: orderId,
        shippingOrderId: null,
        paymentStatus: "PAID",
        status: { in: ["PAID", "PACKED"] },
      },
      data: {
        shippingOrderId: "CREATING",
        shippingStatus: "CREATING",
        shippingAttemptedAt: new Date(),
        shippingReconciliationRequired: false,
        shippingLastError: null,
      },
    });
    if (claim.count === 1) {
      await tx.orderEvent.create({ data: { orderId, type: "SHIPMENT_CREATE_REQUESTED", message: "Shipment creation claimed." } });
    }
    return claim.count === 1;
  });
}

export async function cancelCustomerOrder(orderId: string, buyerId: string) {
  return prisma.$transaction(async (tx) => {
    const order = await tx.order.findUnique({ where: { id: orderId } });
    if (!order) return { cancelled: false, refundRequested: false };
    const cancelled = await tx.order.updateMany({
      where: { id: orderId, buyerId, shippingOrderId: null, status: { in: ["PENDING", "PAID"] } },
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
