/**
 * Retries search synchronization for every listing whose last sync attempt
 * didn't reach its desired state (searchSynced=false) — makes a temporary
 * Meilisearch outage recoverable without a full reindex. Safe to run
 * repeatedly/on a schedule.
 *
 * In a real deployment MEILISEARCH_* env vars are already set directly by
 * the host, so this loadEnvFile call is a no-op there — it only matters for
 * local dev, where they only live in .env.local. lib/search/meilisearch-http
 * is imported dynamically *inside* main(), after this runs, since a static
 * top-level import would be hoisted ahead of it (see
 * lib/platform/service-env.ts, which parses process.env once at import time).
 *
 * Usage: pnpm reconcile:search
 */
try {
  process.loadEnvFile(".env.local");
} catch {
  try {
    process.loadEnvFile(".env");
  } catch {}
}

import { prisma } from "@/lib/db";

async function main() {
  const { syncListingSearch } = await import("@/lib/search/meilisearch-http");

  const pending = await prisma.bikePartListing.findMany({ where: { searchSynced: false } });
  if (pending.length === 0) {
    console.log("No pending search-sync reconciliation needed.");
    return;
  }

  console.log(`Found ${pending.length} listing(s) needing search reconciliation.`);

  let succeeded = 0;
  let failed = 0;
  for (const listing of pending) {
    const synced = await syncListingSearch(listing);
    if (synced) {
      await prisma.bikePartListing.update({ where: { id: listing.id }, data: { searchSynced: true } });
      succeeded += 1;
    } else {
      failed += 1;
    }
  }

  console.log(`Reconciliation complete: ${succeeded} synced, ${failed} still pending.`);
  if (failed > 0) process.exitCode = 1;
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
