import assert from "node:assert/strict";
import test, { after } from "node:test";
import { prisma } from "@/lib/db";
import { confirmOrderPayment } from "@/lib/order-payment-state";
import {
  releaseOrderAndRecordEvent,
  reserveStock,
} from "@/lib/checkout-stock";

const suffix = `${Date.now()}-${process.pid}`;
const listingIds: string[] = [];
const orderIds: string[] = [];
const userIds: string[] = [];

async function setupOrder(stock = 1) {
  const listing = await prisma.bikePartListing.create({
    data: {
      name: `Payment race ${suffix}-${listingIds.length}`,
      slug: `payment-race-${suffix}-${listingIds.length}`,
      brand: "Test",
      category: "Test",
      price: 100,
      stock,
    },
  });
  listingIds.push(listing.id);
  const phone = `9${String(Date.now()).slice(-8)}${userIds.length % 10}`;
  const user = await prisma.user.create({ data: { phone } });
  userIds.push(user.id);
  const order = await prisma.$transaction(async (tx) => {
    await reserveStock(tx, [{ id: listing.id, quantity: 1 }]);
    return tx.order.create({
      data: {
        buyerId: user.id,
        customerName: "Payment Race",
        customerPhone: user.phone!,
        deliveryAddress: {},
        itemsTotal: 100,
        amount: 100,
        stockReserved: true,
        razorpayOrderId: `pay_${suffix}_${orderIds.length}`,
        items: {
          create: [{ listingId: listing.id, productName: listing.name, quantity: 1, unitPrice: 100 }],
        },
      },
    });
  });
  orderIds.push(order.id);
  return { listing, user, order };
}

test("payment and release race has no paid/restored-stock state", async () => {
  const { listing, user, order } = await setupOrder();
  const [paymentStatus] = await Promise.all([
    confirmOrderPayment({
      orderId: order.id,
      buyerId: user.id,
      razorpayOrderId: order.razorpayOrderId!,
      razorpayPaymentId: `payment_${suffix}`,
      razorpaySignature: "test-signature",
      source: "verify",
    }),
    releaseOrderAndRecordEvent(order.id, "STOCK_RELEASED", "Test release"),
  ]);

  const finalOrder = await prisma.order.findUniqueOrThrow({ where: { id: order.id } });
  const finalListing = await prisma.bikePartListing.findUniqueOrThrow({ where: { id: listing.id } });
  assert.ok(["confirmed", "not_payable"].includes(paymentStatus));
  if (finalOrder.paymentStatus === "PAID") {
    assert.equal(finalOrder.status, "PAID");
    assert.equal(finalOrder.stockReserved, true);
    assert.equal(finalListing.stock, 0);
  } else {
    assert.equal(finalOrder.status, "CANCELLED");
    assert.equal(finalOrder.stockReserved, false);
    assert.equal(finalListing.stock, 1);
  }
  assert.equal(finalOrder.paymentStatus === "PAID" && finalListing.stock === 1, false);
});

test("payment confirmation is idempotent and paid orders cannot release stock", async () => {
  const { listing, user, order } = await setupOrder();
  const input = {
    orderId: order.id,
    buyerId: user.id,
    razorpayOrderId: order.razorpayOrderId!,
    razorpayPaymentId: `payment_duplicate_${suffix}`,
    razorpaySignature: "test-signature",
    source: "verify" as const,
  };
  assert.equal(await confirmOrderPayment(input), "confirmed");
  assert.equal(await confirmOrderPayment(input), "already_paid");
  assert.equal(await releaseOrderAndRecordEvent(order.id, "STOCK_RELEASED", "Should not release"), false);

  const finalOrder = await prisma.order.findUniqueOrThrow({ where: { id: order.id } });
  const finalListing = await prisma.bikePartListing.findUniqueOrThrow({ where: { id: listing.id } });
  assert.equal(finalOrder.paymentStatus, "PAID");
  assert.equal(finalOrder.stockReserved, true);
  assert.equal(finalListing.stock, 0);
  assert.equal(await prisma.orderEvent.count({ where: { orderId: order.id, type: "PAYMENT_CONFIRMED" } }), 1);
});

after(async () => {
  await prisma.order.deleteMany({ where: { id: { in: orderIds } } });
  await prisma.bikePartListing.deleteMany({ where: { id: { in: listingIds } } });
  await prisma.user.deleteMany({ where: { id: { in: userIds } } });
  await prisma.$disconnect();
});
