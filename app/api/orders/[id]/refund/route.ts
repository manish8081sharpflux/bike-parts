import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

/**
 * Customer-initiated refund request. Same trust model as the rest of the
 * customer-facing API (see app/api/orders/route.ts) — the storefront's login
 * is a plain phone-entry with no real OTP, so every customer endpoint here
 * trusts the phone number the client sends rather than a real session. The
 * `phone` check below still guards against one customer requesting a refund
 * on an order that isn't theirs.
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await request.json().catch(() => null);
  const phone = typeof body?.phone === "string" ? body.phone.trim() : "";
  const reason = typeof body?.reason === "string" ? body.reason.trim() : "";

  if (!phone) {
    return NextResponse.json({ error: "phone is required." }, { status: 400 });
  }
  if (!reason) {
    return NextResponse.json({ error: "A reason is required to request a refund." }, { status: 400 });
  }

  const order = await prisma.order.findUnique({ where: { id } });
  if (!order || order.customerPhone !== phone) {
    return NextResponse.json({ error: "Order not found." }, { status: 404 });
  }

  if (order.paymentStatus !== "PAID") {
    return NextResponse.json(
      { error: "This order hasn't been paid, so there's nothing to refund." },
      { status: 400 }
    );
  }
  if (order.refundStatus === "REQUESTED") {
    return NextResponse.json({ error: "A refund request is already pending for this order." }, { status: 409 });
  }
  if (order.refundStatus === "REFUNDED") {
    return NextResponse.json({ error: "This order has already been refunded." }, { status: 409 });
  }

  await prisma.order.update({
    where: { id },
    data: {
      refundStatus: "REQUESTED",
      refundReason: reason,
      refundAdminNote: null,
      refundAmount: order.amount,
      refundRequestedAt: new Date(),
    },
  });

  await prisma.orderEvent.create({
    data: {
      orderId: id,
      type: "REFUND_REQUESTED",
      message: `Customer requested a refund — ${reason}`,
    },
  });

  return NextResponse.json({ ok: true });
}
