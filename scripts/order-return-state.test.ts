import assert from "node:assert/strict";
import test, { after } from "node:test";
import { prisma } from "@/lib/db";
import {
  approveReturn,
  applyReturnPorterStatus,
  claimReturnPickupDispatch,
  completeReturnPickupDispatch,
  failReturnPickupDispatch,
  markReturnReceived,
  rejectReturn,
  requestReturn,
} from "@/lib/order-return-state";

const suffix = `${Date.now()}-${process.pid}`;
const orderIds: string[] = [];
const userIds: string[] = [];
const listingIds: string[] = [];

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

/** A delivered order with one real OrderItem pointing at a real BikePartListing — for stock-restoration tests. */
async function deliveredOrderWithListing(startingStock: number, quantity: number) {
  const listing = await prisma.bikePartListing.create({
    data: {
      name: `Return Stock Test Part ${suffix}-${listingIds.length}`,
      slug: `return-stock-test-part-${suffix}-${listingIds.length}`,
      brand: "Honda",
      category: "Engine",
      price: 100,
      stock: startingStock,
    },
  });
  listingIds.push(listing.id);
  const order = await deliveredOrder();
  await prisma.orderItem.create({
    data: {
      orderId: order.id,
      listingId: listing.id,
      productName: listing.name,
      quantity,
      unitPrice: 100,
    },
  });
  return { order, listing };
}

async function approvedAndDispatchable(order: { id: string }) {
  await requestReturn(order.id, "wrong item");
  await approveReturn(order.id, "ok");
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

test("full happy path: request -> approve -> dispatch -> picked up -> received (resellable) restores stock and auto-requests refund exactly once", async () => {
  const { order, listing } = await deliveredOrderWithListing(5, 2);
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

  const result = await markReturnReceived(order.id, "Verified condition, all good", "RESELLABLE");
  assert.equal(result.received, true);
  assert.equal(result.stockRestored, true);

  const final = await prisma.order.findUniqueOrThrow({ where: { id: order.id } });
  assert.equal(final.returnStatus, "RECEIVED");
  assert.equal(final.returnCondition, "RESELLABLE");
  assert.equal(final.returnStockRestored, true);
  assert.ok(final.returnReceivedAt);
  // markReturnReceived reuses the existing refund flow — this is the whole
  // point of separating "return" (physical) from "refund" (money): once
  // received, the money side is just the already-tested refund pipeline.
  assert.equal(final.refundStatus, "REQUESTED");
  assert.equal(Number(final.refundAmount), 100);

  const restockedListing = await prisma.bikePartListing.findUniqueOrThrow({ where: { id: listing.id } });
  assert.equal(restockedListing.stock, 7, "stock should increase by the returned quantity (5 + 2)");

  // Idempotency: calling again must not re-fire the refund request or
  // restock a second time — the outer returnStatus claim alone already
  // blocks re-entry once RECEIVED.
  const repeat = await markReturnReceived(order.id, "again", "RESELLABLE");
  assert.equal(repeat.received, false);
  assert.equal(repeat.stockRestored, false);
  const afterRepeat = await prisma.bikePartListing.findUniqueOrThrow({ where: { id: listing.id } });
  assert.equal(afterRepeat.stock, 7, "stock must not increase twice from a repeated call");
});

test("mark received with condition DAMAGED does not restore stock", async () => {
  const { order, listing } = await deliveredOrderWithListing(3, 1);
  await requestReturn(order.id, "cracked");
  await approveReturn(order.id, "ok");
  await claimReturnPickupDispatch(order.id);
  await completeReturnPickupDispatch(order.id, { porterOrderId: "porter-return-damaged", status: "created", trackingUrl: null });
  await applyReturnPorterStatus(order.id, "delivered");

  const result = await markReturnReceived(order.id, "Cracked casing, scrap", "DAMAGED");
  assert.equal(result.received, true);
  assert.equal(result.stockRestored, false);

  const final = await prisma.order.findUniqueOrThrow({ where: { id: order.id } });
  assert.equal(final.returnCondition, "DAMAGED");
  assert.equal(final.returnStockRestored, false);

  const unchangedListing = await prisma.bikePartListing.findUniqueOrThrow({ where: { id: listing.id } });
  assert.equal(unchangedListing.stock, 3, "damaged returns must never increase stock");
});

test("mark received is a no-op outside PICKED_UP/PICKUP_SCHEDULED", async () => {
  const order = await deliveredOrder();
  const result = await markReturnReceived(order.id, "too early", "RESELLABLE");
  assert.equal(result.received, false);
  assert.equal(result.stockRestored, false);
  assert.equal((await prisma.order.findUniqueOrThrow({ where: { id: order.id } })).returnStatus, "NONE");
});

test("definite Porter rejection clears the claim and allows a retry", async () => {
  const order = await deliveredOrder();
  await approvedAndDispatchable(order);

  assert.equal(await claimReturnPickupDispatch(order.id), true);
  await failReturnPickupDispatch(order.id, "Porter rejected: invalid pickup address", false);

  const afterFailure = await prisma.order.findUniqueOrThrow({ where: { id: order.id } });
  assert.equal(afterFailure.returnPorterOrderId, null, "definite failure must clear the claim");
  assert.equal(afterFailure.returnPorterReconciliationRequired, false);
  assert.equal(afterFailure.returnPorterLastError, "Porter rejected: invalid pickup address");

  // Retry is allowed after a definite failure.
  assert.equal(await claimReturnPickupDispatch(order.id), true);
});

test("uncertain Porter failure (timeout) blocks retry and requires reconciliation", async () => {
  const order = await deliveredOrder();
  await approvedAndDispatchable(order);

  assert.equal(await claimReturnPickupDispatch(order.id), true);
  await failReturnPickupDispatch(order.id, "Porter request outcome is uncertain.", true);

  const afterFailure = await prisma.order.findUniqueOrThrow({ where: { id: order.id } });
  assert.equal(afterFailure.returnPorterOrderId, "DISPATCHING", "uncertain failure must NOT clear the claim");
  assert.equal(afterFailure.returnPorterStatus, "RECONCILIATION_REQUIRED");
  assert.equal(afterFailure.returnPorterReconciliationRequired, true);
  assert.equal(afterFailure.returnPorterLastError, "Porter request outcome is uncertain.");

  // A reconciliation-required pickup can never be silently re-dispatched —
  // the claim's WHERE clause requires returnPorterOrderId: null, which is
  // exactly what stays untouched here.
  assert.equal(await claimReturnPickupDispatch(order.id), false, "must not be re-dispatchable while reconciliation is required");

  const events = await prisma.orderEvent.findMany({ where: { orderId: order.id, type: "RETURN_PICKUP_RECONCILIATION_REQUIRED" } });
  assert.equal(events.length, 1, "reconciliation-required event must be recorded for operators to investigate");
});

after(async () => {
  await prisma.orderItem.deleteMany({ where: { orderId: { in: orderIds } } });
  await prisma.order.deleteMany({ where: { id: { in: orderIds } } });
  await prisma.user.deleteMany({ where: { id: { in: userIds } } });
  await prisma.bikePartListing.deleteMany({ where: { id: { in: listingIds } } });
  await prisma.$disconnect();
});
