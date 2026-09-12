import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { verifyRazorpayWebhookSignature } from "@/lib/razorpay";

/**
 * Razorpay webhook — a safety net in case the client-side verify call in
 * /api/checkout/verify never completes (e.g. the browser tab closes right
 * after payment). Configure this URL as a webhook in the Razorpay dashboard
 * for the `payment.captured` event, using RAZORPAY_WEBHOOK_SECRET as the
 * webhook secret.
 */
export async function POST(request: Request) {
  const rawBody = await request.text();
  const signature = request.headers.get("x-razorpay-signature");

  if (!signature) {
    return NextResponse.json({ error: "Missing signature header." }, { status: 400 });
  }

  let valid = false;
  try {
    valid = verifyRazorpayWebhookSignature({ rawBody, signature });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Webhook is not configured.";
    return NextResponse.json({ error: message }, { status: 500 });
  }

  if (!valid) {
    return NextResponse.json({ error: "Invalid signature." }, { status: 400 });
  }

  const payload = JSON.parse(rawBody) as {
    event: string;
    payload?: { payment?: { entity?: { order_id?: string; id?: string } } };
  };

  if (payload.event === "payment.captured") {
    const entity = payload.payload?.payment?.entity;
    const razorpayOrderId = entity?.order_id;
    const razorpayPaymentId = entity?.id;

    if (razorpayOrderId) {
      const order = await prisma.order.findFirst({ where: { razorpayOrderId } });

      if (order && order.paymentStatus !== "PAID") {
        await prisma.order.update({
          where: { id: order.id },
          data: {
            paymentStatus: "PAID",
            status: "PAID",
            razorpayPaymentId: razorpayPaymentId ?? order.razorpayPaymentId,
          },
        });

        await prisma.orderEvent.create({
          data: {
            orderId: order.id,
            type: "PAYMENT_CONFIRMED",
            message: `Payment captured via webhook (${razorpayPaymentId ?? "unknown"})`,
          },
        });
      }
    }
  }

  return NextResponse.json({ received: true });
}
