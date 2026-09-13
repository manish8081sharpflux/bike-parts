import assert from "node:assert/strict";
import test, { after } from "node:test";
import { prisma } from "@/lib/db";
import {
  approveReturn,
  applyReturnPorterStatus,
  claimReturnPickupDispatch,
  completeReturnPickupDispatch,
  markReturnReceived,
  rejectReturn,
  requestReturn,
} from "@/lib/order-return-state";

const suffix = `${Date.now()}-${process.pid}`;
const orderIds: string[] = [];
const userIds: string[] = [];

async function deliveredOrder() {
  const user = await prisma.user.create({ data: { phone: `7${String(Date.now()).slice(-8)}${userIds.length}` } });
  userIds.push(user.id);
  const order = await prisma.order.create({
    data: {
      buyerId: user.id,
      customerName: "Return Test",
      customerPhone: user.phone!,
      deliveryAddress: {},
      itemsTotal: 100,
      amount: 100,
      paymentStatus: "PAID",
      status: "DELIVERED",
      stockReserved: true,
      razorpayOrderId: `order_${suffix}_${orderIds.length}`,
      razorpayPaymentId: `payment_${suffix}_${orderIds.length}`,
    },
  });
  orderIds.push(order.id);
  return order;
}

test("return can only be requested on a delivered order", async () => {
  const user = await prisma.user.create({ data: { phone: `7${String(Date.now()).slice(-8)}notdelivered` } });
  userIds.push(user.id);
  const order = await prisma.order.create({
    data: {
      buyerId: user.id,
      customerName: "Not Delivered",
      customerPhone: user.phone!,
      deliveryAddress: {},
      itemsTotal: 100,
      amount: 100,
      paymentStatus: "PAID",
      status: "PACKED",
    },
  });
  orderIds.push(order.id);

  assert.equal(await requestReturn(order.id, "changed my mind"), "not_returnable");
});

test("duplicate return requests produce one logical request", async () => {
  const order = await deliveredOrder();
  assert.equal(await requestReturn(order.id, "wrong part"), "requested");
  assert.equal(await requestReturn(order.id, "wrong part again"), "already_requested");

  const current = await prisma.order.findUniqueOrThrow({ where: { id: order.id } });
  assert.equal(current.returnStatus, "REQUESTED");
  assert.equal(current.returnReason, "wrong part");
});

test("rejected return can be requested again", async () => {
  const order = await deliveredOrder();
  await requestReturn(order.id, "defective");
  assert.equal(await rejectReturn(order.id, "Item shows signs of use"), true);
  assert.equal((await prisma.order.findUniqueOrThrow({ where: { id: order.id } })).returnStatus, "REJECTED");

  assert.equal(await requestReturn(order.id, "still defective"), "requested");
  assert.equal((await prisma.order.findUniqueOrThrow({ where: { id: order.id } })).returnStatus, "REQUESTED");
});

test("full happy path: request -> approve -> dispatch -> picked up -> received auto-requests refund", async () => {
  const order = await deliveredOrder();
  await requestReturn(order.id, "wrong size");
  assert.equal(await approveReturn(order.id, "Approved for pickup"), true);
  assert.equal((await prisma.order.findUniqueOrThrow({ where: { id: order.id } })).returnStatus, "APPROVED");

  assert.equal(await claimReturnPickupDispatch(order.id), true);
  assert.equal(await claimReturnPickupDispatch(order.id), false, "a second claim on the same order must not win");

  assert.equal(
    await completeReturnPickupDispatch(order.id, { porterOrderId: "porter-return-1", status: "created", trackingUrl: null }),
    true
  );
  const afterDispatch = await prisma.order.findUniqueOrThrow({ where: { id: order.id } });
  assert.equal(afterDispatch.returnStatus, "PICKUP_SCHEDULED");
  assert.equal(afterDispatch.returnPorterOrderId, "porter-return-1");

  const applied = await applyReturnPorterStatus(order.id, "delivered");
  assert.equal(applied.transitioned, true);
  assert.equal((await prisma.order.findUniqueOrThrow({ where: { id: order.id } })).returnStatus, "PICKED_UP");

  assert.equal(await markReturnReceived(order.id, "Verified condition, all good"), true);
  const final = await prisma.order.findUniqueOrThrow({ where: { id: order.id } });
  assert.equal(final.returnStatus, "RECEIVED");
  assert.ok(final.returnReceivedAt);
  // markReturnReceived reuses the existing refund flow — this is the whole
  // point of separating "return" (physical) from "refund" (money): once
  // received, the money side is just the already-tested refund pipeline.
  assert.equal(final.refundStatus, "REQUESTED");
  assert.equal(Number(final.refundAmount), 100);
});

test("mark received is a no-op outside PICKED_UP/PICKUP_SCHEDULED", async () => {
  const order = await deliveredOrder();
  assert.equal(await markReturnReceived(order.id, "too early"), false);
  assert.equal((await prisma.order.findUniqueOrThrow({ where: { id: order.id } })).returnStatus, "NONE");
});

after(async () => {
  await prisma.order.deleteMany({ where: { id: { in: orderIds } } });
  await prisma.user.deleteMany({ where: { id: { in: userIds } } });
  await prisma.$disconnect();
});
