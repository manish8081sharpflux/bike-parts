import { NextResponse } from "next/server";
import { verifyRazorpayWebhookSignature } from "@/lib/razorpay";
import { confirmOrderPayment } from "@/lib/order-payment-state";
import {
  markProviderRefundCreated,
  markRefundFailed,
  markRefundSucceeded,
} from "@/lib/order-refund-state";
import {
  claimWebhookEvent,
  deterministicWebhookEventId,
  markWebhookFailed,
  markWebhookProcessed,
} from "@/lib/webhook-events";
import { prisma } from "@/lib/db";

/**
 * Razorpay webhook — a safety net in case the client-side verify call in
 * /api/checkout/verify never completes (e.g. the browser tab closes right
 * after payment). Configure this URL as a webhook in the Razorpay dashboard
 * for the `payment.captured` event, using RAZORPAY_WEBHOOK_SECRET as the
 * webhook secret.
 */
type RazorpayWebhookPayload = {
  id?: string;
  event: string;
  payload?: {
    payment?: { entity?: { order_id?: string; id?: string } };
    refund?: { entity?: { id?: string; payment_id?: string } };
  };
};

async function processRazorpayWebhook(payload: RazorpayWebhookPayload) {
  const paymentEntity = payload.payload?.payment?.entity;
  const refundEntity = payload.payload?.refund?.entity;

  if (payload.event === "payment.captured") {
    const razorpayOrderId = paymentEntity?.order_id;
    if (razorpayOrderId) {
      const order = await prisma.order.findFirst({ where: { razorpayOrderId } });
      if (order) {
        await confirmOrderPayment({
          orderId: order.id,
          razorpayOrderId,
          razorpayPaymentId: paymentEntity?.id,
          source: "webhook",
        });
      }
    }
  }

  if (["refund.created", "refund.processed", "refund.failed"].includes(payload.event)) {
    const refundId = refundEntity?.id;
    const paymentId = refundEntity?.payment_id;
    const order = refundId
      ? await prisma.order.findFirst({ where: { razorpayRefundId: refundId } })
      : paymentId
      ? await prisma.order.findFirst({ where: { razorpayPaymentId: paymentId, refundStatus: "PROCESSING" } })
      : null;
    if (order && refundId) {
      if (payload.event === "refund.created") await markProviderRefundCreated(order.id, refundId);
      if (payload.event === "refund.processed") await markRefundSucceeded(order.id, refundId);
      if (payload.event === "refund.failed") await markRefundFailed(order.id, "Razorpay reported that the refund failed.");
    }
  }
}

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

  let payload: RazorpayWebhookPayload;
  try {
    payload = JSON.parse(rawBody) as RazorpayWebhookPayload;
  } catch {
    return NextResponse.json({ error: "Invalid webhook payload." }, { status: 400 });
  }

  const paymentEntity = payload.payload?.payment?.entity;
  const refundEntity = payload.payload?.refund?.entity;
  const providerEventId = payload.id ?? deterministicWebhookEventId(
    {
      event: payload.event,
      paymentId: paymentEntity?.id,
      refundId: refundEntity?.id,
      orderId: paymentEntity?.order_id,
      paymentReference: refundEntity?.payment_id,
    },
    rawBody
  );
  const claim = await claimWebhookEvent({ provider: "razorpay", eventId: providerEventId, eventType: payload.event, rawBody });
  if (claim.status === "already_processed" || claim.status === "in_progress") {
    return NextResponse.json({ received: true, duplicate: true });
  }

  try {
    await processRazorpayWebhook(payload);
    await markWebhookProcessed(claim.id, claim.attempts);
    return NextResponse.json({ received: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Webhook processing failed.";
    await markWebhookFailed(claim.id, claim.attempts, message);
    return NextResponse.json({ error: "Webhook processing failed." }, { status: 500 });
  }
}
