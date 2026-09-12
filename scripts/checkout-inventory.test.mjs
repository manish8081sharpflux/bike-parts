import assert from "node:assert/strict";
import test, { after } from "node:test";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const suffix = `${Date.now()}-${process.pid}`;
const listingIds = [];
const orderIds = [];
const userIds = [];

async function listing(name, stock) {
  const item = await prisma.bikePartListing.create({
    data: {
      name,
      slug: `${name.toLowerCase().replaceAll(" ", "-")}-${suffix}-${listingIds.length}`,
      brand: "Test",
      category: "Test",
      price: 100,
      stock,
    },
  });
  listingIds.push(item.id);
  return item;
}

async function reserve(tx, id, quantity) {
  return tx.$executeRaw`
    UPDATE "BikePartListing"
    SET stock = stock - ${quantity}, "updatedAt" = now()
    WHERE id = ${id} AND stock >= ${quantity}
  `;
}

async function createOrder(tx, userId, phone, lines) {
  const order = await tx.order.create({
    data: {
      buyerId: userId,
      customerName: "Inventory Test",
      customerPhone: phone,
      deliveryAddress: {},
      itemsTotal: 100,
      amount: 100,
      stockReserved: true,
      items: { create: lines.map(({ id, quantity }) => ({ listingId: id, productName: "Test", quantity, unitPrice: 100 })) },
    },
  });
  orderIds.push(order.id);
  return order;
}

test("order failure rolls back the stock reservation", async () => {
  const item = await listing("Rollback", 10);
  const before = await prisma.order.count();
  await assert.rejects(prisma.$transaction(async (tx) => {
    assert.equal(await reserve(tx, item.id, 3), 1);
    throw new Error("forced order.create failure");
  }));
  assert.equal((await prisma.bikePartListing.findUniqueOrThrow({ where: { id: item.id } })).stock, 10);
  assert.equal(await prisma.order.count(), before);
});

test("multi-item reservation is all-or-nothing", async () => {
  const first = await listing("Multi A", 5);
  const second = await listing("Multi B", 0);
  await assert.rejects(prisma.$transaction(async (tx) => {
    assert.equal(await reserve(tx, first.id, 2), 1);
    if ((await reserve(tx, second.id, 1)) === 0) throw new Error("out of stock");
  }));
  assert.equal((await prisma.bikePartListing.findUniqueOrThrow({ where: { id: first.id } })).stock, 5);
  assert.equal((await prisma.bikePartListing.findUniqueOrThrow({ where: { id: second.id } })).stock, 0);
});

test("successful reservation creates an order and keeps stockReserved", async () => {
  const item = await listing("Successful", 5);
  const user = await prisma.user.create({ data: { phone: `900${suffix.slice(-7)}` } });
  userIds.push(user.id);
  const order = await prisma.$transaction(async (tx) => {
    assert.equal(await reserve(tx, item.id, 2), 1);
    return createOrder(tx, user.id, user.phone, [{ id: item.id, quantity: 2 }]);
  });
  assert.equal((await prisma.bikePartListing.findUniqueOrThrow({ where: { id: item.id } })).stock, 3);
  assert.equal((await prisma.order.findUniqueOrThrow({ where: { id: order.id } })).stockReserved, true);
});

test("Razorpay failure compensation restores stock and records cancellation", async () => {
  const item = await listing("Compensation", 5);
  const user = await prisma.user.create({ data: { phone: `901${suffix.slice(-7)}` } });
  userIds.push(user.id);
  const order = await prisma.$transaction(async (tx) => {
    assert.equal(await reserve(tx, item.id, 2), 1);
    return createOrder(tx, user.id, user.phone, [{ id: item.id, quantity: 2 }]);
  });
  await prisma.$transaction(async (tx) => {
    const claimed = await tx.order.updateMany({ where: { id: order.id, stockReserved: true }, data: { stockReserved: false, status: "CANCELLED" } });
    if (claimed.count === 1) {
      await tx.$executeRaw`UPDATE "BikePartListing" SET stock = stock + 2, "updatedAt" = now() WHERE id = ${item.id}`;
      await tx.orderEvent.create({ data: { orderId: order.id, type: "PAYMENT_FAILED", message: "test compensation" } });
    }
  });
  const restored = await prisma.bikePartListing.findUniqueOrThrow({ where: { id: item.id } });
  const cancelled = await prisma.order.findUniqueOrThrow({ where: { id: order.id } });
  assert.equal(restored.stock, 5);
  assert.equal(cancelled.stockReserved, false);
  assert.equal(cancelled.status, "CANCELLED");
});

test("concurrent releases restore stock exactly once", async () => {
  const item = await listing("Double Release", 3);
  const user = await prisma.user.create({ data: { phone: `902${suffix.slice(-7)}` } });
  userIds.push(user.id);
  const order = await prisma.$transaction(async (tx) => {
    assert.equal(await reserve(tx, item.id, 2), 1);
    return createOrder(tx, user.id, user.phone, [{ id: item.id, quantity: 2 }]);
  });
  await Promise.all([1, 2].map(() => prisma.$transaction(async (tx) => {
    const claimed = await tx.order.updateMany({ where: { id: order.id, stockReserved: true }, data: { stockReserved: false } });
    if (claimed.count === 1) await tx.$executeRaw`UPDATE "BikePartListing" SET stock = stock + 2, "updatedAt" = now() WHERE id = ${item.id}`;
  })));
  assert.equal((await prisma.bikePartListing.findUniqueOrThrow({ where: { id: item.id } })).stock, 3);
});

test("concurrent last-unit reservations allow one winner", async () => {
  const item = await listing("Last Unit", 1);
  const results = await Promise.all([1, 2].map(() => prisma.$transaction((tx) => reserve(tx, item.id, 1))));
  assert.deepEqual(results.sort(), [0, 1]);
  assert.equal((await prisma.bikePartListing.findUniqueOrThrow({ where: { id: item.id } })).stock, 0);
});

after(async () => {
  await prisma.order.deleteMany({ where: { id: { in: orderIds } } });
  await prisma.bikePartListing.deleteMany({ where: { id: { in: listingIds } } });
  await prisma.user.deleteMany({ where: { id: { in: userIds } } });
  await prisma.$disconnect();
});
