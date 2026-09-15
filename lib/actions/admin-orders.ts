"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { requireAdminAction } from "@/lib/auth/require-admin";
import {
  assertBorzoConfigured,
  assertShippingConfigured,
  assignAwb,
  cancelLocalDelivery,
  cancelShipment,
  checkLocalDeliveryEligibility,
  createLocalDelivery,
  createReverseShipment,
  createShipment,
  schedulePickup,
  trackLocalDelivery,
  trackShipment,
  BorzoRequestError,
  ShippingProviderError,
} from "@/lib/shipping/service";
import { buildPackage, calculateTotalWeightKg } from "@/lib/shipping/package";
import { mapBorzoStatusToOrderStatus } from "@/lib/shipping/status-mapping";
import { createRazorpayRefund, isRazorpayConfigured } from "@/lib/razorpay";
import {
  claimRefundRequest,
  markRefundFailed,
  markRefundNeedsReconciliation,
  markRefundSucceeded,
} from "@/lib/order-refund-state";
import {
  applyProviderTrackingUpdate,
  applyShippingStatus,
  cancelAdminOrderBeforeDispatch,
  claimShippingDispatch,
  ORDER_STATUS_LABELS,
} from "@/lib/order-delivery-state";
import {
  approveReturn,
  applyReturnShippingStatus,
  claimReturnShippingDispatch,
  completeReturnShippingDispatch,
  failReturnShippingDispatch,
  markReturnReceived,
  rejectReturn,
  type ReturnCondition,
} from "@/lib/order-return-state";
import {
  approvePartialReturn,
  applyPartialReturnShippingStatus,
  claimPartialRefundRequest,
  claimPartialReturnShippingDispatch,
  completePartialReturnShippingDispatch,
  failPartialReturnShippingDispatch,
  markPartialRefundFailed,
  markPartialRefundNeedsReconciliation,
  markPartialRefundSucceeded,
  markPartialReturnReceived,
  rejectPartialReturn,
} from "@/lib/order-returns/service";
import type { OrderStatus } from "@prisma/client";
import { getPorterDeliveryStatus, cancelPorterDelivery } from "@/lib/porter";

const ORDER_STATUSES: OrderStatus[] = [
  "PENDING",
  "PAID",
  "PACKED",
  "SHIPPED",
  "OUT_FOR_DELIVERY",
  "DELIVERED",
  "CANCELLED",
];

type DeliveryAddress = {
  contactName?: string;
  // Delivery contact number, saved on the customer's Address row — may
  // differ from the account phone (order.customerPhone) used for OTP login.
  // Absent on orders placed before Fix 6, which is why every read of this
  // falls back to order.customerPhone.
  phone?: string;
  flatNo?: string;
  floor?: string;
  area?: string;
  landmark?: string;
  city?: string;
  pincode?: string;
};

function warehouseAddress() {
  return {
    contactName: process.env.WAREHOUSE_CONTACT_NAME!,
    contactPhone: process.env.WAREHOUSE_PHONE!,
    line1: process.env.WAREHOUSE_ADDRESS_LINE1!,
    city: process.env.WAREHOUSE_CITY!,
    pincode: process.env.WAREHOUSE_PINCODE!,
  };
}

function assertWarehouseConfiguredInProduction() {
  if (
    process.env.NODE_ENV === "production" &&
    (!process.env.WAREHOUSE_CONTACT_NAME ||
      !process.env.WAREHOUSE_PHONE ||
      !process.env.WAREHOUSE_ADDRESS_LINE1 ||
      !process.env.WAREHOUSE_CITY ||
      !/^\d{6}$/.test(process.env.WAREHOUSE_PINCODE ?? ""))
  ) {
    throw new Error("Production warehouse configuration is incomplete.");
  }
}

function customerAddressFrom(order: { deliveryAddress: unknown; customerName: string; customerPhone: string }) {
  const address = (order.deliveryAddress ?? {}) as DeliveryAddress;
  const line1 = [address.flatNo, address.floor, address.area].filter(Boolean).join(", ");
  const phone = address.phone || order.customerPhone;
  if (!order.customerName.trim() || !/^\d{10}$/.test(phone) || !line1 || !address.city || !/^\d{6}$/.test(address.pincode ?? "")) {
    throw new Error("Delivery address is incomplete. Contact name, phone, address, city, and pincode are required.");
  }
  return {
    contactName: address.contactName || order.customerName,
    contactPhone: phone,
    line1,
    line2: address.landmark ?? "",
    city: address.city ?? "",
    pincode: address.pincode ?? "",
  };
}

/** True for a caught error that means the mutation's outcome is genuinely unknown — never safe to silently retry. */
function isUncertain(error: unknown): boolean {
  if (error instanceof ShippingProviderError) return error.uncertain;
  if (error instanceof BorzoRequestError) return error.uncertain;
  return false;
}

/** Borzo's required `matter` field — a free-text description of what's being carried, built from the order's real line items (never fabricated). */
function buildMatterDescription(items: Array<{ productName: string; quantity: number }>) {
  return items.map((item) => `${item.productName} x${item.quantity}`).join(", ").slice(0, 5000);
}

export async function updateOrderStatusAction(orderId: string, formData: FormData) {
  await requireAdminAction();

  const statusRaw = String(formData.get("status") ?? "");
  const adminNote = String(formData.get("adminNote") ?? "").trim();

  if (!ORDER_STATUSES.includes(statusRaw as OrderStatus)) {
    redirect(`/admin/orders/${orderId}?error=${encodeURIComponent("Invalid status.")}`);
  }

  if (statusRaw === "CANCELLED") {
    const result = await cancelAdminOrderBeforeDispatch(orderId, adminNote);
    if (!result.cancelled) {
      redirect(`/admin/orders/${orderId}?error=${encodeURIComponent("Shipped or already-cancelled orders require shipment cancellation/reconciliation before local cancellation.")}`);
    }
    revalidatePath(`/admin/orders/${orderId}`);
    revalidatePath("/admin/orders");
  revalidatePath("/admin/returns");
    revalidatePath("/admin");
    if (result.refundRequested) redirect(`/admin/orders/${orderId}?refundReady=1`);
    return;
  }

  // Cancelling an order that was already paid for means the customer is now
  // owed money back. Auto-create the refund request right here instead of
  // waiting on the customer to notice and ask for one — this is also what
  // makes the Refund card (with its Approve/Reject actions) appear below
  // without any extra step. Only kicks in the first time: if a refund is
  // already requested/processing/refunded/rejected, that flow is left alone.
  await prisma.$transaction(async (tx) => {
    await tx.order.update({
      where: { id: orderId },
      data: { status: statusRaw as OrderStatus, adminNote: adminNote || undefined },
    });
    await tx.orderEvent.create({
      data: {
        orderId,
        type: "STATUS_CHANGE",
        message: `Status changed to ${ORDER_STATUS_LABELS[statusRaw as OrderStatus] ?? statusRaw}${adminNote ? ` — ${adminNote}` : ""}`,
      },
    });
  });

  revalidatePath(`/admin/orders/${orderId}`);
  revalidatePath("/admin/orders");
  revalidatePath("/admin/returns");
  revalidatePath("/admin");

  // Send the admin back to this order with a flag that pops up a modal
  // pointing them straight at the refund they now need to approve or reject.
}

/**
 * Creates a forward shipment for a paid order through the generic shipping
 * service (Shiprocket today — see lib/shipping/service.ts). Collapses
 * create-order -> assign-AWB -> schedule-pickup into one admin click; once
 * the order is actually created at the provider, any failure in the later
 * steps is treated as uncertain regardless of its own classification, since
 * a real shipment now exists there that a naive retry could duplicate.
 *
 * `courierCompanyId` (optional) comes from the admin's courier choice (see
 * the serviceability check surfaced in the dispatch UI) — omitted, the
 * provider's own recommended courier is used (see assignAwb).
 * `confirmDefaultDimensions` must be "on" when the order has more than one
 * distinct product, since the package builder falls back to a configured
 * default parcel size in that case rather than fabricating a per-order
 * volumetric calculation (see lib/shipping/package.ts) — the admin must
 * explicitly acknowledge that before a shipment is created.
 */
export async function dispatchOrderAction(orderId: string, formData: FormData) {
  await requireAdminAction();
  let claimed = false;
  let shipmentCreated = false;
  const courierCompanyId = String(formData.get("courierCompanyId") ?? "").trim() || undefined;
  const confirmDefaultDimensions = formData.get("confirmDefaultDimensions") === "on";

  try {
    const order = await prisma.order.findUniqueOrThrow({
      where: { id: orderId },
      include: { items: { include: { listing: true } } },
    });

    if (order.paymentStatus !== "PAID") {
      throw new Error("Order must be paid before a shipment can be created.");
    }
    if (!(order.status === "PAID" || order.status === "PACKED")) {
      throw new Error("This order is not in a dispatchable fulfillment state.");
    }
    if (order.shippingOrderId) {
      throw new Error("This order already has a shipment.");
    }
    assertShippingConfigured();
    assertWarehouseConfiguredInProduction();

    const drop = customerAddressFrom(order);

    const built = buildPackage(
      order.items.map((item) => ({
        productName: item.productName,
        quantity: item.quantity,
        weightKg: item.listing?.weightKg != null ? Number(item.listing.weightKg) : null,
        lengthCm: item.listing?.lengthCm != null ? Number(item.listing.lengthCm) : null,
        breadthCm: item.listing?.breadthCm != null ? Number(item.listing.breadthCm) : null,
        heightCm: item.listing?.heightCm != null ? Number(item.listing.heightCm) : null,
      }))
    );
    if (!built.usesRealDimensions && !confirmDefaultDimensions) {
      throw new Error("This order has multiple different products — confirm the default parcel dimensions before creating a shipment.");
    }

    if (!(await claimShippingDispatch(orderId))) {
      throw new Error("This order already has a shipment.");
    }
    claimed = true;

    const created = await createShipment({
      referenceId: order.id,
      pickup: warehouseAddress(),
      drop,
      package: built.package,
      items: order.items.map((item) => ({
        name: item.productName,
        sku: item.listing?.sku ?? null,
        quantity: item.quantity,
        unitPrice: Number(item.unitPrice),
      })),
      declaredValue: Number(order.amount),
      codAmount: 0,
      courierCompanyId,
    });
    shipmentCreated = true;

    if (!created.shippingShipmentId) {
      throw new ShippingProviderError("Shiprocket returned no shipment identifier; reconciliation is required.", { uncertain: true });
    }

    const awb = await assignAwb(created.shippingShipmentId, courierCompanyId);
    const pickup = await schedulePickup(created.shippingShipmentId);

    await prisma.$transaction(async (tx) => {
      const completed = await tx.order.updateMany({
        where: { id: orderId, shippingOrderId: "CREATING" },
        data: {
          shippingProvider: "SHIPROCKET",
          shippingOrderId: created.shippingOrderId,
          shippingShipmentId: created.shippingShipmentId,
          shippingAwbCode: awb.awbCode,
          shippingCourierName: awb.courierName,
          shippingStatus: pickup.status,
          status: "SHIPPED",
          shippingReconciliationRequired: false,
          shippingLastError: null,
        },
      });
      if (completed.count !== 1) throw new Error("Dispatch claim is no longer current.");
      await tx.orderEvent.create({
        data: {
          orderId,
          type: "SHIPMENT_CREATED",
          message: `Shipment created via Shiprocket (order ${created.shippingOrderId}, AWB ${awb.awbCode}, courier ${awb.courierName})`,
        },
      });
    });
  } catch (error) {
    console.error("[shipping] Dispatch failed for order", orderId, error);
    if (claimed) {
      const failureMessage = error instanceof Error ? error.message : "Could not create a shipment for this order.";
      // Once the provider has actually created the order/shipment, any
      // later failure must be treated as uncertain regardless of its own
      // classification — a naive retry could create a second shipment.
      const uncertain = shipmentCreated || isUncertain(error);
      await prisma.$transaction(async (tx) => {
        if (uncertain) {
          await tx.order.updateMany({ where: { id: orderId, shippingOrderId: "CREATING" }, data: { shippingStatus: "RECONCILIATION_REQUIRED", shippingReconciliationRequired: true, shippingLastError: failureMessage } });
          await tx.orderEvent.create({ data: { orderId, type: "SHIPMENT_RECONCILIATION_REQUIRED", message: failureMessage } });
        } else {
          await tx.order.updateMany({ where: { id: orderId, shippingOrderId: "CREATING" }, data: { shippingOrderId: null, shippingStatus: null, shippingLastError: failureMessage } });
          await tx.orderEvent.create({ data: { orderId, type: "SHIPMENT_CREATE_FAILED", message: failureMessage } });
        }
      });
    }
    const message = error instanceof Error ? error.message : "Could not create a shipment for this order.";
    redirect(`/admin/orders/${orderId}?error=${encodeURIComponent(message)}`);
  }

  revalidatePath(`/admin/orders/${orderId}`);
  revalidatePath("/admin/orders");
  revalidatePath("/admin/returns");
  revalidatePath("/admin");
}

/**
 * Refreshes forward-tracking status. Branches on shippingProvider: a
 * historical PORTER row (from before the Shiprocket migration — see the
 * migration note on Order.shippingProvider) is tracked through the frozen
 * legacy lib/porter.ts wrapper, since Porter's status vocabulary and
 * mapPorterStatusToOrderStatus-equivalent logic don't apply to Shiprocket
 * and vice versa. New shipments are always SHIPROCKET.
 */
export async function refreshDeliveryStatusAction(orderId: string) {
  await requireAdminAction();

  try {
    const order = await prisma.order.findUniqueOrThrow({ where: { id: orderId } });
    if (!order.shippingOrderId || order.shippingOrderId === "CREATING" || order.shippingReconciliationRequired) {
      throw new Error("This order does not have an active shipment yet.");
    }

    if (order.shippingProvider === "PORTER") {
      const { status } = await getPorterDeliveryStatus(order.shippingOrderId);
      await applyLegacyPorterForwardStatus(orderId, status);
    } else if (order.shippingProvider === "BORZO") {
      // GET /orders (order/status/tracking) + GET /courier (real rider, if
      // assigned) — see lib/shipping/service.ts's trackLocalDelivery, which
      // never fails the whole refresh just because no courier exists yet.
      const tracking = await trackLocalDelivery(order.shippingOrderId);
      const hasLiveLocation = tracking.courierLatitude != null && tracking.courierLongitude != null;
      const mapped = mapBorzoStatusToOrderStatus(tracking.status, {
        pointStatuses: tracking.pointDeliveryStatus ? [tracking.pointDeliveryStatus] : [],
        courierHasLiveLocation: hasLiveLocation,
      });
      await applyProviderTrackingUpdate(orderId, mapped, tracking.status, "Borzo", {
        shippingStatus: tracking.status,
        shippingTrackingUrl: tracking.trackingUrl ?? order.shippingTrackingUrl,
        shippingWaybillUrl: tracking.waybillUrl ?? order.shippingWaybillUrl,
        shippingCourierName: tracking.courierName ?? order.shippingCourierName,
        deliveryExecutiveName: tracking.courierName ?? order.deliveryExecutiveName,
        deliveryExecutivePhone: tracking.courierPhone ?? order.deliveryExecutivePhone,
        deliveryExecutiveId: tracking.courierId ?? order.deliveryExecutiveId,
        deliveryExecutivePhotoUrl: tracking.courierPhotoUrl ?? order.deliveryExecutivePhotoUrl,
        // Only ever both-or-neither — a stale single coordinate left over
        // from a courier who's since gone off-shift is not a real position.
        deliveryExecutiveLatitude: hasLiveLocation ? tracking.courierLatitude : null,
        deliveryExecutiveLongitude: hasLiveLocation ? tracking.courierLongitude : null,
        shippingLastUpdatedAt: new Date(),
      });
    } else {
      const tracking = await trackShipment({ awbCode: order.shippingAwbCode, shippingShipmentId: order.shippingShipmentId });
      await applyShippingStatus(orderId, tracking.rawStatus);
      if (tracking.trackingUrl) {
        await prisma.order.update({ where: { id: orderId }, data: { shippingTrackingUrl: tracking.trackingUrl } });
      }
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not refresh delivery status.";
    console.error("[shipping] Delivery status refresh failed for order", orderId, error);
    redirect(`/admin/orders/${orderId}?error=${encodeURIComponent(message)}`);
  }

  revalidatePath(`/admin/orders/${orderId}`);
  revalidatePath("/admin/orders");
  revalidatePath("/admin/returns");
  revalidatePath("/admin");
}

/** Legacy-only: applies a raw Porter status string using Porter's own (frozen) status vocabulary — kept solely so historical PORTER-provider orders remain trackable. Never used for new (SHIPROCKET/BORZO) shipments. */
async function applyLegacyPorterForwardStatus(orderId: string, rawStatus: string) {
  const value = rawStatus.toLowerCase().trim();
  let mapped: OrderStatus | null = null;
  if (value.includes("cancel")) mapped = "CANCELLED";
  else if (value.includes("out_for_delivery") || value.includes("out for delivery") || value.includes("transit") || value.includes("ongoing") || value.includes("picked") || value.includes("arrived")) mapped = "OUT_FOR_DELIVERY";
  else if (value === "delivered" || value.includes("completed") || value.includes("complete")) mapped = "DELIVERED";

  await applyProviderTrackingUpdate(orderId, mapped, rawStatus, "Porter", { shippingStatus: rawStatus });
}

/**
 * Cancels an already-created shipment — a capability the old Porter
 * integration never actually exposed (cancelPorterDelivery existed but was
 * never wired to an action). Only meaningful before the shipment has been
 * picked up; the provider itself also rejects cancellation past that point
 * with a definite (non-uncertain) error. Never marks the shipment cancelled
 * on an uncertain outcome.
 */
export async function cancelShipmentAction(orderId: string) {
  await requireAdminAction();

  try {
    const order = await prisma.order.findUniqueOrThrow({ where: { id: orderId } });
    if (!order.shippingOrderId || order.shippingOrderId === "CREATING") {
      throw new Error("This order does not have an active shipment to cancel.");
    }
    if (order.shippingReconciliationRequired) {
      throw new Error("Shipment outcome is uncertain. Verify with the provider before cancelling.");
    }
    if (order.status === "DELIVERED" || order.status === "CANCELLED") {
      throw new Error("This order cannot be cancelled in its current state.");
    }

    if (order.shippingProvider === "PORTER") {
      await cancelPorterDelivery(order.shippingOrderId);
    } else if (order.shippingProvider === "BORZO") {
      await cancelLocalDelivery(order.shippingOrderId);
    } else {
      await cancelShipment(order.shippingOrderId);
    }

    await prisma.$transaction(async (tx) => {
      await tx.order.update({ where: { id: orderId }, data: { status: "CANCELLED", shippingStatus: "CANCELLED" } });
      await tx.orderEvent.create({ data: { orderId, type: "SHIPMENT_CANCELLED", message: "Shipment cancelled." } });
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not cancel this shipment.";
    console.error("[shipping] Shipment cancellation failed for order", orderId, error);
    // An uncertain cancellation outcome must never be recorded as
    // cancelled — leave the order's status untouched and require manual
    // verification instead.
    if (isUncertain(error)) {
      await prisma.order.update({ where: { id: orderId }, data: { shippingReconciliationRequired: true, shippingLastError: message } }).catch(() => {});
    }
    redirect(`/admin/orders/${orderId}?error=${encodeURIComponent(message)}`);
  }

  revalidatePath(`/admin/orders/${orderId}`);
  revalidatePath("/admin/orders");
  revalidatePath("/admin");
}

// ---------------------------------------------------------------------------
// Borzo local delivery — same-city courier, Pune-to-Pune only for now (see
// lib/shipping/pune-eligibility.ts). A deliberately separate flow from the
// Shiprocket dispatch above (Part 5/9 of the Borzo integration task): no
// AWB, no assign/schedule sub-steps, and a real price quote surfaced before
// booking (see the /borzo-quote API route + BorzoDeliveryForm client
// component). Shares the exact same shippingOrderId "CREATING" claim
// (claimShippingDispatch) as the Shiprocket path, so whichever of the two
// an admin actually clicks first is the only one that can ever win — a
// race between "Create Shipment" and "Create Borzo Delivery" on the same
// order can still never create two shipments.
// ---------------------------------------------------------------------------

/**
 * Creates a real Borzo delivery for a paid, Pune-eligible order. Re-checks
 * eligibility server-side (never trusts that the button was only shown for
 * a genuinely-eligible order) and re-validates every product has a real
 * shipping weight before booking.
 */
export async function createBorzoDeliveryAction(orderId: string) {
  await requireAdminAction();
  let claimed = false;
  let deliveryCreated = false;

  try {
    const order = await prisma.order.findUniqueOrThrow({
      where: { id: orderId },
      include: { items: { include: { listing: true } } },
    });

    if (order.paymentStatus !== "PAID") {
      throw new Error("Order must be paid before a delivery can be created.");
    }
    if (!(order.status === "PAID" || order.status === "PACKED")) {
      throw new Error("This order is not in a dispatchable fulfillment state.");
    }
    if (order.shippingOrderId) {
      throw new Error("This order already has a shipment.");
    }

    const address = (order.deliveryAddress ?? {}) as DeliveryAddress;
    const eligibility = checkLocalDeliveryEligibility(process.env.WAREHOUSE_CITY, address.city, address.pincode);
    if (!eligibility.eligible) {
      throw new Error(eligibility.reason);
    }

    assertBorzoConfigured();
    assertWarehouseConfiguredInProduction();

    const drop = customerAddressFrom(order);
    const totalWeightKg = calculateTotalWeightKg(
      order.items.map((item) => ({
        productName: item.productName,
        quantity: item.quantity,
        weightKg: item.listing?.weightKg != null ? Number(item.listing.weightKg) : null,
      }))
    );

    if (!(await claimShippingDispatch(orderId))) {
      throw new Error("This order already has a shipment.");
    }
    claimed = true;

    const created = await createLocalDelivery({
      pickup: warehouseAddress(),
      drop,
      matter: buildMatterDescription(order.items),
      totalWeightKg,
    });
    deliveryCreated = true;

    await prisma.$transaction(async (tx) => {
      const completed = await tx.order.updateMany({
        where: { id: orderId, shippingOrderId: "CREATING" },
        data: {
          shippingProvider: "BORZO",
          shippingOrderId: created.shippingOrderId,
          shippingShipmentId: null,
          // Borzo has no AWB/label concept — never fabricated (Part 11).
          shippingAwbCode: null,
          shippingCourierName: created.courierName,
          deliveryExecutiveName: created.courierName,
          deliveryExecutivePhone: created.courierPhone,
          deliveryExecutiveId: created.courierId,
          deliveryExecutivePhotoUrl: created.courierPhotoUrl,
          deliveryExecutiveLatitude: created.courierLatitude != null && created.courierLongitude != null ? created.courierLatitude : null,
          deliveryExecutiveLongitude: created.courierLatitude != null && created.courierLongitude != null ? created.courierLongitude : null,
          shippingStatus: created.status,
          shippingTrackingUrl: created.trackingUrl,
          shippingWaybillUrl: created.waybillUrl,
          shippingLastUpdatedAt: new Date(),
          status: "SHIPPED",
          shippingReconciliationRequired: false,
          shippingLastError: null,
        },
      });
      if (completed.count !== 1) throw new Error("Dispatch claim is no longer current.");
      await tx.orderEvent.create({
        data: { orderId, type: "SHIPMENT_CREATED", message: `Local delivery created via Borzo (order ${created.shippingOrderId})` },
      });
    });
  } catch (error) {
    console.error("[shipping] Borzo delivery creation failed for order", orderId, error);
    if (claimed) {
      const failureMessage = error instanceof Error ? error.message : "Could not create this delivery.";
      // Once Borzo has actually created the order, any later failure must
      // be treated as uncertain regardless of its own classification — a
      // naive retry could book a second delivery.
      const uncertain = deliveryCreated || isUncertain(error);
      await prisma.$transaction(async (tx) => {
        if (uncertain) {
          await tx.order.updateMany({ where: { id: orderId, shippingOrderId: "CREATING" }, data: { shippingStatus: "RECONCILIATION_REQUIRED", shippingReconciliationRequired: true, shippingLastError: failureMessage } });
          await tx.orderEvent.create({ data: { orderId, type: "SHIPMENT_RECONCILIATION_REQUIRED", message: failureMessage } });
        } else {
          await tx.order.updateMany({ where: { id: orderId, shippingOrderId: "CREATING" }, data: { shippingOrderId: null, shippingStatus: null, shippingLastError: failureMessage } });
          await tx.orderEvent.create({ data: { orderId, type: "SHIPMENT_CREATE_FAILED", message: failureMessage } });
        }
      });
    }
    const message = error instanceof Error ? error.message : "Could not create this delivery.";
    redirect(`/admin/orders/${orderId}?error=${encodeURIComponent(message)}`);
  }

  revalidatePath(`/admin/orders/${orderId}`);
  revalidatePath("/admin/orders");
  revalidatePath("/admin");
}

/**
 * Approves a pending refund request — actually moves money via Razorpay
 * (a real, non-reversible refund call), then reflects that back onto the
 * order: paymentStatus REFUNDED, fulfillment status CANCELLED (nothing left
 * to ship once the customer's been refunded), and the refund lifecycle
 * fields recorded so the customer-facing order page can show it.
 */
export async function approveRefundAction(orderId: string, formData: FormData) {
  await requireAdminAction();

  const adminNote = String(formData.get("refundAdminNote") ?? "").trim();

  try {
    if (!isRazorpayConfigured()) {
      throw new Error("Razorpay is not configured. Set RAZORPAY_KEY_ID / RAZORPAY_KEY_SECRET in .env.local.");
    }

    const claim = await claimRefundRequest(orderId, adminNote);
    if (!claim.claimed || !claim.paymentId || claim.amount === undefined) {
      throw new Error("This order has no pending refund request.");
    }

    const refund = await createRazorpayRefund({
      paymentId: claim.paymentId,
      amountInPaise: Math.round(claim.amount * 100),
      notes: { orderId },
    });
    await markRefundSucceeded(orderId, refund.id);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not process this refund.";
    console.error("[refund] Approval failed for order", orderId, error);
    if (error instanceof Error && /timeout|timed out|network|socket|ECONNRESET|ETIMEDOUT/i.test(error.message)) {
      await markRefundNeedsReconciliation(orderId, message).catch((dbError) => {
        console.error("[refund] Also failed to record reconciliation-needed state for order", orderId, dbError);
      });
    } else if (message !== "This order has no pending refund request.") {
      await markRefundFailed(orderId, message).catch((dbError) => {
        console.error("[refund] Also failed to record refund-failed state for order", orderId, dbError);
      });
    }
    redirect(`/admin/orders/${orderId}?error=${encodeURIComponent(message)}`);
  }

  revalidatePath(`/admin/orders/${orderId}`);
  revalidatePath("/admin/orders");
  revalidatePath("/admin/returns");
  revalidatePath("/admin");
}

/** Rejects a pending refund request — no money moves, just records why for the customer to see. */
export async function rejectRefundAction(orderId: string, formData: FormData) {
  await requireAdminAction();

  const adminNote = String(formData.get("refundAdminNote") ?? "").trim();
  if (!adminNote) {
    redirect(`/admin/orders/${orderId}?error=${encodeURIComponent("A note is required so the customer knows why.")}`);
  }

  const rejected = await prisma.$transaction(async (tx) => {
    const claim = await tx.order.updateMany({
      where: { id: orderId, paymentStatus: "PAID", refundStatus: "REQUESTED" },
      data: { refundStatus: "REJECTED", refundAdminNote: adminNote },
    });
    if (claim.count !== 1) return false;
    await tx.orderEvent.create({
      data: { orderId, type: "REFUND_REJECTED", message: `Refund request rejected — ${adminNote}` },
    });
    return true;
  });

  if (!rejected) redirect(`/admin/orders/${orderId}?error=${encodeURIComponent("This order has no pending refund request.")}`);

  revalidatePath(`/admin/orders/${orderId}`);
  revalidatePath("/admin/orders");
  revalidatePath("/admin/returns");
  revalidatePath("/admin");
}

/** Approves a pending return request — next step for the admin is creating a reverse shipment. */
export async function approveReturnAction(orderId: string, formData: FormData) {
  await requireAdminAction();
  const adminNote = String(formData.get("returnAdminNote") ?? "").trim();

  const approved = await approveReturn(orderId, adminNote);
  if (!approved) redirect(`/admin/orders/${orderId}?error=${encodeURIComponent("This order has no pending return request.")}`);

  revalidatePath(`/admin/orders/${orderId}`);
  revalidatePath("/admin/orders");
  revalidatePath("/admin/returns");
}

/** Rejects a pending return request — no pickup happens, just records why for the customer to see. */
export async function rejectReturnAction(orderId: string, formData: FormData) {
  await requireAdminAction();
  const adminNote = String(formData.get("returnAdminNote") ?? "").trim();
  if (!adminNote) {
    redirect(`/admin/orders/${orderId}?error=${encodeURIComponent("A note is required so the customer knows why.")}`);
  }

  const rejected = await rejectReturn(orderId, adminNote);
  if (!rejected) redirect(`/admin/orders/${orderId}?error=${encodeURIComponent("This order has no pending return request.")}`);

  revalidatePath(`/admin/orders/${orderId}`);
  revalidatePath("/admin/orders");
  revalidatePath("/admin/returns");
}

/**
 * Creates a reverse shipment for an approved LEGACY whole-order return —
 * the customer's delivery address becomes the pickup point and the
 * warehouse becomes the drop, through the same generic shipping service
 * createReverseShipment uses for partial returns (see
 * dispatchPartialReturnPickupAction below) — one shipping implementation,
 * not two. Ships every item on the order, since the legacy flow has no
 * concept of a partial return.
 */
export async function dispatchReturnPickupAction(orderId: string, formData: FormData) {
  await requireAdminAction();
  let claimed = false;
  let shipmentCreated = false;
  const courierCompanyId = String(formData.get("courierCompanyId") ?? "").trim() || undefined;
  const confirmDefaultDimensions = formData.get("confirmDefaultDimensions") === "on";

  try {
    const order = await prisma.order.findUniqueOrThrow({ where: { id: orderId }, include: { items: { include: { listing: true } } } });

    if (order.returnStatus !== "APPROVED") {
      throw new Error("This return has not been approved yet.");
    }
    if (order.returnShippingReconciliationRequired) {
      throw new Error("Shipment outcome is uncertain. Verify with the provider before creating another.");
    }
    if (order.returnShippingOrderId) {
      throw new Error("A shipment has already been created for this return.");
    }
    assertShippingConfigured();
    assertWarehouseConfiguredInProduction();

    const pickup = customerAddressFrom(order);

    const built = buildPackage(
      order.items.map((item) => ({
        productName: item.productName,
        quantity: item.quantity,
        weightKg: item.listing?.weightKg != null ? Number(item.listing.weightKg) : null,
        lengthCm: item.listing?.lengthCm != null ? Number(item.listing.lengthCm) : null,
        breadthCm: item.listing?.breadthCm != null ? Number(item.listing.breadthCm) : null,
        heightCm: item.listing?.heightCm != null ? Number(item.listing.heightCm) : null,
      }))
    );
    if (!built.usesRealDimensions && !confirmDefaultDimensions) {
      throw new Error("This order has multiple different products — confirm the default parcel dimensions before creating a shipment.");
    }

    if (!(await claimReturnShippingDispatch(orderId))) {
      throw new Error("A shipment has already been created for this return.");
    }
    claimed = true;

    const created = await createReverseShipment({
      referenceId: `return-${order.id}`,
      pickup,
      drop: warehouseAddress(),
      package: built.package,
      items: order.items.map((item) => ({
        name: item.productName,
        sku: item.listing?.sku ?? null,
        quantity: item.quantity,
        unitPrice: Number(item.unitPrice),
      })),
      declaredValue: Number(order.amount),
      instructions: `Return pickup for Deep Automobiles order ${order.id}`,
    });
    shipmentCreated = true;

    if (!created.shippingShipmentId) {
      throw new ShippingProviderError("Shiprocket returned no shipment identifier; reconciliation is required.", { uncertain: true });
    }

    const awb = await assignAwb(created.shippingShipmentId, courierCompanyId);
    const pickupResult = await schedulePickup(created.shippingShipmentId);

    if (
      !(await completeReturnShippingDispatch(orderId, {
        provider: "SHIPROCKET",
        shippingOrderId: created.shippingOrderId,
        shippingShipmentId: created.shippingShipmentId,
        awbCode: awb.awbCode,
        courierName: awb.courierName,
        status: pickupResult.status,
        trackingUrl: null,
      }))
    ) {
      throw new Error("Return shipment claim is no longer current.");
    }
  } catch (error) {
    console.error("[shipping] Return shipment creation failed for order", orderId, error);
    if (claimed) {
      const failureMessage = error instanceof Error ? error.message : "Could not create this return shipment.";
      const uncertain = shipmentCreated || isUncertain(error);
      await failReturnShippingDispatch(orderId, failureMessage, uncertain).catch((dbError) => {
        console.error("[shipping] Also failed to record return-dispatch-failed state for order", orderId, dbError);
      });
    }
    const message = error instanceof Error ? error.message : "Could not create this return shipment.";
    redirect(`/admin/orders/${orderId}?error=${encodeURIComponent(message)}`);
  }

  revalidatePath(`/admin/orders/${orderId}`);
  revalidatePath("/admin/orders");
  revalidatePath("/admin/returns");
}

/** Refreshes the reverse-shipment tracking status for the legacy whole-order return, moving PICKUP_SCHEDULED to PICKED_UP once collected. */
export async function refreshReturnPickupStatusAction(orderId: string) {
  await requireAdminAction();

  try {
    const order = await prisma.order.findUniqueOrThrow({ where: { id: orderId } });
    if (order.returnShippingReconciliationRequired) {
      throw new Error("Shipment outcome is uncertain. Verify with the provider before refreshing status.");
    }
    if (!order.returnShippingOrderId || order.returnShippingOrderId === "CREATING") {
      throw new Error("This return does not have an active shipment yet.");
    }

    const tracking = await trackShipment({ awbCode: order.returnShippingAwbCode, shippingShipmentId: order.returnShippingShipmentId });
    await applyReturnShippingStatus(orderId, tracking.rawStatus);
    if (tracking.trackingUrl) {
      await prisma.order.update({ where: { id: orderId }, data: { returnShippingTrackingUrl: tracking.trackingUrl } });
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not refresh shipment status.";
    console.error("[shipping] Return shipment status refresh failed for order", orderId, error);
    redirect(`/admin/orders/${orderId}?error=${encodeURIComponent(message)}`);
  }

  revalidatePath(`/admin/orders/${orderId}`);
  revalidatePath("/admin/orders");
  revalidatePath("/admin/returns");
}

/**
 * Admin confirms the returned item is physically back at the warehouse —
 * the manual fallback for when tracking doesn't reliably report pickup or
 * delivery. Automatically requests the refund (see markReturnReceived),
 * which is what makes the existing Refund card's Approve/Reject buttons
 * appear below.
 */
export async function markReturnReceivedAction(orderId: string, formData: FormData) {
  await requireAdminAction();
  const adminNote = String(formData.get("returnAdminNote") ?? "").trim();
  const conditionRaw = String(formData.get("returnCondition") ?? "");
  if (conditionRaw !== "RESELLABLE" && conditionRaw !== "DAMAGED") {
    redirect(`/admin/orders/${orderId}?error=${encodeURIComponent("Choose whether the returned item is resellable or damaged before marking it received.")}`);
  }

  const { received } = await markReturnReceived(orderId, adminNote, conditionRaw as ReturnCondition);
  if (!received) {
    redirect(`/admin/orders/${orderId}?error=${encodeURIComponent("This return is not ready to be marked received.")}`);
  }

  revalidatePath(`/admin/orders/${orderId}`);
  revalidatePath("/admin/orders");
  revalidatePath("/admin/returns");
  redirect(`/admin/orders/${orderId}?refundReady=1`);
}

// ---------------------------------------------------------------------------
// Item/quantity-level returns (OrderReturn) — see lib/order-returns/service.ts.
// Each action below is scoped to one returnId, not the whole order, so one
// order can have several returns moving through their lifecycles
// independently (e.g. Return #1 RECEIVED while Return #2 is still REQUESTED).
// `orderId` is only used to redirect back to the right order detail page.
// ---------------------------------------------------------------------------

/** Approves a pending partial return — next step is creating a reverse shipment for it. */
export async function approvePartialReturnAction(orderId: string, returnId: string, formData: FormData) {
  await requireAdminAction();
  const adminNote = String(formData.get("returnAdminNote") ?? "").trim();

  const approved = await approvePartialReturn(returnId, adminNote);
  if (!approved) redirect(`/admin/orders/${orderId}?error=${encodeURIComponent("This return is not pending approval.")}`);

  revalidatePath(`/admin/orders/${orderId}`);
  revalidatePath("/admin/orders");
  revalidatePath("/admin/returns");
}

/** Rejects a pending partial return — the returned quantity becomes returnable again since REJECTED rows are excluded from the "already returned" sum. */
export async function rejectPartialReturnAction(orderId: string, returnId: string, formData: FormData) {
  await requireAdminAction();
  const adminNote = String(formData.get("returnAdminNote") ?? "").trim();
  if (!adminNote) {
    redirect(`/admin/orders/${orderId}?error=${encodeURIComponent("A note is required so the customer knows why.")}`);
  }

  const rejected = await rejectPartialReturn(returnId, adminNote);
  if (!rejected) redirect(`/admin/orders/${orderId}?error=${encodeURIComponent("This return is not pending approval.")}`);

  revalidatePath(`/admin/orders/${orderId}`);
  revalidatePath("/admin/orders");
  revalidatePath("/admin/returns");
}

/**
 * Creates a reverse shipment for one approved partial return. Uses
 * `return-{returnId}` as the shipping reference (never `return-{orderId}`)
 * so multiple returns on the same order never collide on one shipment, and
 * builds the package from ONLY this return's OrderReturnItem contents/
 * quantities — never the full original order (see buildPackage and
 * lib/order-returns/service.ts).
 */
export async function dispatchPartialReturnPickupAction(orderId: string, returnId: string, formData: FormData) {
  await requireAdminAction();
  let claimed = false;
  let shipmentCreated = false;
  const courierCompanyId = String(formData.get("courierCompanyId") ?? "").trim() || undefined;
  const confirmDefaultDimensions = formData.get("confirmDefaultDimensions") === "on";

  try {
    const order = await prisma.order.findUniqueOrThrow({ where: { id: orderId } });
    const orderReturn = await prisma.orderReturn.findUniqueOrThrow({
      where: { id: returnId },
      include: { items: { include: { orderItem: { include: { listing: true } } } } },
    });

    if (orderReturn.orderId !== orderId) throw new Error("This return does not belong to this order.");
    if (orderReturn.status !== "APPROVED") throw new Error("This return has not been approved yet.");
    if (orderReturn.shippingReconciliationRequired) {
      throw new Error("Shipment outcome is uncertain. Verify with the provider before creating another.");
    }
    if (orderReturn.shippingOrderId) throw new Error("A shipment has already been created for this return.");
    assertShippingConfigured();
    assertWarehouseConfiguredInProduction();

    const pickup = customerAddressFrom(order);

    // Only the returned items/quantities — never the full order (Part 22).
    const built = buildPackage(
      orderReturn.items.map((line) => ({
        productName: line.orderItem.productName,
        quantity: line.quantity,
        weightKg: line.orderItem.listing?.weightKg != null ? Number(line.orderItem.listing.weightKg) : null,
        lengthCm: line.orderItem.listing?.lengthCm != null ? Number(line.orderItem.listing.lengthCm) : null,
        breadthCm: line.orderItem.listing?.breadthCm != null ? Number(line.orderItem.listing.breadthCm) : null,
        heightCm: line.orderItem.listing?.heightCm != null ? Number(line.orderItem.listing.heightCm) : null,
      }))
    );
    if (!built.usesRealDimensions && !confirmDefaultDimensions) {
      throw new Error("This return has multiple different products — confirm the default parcel dimensions before creating a shipment.");
    }

    if (!(await claimPartialReturnShippingDispatch(returnId))) {
      throw new Error("A shipment has already been created for this return.");
    }
    claimed = true;

    const created = await createReverseShipment({
      referenceId: `return-${returnId}`,
      pickup,
      drop: warehouseAddress(),
      package: built.package,
      items: orderReturn.items.map((line) => ({
        name: line.orderItem.productName,
        sku: line.orderItem.listing?.sku ?? null,
        quantity: line.quantity,
        unitPrice: Number(line.orderItem.unitPrice),
      })),
      declaredValue: orderReturn.items.reduce((sum, line) => sum + Number(line.orderItem.unitPrice) * line.quantity, 0),
      instructions: `Return #${returnId.slice(-6)} pickup for Deep Automobiles order ${order.id}`,
    });
    shipmentCreated = true;

    if (!created.shippingShipmentId) {
      throw new ShippingProviderError("Shiprocket returned no shipment identifier; reconciliation is required.", { uncertain: true });
    }

    const awb = await assignAwb(created.shippingShipmentId, courierCompanyId);
    const pickupResult = await schedulePickup(created.shippingShipmentId);

    if (
      !(await completePartialReturnShippingDispatch(returnId, {
        provider: "SHIPROCKET",
        shippingOrderId: created.shippingOrderId,
        shippingShipmentId: created.shippingShipmentId,
        awbCode: awb.awbCode,
        courierName: awb.courierName,
        status: pickupResult.status,
        trackingUrl: null,
      }))
    ) {
      throw new Error("Return shipment claim is no longer current.");
    }
  } catch (error) {
    console.error("[shipping] Partial return shipment creation failed for return", returnId, error);
    if (claimed) {
      const failureMessage = error instanceof Error ? error.message : "Could not create this return shipment.";
      const uncertain = shipmentCreated || isUncertain(error);
      await failPartialReturnShippingDispatch(returnId, failureMessage, uncertain).catch((dbError) => {
        console.error("[shipping] Also failed to record partial-return-dispatch-failed state for return", returnId, dbError);
      });
    }
    const message = error instanceof Error ? error.message : "Could not create this return shipment.";
    redirect(`/admin/orders/${orderId}?error=${encodeURIComponent(message)}`);
  }

  revalidatePath(`/admin/orders/${orderId}`);
  revalidatePath("/admin/orders");
  revalidatePath("/admin/returns");
}

/** Refreshes one partial return's reverse-shipment tracking status. */
export async function refreshPartialReturnPickupStatusAction(orderId: string, returnId: string) {
  await requireAdminAction();

  try {
    const orderReturn = await prisma.orderReturn.findUniqueOrThrow({ where: { id: returnId } });
    if (orderReturn.orderId !== orderId) throw new Error("This return does not belong to this order.");
    if (orderReturn.shippingReconciliationRequired) {
      throw new Error("Shipment outcome is uncertain. Verify with the provider before refreshing status.");
    }
    if (!orderReturn.shippingOrderId || orderReturn.shippingOrderId === "CREATING") {
      throw new Error("This return does not have an active shipment yet.");
    }

    const tracking = await trackShipment({ awbCode: orderReturn.shippingAwbCode, shippingShipmentId: orderReturn.shippingShipmentId });
    await applyPartialReturnShippingStatus(returnId, tracking.rawStatus);
    if (tracking.trackingUrl) {
      await prisma.orderReturn.update({ where: { id: returnId }, data: { shippingTrackingUrl: tracking.trackingUrl } });
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not refresh shipment status.";
    console.error("[shipping] Partial return shipment status refresh failed for return", returnId, error);
    redirect(`/admin/orders/${orderId}?error=${encodeURIComponent(message)}`);
  }

  revalidatePath(`/admin/orders/${orderId}`);
  revalidatePath("/admin/orders");
  revalidatePath("/admin/returns");
}

/**
 * Admin confirms this return's item(s) are physically back at the warehouse
 * and chooses a condition — only RESELLABLE restores stock, and only for the
 * quantities on this specific return (see markPartialReturnReceived).
 * Automatically requests this return's own refund.
 */
export async function markPartialReturnReceivedAction(orderId: string, returnId: string, formData: FormData) {
  await requireAdminAction();
  const adminNote = String(formData.get("returnAdminNote") ?? "").trim();
  const conditionRaw = String(formData.get("returnCondition") ?? "");
  if (conditionRaw !== "RESELLABLE" && conditionRaw !== "DAMAGED") {
    redirect(`/admin/orders/${orderId}?error=${encodeURIComponent("Choose whether the returned item(s) are resellable or damaged before marking this return received.")}`);
  }

  const { received } = await markPartialReturnReceived(returnId, adminNote, conditionRaw as ReturnCondition);
  if (!received) {
    redirect(`/admin/orders/${orderId}?error=${encodeURIComponent("This return is not ready to be marked received.")}`);
  }

  revalidatePath(`/admin/orders/${orderId}`);
  revalidatePath("/admin/orders");
  revalidatePath("/admin/returns");
  redirect(`/admin/orders/${orderId}?refundReady=1`);
}

/**
 * Approves one return's pending refund — moves money via Razorpay for just
 * this return's amount, using createRazorpayRefund's existing
 * amountInPaise parameter (already supports partial amounts). Never touches
 * Order.status/paymentStatus — a partial return is not a whole-order
 * cancellation. Razorpay/refund logic is completely independent of the
 * shipping migration (see lib/razorpay.ts, untouched).
 */
export async function approvePartialRefundAction(orderId: string, returnId: string, formData: FormData) {
  await requireAdminAction();
  const adminNote = String(formData.get("refundAdminNote") ?? "").trim();

  try {
    if (!isRazorpayConfigured()) {
      throw new Error("Razorpay is not configured. Set RAZORPAY_KEY_ID / RAZORPAY_KEY_SECRET in .env.local.");
    }

    const claim = await claimPartialRefundRequest(returnId, adminNote);
    if (!claim.claimed || !claim.paymentId || claim.amount === undefined) {
      throw new Error("This return has no pending refund request, or refunding it would exceed the order's paid amount.");
    }

    const refund = await createRazorpayRefund({
      paymentId: claim.paymentId,
      amountInPaise: Math.round(claim.amount * 100),
      notes: { orderId, returnId },
    });
    await markPartialRefundSucceeded(returnId, refund.id);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not process this refund.";
    console.error("[refund] Partial refund approval failed for return", returnId, error);
    if (error instanceof Error && /timeout|timed out|network|socket|ECONNRESET|ETIMEDOUT/i.test(error.message)) {
      await markPartialRefundNeedsReconciliation(returnId, message).catch((dbError) => {
        console.error("[refund] Also failed to record reconciliation-needed state for return", returnId, dbError);
      });
    } else if (!message.startsWith("This return has no pending refund request")) {
      await markPartialRefundFailed(returnId, message).catch((dbError) => {
        console.error("[refund] Also failed to record refund-failed state for return", returnId, dbError);
      });
    }
    redirect(`/admin/orders/${orderId}?error=${encodeURIComponent(message)}`);
  }

  revalidatePath(`/admin/orders/${orderId}`);
  revalidatePath("/admin/orders");
  revalidatePath("/admin/returns");
}

/** Rejects one return's pending refund request — no money moves, just records why. */
export async function rejectPartialRefundAction(orderId: string, returnId: string, formData: FormData) {
  await requireAdminAction();
  const adminNote = String(formData.get("refundAdminNote") ?? "").trim();
  if (!adminNote) {
    redirect(`/admin/orders/${orderId}?error=${encodeURIComponent("A note is required so the customer knows why.")}`);
  }

  const rejected = await prisma.$transaction(async (tx) => {
    const claim = await tx.orderReturn.updateMany({
      where: { id: returnId, refundStatus: "REQUESTED" },
      data: { refundStatus: "FAILED", refundFailureReason: adminNote },
    });
    if (claim.count !== 1) return false;
    await tx.orderEvent.create({
      data: { orderId, type: "PARTIAL_REFUND_REJECTED", message: `Refund for return #${returnId.slice(-6)} rejected — ${adminNote}` },
    });
    return true;
  });

  if (!rejected) redirect(`/admin/orders/${orderId}?error=${encodeURIComponent("This return has no pending refund request.")}`);

  revalidatePath(`/admin/orders/${orderId}`);
  revalidatePath("/admin/orders");
  revalidatePath("/admin/returns");
}

