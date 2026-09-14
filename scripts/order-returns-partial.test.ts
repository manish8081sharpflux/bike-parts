import assert from "node:assert/strict";
import test, { after } from "node:test";
import { prisma } from "@/lib/db";
import {
  approvePartialReturn,
  applyPartialReturnShippingStatus,
  claimPartialRefundRequest,
  claimPartialReturnShippingDispatch,
  completePartialReturnShippingDispatch,
  failPartialReturnShippingDispatch,
  getReturnableQuantities,
  markPartialReturnReceived,
  markPartialRefundSucceeded,
  PartialReturnError,
  rejectPartialReturn,
  requestPartialReturn,
} from "@/lib/order-returns/service";
import { requestReturn as requestLegacyReturn } from "@/lib/order-return-state";

const suffix = `${Date.now()}-${process.pid}`;
const orderIds: string[] = [];
const userIds: string[] = [];
const listingIds: string[] = [];
let counter = 0;

async function createUser() {
  const user = await prisma.user.create({ data: { phone: `7${String(Date.now()).slice(-8)}${counter++}` } });
  userIds.push(user.id);
  return user;
}

/**
 * Builds a delivered, paid order with one real BikePartListing + OrderItem
 * per spec entry — mirrors the task's own worked example (Brake Pads×2, Oil
 * Filter×1, Spark Plug×3) so stock-restoration and refund-amount tests
 * exercise real listing rows, not just OrderItem rows with no product.
 */
async function deliveredOrder(buyerId: string, specs: Array<{ name: string; price: number; quantity: number; stock: number }>) {
  const listings = await Promise.all(
    specs.map((spec) =>
      prisma.bikePartListing.create({
        data: {
          name: `${spec.name} ${suffix}-${counter++}`,
          slug: `partial-return-${suffix}-${counter}`,
          brand: "Honda",
          category: "Engine",
          price: spec.price,
          stock: spec.stock,
        },
      })
    )
  );
  listings.forEach((listing) => listingIds.push(listing.id));

  const order = await prisma.order.create({
    data: {
      buyerId,
      customerName: "Partial Return Test",
      customerPhone: `7${String(Date.now()).slice(-8)}`,
      deliveryAddress: {},
      itemsTotal: specs.reduce((sum, spec) => sum + spec.price * spec.quantity, 0),
      amount: specs.reduce((sum, spec) => sum + spec.price * spec.quantity, 0),
      paymentStatus: "PAID",
      status: "DELIVERED",
      stockReserved: true,
      razorpayOrderId: `order_${suffix}_${orderIds.length}`,
      razorpayPaymentId: `payment_${suffix}_${orderIds.length}`,
      items: {
        create: specs.map((spec, index) => ({
          listingId: listings[index].id,
          productName: listings[index].name,
          quantity: spec.quantity,
          unitPrice: spec.price,
        })),
      },
    },
    include: { items: true },
  });
  orderIds.push(order.id);
  return { order, listings };
}

async function expectPartialReturnError(promise: Promise<unknown>, status: number) {
  await assert.rejects(promise, (error: unknown) => {
    assert.ok(error instanceof PartialReturnError);
    assert.equal(error.status, status);
    return true;
  });
}

// 1. one-item full return
test("one-item order can be fully returned", async () => {
  const user = await createUser();
  const { order } = await deliveredOrder(user.id, [{ name: "Brake Pads", price: 500, quantity: 2, stock: 5 }]);
  const created = await requestPartialReturn(user.id, order.id, {
    reason: "Wrong size",
    items: [{ orderItemId: order.items[0].id, quantity: 2 }],
  });
  assert.equal(created.status, "REQUESTED");
  const line = await prisma.orderReturnItem.findFirstOrThrow({ where: { returnId: created.id } });
  assert.equal(line.quantity, 2);
});

// 2. one item from a multi-item order
test("only one item can be returned from a multi-item order", async () => {
  const user = await createUser();
  const { order } = await deliveredOrder(user.id, [
    { name: "Brake Pads", price: 500, quantity: 2, stock: 5 },
    { name: "Oil Filter", price: 200, quantity: 1, stock: 5 },
    { name: "Spark Plug", price: 100, quantity: 3, stock: 5 },
  ]);
  const created = await requestPartialReturn(user.id, order.id, {
    reason: "Only the brake pads were wrong",
    items: [{ orderItemId: order.items[0].id, quantity: 2 }],
  });
  const lines = await prisma.orderReturnItem.findMany({ where: { returnId: created.id } });
  assert.equal(lines.length, 1);
  assert.equal(lines[0].orderItemId, order.items[0].id);

  const remaining = await getReturnableQuantities(order.id);
  assert.equal(remaining.get(order.items[1].id), 1, "untouched items keep their full remaining quantity");
  assert.equal(remaining.get(order.items[2].id), 3);
});

// 3. partial quantity return
test("a partial quantity of one item can be returned", async () => {
  const user = await createUser();
  const { order } = await deliveredOrder(user.id, [{ name: "Brake Pads", price: 500, quantity: 2, stock: 5 }]);
  await requestPartialReturn(user.id, order.id, { reason: "One pad was defective", items: [{ orderItemId: order.items[0].id, quantity: 1 }] });
  const remaining = await getReturnableQuantities(order.id);
  assert.equal(remaining.get(order.items[0].id), 1);
});

// 4. qty 3 purchased / 1 returned
test("3 purchased, 1 returned leaves 2 remaining", async () => {
  const user = await createUser();
  const { order } = await deliveredOrder(user.id, [{ name: "Spark Plug", price: 100, quantity: 3, stock: 5 }]);
  await requestPartialReturn(user.id, order.id, { reason: "One was faulty", items: [{ orderItemId: order.items[0].id, quantity: 1 }] });
  const remaining = await getReturnableQuantities(order.id);
  assert.equal(remaining.get(order.items[0].id), 2);
});

// 5. second return for the remaining quantity
test("a second return request can claim the remaining quantity", async () => {
  const user = await createUser();
  const { order } = await deliveredOrder(user.id, [{ name: "Spark Plug", price: 100, quantity: 3, stock: 5 }]);
  await requestPartialReturn(user.id, order.id, { reason: "One was faulty", items: [{ orderItemId: order.items[0].id, quantity: 1 }] });
  const second = await requestPartialReturn(user.id, order.id, { reason: "The other two were faulty too", items: [{ orderItemId: order.items[0].id, quantity: 2 }] });
  assert.ok(second.id);
  const remaining = await getReturnableQuantities(order.id);
  assert.equal(remaining.get(order.items[0].id), 0);
});

// 6. cannot return more than purchased
test("requesting more than the purchased quantity is rejected", async () => {
  const user = await createUser();
  const { order } = await deliveredOrder(user.id, [{ name: "Brake Pads", price: 500, quantity: 2, stock: 5 }]);
  await expectPartialReturnError(
    requestPartialReturn(user.id, order.id, { reason: "Too many", items: [{ orderItemId: order.items[0].id, quantity: 3 }] }),
    409
  );
});

// 7. concurrent requests cannot over-return
test("two concurrent return requests for the same item cannot both succeed past the purchased quantity", async () => {
  const user = await createUser();
  const { order } = await deliveredOrder(user.id, [{ name: "Brake Pads", price: 500, quantity: 2, stock: 5 }]);
  const attempt = (quantity: number) =>
    requestPartialReturn(user.id, order.id, { reason: "concurrent", items: [{ orderItemId: order.items[0].id, quantity }] })
      .then(() => true)
      .catch(() => false);

  const [first, second] = await Promise.all([attempt(2), attempt(2)]);
  assert.equal(first && second, false, "both requests for the full quantity must not both succeed");
  assert.ok(first || second, "at least one legitimate request must succeed");

  const remaining = await getReturnableQuantities(order.id);
  assert.ok((remaining.get(order.items[0].id) ?? 0) >= 0, "remaining quantity must never go negative");
});

// 8. customer cannot return another user's order
test("a customer cannot request a return on another user's order", async () => {
  const owner = await createUser();
  const attacker = await createUser();
  const { order } = await deliveredOrder(owner.id, [{ name: "Brake Pads", price: 500, quantity: 2, stock: 5 }]);
  await expectPartialReturnError(
    requestPartialReturn(attacker.id, order.id, { reason: "not mine", items: [{ orderItemId: order.items[0].id, quantity: 1 }] }),
    404
  );
});

// 9. an item from another order is rejected
test("an orderItemId from a different order is rejected", async () => {
  const user = await createUser();
  const { order: orderA } = await deliveredOrder(user.id, [{ name: "Brake Pads", price: 500, quantity: 2, stock: 5 }]);
  const { order: orderB } = await deliveredOrder(user.id, [{ name: "Oil Filter", price: 200, quantity: 1, stock: 5 }]);
  await expectPartialReturnError(
    requestPartialReturn(user.id, orderA.id, { reason: "wrong order", items: [{ orderItemId: orderB.items[0].id, quantity: 1 }] }),
    404
  );
});

// 10. a rejected return frees its quantity back up
test("a rejected return does not permanently consume returnable quantity", async () => {
  const user = await createUser();
  const { order } = await deliveredOrder(user.id, [{ name: "Brake Pads", price: 500, quantity: 2, stock: 5 }]);
  const created = await requestPartialReturn(user.id, order.id, { reason: "wrong size", items: [{ orderItemId: order.items[0].id, quantity: 2 }] });
  assert.equal(await rejectPartialReturn(created.id, "Signs of use"), true);

  const remaining = await getReturnableQuantities(order.id);
  assert.equal(remaining.get(order.items[0].id), 2, "rejected quantity must become returnable again");

  const again = await requestPartialReturn(user.id, order.id, { reason: "still wrong size", items: [{ orderItemId: order.items[0].id, quantity: 2 }] });
  assert.ok(again.id);
});

// 11. an approved (non-rejected) return consumes quantity
test("an approved return continues to consume its quantity", async () => {
  const user = await createUser();
  const { order } = await deliveredOrder(user.id, [{ name: "Brake Pads", price: 500, quantity: 2, stock: 5 }]);
  const created = await requestPartialReturn(user.id, order.id, { reason: "wrong size", items: [{ orderItemId: order.items[0].id, quantity: 2 }] });
  assert.equal(await approvePartialReturn(created.id, "ok"), true);

  const remaining = await getReturnableQuantities(order.id);
  assert.equal(remaining.get(order.items[0].id), 0);
  await expectPartialReturnError(
    requestPartialReturn(user.id, order.id, { reason: "again", items: [{ orderItemId: order.items[0].id, quantity: 1 }] }),
    409
  );
});

// 12. Shipment dispatch is scoped per-return, not per-order — two returns on
// the same order can each be claimed/dispatched independently. (The literal
// `return-{returnId}` shipping reference itself is composed in
// dispatchPartialReturnPickupAction, lib/actions/admin-orders.ts, which this
// state-machine test file does not call since it would require a live
// Shiprocket network call — same convention scripts/order-return-state.test.ts
// already follows for the legacy flow.)
test("shipment dispatch is scoped to one return, not the whole order", async () => {
  const user = await createUser();
  const { order } = await deliveredOrder(user.id, [
    { name: "Brake Pads", price: 500, quantity: 2, stock: 5 },
    { name: "Spark Plug", price: 100, quantity: 3, stock: 5 },
  ]);
  const returnA = await requestPartialReturn(user.id, order.id, { reason: "a", items: [{ orderItemId: order.items[0].id, quantity: 1 }] });
  const returnB = await requestPartialReturn(user.id, order.id, { reason: "b", items: [{ orderItemId: order.items[1].id, quantity: 2 }] });
  await approvePartialReturn(returnA.id, "ok");
  await approvePartialReturn(returnB.id, "ok");

  assert.equal(await claimPartialReturnShippingDispatch(returnA.id), true);
  assert.equal(await claimPartialReturnShippingDispatch(returnB.id), true, "a second return on the same order must be independently dispatchable");

  assert.equal(await completePartialReturnShippingDispatch(returnA.id, { provider: "SHIPROCKET", shippingOrderId: "sr-return-a", shippingShipmentId: null, awbCode: null, courierName: "Test Courier", status: "created", trackingUrl: null }), true);
  assert.equal(await completePartialReturnShippingDispatch(returnB.id, { provider: "SHIPROCKET", shippingOrderId: "sr-return-b", shippingShipmentId: null, awbCode: null, courierName: "Test Courier", status: "created", trackingUrl: null }), true);

  const [finalA, finalB] = await Promise.all([
    prisma.orderReturn.findUniqueOrThrow({ where: { id: returnA.id } }),
    prisma.orderReturn.findUniqueOrThrow({ where: { id: returnB.id } }),
  ]);
  assert.equal(finalA.shippingOrderId, "sr-return-a");
  assert.equal(finalB.shippingOrderId, "sr-return-b");
});

// 13. duplicate reverse pickup is blocked
test("a duplicate pickup dispatch claim on the same return is blocked", async () => {
  const user = await createUser();
  const { order } = await deliveredOrder(user.id, [{ name: "Brake Pads", price: 500, quantity: 2, stock: 5 }]);
  const created = await requestPartialReturn(user.id, order.id, { reason: "x", items: [{ orderItemId: order.items[0].id, quantity: 1 }] });
  await approvePartialReturn(created.id, "ok");

  assert.equal(await claimPartialReturnShippingDispatch(created.id), true);
  assert.equal(await claimPartialReturnShippingDispatch(created.id), false, "a second claim on the same return must not win");
});

// 14. uncertain pickup outcome requires reconciliation and blocks retry
test("an uncertain shipment creation failure requires reconciliation and blocks retry", async () => {
  const user = await createUser();
  const { order } = await deliveredOrder(user.id, [{ name: "Brake Pads", price: 500, quantity: 2, stock: 5 }]);
  const created = await requestPartialReturn(user.id, order.id, { reason: "x", items: [{ orderItemId: order.items[0].id, quantity: 1 }] });
  await approvePartialReturn(created.id, "ok");
  await claimPartialReturnShippingDispatch(created.id);
  await failPartialReturnShippingDispatch(created.id, "Shiprocket request outcome is uncertain.", true);

  const afterFailure = await prisma.orderReturn.findUniqueOrThrow({ where: { id: created.id } });
  assert.equal(afterFailure.shippingOrderId, "CREATING", "uncertain failure must not clear the claim");
  assert.equal(afterFailure.shippingReconciliationRequired, true);

  assert.equal(await claimPartialReturnShippingDispatch(created.id), false, "must not be re-dispatchable while reconciliation is required");
});

// 15. resellable partial return restores only the returned quantity
test("a resellable partial return restores only the returned quantity, not the full purchase", async () => {
  const user = await createUser();
  const { order, listings } = await deliveredOrder(user.id, [{ name: "Spark Plug", price: 100, quantity: 3, stock: 5 }]);
  const created = await requestPartialReturn(user.id, order.id, { reason: "one faulty", items: [{ orderItemId: order.items[0].id, quantity: 1 }] });
  await approvePartialReturn(created.id, "ok");
  await claimPartialReturnShippingDispatch(created.id);
  await completePartialReturnShippingDispatch(created.id, { provider: "SHIPROCKET", shippingOrderId: "sr-x", shippingShipmentId: null, awbCode: null, courierName: "Test Courier", status: "created", trackingUrl: null });
  await applyPartialReturnShippingStatus(created.id, "PICKED UP");

  const result = await markPartialReturnReceived(created.id, "ok", "RESELLABLE");
  assert.equal(result.received, true);
  assert.equal(result.stockRestoredCount, 1);

  const listing = await prisma.bikePartListing.findUniqueOrThrow({ where: { id: listings[0].id } });
  assert.equal(listing.stock, 6, "stock must increase by exactly the returned quantity (5 + 1), never the full purchased quantity (3)");
});

// 16. damaged return restores zero stock
test("a damaged partial return restores zero stock", async () => {
  const user = await createUser();
  const { order, listings } = await deliveredOrder(user.id, [{ name: "Spark Plug", price: 100, quantity: 3, stock: 5 }]);
  const created = await requestPartialReturn(user.id, order.id, { reason: "one faulty", items: [{ orderItemId: order.items[0].id, quantity: 1 }] });
  await approvePartialReturn(created.id, "ok");
  await claimPartialReturnShippingDispatch(created.id);
  await completePartialReturnShippingDispatch(created.id, { provider: "SHIPROCKET", shippingOrderId: "sr-y", shippingShipmentId: null, awbCode: null, courierName: "Test Courier", status: "created", trackingUrl: null });
  await applyPartialReturnShippingStatus(created.id, "PICKED UP");

  const result = await markPartialReturnReceived(created.id, "cracked", "DAMAGED");
  assert.equal(result.received, true);
  assert.equal(result.stockRestoredCount, 0);

  const listing = await prisma.bikePartListing.findUniqueOrThrow({ where: { id: listings[0].id } });
  assert.equal(listing.stock, 5, "damaged returns must never increase stock");
});

// 17. repeated "mark received" never double-restocks
test("repeating mark-received on an already-received return does not double-restock", async () => {
  const user = await createUser();
  const { order, listings } = await deliveredOrder(user.id, [{ name: "Spark Plug", price: 100, quantity: 3, stock: 5 }]);
  const created = await requestPartialReturn(user.id, order.id, { reason: "one faulty", items: [{ orderItemId: order.items[0].id, quantity: 1 }] });
  await approvePartialReturn(created.id, "ok");
  await claimPartialReturnShippingDispatch(created.id);
  await completePartialReturnShippingDispatch(created.id, { provider: "SHIPROCKET", shippingOrderId: "sr-z", shippingShipmentId: null, awbCode: null, courierName: "Test Courier", status: "created", trackingUrl: null });
  await applyPartialReturnShippingStatus(created.id, "PICKED UP");

  await markPartialReturnReceived(created.id, "ok", "RESELLABLE");
  const repeat = await markPartialReturnReceived(created.id, "ok again", "RESELLABLE");
  assert.equal(repeat.received, false, "a return already RECEIVED must not transition again");

  const listing = await prisma.bikePartListing.findUniqueOrThrow({ where: { id: listings[0].id } });
  assert.equal(listing.stock, 6, "stock must not increase a second time");
});

// 18. partial refund uses the historical unit price, not the current listing price
test("refund amount uses OrderItem.unitPrice at purchase time, not the current listing price", async () => {
  const user = await createUser();
  const { order, listings } = await deliveredOrder(user.id, [{ name: "Brake Pads", price: 500, quantity: 2, stock: 5 }]);
  // Price changes after purchase — the refund must not be recomputed from this.
  await prisma.bikePartListing.update({ where: { id: listings[0].id }, data: { price: 9999 } });

  const created = await requestPartialReturn(user.id, order.id, { reason: "wrong size", items: [{ orderItemId: order.items[0].id, quantity: 1 }] });
  await approvePartialReturn(created.id, "ok");
  await claimPartialReturnShippingDispatch(created.id);
  await completePartialReturnShippingDispatch(created.id, { provider: "SHIPROCKET", shippingOrderId: "sr-refund", shippingShipmentId: null, awbCode: null, courierName: "Test Courier", status: "created", trackingUrl: null });
  await applyPartialReturnShippingStatus(created.id, "PICKED UP");
  await markPartialReturnReceived(created.id, "ok", "RESELLABLE");

  const afterReceive = await prisma.orderReturn.findUniqueOrThrow({ where: { id: created.id } });
  assert.equal(Number(afterReceive.refundAmount), 500, "refund must use the historical unitPrice (500), never the now-changed listing price (9999)");
});

// 19. multiple partial refunds never exceed the original amount paid
test("multiple partial refunds on one order never sum to more than the amount paid", async () => {
  const user = await createUser();
  const { order } = await deliveredOrder(user.id, [
    { name: "Brake Pads", price: 500, quantity: 2, stock: 5 },
    { name: "Spark Plug", price: 100, quantity: 3, stock: 5 },
  ]);

  const returnA = await requestPartialReturn(user.id, order.id, { reason: "a", items: [{ orderItemId: order.items[0].id, quantity: 2 }] });
  const returnB = await requestPartialReturn(user.id, order.id, { reason: "b", items: [{ orderItemId: order.items[1].id, quantity: 3 }] });
  for (const returnId of [returnA.id, returnB.id]) {
    await approvePartialReturn(returnId, "ok");
    await claimPartialReturnShippingDispatch(returnId);
    await completePartialReturnShippingDispatch(returnId, { provider: "SHIPROCKET", shippingOrderId: `sr-${returnId}`, shippingShipmentId: null, awbCode: null, courierName: "Test Courier", status: "created", trackingUrl: null });
    await applyPartialReturnShippingStatus(returnId, "PICKED UP");
    await markPartialReturnReceived(returnId, "ok", "RESELLABLE");
  }

  const claimA = await claimPartialRefundRequest(returnA.id, "ok");
  assert.equal(claimA.claimed, true);
  await markPartialRefundSucceeded(returnA.id, `rfnd_${suffix}_a`);
  const claimB = await claimPartialRefundRequest(returnB.id, "ok");
  assert.equal(claimB.claimed, true);
  await markPartialRefundSucceeded(returnB.id, `rfnd_${suffix}_b`);

  const totals = await prisma.orderReturn.aggregate({
    where: { orderId: order.id, refundStatus: "REFUNDED" },
    _sum: { refundAmount: true },
  });
  const orderRow = await prisma.order.findUniqueOrThrow({ where: { id: order.id } });
  assert.ok(Number(totals._sum.refundAmount) <= Number(orderRow.amount), "sum of all partial refunds must never exceed the order's paid amount");
  assert.equal(Number(totals._sum.refundAmount), 1000 + 300);

  // Defense-in-depth: even if a return's refundAmount were somehow inflated
  // beyond what the order could ever owe, claimPartialRefundRequest must
  // still refuse to hand it to Razorpay.
  const inflated = await prisma.orderReturn.create({
    data: { orderId: order.id, reason: "inflated", refundStatus: "REQUESTED", refundAmount: 999999 },
  });
  const claimInflated = await claimPartialRefundRequest(inflated.id, "ok");
  assert.equal(claimInflated.claimed, false, "a refund that would exceed the order's paid amount must never be claimed");
});

// 20. legacy whole-order return data and flow keep working, and the two systems don't silently overlap
test("legacy whole-order returns keep working and block a new partial return on the same order", async () => {
  const user = await createUser();
  const { order } = await deliveredOrder(user.id, [{ name: "Brake Pads", price: 500, quantity: 2, stock: 5 }]);

  assert.equal(await requestLegacyReturn(order.id, "whole order is wrong"), "requested");
  const legacyOrder = await prisma.order.findUniqueOrThrow({ where: { id: order.id } });
  assert.equal(legacyOrder.returnStatus, "REQUESTED");

  // The new item-level system must not also accept a return on this order
  // while the legacy whole-order return is still unresolved — running both
  // at once on the same items risks double-restocking/double-refunding.
  await expectPartialReturnError(
    requestPartialReturn(user.id, order.id, { reason: "also this one", items: [{ orderItemId: order.items[0].id, quantity: 1 }] }),
    409
  );
});

// 21. normal orders without any return activity are unaffected
test("an order with no returns reports full remaining quantity and no partial-return rows", async () => {
  const user = await createUser();
  const { order } = await deliveredOrder(user.id, [
    { name: "Brake Pads", price: 500, quantity: 2, stock: 5 },
    { name: "Oil Filter", price: 200, quantity: 1, stock: 5 },
  ]);
  const remaining = await getReturnableQuantities(order.id);
  assert.equal(remaining.get(order.items[0].id), 2);
  assert.equal(remaining.get(order.items[1].id), 1);
  const returns = await prisma.orderReturn.findMany({ where: { orderId: order.id } });
  assert.equal(returns.length, 0);
});

after(async () => {
  await prisma.orderReturnItem.deleteMany({ where: { orderReturn: { orderId: { in: orderIds } } } });
  await prisma.orderReturn.deleteMany({ where: { orderId: { in: orderIds } } });
  await prisma.orderItem.deleteMany({ where: { orderId: { in: orderIds } } });
  await prisma.order.deleteMany({ where: { id: { in: orderIds } } });
  await prisma.user.deleteMany({ where: { id: { in: userIds } } });
  await prisma.bikePartListing.deleteMany({ where: { id: { in: listingIds } } });
  await prisma.$disconnect();
});
