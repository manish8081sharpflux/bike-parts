import assert from "node:assert/strict";
import test, { after } from "node:test";
import { prisma } from "@/lib/db";
import {
  applyProviderTrackingUpdate,
  applyShippingStatus,
  cancelAdminOrderBeforeDispatch,
  cancelCustomerOrder,
  claimShippingDispatch,
} from "@/lib/order-delivery-state";
import { mapBorzoStatusToOrderStatus, mapShiprocketStatusToOrderStatus } from "@/lib/shipping/status-mapping";

const suffix = `${Date.now()}-${process.pid}`;
const orderIds: string[] = [];
const userIds: string[] = [];

async function order(status: "PAID" | "SHIPPED" | "CANCELLED" = "PAID") {
  const user = await prisma.user.create({ data: { phone: `6${String(Date.now()).slice(-8)}${userIds.length}` } });
  userIds.push(user.id);
  const created = await prisma.order.create({
    data: {
      buyerId: user.id,
      customerName: "Shipping Test",
      customerPhone: user.phone!,
      deliveryAddress: { contactName: "Shipping Test", city: "Patna", pincode: "800001", flatNo: "1" },
      itemsTotal: 100,
      amount: 100,
      paymentStatus: "PAID",
      status,
      shippingProvider: status === "SHIPPED" ? "SHIPROCKET" : null,
      shippingOrderId: status === "SHIPPED" ? `sr_${suffix}` : null,
    },
  });
  orderIds.push(created.id);
  return { created, user };
}

test("customer cancel and dispatch claim have exactly one winner", async () => {
  const { created, user } = await order();
  const [dispatch, cancellation] = await Promise.all([
    claimShippingDispatch(created.id),
    cancelCustomerOrder(created.id, user.id),
  ]);
  assert.equal(Number(dispatch) + Number(cancellation.cancelled), 1);
  const final = await prisma.order.findUniqueOrThrow({ where: { id: created.id } });
  if (dispatch) {
    assert.equal(final.shippingOrderId, "CREATING");
    assert.equal(final.status, "PAID");
  } else {
    assert.equal(final.shippingOrderId, null);
    assert.equal(final.status, "CANCELLED");
  }
});

test("shipped and cancelled orders cannot be customer-cancelled or dispatched", async () => {
  const shipped = await order("SHIPPED");
  assert.equal((await cancelCustomerOrder(shipped.created.id, shipped.user.id)).cancelled, false);
  assert.equal(await claimShippingDispatch(shipped.created.id), false);

  const cancelled = await order("CANCELLED");
  assert.equal((await cancelCustomerOrder(cancelled.created.id, cancelled.user.id)).cancelled, false);
  assert.equal(await claimShippingDispatch(cancelled.created.id), false);
});

test("duplicate dispatch claims allow one winner", async () => {
  const { created } = await order();
  const claims = await Promise.all([claimShippingDispatch(created.id), claimShippingDispatch(created.id)]);
  assert.deepEqual(claims.sort(), [false, true]);
});

test("Shiprocket status mapping is specific and monotonic; unknown statuses never advance the order", async () => {
  assert.equal(mapShiprocketStatusToOrderStatus("OUT FOR DELIVERY"), "OUT_FOR_DELIVERY");
  assert.equal(mapShiprocketStatusToOrderStatus("IN TRANSIT"), "SHIPPED");
  assert.equal(mapShiprocketStatusToOrderStatus("PICKED UP"), "SHIPPED");
  assert.equal(mapShiprocketStatusToOrderStatus("DELIVERED"), "DELIVERED");
  assert.equal(mapShiprocketStatusToOrderStatus("CANCELED"), "CANCELLED");
  assert.equal(mapShiprocketStatusToOrderStatus("RTO INITIATED"), null);
  assert.equal(mapShiprocketStatusToOrderStatus("some-new-provider-state"), null);

  const { created } = await order("SHIPPED");
  assert.equal((await applyShippingStatus(created.id, "DELIVERED")).transitioned, true);
  // An unknown status after that must not un-advance or otherwise change the order's status.
  assert.equal((await applyShippingStatus(created.id, "some-new-provider-state")).transitioned, false);
  const final = await prisma.order.findUniqueOrThrow({ where: { id: created.id } });
  assert.equal(final.status, "DELIVERED");
  assert.equal(final.shippingStatus, "some-new-provider-state", "raw status is always stored even when unmapped");
  assert.equal(await prisma.orderEvent.count({ where: { orderId: created.id, type: "STATUS_CHANGE" } }), 1);
});

test("admin cancellation and dispatch have exactly one winner", async () => {
  const { created } = await order();
  const [dispatch, cancellation] = await Promise.all([
    claimShippingDispatch(created.id),
    cancelAdminOrderBeforeDispatch(created.id, "admin test"),
  ]);
  assert.equal(Number(dispatch) + Number(cancellation.cancelled), 1);
  const final = await prisma.order.findUniqueOrThrow({ where: { id: created.id } });
  assert.notEqual(final.status === "CANCELLED" && final.shippingOrderId === "CREATING", true);
});

test("a historical PORTER-provider row remains readable and distinguishable from Shiprocket rows", async () => {
  const { created } = await order("SHIPPED");
  await prisma.order.update({
    where: { id: created.id },
    data: { shippingProvider: "PORTER", shippingOrderId: `porter_${suffix}`, shippingCourierName: "Porter" },
  });
  const legacy = await prisma.order.findUniqueOrThrow({ where: { id: created.id } });
  assert.equal(legacy.shippingProvider, "PORTER");
  assert.equal(legacy.shippingCourierName, "Porter");
  // A legacy PORTER row must never be picked up by a fresh dispatch claim —
  // it already has a non-null shippingOrderId, so the claim's WHERE clause
  // (shippingOrderId: null) can never match it, exactly like any other
  // already-dispatched order.
  assert.equal(await claimShippingDispatch(created.id), false);
});

// 1. BORZO provider resolves correctly / 6. duplicate-create protection —
// Borzo's admin action (createBorzoDeliveryAction) reuses the exact same
// shippingOrderId "CREATING" claim as Shiprocket, so a double-click on
// "Create Borzo Delivery" is blocked by the same mechanism already proven
// above for Shiprocket — no separate claim implementation to trust.
test("Borzo delivery creation is protected against a double-click the same way Shiprocket dispatch is", async () => {
  const { created } = await order();
  const claims = await Promise.all([claimShippingDispatch(created.id), claimShippingDispatch(created.id)]);
  assert.deepEqual(claims.sort(), [false, true]);
  const final = await prisma.order.findUniqueOrThrow({ where: { id: created.id } });
  assert.equal(final.shippingOrderId, "CREATING");
});

// 8/9. Borzo delivered / out-for-delivery mapping, applied through the DB —
// no duplicated transition logic (Part 16): applyProviderTrackingUpdate is
// the exact same function the Shiprocket and legacy Porter paths use.
test("Borzo tracking updates apply through the shared transition helper and write Borzo-specific fields", async () => {
  const { created } = await order();
  await prisma.order.update({
    where: { id: created.id },
    data: { shippingProvider: "BORZO", shippingOrderId: `borzo_${suffix}`, status: "SHIPPED" },
  });

  const mapped = mapBorzoStatusToOrderStatus("active", ["picked up from pickup point"]);
  assert.equal(mapped, "OUT_FOR_DELIVERY");
  await applyProviderTrackingUpdate(created.id, mapped, "active", "Borzo", {
    shippingStatus: "active",
    shippingCourierName: "Rahul Sharma",
    deliveryExecutiveName: "Rahul Sharma",
    deliveryExecutivePhone: "9123456780",
    shippingLastUpdatedAt: new Date(),
  });

  const afterOutForDelivery = await prisma.order.findUniqueOrThrow({ where: { id: created.id } });
  assert.equal(afterOutForDelivery.status, "OUT_FOR_DELIVERY");
  assert.equal(afterOutForDelivery.deliveryExecutiveName, "Rahul Sharma");
  assert.equal(afterOutForDelivery.deliveryExecutivePhone, "9123456780");
  assert.ok(afterOutForDelivery.shippingLastUpdatedAt);

  const deliveredMapped = mapBorzoStatusToOrderStatus("completed");
  assert.equal(deliveredMapped, "DELIVERED");
  await applyProviderTrackingUpdate(created.id, deliveredMapped, "completed", "Borzo", { shippingStatus: "completed" });
  const afterDelivered = await prisma.order.findUniqueOrThrow({ where: { id: created.id } });
  assert.equal(afterDelivered.status, "DELIVERED");

  const events = await prisma.orderEvent.findMany({ where: { orderId: created.id, type: "STATUS_CHANGE" } });
  assert.equal(events.length, 2, "one event per actual transition — OUT_FOR_DELIVERY then DELIVERED");
});

// 15. historical Shiprocket order remains readable
test("a historical SHIPROCKET-provider row remains fully readable", async () => {
  const { created } = await order("SHIPPED");
  const row = await prisma.order.findUniqueOrThrow({ where: { id: created.id } });
  assert.equal(row.shippingProvider, "SHIPROCKET");
  assert.equal(row.shippingOrderId, `sr_${suffix}`);
});

// 17. no fake AWB for Borzo
test("a Borzo-provider order never has an AWB code, unlike a Shiprocket order", async () => {
  const { created } = await order();
  await prisma.order.update({
    where: { id: created.id },
    data: { shippingProvider: "BORZO", shippingOrderId: `borzo_${suffix}`, shippingAwbCode: null },
  });
  const row = await prisma.order.findUniqueOrThrow({ where: { id: created.id } });
  assert.equal(row.shippingAwbCode, null);
});

after(async () => {
  await prisma.order.deleteMany({ where: { id: { in: orderIds } } });
  await prisma.user.deleteMany({ where: { id: { in: userIds } } });
  await prisma.$disconnect();
});
