import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCustomerSession } from "@/lib/auth/customer-session";
import { cancelCustomerOrder } from "@/lib/order-delivery-state";

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

  if (!(["PENDING", "PAID"] as const).includes(order.status as "PENDING" | "PAID") || order.porterOrderId) {
    return NextResponse.json({ error: "This order can no longer be cancelled after fulfillment has started." }, { status: 409 });
  }

  const { cancelled: cancellationWon } = await cancelCustomerOrder(id, session.user.id);

  if (!cancellationWon) {
    return NextResponse.json({ error: "This order can no longer be cancelled after fulfillment has started." }, { status: 409 });
  }

  return NextResponse.json({ ok: true });
}
