"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { requireAdminAction } from "@/lib/auth/require-admin";
import { createPorterDelivery, getPorterDeliveryStatus, isPorterConfigured } from "@/lib/porter";
import { createRazorpayRefund, isRazorpayConfigured } from "@/lib/razorpay";
import {
  claimRefundRequest,
  markRefundFailed,
  markRefundNeedsReconciliation,
  markRefundSucceeded,
  requestRefund,
} from "@/lib/order-refund-state";
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

// Relative progress of each stage, used to decide whether a Porter-reported
// status represents forward progress (so a stale/out-of-order API response
// can never move an order backwards). CANCELLED has no natural rank — it's
// handled as a special case below.
const ORDER_STATUS_RANK: Record<OrderStatus, number> = {
  PENDING: 0,
  PAID: 1,
  PACKED: 2,
  SHIPPED: 3,
  OUT_FOR_DELIVERY: 4,
  DELIVERED: 5,
  CANCELLED: -1,
};

/**
 * Best-effort mapping from Porter's (partner-specific, not fully documented)
 * delivery status string to our own OrderStatus enum. Returns null when the
 * string doesn't clearly correspond to one of our stages — in that case we
 * still record the raw text (see refreshDeliveryStatusAction) but leave the
 * order's actual status untouched rather than guess.
 */
function mapPorterStatusToOrderStatus(raw: string): OrderStatus | null {
  const value = raw.toLowerCase();
  if (value.includes("deliver") || value.includes("complet")) return "DELIVERED";
  if (value.includes("cancel")) return "CANCELLED";
  if (
    value.includes("transit") ||
    value.includes("ongoing") ||
    value.includes("picked") ||
    value.includes("arrived") ||
    value.includes("out_for_delivery")
  ) {
    return "OUT_FOR_DELIVERY";
  }
  return null;
}

type DeliveryAddress = {
  contactName?: string;
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

  const order = await prisma.order.findUniqueOrThrow({ where: { id: orderId } });

  // Cancelling an order that was already paid for means the customer is now
  // owed money back. Auto-create the refund request right here instead of
  // waiting on the customer to notice and ask for one — this is also what
  // makes the Refund card (with its Approve/Reject actions) appear below
  // without any extra step. Only kicks in the first time: if a refund is
  // already requested/processing/refunded/rejected, that flow is left alone.
  const shouldAutoRequestRefund =
    statusRaw === "CANCELLED" && order.paymentStatus === "PAID" && order.refundStatus === "NONE";

  await prisma.$transaction(async (tx) => {
    await tx.order.update({
      where: { id: orderId },
      data: { status: statusRaw as OrderStatus, adminNote: adminNote || undefined },
    });
    await tx.orderEvent.create({
      data: {
        orderId,
        type: "STATUS_CHANGE",
        message: `Status changed to ${statusRaw}${adminNote ? ` — ${adminNote}` : ""}`,
      },
    });
    if (shouldAutoRequestRefund) {
      const refundRequest = await requestRefund(orderId, "Order cancelled by admin", tx);
      if (refundRequest === "not_refundable") {
        throw new Error("The paid order changed before its refund request could be created.");
      }
    }
  });

  revalidatePath(`/admin/orders/${orderId}`);
  revalidatePath("/admin/orders");
  revalidatePath("/admin");

  // Send the admin back to this order with a flag that pops up a modal
  // pointing them straight at the refund they now need to approve or reject.
  if (shouldAutoRequestRefund) {
    redirect(`/admin/orders/${orderId}?refundReady=1`);
  }
}

export async function dispatchOrderAction(orderId: string) {
  await requireAdminAction();

  // "Claimed" once the atomic guard below succeeds — tracked so the catch
  // block knows whether it needs to release the claim on failure.
  let claimed = false;

  try {
    const order = await prisma.order.findUniqueOrThrow({ where: { id: orderId } });

    if (order.paymentStatus !== "PAID") {
      throw new Error("Order must be paid before it can be dispatched for delivery.");
    }
    if (order.porterOrderId) {
      throw new Error("This order has already been dispatched with Porter.");
    }
    if (!isPorterConfigured()) {
      throw new Error("Porter is not configured. Set PORTER_API_KEY in .env.local.");
    }

    // Atomically claim this order before calling Porter — the check above
    // reads then acts, which isn't safe against two near-simultaneous
    // clicks (or two admin tabs) both passing the `porterOrderId` check
    // before either has written anything, both then calling Porter and
    // creating two real courier deliveries for one order. This conditional
    // update only succeeds (count 1) for whichever request gets there
    // first; the loser sees count 0 and bails out before ever calling
    // Porter, exactly like reserveStock's atomic decrement in
    // lib/checkout-stock.ts for the same class of race.
    const claim = await prisma.order.updateMany({
      where: { id: orderId, porterOrderId: null, paymentStatus: "PAID" },
      data: { porterOrderId: "DISPATCHING" },
    });
    if (claim.count === 0) {
      throw new Error("This order has already been dispatched with Porter.");
    }
    claimed = true;

    const address = (order.deliveryAddress ?? {}) as DeliveryAddress;

    const result = await createPorterDelivery({
      orderId: order.id,
      pickup: {
        contactName: process.env.WAREHOUSE_CONTACT_NAME ?? "Deep Automobiles Warehouse",
        contactPhone: process.env.WAREHOUSE_PHONE ?? "9999999999",
        line1: process.env.WAREHOUSE_ADDRESS_LINE1 ?? "Deep Automobiles Warehouse",
        city: process.env.WAREHOUSE_CITY ?? "Patna",
        pincode: process.env.WAREHOUSE_PINCODE ?? "800001",
      },
      drop: {
        contactName: address.contactName || order.customerName,
        contactPhone: order.customerPhone,
        line1: [address.flatNo, address.floor, address.area].filter(Boolean).join(", "),
        line2: address.landmark ?? "",
        city: address.city ?? "",
        pincode: address.pincode ?? "",
      },
      amount: Number(order.amount),
    });

    await prisma.order.update({
      where: { id: orderId },
      data: {
        porterOrderId: result.porterOrderId,
        porterStatus: result.status,
        porterTrackingUrl: result.trackingUrl,
        status: "SHIPPED",
      },
    });

    await prisma.orderEvent.create({
      data: {
        orderId,
        type: "DISPATCHED",
        message: `Dispatched via Porter (order ${result.porterOrderId})`,
      },
    });
  } catch (error) {
    // The Porter API call itself failed after the claim succeeded (network
    // error, Porter rejected the request, etc.) — release the claim so the
    // order isn't stuck permanently showing "already dispatched" when no
    // real delivery was ever created.
    if (claimed) {
      await prisma.order
        .update({ where: { id: orderId }, data: { porterOrderId: null } })
        .catch(() => {});
    }
    const message = error instanceof Error ? error.message : "Could not dispatch this order.";
    redirect(`/admin/orders/${orderId}?error=${encodeURIComponent(message)}`);
  }

  revalidatePath(`/admin/orders/${orderId}`);
  revalidatePath("/admin/orders");
  revalidatePath("/admin");
}

export async function refreshDeliveryStatusAction(orderId: string) {
  await requireAdminAction();

  try {
    const order = await prisma.order.findUniqueOrThrow({ where: { id: orderId } });
    if (!order.porterOrderId) {
      throw new Error("This order has not been dispatched yet.");
    }

    const { status } = await getPorterDeliveryStatus(order.porterOrderId);

    // Auto-sync our own status when Porter's reported status clearly maps to
    // one of our stages and represents forward progress — e.g. Porter saying
    // "delivered" flips the order to DELIVERED here, not just the side note.
    const mappedStatus = mapPorterStatusToOrderStatus(status);
    const isForwardProgress =
      mappedStatus === "CANCELLED"
        ? order.status !== "DELIVERED" && order.status !== "CANCELLED"
        : mappedStatus !== null && ORDER_STATUS_RANK[mappedStatus] > ORDER_STATUS_RANK[order.status];

    await prisma.order.update({
      where: { id: orderId },
      data: {
        porterStatus: status,
        ...(isForwardProgress ? { status: mappedStatus! } : {}),
      },
    });

    if (isForwardProgress) {
      await prisma.orderEvent.create({
        data: {
          orderId,
          type: "STATUS_CHANGE",
          message: `Status changed to ${mappedStatus} (auto-synced from Porter status "${status}")`,
        },
      });
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not refresh delivery status.";
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
    if (error instanceof Error && /timeout|timed out|network|socket|ECONNRESET|ETIMEDOUT/i.test(error.message)) {
      await markRefundNeedsReconciliation(orderId, message).catch(() => {});
    } else if (message !== "This order has no pending refund request.") {
      await markRefundFailed(orderId, message).catch(() => {});
    }
    redirect(`/admin/orders/${orderId}?error=${encodeURIComponent(message)}`);
  }

  revalidatePath(`/admin/orders/${orderId}`);
  revalidatePath("/admin/orders");
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
  revalidatePath("/admin");
}
