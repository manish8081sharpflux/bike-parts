import { prisma } from "@/lib/db";

const olderThanMinutes = Number(process.env.RECONCILE_OLDER_THAN_MINUTES ?? 15);
const cutoff = new Date(Date.now() - olderThanMinutes * 60 * 1000);

const orders = await prisma.order.findMany({
  where: {
    refundStatus: "PROCESSING",
    OR: [{ refundReconciliationRequired: true }, { refundAttemptedAt: { lt: cutoff } }],
  },
  select: {
    id: true,
    razorpayPaymentId: true,
    razorpayRefundId: true,
    refundStatus: true,
    refundAttemptedAt: true,
    refundFailureReason: true,
    refundReconciliationRequired: true,
  },
  orderBy: { refundAttemptedAt: "asc" },
});

console.table(orders);
console.log(`Found ${orders.length} refund reconciliation candidate(s). Read-only report; no state was changed.`);
await prisma.$disconnect();
