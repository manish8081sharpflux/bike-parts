import { Prisma, PrismaClient } from "@prisma/client";
import { prisma } from "@/lib/db";
import { legacyStorefrontCatalog } from "@/lib/storefront-catalog";

// Only used as a name fallback in the shortage message below, for any
// still-in-flight order that reserved against the pre-DB-catalog static ids.
const LEGACY_CATALOG_BY_ID = new Map(legacyStorefrontCatalog.map((product) => [product.id, product]));

/** How long an order can hold a stock reservation without completing payment before it's released back. */
const RESERVATION_TTL_MS = 15 * 60 * 1000;
type DbClient = PrismaClient | Prisma.TransactionClient;

export type StockShortage = {
  id: string;
  name: string;
  requested: number;
  available: number;
};

export class OutOfStockError extends Error {
  items: StockShortage[];

  constructor(items: StockShortage[]) {
    super("One or more items are out of stock.");
    this.name = "OutOfStockError";
    this.items = items;
  }
}

/**
 * Atomically checks and decrements stock for every line item in the caller's
 * transaction — all-or-nothing. Each decrement is itself a single
 * conditional SQL UPDATE (`WHERE stock >= quantity`), so two concurrent
 * requests racing for the same last unit can never both succeed: only one
 * of them will see its UPDATE affect a row, the other gets 0 rows affected
 * and the whole transaction rolls back (including any other items in that
 * request that *did* get decremented first) before anything is committed.
 *
 * `items[].id` is a `BikePartListing` id (the storefront now reads that
 * table — see lib/storefront-catalog.ts's getStorefrontProducts).
 */
export async function reserveStock(
  db: DbClient,
  items: Array<{ id: string; quantity: number }>
) {
  const shortages: StockShortage[] = [];

  for (const item of items) {
    const affected = await db.$executeRaw`
      UPDATE "BikePartListing"
      SET stock = stock - ${item.quantity}, "updatedAt" = now()
      WHERE id = ${item.id} AND stock >= ${item.quantity}
    `;

    if (affected === 0) {
      const current = await db.bikePartListing.findUnique({ where: { id: item.id } });
      shortages.push({
        id: item.id,
        name: current?.name ?? LEGACY_CATALOG_BY_ID.get(item.id)?.name ?? item.id,
        requested: item.quantity,
        available: current?.stock ?? 0,
      });
    }
  }

  if (shortages.length > 0) throw new OutOfStockError(shortages);
}

/**
 * Releases (restores) stock for an order that reserved it but never
 * completed payment. Idempotent — only acts if the order still has
 * `stockReserved: true`, so calling it twice (e.g. once from the client's
 * cancel call, once from the expiry sweep) never double-restores stock.
 *
 * Each line restores against whichever catalog it was reserved from:
 * `listingId` (`BikePartListing`, every order since the storefront started
 * reading that table) or, for any order that reserved stock before that and
 * is still mid-checkout, the legacy `catalogProductId` (`ProductStock`).
 */
async function releaseOrderStockInTransaction(tx: Prisma.TransactionClient, orderId: string) {
  const claimed = await tx.order.updateMany({
    where: { id: orderId, stockReserved: true, paymentStatus: "PENDING" },
    data: { stockReserved: false },
  });
  if (claimed.count !== 1) return false;

  const items = await tx.orderItem.findMany({ where: { orderId } });
  for (const item of items) {
    if (item.listingId) {
      await tx.$executeRaw`
        UPDATE "BikePartListing"
        SET stock = stock + ${item.quantity}, "updatedAt" = now()
        WHERE id = ${item.listingId}
      `;
    } else if (item.catalogProductId) {
      await tx.$executeRaw`
        UPDATE "ProductStock"
        SET stock = stock + ${item.quantity}, "updatedAt" = now()
        WHERE id = ${item.catalogProductId}
      `;
    }
  }
  return true;
}

export async function releaseOrderStock(orderId: string, db: DbClient = prisma) {
  if (db === prisma) {
    return prisma.$transaction((tx) => releaseOrderStockInTransaction(tx, orderId));
  }
  return releaseOrderStockInTransaction(db, orderId);
}

export async function releaseOrderAndRecordEvent(
  orderId: string,
  eventType: string,
  message: string
) {
  return prisma.$transaction(async (tx) => {
    const released = await releaseOrderStockInTransaction(tx, orderId);
    if (!released) return false;
    await tx.order.update({ where: { id: orderId }, data: { status: "CANCELLED" } });
    await tx.orderEvent.create({ data: { orderId, type: eventType, message } });
    return true;
  });
}

/**
 * Best-effort sweep for abandoned checkouts: releases stock for any order
 * that's held a reservation past RESERVATION_TTL_MS without being paid, and
 * marks it cancelled. There's no cron/queue infra in this app, so this is
 * called opportunistically at the start of every checkout request instead
 * of on a schedule — self-healing, and cheap when there's nothing stale.
 */
export async function releaseExpiredReservations() {
  const cutoff = new Date(Date.now() - RESERVATION_TTL_MS);
  const stale = await prisma.order.findMany({
    where: {
      stockReserved: true,
      paymentStatus: "PENDING",
      createdAt: { lt: cutoff },
    },
    select: { id: true },
    take: 50,
  });

  for (const { id } of stale) {
    await releaseOrderAndRecordEvent(
      id,
      "STOCK_RELEASED",
      "Stock reservation expired and was released — payment was never completed."
    ).catch(() => {});
  }
}
