import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCustomerSession } from "@/lib/auth/customer-session";

/**
 * Customer-initiated order cancellation. Same trust model as the refund
 * route next to this one (app/api/orders/[id]/refund) — the storefront login
 * is a plain phone-entry with no real OTP, so the `phone` check below is
 * what actually guards against cancelling an order that isn't the caller's.
 *
 * If the order was already paid for, this also auto-creates the refund
 * request (skipping the separate "Request refund" step) so the admin sees
 * it ready to approve/reject immediately — mirrors what happens when an
 * admin cancels a paid order from the other side (see updateOrderStatusAction
 * in lib/actions/admin-orders.ts).
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await getCustomerSession();
  if (!session) return NextResponse.json({ error: "Authentication required." }, { status: 401 });

  const order = await prisma.order.findUnique({ where: { id } });
  if (!order || order.buyerId !== session.user.id) {
    return NextResponse.json({ error: "Order not found." }, { status: 404 });
  }

  if (order.status === "CANCELLED") {
    return NextResponse.json({ error: "This order is already cancelled." }, { status: 409 });
  }
  if (order.status === "DELIVERED") {
    return NextResponse.json({ error: "This order has already been delivered and can't be cancelled." }, { status: 409 });
  }

  const shouldAutoRequestRefund = order.paymentStatus === "PAID" && order.refundStatus === "NONE";

  await prisma.order.update({
    where: { id },
    data: {
      status: "CANCELLED",
      ...(shouldAutoRequestRefund
        ? {
            refundStatus: "REQUESTED" as const,
            refundReason: "Cancelled by customer",
            refundAmount: order.amount,
            refundRequestedAt: new Date(),
          }
        : {}),
    },
  });

  await prisma.orderEvent.create({
    data: {
      orderId: id,
      type: "STATUS_CHANGE",
      message: "Order cancelled by customer.",
    },
  });

  if (shouldAutoRequestRefund) {
    await prisma.orderEvent.create({
      data: {
        orderId: id,
        type: "REFUND_REQUESTED",
        message: "Refund auto-requested — order was cancelled by the customer after payment was already made.",
      },
    });
  }

  return NextResponse.json({ ok: true });
}
