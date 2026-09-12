import assert from "node:assert/strict";
import test, { after } from "node:test";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import {
  OutOfStockError,
  releaseOrderAndRecordEvent,
  releaseOrderStock,
  reserveStock,
} from "@/lib/checkout-stock";

const suffix = `${Date.now()}-${process.pid}`;
const listingIds: string[] = [];
const orderIds: string[] = [];
const userIds: string[] = [];

async function listing(name: string, stock: number) {
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

async function createOrder(tx: Prisma.TransactionClient, userId: string, phone: string, listingId: string, quantity: number) {
  const order = await tx.order.create({
    data: {
      buyerId: userId,
      customerName: "Inventory Test",
      customerPhone: phone,
      deliveryAddress: {},
      itemsTotal: 100,
      amount: 100,
      stockReserved: true,
      items: { create: [{ listingId, productName: "Test", quantity, unitPrice: 100 }] },
    },
  });
  orderIds.push(order.id);
  return order;
}

async function testUser() {
  const phone = `8${String(Date.now()).slice(-8)}${userIds.length % 10}`;
  const user = await prisma.user.create({ data: { phone } });
  userIds.push(user.id);
  return user;
}

test("order failure rolls back the stock reservation", async () => {
  const item = await listing("Rollback", 10);
  await assert.rejects(prisma.$transaction(async (tx) => {
    await reserveStock(tx, [{ id: item.id, quantity: 3 }]);
    throw new Error("forced order.create failure");
  }));
  assert.equal((await prisma.bikePartListing.findUniqueOrThrow({ where: { id: item.id } })).stock, 10);
});

test("multi-item reservation is all-or-nothing", async () => {
  const first = await listing("Multi A", 5);
  const second = await listing("Multi B", 0);
  await assert.rejects(prisma.$transaction(async (tx) => {
    await reserveStock(tx, [{ id: first.id, quantity: 2 }, { id: second.id, quantity: 1 }]);
  }), OutOfStockError);
  assert.equal((await prisma.bikePartListing.findUniqueOrThrow({ where: { id: first.id } })).stock, 5);
  assert.equal((await prisma.bikePartListing.findUniqueOrThrow({ where: { id: second.id } })).stock, 0);
});

test("successful reservation creates an order and keeps stockReserved", async () => {
  const item = await listing("Successful", 5);
  const user = await testUser();
  const order = await prisma.$transaction(async (tx) => {
    await reserveStock(tx, [{ id: item.id, quantity: 2 }]);
    return createOrder(tx, user.id, user.phone!, item.id, 2);
  });
  assert.equal((await prisma.bikePartListing.findUniqueOrThrow({ where: { id: item.id } })).stock, 3);
  assert.equal((await prisma.order.findUniqueOrThrow({ where: { id: order.id } })).stockReserved, true);
});

test("Razorpay failure compensation restores stock and records cancellation", async () => {
  const item = await listing("Compensation", 5);
  const user = await testUser();
  const order = await prisma.$transaction(async (tx) => {
    await reserveStock(tx, [{ id: item.id, quantity: 2 }]);
    return createOrder(tx, user.id, user.phone!, item.id, 2);
  });
  assert.equal(await releaseOrderAndRecordEvent(order.id, "PAYMENT_FAILED", "test compensation"), true);
  const restored = await prisma.bikePartListing.findUniqueOrThrow({ where: { id: item.id } });
  const cancelled = await prisma.order.findUniqueOrThrow({ where: { id: order.id } });
  assert.equal(restored.stock, 5);
  assert.equal(cancelled.stockReserved, false);
  assert.equal(cancelled.status, "CANCELLED");
});

test("concurrent releases restore stock exactly once", async () => {
  const item = await listing("Double Release", 3);
  const user = await testUser();
  const order = await prisma.$transaction(async (tx) => {
    await reserveStock(tx, [{ id: item.id, quantity: 2 }]);
    return createOrder(tx, user.id, user.phone!, item.id, 2);
  });
  await Promise.all([releaseOrderStock(order.id), releaseOrderStock(order.id)]);
  assert.equal((await prisma.bikePartListing.findUniqueOrThrow({ where: { id: item.id } })).stock, 3);
});

test("concurrent last-unit reservations allow one winner", async () => {
  const item = await listing("Last Unit", 1);
  const results = await Promise.all([
    prisma.$transaction((tx) => reserveStock(tx, [{ id: item.id, quantity: 1 }])).then(() => 1).catch(() => 0),
    prisma.$transaction((tx) => reserveStock(tx, [{ id: item.id, quantity: 1 }])).then(() => 1).catch(() => 0),
  ]);
  assert.deepEqual(results.sort(), [0, 1]);
  assert.equal((await prisma.bikePartListing.findUniqueOrThrow({ where: { id: item.id } })).stock, 0);
});

after(async () => {
  await prisma.order.deleteMany({ where: { id: { in: orderIds } } });
  await prisma.bikePartListing.deleteMany({ where: { id: { in: listingIds } } });
  await prisma.user.deleteMany({ where: { id: { in: userIds } } });
  await prisma.$disconnect();
});
