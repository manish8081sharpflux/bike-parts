import { prisma } from "@/lib/db";

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
await prisma.$disconnect();
