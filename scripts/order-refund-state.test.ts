import assert from "node:assert/strict";
import test, { after } from "node:test";
import { prisma } from "@/lib/db";
import { confirmOrderPayment } from "@/lib/order-payment-state";
import {
  claimRefundRequest,
  markRefundFailed,
  markRefundNeedsReconciliation,
  markRefundSucceeded,
  requestRefund,
} from "@/lib/order-refund-state";
import { claimWebhookEvent } from "@/lib/webhook-events";

const suffix = `${Date.now()}-${process.pid}`;
const orderIds: string[] = [];
const userIds: string[] = [];
const webhookIds: string[] = [];

async function paidOrder() {
  const user = await prisma.user.create({ data: { phone: `7${String(Date.now()).slice(-8)}${userIds.length}` } });
  userIds.push(user.id);
  const order = await prisma.order.create({
    data: {
      buyerId: user.id,
      customerName: "Refund Test",
      customerPhone: user.phone!,
      deliveryAddress: {},
      itemsTotal: 100,
      amount: 100,
      paymentStatus: "PAID",
      status: "CANCELLED",
      stockReserved: true,
      razorpayOrderId: `order_${suffix}_${orderIds.length}`,
      razorpayPaymentId: `payment_${suffix}_${orderIds.length}`,
    },
  });
  orderIds.push(order.id);
  return order;
}

test("duplicate customer refund requests produce one logical request", async () => {
  const order = await paidOrder();
  const results = await Promise.all([
    requestRefund(order.id, "Customer request"),
    requestRefund(order.id, "Customer request"),
  ]);
  assert.deepEqual(results.sort(), ["already_requested", "requested"]);
  assert.equal(await prisma.orderEvent.count({ where: { orderId: order.id, type: "REFUND_REQUESTED" } }), 1);
});

test("duplicate approval claims allow only one provider call", async () => {
  const order = await paidOrder();
  assert.equal(await requestRefund(order.id, "Admin test"), "requested");
  const claims = await Promise.all([claimRefundRequest(order.id, "first"), claimRefundRequest(order.id, "second")]);
  assert.deepEqual(claims.map((claim) => claim.claimed).sort(), [false, true]);
});

test("clear refund failure returns to REQUESTED and uncertain failure is reconcilable", async () => {
  const order = await paidOrder();
  await requestRefund(order.id, "Failure test");
  const claim = await claimRefundRequest(order.id, "failure");
  assert.equal(claim.claimed, true);
  assert.equal(await markRefundFailed(order.id, "Provider rejected request"), true);
  assert.equal((await prisma.order.findUniqueOrThrow({ where: { id: order.id } })).refundStatus, "REQUESTED");

  const secondClaim = await claimRefundRequest(order.id, "uncertain");
  assert.equal(secondClaim.claimed, true);
  assert.equal(await markRefundNeedsReconciliation(order.id, "Provider request timed out"), true);
  const reconciled = await prisma.order.findUniqueOrThrow({ where: { id: order.id } });
  assert.equal(reconciled.refundStatus, "PROCESSING");
  assert.equal(reconciled.refundReconciliationRequired, true);
});

test("successful refund is terminal and old payment confirmation cannot restore PAID", async () => {
  const order = await paidOrder();
  await requestRefund(order.id, "Success test");
  await claimRefundRequest(order.id, "success");
  assert.equal(await markRefundSucceeded(order.id, `refund_${suffix}`), true);
  assert.equal(await markRefundSucceeded(order.id, `refund_${suffix}`), false);

  const finalOrder = await prisma.order.findUniqueOrThrow({ where: { id: order.id } });
  assert.equal(finalOrder.paymentStatus, "REFUNDED");
  assert.equal(finalOrder.refundStatus, "REFUNDED");
  assert.equal(await confirmOrderPayment({ orderId: order.id, razorpayOrderId: order.razorpayOrderId!, razorpayPaymentId: "old-payment" }), "not_payable");
  assert.equal((await prisma.order.findUniqueOrThrow({ where: { id: order.id } })).paymentStatus, "REFUNDED");
});

test("duplicate webhook event claims are idempotent", async () => {
  const eventId = `webhook_${suffix}`;
  const first = await claimWebhookEvent({ provider: "razorpay", eventId, eventType: "refund.processed", rawBody: "{}" });
  const second = await claimWebhookEvent({ provider: "razorpay", eventId, eventType: "refund.processed", rawBody: "{}" });
  assert.equal(first, true);
  assert.equal(second, false);
  webhookIds.push(eventId);
});

after(async () => {
  await prisma.order.deleteMany({ where: { id: { in: orderIds } } });
  await prisma.user.deleteMany({ where: { id: { in: userIds } } });
  await prisma.webhookEvent.deleteMany({ where: { eventId: { in: webhookIds } } });
  await prisma.$disconnect();
});
