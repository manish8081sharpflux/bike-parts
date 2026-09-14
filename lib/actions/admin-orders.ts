"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { requireAdminAction } from "@/lib/auth/require-admin";
import {
  createPorterDelivery,
  getPorterDeliveryStatus,
  assertPorterConfigured,
  PorterRequestError,
} from "@/lib/porter";
import { createRazorpayRefund, isRazorpayConfigured } from "@/lib/razorpay";
import {
  claimRefundRequest,
  markRefundFailed,
  markRefundNeedsReconciliation,
  markRefundSucceeded,
} from "@/lib/order-refund-state";
import {
  applyPorterStatus,
  cancelAdminOrderBeforeDispatch,
  claimPorterDispatch,
  ORDER_STATUS_LABELS,
} from "@/lib/order-delivery-state";
import {
  approveReturn,
  applyReturnPorterStatus,
  claimReturnPickupDispatch,
  completeReturnPickupDispatch,
  failReturnPickupDispatch,
  markReturnReceived,
  rejectReturn,
  type ReturnCondition,
} from "@/lib/order-return-state";
import {
  approvePartialReturn,
  applyPartialReturnPorterStatus,
  claimPartialRefundRequest,
  claimPartialReturnPickupDispatch,
  completePartialReturnPickupDispatch,
  failPartialReturnPickupDispatch,
  markPartialRefundFailed,
  markPartialRefundNeedsReconciliation,
  markPartialRefundSucceeded,
  markPartialReturnReceived,
  rejectPartialReturn,
} from "@/lib/order-returns/service";
import type { OrderStatus } from "@prisma/client";

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
      redirect(`/admin/orders/${orderId}?error=${encodeURIComponent("Dispatched or already-cancelled orders require Porter cancellation/reconciliation before local cancellation.")}`);
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

export async function dispatchOrderAction(orderId: string) {
  await requireAdminAction();
  let claimed = false;

  try {
    const order = await prisma.order.findUniqueOrThrow({ where: { id: orderId } });

    if (order.paymentStatus !== "PAID") {
      throw new Error("Order must be paid before it can be dispatched for delivery.");
    }
    if (!(order.status === "PAID" || order.status === "PACKED")) {
      throw new Error("This order is not in a dispatchable fulfillment state.");
    }
    if (order.porterOrderId) {
      throw new Error("This order has already been dispatched with Porter.");
    }
    assertPorterConfigured();
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

    const address = (order.deliveryAddress ?? {}) as DeliveryAddress;
    const line1 = [address.flatNo, address.floor, address.area].filter(Boolean).join(", ");
    // The delivery contact may not be the account holder (e.g. an order sent
    // to a shop or a relative's place), so Porter gets the address's own
    // phone when the snapshot has one — falling back to the account phone
    // only for orders placed before Fix 6, whose snapshot predates this
    // field. Whichever number is chosen is the one validated here.
    const dropPhone = address.phone || order.customerPhone;
    if (!order.customerName.trim() || !/^\d{10}$/.test(dropPhone) || !line1 || !address.city || !/^\d{6}$/.test(address.pincode ?? "")) {
      throw new Error("Delivery address is incomplete. Contact name, phone, address, city, and pincode are required.");
    }

    if (!(await claimPorterDispatch(orderId))) {
      throw new Error("This order has already been dispatched with Porter.");
    }
    claimed = true;

    const result = await createPorterDelivery({
      orderId: order.id,
      pickup: {
        contactName: process.env.WAREHOUSE_CONTACT_NAME!,
        contactPhone: process.env.WAREHOUSE_PHONE!,
        line1: process.env.WAREHOUSE_ADDRESS_LINE1!,
        city: process.env.WAREHOUSE_CITY!,
        pincode: process.env.WAREHOUSE_PINCODE!,
      },
      drop: {
        contactName: address.contactName || order.customerName,
        contactPhone: dropPhone,
        line1,
        line2: address.landmark ?? "",
        city: address.city ?? "",
        pincode: address.pincode ?? "",
      },
      amount: Number(order.amount),
    });

    if (!result.porterOrderId) {
      throw new PorterRequestError("Porter returned no delivery identifier; reconciliation is required.", { uncertain: true });
    }

    await prisma.$transaction(async (tx) => {
      const completed = await tx.order.updateMany({
        where: { id: orderId, porterOrderId: "DISPATCHING" },
        data: {
          porterOrderId: result.porterOrderId,
          porterStatus: result.status,
          porterTrackingUrl: result.trackingUrl,
          status: "SHIPPED",
          porterReconciliationRequired: false,
          porterLastError: null,
        },
      });
      if (completed.count !== 1) throw new Error("Dispatch claim is no longer current.");
      await tx.orderEvent.create({ data: { orderId, type: "PORTER_DISPATCHED", message: `Dispatched via Porter (order ${result.porterOrderId})` } });
    });
  } catch (error) {
    console.error("[porter] Dispatch failed for order", orderId, error);
    if (claimed) {
      const failureMessage = error instanceof Error ? error.message : "Could not dispatch this order.";
      const uncertain = error instanceof PorterRequestError && error.uncertain;
      await prisma.$transaction(async (tx) => {
        if (uncertain) {
          await tx.order.updateMany({ where: { id: orderId, porterOrderId: "DISPATCHING" }, data: { porterStatus: "RECONCILIATION_REQUIRED", porterReconciliationRequired: true, porterLastError: failureMessage } });
          await tx.orderEvent.create({ data: { orderId, type: "PORTER_RECONCILIATION_REQUIRED", message: failureMessage } });
        } else {
          await tx.order.updateMany({ where: { id: orderId, porterOrderId: "DISPATCHING" }, data: { porterOrderId: null, porterStatus: null, porterLastError: failureMessage } });
          await tx.orderEvent.create({ data: { orderId, type: "PORTER_DISPATCH_FAILED", message: failureMessage } });
        }
      });
    }
    const message = error instanceof Error ? error.message : "Could not dispatch this order.";
    redirect(`/admin/orders/${orderId}?error=${encodeURIComponent(message)}`);
  }

  revalidatePath(`/admin/orders/${orderId}`);
  revalidatePath("/admin/orders");
  revalidatePath("/admin/returns");
  revalidatePath("/admin");
}

export async function refreshDeliveryStatusAction(orderId: string) {
  await requireAdminAction();

  try {
    const order = await prisma.order.findUniqueOrThrow({ where: { id: orderId } });
    if (!order.porterOrderId || order.porterOrderId === "DISPATCHING" || order.porterReconciliationRequired) {
      throw new Error("This order has not been dispatched yet.");
    }

    const { status } = await getPorterDeliveryStatus(order.porterOrderId);

    await applyPorterStatus(orderId, status);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not refresh delivery status.";
    console.error("[porter] Delivery status refresh failed for order", orderId, error);
    redirect(`/admin/orders/${orderId}?error=${encodeURIComponent(message)}`);
  }

  revalidatePath(`/admin/orders/${orderId}`);
  revalidatePath("/admin/orders");
  revalidatePath("/admin/returns");
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

/** Approves a pending return request — next step for the admin is dispatching a reverse pickup. */
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
 * Dispatches a reverse Porter pickup for an approved return — the customer's
 * delivery address becomes the pickup point and the warehouse becomes the
 * drop, reusing the exact same createPorterDelivery call the forward
 * dispatch uses (see dispatchOrderAction above), just with the two
 * addresses swapped.
 */
export async function dispatchReturnPickupAction(orderId: string) {
  await requireAdminAction();
  let claimed = false;

  try {
    const order = await prisma.order.findUniqueOrThrow({ where: { id: orderId } });

    if (order.returnStatus !== "APPROVED") {
      throw new Error("This return has not been approved yet.");
    }
    if (order.returnPorterReconciliationRequired) {
      throw new Error("Pickup outcome is uncertain. Verify the pickup with Porter before dispatching again.");
    }
    if (order.returnPorterOrderId) {
      throw new Error("A pickup has already been dispatched for this return.");
    }
    assertPorterConfigured();
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

    const address = (order.deliveryAddress ?? {}) as DeliveryAddress;
    const line1 = [address.flatNo, address.floor, address.area].filter(Boolean).join(", ");
    const pickupPhone = address.phone || order.customerPhone;
    if (!order.customerName.trim() || !/^\d{10}$/.test(pickupPhone) || !line1 || !address.city || !/^\d{6}$/.test(address.pincode ?? "")) {
      throw new Error("Delivery address is incomplete. Contact name, phone, address, city, and pincode are required.");
    }

    if (!(await claimReturnPickupDispatch(orderId))) {
      throw new Error("A pickup has already been dispatched for this return.");
    }
    claimed = true;

    const result = await createPorterDelivery({
      orderId: `return-${order.id}`,
      pickup: {
        contactName: address.contactName || order.customerName,
        contactPhone: pickupPhone,
        line1,
        line2: address.landmark ?? "",
        city: address.city ?? "",
        pincode: address.pincode ?? "",
      },
      drop: {
        contactName: process.env.WAREHOUSE_CONTACT_NAME!,
        contactPhone: process.env.WAREHOUSE_PHONE!,
        line1: process.env.WAREHOUSE_ADDRESS_LINE1!,
        city: process.env.WAREHOUSE_CITY!,
        pincode: process.env.WAREHOUSE_PINCODE!,
      },
      amount: Number(order.amount),
      instructions: `Return pickup for Deep Automobiles order ${order.id}`,
    });

    if (!result.porterOrderId) {
      throw new PorterRequestError("Porter returned no delivery identifier; reconciliation is required.", { uncertain: true });
    }

    if (!(await completeReturnPickupDispatch(orderId, result))) {
      throw new Error("Return pickup claim is no longer current.");
    }
  } catch (error) {
    console.error("[porter] Return pickup dispatch failed for order", orderId, error);
    if (claimed) {
      const failureMessage = error instanceof Error ? error.message : "Could not dispatch this return pickup.";
      // Same definite-vs-uncertain split as dispatchOrderAction: a timeout,
      // ECONNRESET, socket interruption, or a response missing a Porter
      // order id means the pickup may already exist on Porter's side — that
      // must never be treated as "safe to retry."
      const uncertain = error instanceof PorterRequestError && error.uncertain;
      await failReturnPickupDispatch(orderId, failureMessage, uncertain).catch((dbError) => {
        console.error("[porter] Also failed to record return-dispatch-failed state for order", orderId, dbError);
      });
    }
    const message = error instanceof Error ? error.message : "Could not dispatch this return pickup.";
    redirect(`/admin/orders/${orderId}?error=${encodeURIComponent(message)}`);
  }

  revalidatePath(`/admin/orders/${orderId}`);
  revalidatePath("/admin/orders");
  revalidatePath("/admin/returns");
}

/** Polls Porter for the reverse-pickup shipment's latest status and applies it (moving PICKUP_SCHEDULED to PICKED_UP once collected). */
export async function refreshReturnPickupStatusAction(orderId: string) {
  await requireAdminAction();

  try {
    const order = await prisma.order.findUniqueOrThrow({ where: { id: orderId } });
    if (order.returnPorterReconciliationRequired) {
      throw new Error("Pickup outcome is uncertain. Verify the pickup with Porter before refreshing status.");
    }
    if (!order.returnPorterOrderId || order.returnPorterOrderId === "DISPATCHING") {
      throw new Error("This return has not been dispatched for pickup yet.");
    }

    const { status } = await getPorterDeliveryStatus(order.returnPorterOrderId);
    await applyReturnPorterStatus(orderId, status);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not refresh pickup status.";
    console.error("[porter] Return pickup status refresh failed for order", orderId, error);
    redirect(`/admin/orders/${orderId}?error=${encodeURIComponent(message)}`);
  }

  revalidatePath(`/admin/orders/${orderId}`);
  revalidatePath("/admin/orders");
  revalidatePath("/admin/returns");
}

/**
 * Admin confirms the returned item is physically back at the warehouse —
 * the manual fallback for when Porter's own tracking doesn't reliably
 * report pickup/delivery. Automatically requests the refund (see
 * markReturnReceived), which is what makes the existing Refund card's
 * Approve/Reject buttons appear below.
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

/** Approves a pending partial return — next step is dispatching a reverse pickup for it. */
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
 * Dispatches a reverse Porter pickup for one approved partial return. Uses
 * `return-{returnId}` as the Porter request reference (never
 * `return-{orderId}`) so multiple returns on the same order never collide on
 * one Porter shipment.
 */
export async function dispatchPartialReturnPickupAction(orderId: string, returnId: string) {
  await requireAdminAction();
  let claimed = false;

  try {
    const order = await prisma.order.findUniqueOrThrow({ where: { id: orderId } });
    const orderReturn = await prisma.orderReturn.findUniqueOrThrow({ where: { id: returnId } });

    if (orderReturn.orderId !== orderId) throw new Error("This return does not belong to this order.");
    if (orderReturn.status !== "APPROVED") throw new Error("This return has not been approved yet.");
    if (orderReturn.porterReconciliationRequired) {
      throw new Error("Pickup outcome is uncertain. Verify the pickup with Porter before dispatching again.");
    }
    if (orderReturn.porterOrderId) throw new Error("A pickup has already been dispatched for this return.");
    assertPorterConfigured();
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

    const address = (order.deliveryAddress ?? {}) as DeliveryAddress;
    const line1 = [address.flatNo, address.floor, address.area].filter(Boolean).join(", ");
    const pickupPhone = address.phone || order.customerPhone;
    if (!order.customerName.trim() || !/^\d{10}$/.test(pickupPhone) || !line1 || !address.city || !/^\d{6}$/.test(address.pincode ?? "")) {
      throw new Error("Delivery address is incomplete. Contact name, phone, address, city, and pincode are required.");
    }

    if (!(await claimPartialReturnPickupDispatch(returnId))) {
      throw new Error("A pickup has already been dispatched for this return.");
    }
    claimed = true;

    const result = await createPorterDelivery({
      orderId: `return-${returnId}`,
      pickup: {
        contactName: address.contactName || order.customerName,
        contactPhone: pickupPhone,
        line1,
        line2: address.landmark ?? "",
        city: address.city ?? "",
        pincode: address.pincode ?? "",
      },
      drop: {
        contactName: process.env.WAREHOUSE_CONTACT_NAME!,
        contactPhone: process.env.WAREHOUSE_PHONE!,
        line1: process.env.WAREHOUSE_ADDRESS_LINE1!,
        city: process.env.WAREHOUSE_CITY!,
        pincode: process.env.WAREHOUSE_PINCODE!,
      },
      amount: Number(order.amount),
      instructions: `Return #${returnId.slice(-6)} pickup for Deep Automobiles order ${order.id}`,
    });

    if (!result.porterOrderId) {
      throw new PorterRequestError("Porter returned no delivery identifier; reconciliation is required.", { uncertain: true });
    }

    if (!(await completePartialReturnPickupDispatch(returnId, result))) {
      throw new Error("Return pickup claim is no longer current.");
    }
  } catch (error) {
    console.error("[porter] Partial return pickup dispatch failed for return", returnId, error);
    if (claimed) {
      const failureMessage = error instanceof Error ? error.message : "Could not dispatch this return pickup.";
      const uncertain = error instanceof PorterRequestError && error.uncertain;
      await failPartialReturnPickupDispatch(returnId, failureMessage, uncertain).catch((dbError) => {
        console.error("[porter] Also failed to record partial-return-dispatch-failed state for return", returnId, dbError);
      });
    }
    const message = error instanceof Error ? error.message : "Could not dispatch this return pickup.";
    redirect(`/admin/orders/${orderId}?error=${encodeURIComponent(message)}`);
  }

  revalidatePath(`/admin/orders/${orderId}`);
  revalidatePath("/admin/orders");
  revalidatePath("/admin/returns");
}

/** Polls Porter for one partial return's pickup shipment and applies the latest status. */
export async function refreshPartialReturnPickupStatusAction(orderId: string, returnId: string) {
  await requireAdminAction();

  try {
    const orderReturn = await prisma.orderReturn.findUniqueOrThrow({ where: { id: returnId } });
    if (orderReturn.orderId !== orderId) throw new Error("This return does not belong to this order.");
    if (orderReturn.porterReconciliationRequired) {
      throw new Error("Pickup outcome is uncertain. Verify the pickup with Porter before refreshing status.");
    }
    if (!orderReturn.porterOrderId || orderReturn.porterOrderId === "DISPATCHING") {
      throw new Error("This return has not been dispatched for pickup yet.");
    }

    const { status } = await getPorterDeliveryStatus(orderReturn.porterOrderId);
    await applyPartialReturnPorterStatus(returnId, status);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not refresh pickup status.";
    console.error("[porter] Partial return pickup status refresh failed for return", returnId, error);
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
 * cancellation.
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
