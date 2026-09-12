import assert from "node:assert/strict";
import test, { after } from "node:test";
import { prisma } from "@/lib/db";
import { cancelCustomerOrder, claimPorterDispatch } from "@/lib/order-delivery-state";

const suffix = `${Date.now()}-${process.pid}`;
const orderIds: string[] = [];
const userIds: string[] = [];

async function order(status: "PAID" | "SHIPPED" | "CANCELLED" = "PAID") {
  const user = await prisma.user.create({ data: { phone: `6${String(Date.now()).slice(-8)}${userIds.length}` } });
  userIds.push(user.id);
  const created = await prisma.order.create({
    data: {
      buyerId: user.id,
      customerName: "Porter Test",
      customerPhone: user.phone!,
      deliveryAddress: { contactName: "Porter Test", city: "Patna", pincode: "800001", flatNo: "1" },
      itemsTotal: 100,
      amount: 100,
      paymentStatus: "PAID",
      status,
      porterOrderId: status === "SHIPPED" ? `porter_${suffix}` : null,
    },
  });
  orderIds.push(created.id);
  return { created, user };
}

test("customer cancel and dispatch claim have exactly one winner", async () => {
  const { created, user } = await order();
  const [dispatch, cancellation] = await Promise.all([
    claimPorterDispatch(created.id),
    cancelCustomerOrder(created.id, user.id),
  ]);
  assert.equal(Number(dispatch) + Number(cancellation.cancelled), 1);
  const final = await prisma.order.findUniqueOrThrow({ where: { id: created.id } });
  if (dispatch) {
    assert.equal(final.porterOrderId, "DISPATCHING");
    assert.equal(final.status, "PAID");
  } else {
    assert.equal(final.porterOrderId, null);
    assert.equal(final.status, "CANCELLED");
  }
});

test("shipped and cancelled orders cannot be customer-cancelled or dispatched", async () => {
  const shipped = await order("SHIPPED");
  assert.equal((await cancelCustomerOrder(shipped.created.id, shipped.user.id)).cancelled, false);
  assert.equal(await claimPorterDispatch(shipped.created.id), false);

  const cancelled = await order("CANCELLED");
  assert.equal((await cancelCustomerOrder(cancelled.created.id, cancelled.user.id)).cancelled, false);
  assert.equal(await claimPorterDispatch(cancelled.created.id), false);
});

test("duplicate dispatch claims allow one winner", async () => {
  const { created } = await order();
  const claims = await Promise.all([claimPorterDispatch(created.id), claimPorterDispatch(created.id)]);
  assert.deepEqual(claims.sort(), [false, true]);
});

after(async () => {
  await prisma.order.deleteMany({ where: { id: { in: orderIds } } });
  await prisma.user.deleteMany({ where: { id: { in: userIds } } });
  await prisma.$disconnect();
});
