import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCustomerSession } from "@/lib/auth/customer-session";
import { requestReturn } from "@/lib/order-return-state";
import { enforceApiRateLimit, rejectInvalidJsonRequest } from "@/lib/security/api-protection";

/**
 * Customer-initiated product return. Ownership and delivery state are
 * checked server-side, and the request transition is claimed atomically —
 * see lib/order-return-state.ts. Only DELIVERED orders are eligible; the
 * refund itself is requested later, once the admin confirms the returned
 * item is physically back at the warehouse (markReturnReceived).
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await getCustomerSession();
  if (!session) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  const limited = await enforceApiRateLimit(request, "return-request", { limit: 10, windowMs: 15 * 60_000 }, session.user.id);
  if (limited) return limited;
  const invalidJson = rejectInvalidJsonRequest(request);
  if (invalidJson) return invalidJson;

  const body = await request.json().catch(() => null);
  const reason = typeof body?.reason === "string" ? body.reason.trim() : "";

  if (!reason) {
    return NextResponse.json({ error: "A reason is required to return this product." }, { status: 400 });
  }

  const order = await prisma.order.findUnique({ where: { id } });
  if (!order || order.buyerId !== session.user.id) {
    return NextResponse.json({ error: "Order not found." }, { status: 404 });
  }

  const result = await requestReturn(id, reason);
  if (result === "not_returnable") {
    return NextResponse.json({ error: "This order is not eligible for a return." }, { status: 409 });
  }
  return NextResponse.json({ ok: true, status: "REQUESTED", alreadyRequested: result === "already_requested" });
}
