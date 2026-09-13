import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { releaseOrderAndRecordEvent } from "@/lib/checkout-stock";
import { getCustomerSession } from "@/lib/auth/customer-session";
import { enforceApiRateLimit, rejectInvalidJsonRequest } from "@/lib/security/api-protection";

/**
 * Called by the storefront when a checkout is abandoned before payment
 * completes — the Razorpay modal was dismissed, or `payment.failed` fired.
 * Releases the order's stock reservation immediately instead of leaving the
 * customer's cart items unavailable to everyone else until the 15-minute
 * expiry sweep would eventually notice (see lib/checkout-stock.ts).
 */
export async function POST(request: Request) {
  const session = await getCustomerSession();
  if (!session) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  const limited = await enforceApiRateLimit(request, "checkout-cancel", { limit: 20, windowMs: 15 * 60_000 }, session.user.id);
  if (limited) return limited;
  const invalidJson = rejectInvalidJsonRequest(request);
  if (invalidJson) return invalidJson;

  let body: { orderId?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  if (!body.orderId) {
    return NextResponse.json({ error: "orderId is required." }, { status: 400 });
  }

  const order = await prisma.order.findUnique({ where: { id: body.orderId } });
  if (order && order.buyerId !== session.user.id) {
    return NextResponse.json({ error: "Order not found." }, { status: 404 });
  }
  // Never touch an order that already succeeded — only release genuinely
  // abandoned ones. Also fine if the order doesn't exist (nothing to do).
  if (!order || order.paymentStatus === "PAID") {
    return NextResponse.json({ ok: true });
  }

  await releaseOrderAndRecordEvent(
    order.id,
    "STOCK_RELEASED",
    "Checkout was cancelled before payment completed; stock reservation released."
  );

  return NextResponse.json({ ok: true });
}
