import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { verifyRazorpayPaymentSignature } from "@/lib/razorpay";
import { getCustomerSession } from "@/lib/auth/customer-session";
import { confirmOrderPayment } from "@/lib/order-payment-state";
import { enforceApiRateLimit, rejectInvalidJsonRequest } from "@/lib/security/api-protection";

type VerifyBody = {
  orderId: string;
  razorpay_order_id: string;
  razorpay_payment_id: string;
  razorpay_signature: string;
};

export async function POST(request: Request) {
  const session = await getCustomerSession();
  if (!session) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  const limited = await enforceApiRateLimit(request, "payment-verify", { limit: 20, windowMs: 15 * 60_000 }, session.user.id);
  if (limited) return limited;
  const invalidJson = rejectInvalidJsonRequest(request);
  if (invalidJson) return invalidJson;

  let body: VerifyBody;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const { orderId, razorpay_order_id, razorpay_payment_id, razorpay_signature } = body;
  if (!orderId || !razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
    return NextResponse.json({ error: "Missing payment details." }, { status: 400 });
  }

  const order = await prisma.order.findUnique({ where: { id: orderId } });
  if (!order || order.buyerId !== session.user.id || order.razorpayOrderId !== razorpay_order_id) {
    return NextResponse.json({ error: "Order not found." }, { status: 404 });
  }

  let valid = false;
  try {
    valid = verifyRazorpayPaymentSignature({
      orderId: razorpay_order_id,
      paymentId: razorpay_payment_id,
      signature: razorpay_signature,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not verify payment.";
    return NextResponse.json({ error: message }, { status: 500 });
  }

  if (!valid) {
    console.error("[checkout/verify] Signature verification failed for order", order.id);
    await prisma.orderEvent.create({
      data: {
        orderId: order.id,
        type: "PAYMENT_VERIFICATION_FAILED",
        message: "Client payment signature verification failed; order remains active for webhook or cancellation reconciliation.",
      },
    }).catch((error) => {
      console.error("[checkout/verify] Also failed to record the verification-failure event for order", order.id, error);
    });
    return NextResponse.json({ error: "Payment signature verification failed." }, { status: 400 });
  }

  const payment = await confirmOrderPayment({
    orderId: order.id,
    buyerId: session.user.id,
    razorpayOrderId: razorpay_order_id,
    razorpayPaymentId: razorpay_payment_id,
    razorpaySignature: razorpay_signature,
    source: "verify",
  });
  if (payment === "not_payable") {
    return NextResponse.json({ error: "This checkout is no longer active." }, { status: 409 });
  }
  return NextResponse.json({ success: true, orderId: order.id, alreadyPaid: payment === "already_paid" });
}
