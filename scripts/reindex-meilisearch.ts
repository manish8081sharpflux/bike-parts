/**
 * Production-safe full reindex — rebuilds the Meilisearch index entirely
 * from the live PostgreSQL BikePartListing table. Never sources documents
 * from lib/products/sample-products.ts (see Fix 8).
 *
 * Strategy: clear the index, then repopulate from every ACTIVE listing —
 * the simple, documented option (Fix 8 item 20) rather than a temp-index-
 * and-swap, which this project's scale doesn't yet justify. This opens a
 * brief window where the index is empty; acceptable here, but the window
 * exists and readers of this file should know that.
 *
 * In a real deployment MEILISEARCH_* env vars are already set directly by
 * the host, so this loadEnvFile call is a no-op there — it only matters for
 * local dev, where they only live in .env.local. The search modules below
 * are imported dynamically *inside* main(), after this runs: lib/platform/
 * service-env.ts parses process.env once at import time, and a static
 * top-level import would be hoisted ahead of this call.
 *
 * Usage: pnpm reindex:search
 */
try {
  process.loadEnvFile(".env.local");
} catch {
  try {
    process.loadEnvFile(".env");
  } catch {}
}

import { prisma } from "@/lib/db";
import { toSearchDocument } from "@/lib/search/search-document";

async function main() {
  const { ensureSearchIndexSettings, isMeilisearchConfigured } = await import("@/lib/search/meilisearch-http");
  const { indexPath, meiliFetch, meiliRequest, waitForMeiliTask } = await import("@/lib/search/meilisearch-client");

  if (!isMeilisearchConfigured()) {
    console.error("Meilisearch is not configured (MEILISEARCH_HOST/MEILISEARCH_API_KEY missing) — nothing to reindex.");
    process.exitCode = 1;
    return;
  }

  const settings = await ensureSearchIndexSettings();
  if (!settings.ok) {
    console.error("Failed to apply index settings:", settings.reason);
    process.exitCode = 1;
    return;
  }
  console.log("Index settings applied.");

  const listings = await prisma.bikePartListing.findMany({ where: { status: "ACTIVE" } });
  console.log(`Loaded ${listings.length} ACTIVE listing(s) from PostgreSQL.`);

  // Clear first, so a listing that's since become non-ACTIVE (or was
  // hard-deleted) can never remain stuck in the index after a rebuild.
  const deleteResponse = await meiliFetch(indexPath("/documents"), { method: "DELETE" });
  if (!deleteResponse.ok) {
    console.error("Failed to clear existing documents:", await deleteResponse.text());
    process.exitCode = 1;
    return;
  }
  const deleteTask = (await deleteResponse.json()) as { taskUid: number };
  const deleteResult = await waitForMeiliTask(deleteTask.taskUid);
  if (!deleteResult.ok) {
    console.error("Clearing the index did not complete successfully:", deleteResult.status);
    process.exitCode = 1;
    return;
  }

  if (listings.length === 0) {
    console.log("No ACTIVE listings to index. Index is now empty.");
    return;
  }

  const documents = listings.map(toSearchDocument);
  const addResult = await meiliRequest<{ taskUid: number }>(indexPath("/documents"), {
    method: "POST",
    body: documents,
  });
  const addTaskResult = await waitForMeiliTask(addResult.taskUid);
  if (!addTaskResult.ok) {
    console.error("Adding documents did not complete successfully:", addTaskResult.status);
    process.exitCode = 1;
    return;
  }

  await prisma.bikePartListing.updateMany({
    where: { id: { in: listings.map((listing) => listing.id) } },
    data: { searchSynced: true },
  });

  console.log(`Reindexed ${listings.length} product(s). searchSynced marked true for all of them.`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
