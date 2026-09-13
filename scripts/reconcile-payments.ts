/**
 * Read-only report of refunds stuck in PROCESSING — never retries or
 * mutates state itself (a refund is real money; auto-retrying it without a
 * human looking first is the wrong default). Safe to run repeatedly/on a
 * schedule: it only reads.
 *
 * Usage: pnpm reconcile:payments
 */
import { prisma } from "@/lib/db";

async function main() {
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
  if (orders.length > 0) process.exitCode = 1;
}

main()
  .catch((error) => {
    console.error("[reconcile-payments] Failed:", error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
