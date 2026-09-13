/**
 * Read-only report of Porter dispatches stuck in an uncertain state — never
 * retries dispatch creation itself (an uncertain dispatch may have actually
 * succeeded on Porter's side; blindly retrying risks a duplicate pickup).
 * Safe to run repeatedly/on a schedule: it only reads.
 *
 * Usage: pnpm reconcile:porter
 */
import { prisma } from "@/lib/db";

async function main() {
  const olderThanMinutes = Number(process.env.PORTER_RECONCILE_OLDER_THAN_MINUTES ?? 15);
  const cutoff = new Date(Date.now() - olderThanMinutes * 60 * 1000);

  const orders = await prisma.order.findMany({
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

  console.table(orders);
  console.log(`Found ${orders.length} Porter reconciliation candidate(s). Read-only report; no state was changed.`);
  if (orders.length > 0) process.exitCode = 1;
}

main()
  .catch((error) => {
    console.error("[reconcile-porter] Failed:", error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
