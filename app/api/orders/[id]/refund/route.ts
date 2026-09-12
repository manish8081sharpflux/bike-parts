import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCustomerSession } from "@/lib/auth/customer-session";
import { requestRefund } from "@/lib/order-refund-state";

/**
 * Customer-initiated refund request. Ownership and payment state are checked
 * server-side, and the request transition is claimed atomically.
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await getCustomerSession();
  if (!session) return NextResponse.json({ error: "Authentication required." }, { status: 401 });

  const body = await request.json().catch(() => null);
  const reason = typeof body?.reason === "string" ? body.reason.trim() : "";

  if (!reason) {
    return NextResponse.json({ error: "A reason is required to request a refund." }, { status: 400 });
  }

  const order = await prisma.order.findUnique({ where: { id } });
  if (!order || order.buyerId !== session.user.id) {
    return NextResponse.json({ error: "Order not found." }, { status: 404 });
  }

  const result = await requestRefund(id, reason);
  if (result === "not_refundable") {
    return NextResponse.json({ error: "This order is not eligible for a refund." }, { status: 409 });
  }
  return NextResponse.json({ ok: true, status: "REQUESTED", alreadyRequested: result === "already_requested" });
}
