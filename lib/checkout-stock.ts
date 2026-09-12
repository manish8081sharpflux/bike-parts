import { prisma } from "@/lib/db";
import { legacyStorefrontCatalog } from "@/lib/storefront-catalog";

// Only used as a name fallback in the shortage message below, for any
// still-in-flight order that reserved against the pre-DB-catalog static ids.
const LEGACY_CATALOG_BY_ID = new Map(legacyStorefrontCatalog.map((product) => [product.id, product]));

/** How long an order can hold a stock reservation without completing payment before it's released back. */
const RESERVATION_TTL_MS = 15 * 60 * 1000;

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
 * Atomically checks and decrements stock for every line item in one
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
export async function reserveStock(items: Array<{ id: string; quantity: number }>) {
  await prisma.$transaction(async (tx) => {
    const shortages: StockShortage[] = [];

    for (const item of items) {
      const affected = await tx.$executeRaw`
        UPDATE "BikePartListing"
        SET stock = stock - ${item.quantity}, "updatedAt" = now()
        WHERE id = ${item.id} AND stock >= ${item.quantity}
      `;

      if (affected === 0) {
        const current = await tx.bikePartListing.findUnique({ where: { id: item.id } });
        shortages.push({
          id: item.id,
          name: current?.name ?? LEGACY_CATALOG_BY_ID.get(item.id)?.name ?? item.id,
          requested: item.quantity,
          available: current?.stock ?? 0,
        });
      }
    }

    if (shortages.length > 0) {
      throw new OutOfStockError(shortages);
    }
  });
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
export async function releaseOrderStock(orderId: string) {
  await prisma.$transaction(async (tx) => {
    const order = await tx.order.findUnique({
      where: { id: orderId },
      include: { items: true },
    });
    if (!order || !order.stockReserved) return;

    for (const item of order.items) {
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

    await tx.order.update({ where: { id: order.id }, data: { stockReserved: false } });
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
      paymentStatus: { not: "PAID" },
      createdAt: { lt: cutoff },
    },
    select: { id: true },
    take: 50,
  });

  for (const { id } of stale) {
    await releaseOrderStock(id);
    await prisma.order
      .update({ where: { id }, data: { status: "CANCELLED" } })
      .catch(() => {});
    await prisma.orderEvent
      .create({
        data: {
          orderId: id,
          type: "STOCK_RELEASED",
          message: "Stock reservation expired and was released — payment was never completed.",
        },
      })
      .catch(() => {});
  }
}
