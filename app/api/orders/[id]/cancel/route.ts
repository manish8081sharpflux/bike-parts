import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCustomerSession } from "@/lib/auth/customer-session";
import { requestRefund } from "@/lib/order-refund-state";

/**
 * Customer-initiated order cancellation. Ownership comes from the session.
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

  const shouldAutoRequestRefund = order.paymentStatus === "PAID" && order.refundStatus !== "REFUNDED";
  await prisma.$transaction(async (tx) => {
    const cancelled = await tx.order.updateMany({
      where: { id, buyerId: session.user.id, status: { not: "CANCELLED" }, paymentStatus: order.paymentStatus },
      data: { status: "CANCELLED" },
    });
    if (cancelled.count !== 1) throw new Error("This order changed before cancellation completed.");
    await tx.orderEvent.create({ data: { orderId: id, type: "STATUS_CHANGE", message: "Order cancelled by customer." } });
    if (shouldAutoRequestRefund) await requestRefund(id, "Cancelled by customer", tx);
  });

  return NextResponse.json({ ok: true });
}
