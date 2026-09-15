/**
 * Read-only report of shipments stuck in an uncertain state — across
 * forward Shiprocket shipments, forward Borzo local deliveries, legacy
 * whole-order return shipments, and item/quantity-level partial-return
 * shipments — plus any historical Porter shipments still flagged for
 * reconciliation. Never retries shipment/AWB/pickup/delivery/cancellation
 * creation itself (an uncertain attempt may have actually succeeded on the
 * provider's side; blindly retrying risks a duplicate shipment or booking).
 * Safe to run repeatedly/on a schedule: it only reads.
 *
 * Replaces the old scripts/reconcile-porter.ts (pnpm reconcile:porter) now
 * that Shiprocket (long-haul) and Borzo (local Pune delivery) are the
 * active shipping providers — see lib/shipping/.
 *
 * Usage: pnpm reconcile:shipping
 */
import { prisma } from "@/lib/db";

async function main() {
  const olderThanMinutes = Number(process.env.SHIPPING_RECONCILE_OLDER_THAN_MINUTES ?? 15);
  const cutoff = new Date(Date.now() - olderThanMinutes * 60 * 1000);

  const forwardShipments = await prisma.order.findMany({
    where: {
      OR: [
        { shippingReconciliationRequired: true },
        { shippingOrderId: "CREATING", shippingAttemptedAt: { lt: cutoff } },
      ],
    },
    select: {
      id: true,
      status: true,
      shippingProvider: true,
      shippingOrderId: true,
      shippingStatus: true,
      shippingAttemptedAt: true,
      shippingLastError: true,
      shippingReconciliationRequired: true,
    },
    orderBy: { shippingAttemptedAt: "asc" },
  });

  const legacyReturnShipments = await prisma.order.findMany({
    where: {
      OR: [
        { returnShippingReconciliationRequired: true },
        { returnShippingOrderId: "CREATING", returnShippingAttemptedAt: { lt: cutoff } },
      ],
    },
    select: {
      id: true,
      returnStatus: true,
      returnShippingProvider: true,
      returnShippingOrderId: true,
      returnShippingStatus: true,
      returnShippingAttemptedAt: true,
      returnShippingLastError: true,
      returnShippingReconciliationRequired: true,
    },
    orderBy: { returnShippingAttemptedAt: "asc" },
  });

  const partialReturnShipments = await prisma.orderReturn.findMany({
    where: {
      OR: [
        { shippingReconciliationRequired: true },
        { shippingOrderId: "CREATING", shippingAttemptedAt: { lt: cutoff } },
      ],
    },
    select: {
      id: true,
      orderId: true,
      status: true,
      shippingProvider: true,
      shippingOrderId: true,
      shippingStatus: true,
      shippingAttemptedAt: true,
      shippingLastError: true,
      shippingReconciliationRequired: true,
    },
    orderBy: { shippingAttemptedAt: "asc" },
  });

  // Historical Porter-provider rows are never re-dispatched through
  // Shiprocket or Borzo (see the migration note on Order.shippingProvider)
  // — but a PORTER row can still legitimately need reconciliation from
  // before the migration, or if the legacy tracking/cancel path
  // (lib/porter.ts, branched to from lib/actions/admin-orders.ts) hits an
  // uncertain outcome after the cutover. Reported separately, and Borzo
  // (local Pune delivery) reported separately again, so it's always clear
  // which provider a candidate belongs to.
  const legacyPorterForward = forwardShipments.filter((row) => row.shippingProvider === "PORTER");
  const legacyPorterReturn = legacyReturnShipments.filter((row) => row.returnShippingProvider === "PORTER");
  const borzoForward = forwardShipments.filter((row) => row.shippingProvider === "BORZO");
  const shiprocketForward = forwardShipments.filter((row) => row.shippingProvider !== "PORTER" && row.shippingProvider !== "BORZO");
  const shiprocketLegacyReturn = legacyReturnShipments.filter((row) => row.returnShippingProvider !== "PORTER");

  console.log(`\nForward shipments needing reconciliation — Shiprocket (${shiprocketForward.length}):`);
  console.table(shiprocketForward);

  console.log(`\nForward local deliveries needing reconciliation — Borzo (${borzoForward.length}):`);
  console.table(borzoForward);

  console.log(`\nLegacy whole-order return shipments needing reconciliation — Shiprocket (${shiprocketLegacyReturn.length}):`);
  console.table(shiprocketLegacyReturn);

  console.log(`\nItem/quantity-level partial-return shipments needing reconciliation (${partialReturnShipments.length}):`);
  console.table(partialReturnShipments);

  console.log(`\nLegacy Porter-provider candidates still needing reconciliation (${legacyPorterForward.length + legacyPorterReturn.length}):`);
  console.table([...legacyPorterForward, ...legacyPorterReturn]);

  const total = forwardShipments.length + legacyReturnShipments.length + partialReturnShipments.length;
  console.log(`\nFound ${total} shipping reconciliation candidate(s) total. Read-only report; no state was changed.`);
  if (total > 0) process.exitCode = 1;
}

main()
  .catch((error) => {
    console.error("[reconcile-shipping] Failed:", error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
