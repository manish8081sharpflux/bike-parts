/**
 * Search hardening tests that need real external services, unlike
 * scripts/search.test.ts:
 *
 *  1. A running local Meilisearch (`pnpm meilisearch:up`) — for the
 *     sync/stale-document-removal/reconciliation tests below.
 *  2. A running app server (`pnpm dev`, or override with
 *     AUTH_TEST_BASE_URL) — for the admin-auth check on /api/search/index,
 *     which depends on next/headers' cookies() and can only be exercised
 *     through a real request (same reasoning as
 *     scripts/addresses-http.test.ts in Fix 6).
 *
 * lib/platform/service-env.ts parses process.env once at module load, and
 * tsx does not auto-load .env.local the way the Next.js CLI does — so this
 * file explicitly loads it via process.loadEnvFile *before* dynamically
 * importing anything that reads platformEnv, an .mts (real ESM, unlike the
 * project's default CJS-transpiled .ts scripts) so top-level await is
 * available to sequence that correctly.
 */
process.loadEnvFile?.(".env.local");

import assert from "node:assert/strict";
import test, { after } from "node:test";
import { prisma } from "@/lib/db";

const {
  ensureSearchIndexSettings,
  isMeilisearchConfigured,
  pingMeilisearch,
  searchMeilisearchIndex,
  syncListingSearch,
  deleteListingSearchDocument,
} = await import("@/lib/search/meilisearch-http");
const { indexPath, meiliFetch } = await import("@/lib/search/meilisearch-client");

const baseUrl = process.env.AUTH_TEST_BASE_URL ?? "http://localhost:3000";
const suffix = `${Date.now()}-${process.pid}`;
const listingIds: string[] = [];

async function makeListing(overrides: Record<string, unknown> = {}) {
  const listing = await prisma.bikePartListing.create({
    data: {
      name: `Live Search Test ${suffix}-${listingIds.length}`,
      slug: `live-search-test-${suffix}-${listingIds.length}`,
      brand: "TestBrand",
      category: "TestCategory",
      price: 100,
      stock: 5,
      status: "ACTIVE",
      ...overrides,
    },
  });
  listingIds.push(listing.id);
  return listing;
}

async function fetchIndexedDocument(id: string) {
  const response = await meiliFetch(indexPath(`/documents/${encodeURIComponent(id)}`));
  return response.status === 200 ? await response.json() : null;
}

test("preconditions: Meilisearch is configured and reachable in this process", async () => {
  assert.equal(isMeilisearchConfigured(), true);
  assert.equal(await pingMeilisearch(), true);
});

test("ensureSearchIndexSettings creates the index and applies explicit settings without seeding any documents", async () => {
  const result = await ensureSearchIndexSettings();
  assert.equal(result.ok, true);
});

test("syncListingSearch indexes an ACTIVE listing and it becomes searchable", async () => {
  const listing = await makeListing({ name: `Findable Sync ${suffix}` });
  assert.equal(await syncListingSearch(listing), true);

  assert.ok(await fetchIndexedDocument(listing.id));
  const results = await searchMeilisearchIndex(`Findable Sync ${suffix}`, { limit: 10, offset: 0 });
  assert.ok(results.hits.some((hit) => hit.id === listing.id));
});

test("archiving a previously-indexed listing and syncing removes its document — stale results cannot remain", async () => {
  const listing = await makeListing({ name: `Stale Removal ${suffix}` });
  assert.equal(await syncListingSearch(listing), true);
  assert.ok(await fetchIndexedDocument(listing.id));

  const archived = await prisma.bikePartListing.update({ where: { id: listing.id }, data: { status: "ARCHIVED" } });
  assert.equal(await syncListingSearch(archived), true);
  assert.equal(await fetchIndexedDocument(listing.id), null);
  const results = await searchMeilisearchIndex(`Stale Removal ${suffix}`, { limit: 10, offset: 0 });
  assert.equal(results.hits.some((hit) => hit.id === listing.id), false);
});

test("deleteListingSearchDocument removes a hard-deleted product's document", async () => {
  const listing = await makeListing({ name: `Hard Delete ${suffix}` });
  assert.equal(await syncListingSearch(listing), true);
  await prisma.bikePartListing.delete({ where: { id: listing.id } });
  listingIds.splice(listingIds.indexOf(listing.id), 1);

  assert.equal(await deleteListingSearchDocument(listing.id), true);
  assert.equal(await fetchIndexedDocument(listing.id), null);
});

test("reconciliation retries a pending sync and marks searchSynced true once it succeeds", async () => {
  const listing = await makeListing({ name: `Reconcile Me ${suffix}`, searchSynced: false });
  const before = await prisma.bikePartListing.findUniqueOrThrow({ where: { id: listing.id } });
  assert.equal(before.searchSynced, false);

  assert.equal(await syncListingSearch(listing), true);
  await prisma.bikePartListing.update({ where: { id: listing.id }, data: { searchSynced: true } });

  const after_ = await prisma.bikePartListing.findUniqueOrThrow({ where: { id: listing.id } });
  assert.equal(after_.searchSynced, true);
});

test("unauthorized index API: POST /api/search/index requires an admin session and mutates nothing", async () => {
  const response = await fetch(`${baseUrl}/api/search/index`, { method: "POST" });
  assert.ok([401, 403].includes(response.status), `expected 401/403, got ${response.status}`);
});

test("unauthorized index API: GET /api/search/index also requires an admin session", async () => {
  const response = await fetch(`${baseUrl}/api/search/index`);
  assert.ok([401, 403].includes(response.status), `expected 401/403, got ${response.status}`);
});

after(async () => {
  await prisma.bikePartListing.deleteMany({ where: { id: { in: listingIds } } });
  await prisma.$disconnect();
});
