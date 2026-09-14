/**
 * Read-only report of Porter dispatches AND reverse pickups stuck in an
 * uncertain state — never retries dispatch/pickup creation itself (an
 * uncertain attempt may have actually succeeded on Porter's side; blindly
 * retrying risks a duplicate delivery or pickup). Safe to run repeatedly/on
 * a schedule: it only reads.
 *
 * Usage: pnpm reconcile:porter
 */
import { prisma } from "@/lib/db";

async function main() {
  const olderThanMinutes = Number(process.env.PORTER_RECONCILE_OLDER_THAN_MINUTES ?? 15);
  const cutoff = new Date(Date.now() - olderThanMinutes * 60 * 1000);

  const forwardDeliveries = await prisma.order.findMany({
    where: {
      OR: [
        { porterReconciliationRequired: true },
        { porterOrderId: "DISPATCHING", porterAttemptedAt: { lt: cutoff } },
      ],
    },
    select: {
      id: true,
      status: true,
      porterOrderId: true,
      porterStatus: true,
      porterAttemptedAt: true,
      porterLastError: true,
      porterReconciliationRequired: true,
    },
    orderBy: { porterAttemptedAt: "asc" },
  });

  const reversePickups = await prisma.order.findMany({
    where: {
      OR: [
        { returnPorterReconciliationRequired: true },
        { returnPorterOrderId: "DISPATCHING", returnPorterAttemptedAt: { lt: cutoff } },
      ],
    },
    select: {
      id: true,
      returnStatus: true,
      returnPorterOrderId: true,
      returnPorterStatus: true,
      returnPorterAttemptedAt: true,
      returnPorterLastError: true,
      returnPorterReconciliationRequired: true,
    },
    orderBy: { returnPorterAttemptedAt: "asc" },
  });

  // Item/quantity-level return pickups (see lib/order-returns/service.ts) —
  // each OrderReturn has its own independent Porter state, separate from the
  // legacy whole-order returnPorter* fields above, so this needs its own
  // query rather than being folded into reversePickups.
  const partialReturnPickups = await prisma.orderReturn.findMany({
    where: {
      OR: [
        { porterReconciliationRequired: true },
        { porterOrderId: "DISPATCHING", porterAttemptedAt: { lt: cutoff } },
      ],
    },
    select: {
      id: true,
      orderId: true,
      status: true,
      porterOrderId: true,
      porterStatus: true,
      porterAttemptedAt: true,
      porterLastError: true,
      porterReconciliationRequired: true,
    },
    orderBy: { porterAttemptedAt: "asc" },
  });

  console.log(`\nForward deliveries needing reconciliation (${forwardDeliveries.length}):`);
  console.table(forwardDeliveries);

  console.log(`\nReverse (return) pickups needing reconciliation (${reversePickups.length}):`);
  console.table(reversePickups);

  console.log(`\nItem/quantity-level return pickups needing reconciliation (${partialReturnPickups.length}):`);
  console.table(partialReturnPickups);

  const total = forwardDeliveries.length + reversePickups.length + partialReturnPickups.length;
  console.log(`\nFound ${total} Porter reconciliation candidate(s) total. Read-only report; no state was changed.`);
  if (total > 0) process.exitCode = 1;
}

main()
  .catch((error) => {
    console.error("[reconcile-porter] Failed:", error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
