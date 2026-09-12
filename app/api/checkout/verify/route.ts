import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { verifyRazorpayPaymentSignature } from "@/lib/razorpay";
import { releaseOrderStock } from "@/lib/checkout-stock";

type VerifyBody = {
  orderId: string;
  razorpay_order_id: string;
  razorpay_payment_id: string;
  razorpay_signature: string;
};

export async function POST(request: Request) {
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
  if (!order || order.razorpayOrderId !== razorpay_order_id) {
    return NextResponse.json({ error: "Order not found." }, { status: 404 });
  }

  if (order.paymentStatus === "PAID") {
    return NextResponse.json({ success: true, orderId: order.id });
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
    // Also move `status` to CANCELLED, not just `paymentStatus` to FAILED —
    // leaving `status` at its prior value (still PENDING for a first
    // attempt) made this order look like it was still "being prepared" to
    // the customer (see mapDbOrderStatus in app/home-client.tsx, which
    // treats anything short of OUT_FOR_DELIVERY/DELIVERED/CANCELLED as
    // "processing") and kept it counted as active/pending on the admin
    // dashboard, even though payment definitively never went through.
    await prisma.order.update({
      where: { id: order.id },
      data: { paymentStatus: "FAILED", status: "CANCELLED" },
    });
    // Signature didn't check out, so this payment can't be trusted as
    // successful — release the reserved stock rather than leaving it stuck
    // against a payment that isn't going to complete.
    await releaseOrderStock(order.id).catch(() => {});
    await prisma.orderEvent
      .create({
        data: {
          orderId: order.id,
          type: "PAYMENT_FAILED",
          message: "Payment signature verification failed — order cancelled and stock released.",
        },
      })
      .catch(() => {});
    return NextResponse.json({ error: "Payment signature verification failed." }, { status: 400 });
  }

  await prisma.order.update({
    where: { id: order.id },
    data: {
      paymentStatus: "PAID",
      status: "PAID",
      razorpayPaymentId: razorpay_payment_id,
      razorpaySignature: razorpay_signature,
    },
  });

  await prisma.orderEvent.create({
    data: {
      orderId: order.id,
      type: "PAYMENT_CONFIRMED",
      message: `Payment captured (${razorpay_payment_id})`,
    },
  });

  return NextResponse.json({ success: true, orderId: order.id });
}
