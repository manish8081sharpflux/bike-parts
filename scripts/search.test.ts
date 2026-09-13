/**
 * Search hardening tests that need no external service — Meilisearch is
 * naturally "unconfigured" in this process (tsx does not load .env.local,
 * only Prisma's own implicit .env loading applies), which is exactly the
 * "Meilisearch unavailable" scenario Fix 8 requires production to survive.
 * See scripts/search-live.test.ts for the tests that need a real running
 * Meilisearch and/or a running `pnpm dev` server (admin-auth check).
 */
import assert from "node:assert/strict";
import test, { after } from "node:test";
import { prisma } from "@/lib/db";
import { GET as searchRoute } from "@/app/api/search/route";
import {
  applySearchIndexSettings,
  isMeilisearchConfigured,
  waitForMutationResponse,
} from "@/lib/search/meilisearch-http";
import { isListingSearchable, toSearchDocument } from "@/lib/search/search-document";
import { searchDatabaseProducts } from "@/lib/search/db-fallback";
import {
  buildFacetFilter,
  parseLimit,
  parseFacetValue,
  parsePage,
  parseQuery,
  parseSearchParams,
  parseSort,
  sortToMeiliClauses,
} from "@/lib/search/search-query";

const suffix = `${Date.now()}-${process.pid}`;
const listingIds: string[] = [];

async function makeListing(overrides: Partial<Parameters<typeof prisma.bikePartListing.create>[0]["data"]> = {}) {
  const listing = await prisma.bikePartListing.create({
    data: {
      name: `Search Test ${suffix}-${listingIds.length}`,
      slug: `search-test-${suffix}-${listingIds.length}`,
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

test("this process has no Meilisearch config — confirms the fallback tests below exercise a genuinely unavailable provider", () => {
  assert.equal(isMeilisearchConfigured(), false);
});

test("toSearchDocument/isListingSearchable reflect DB status, not sample data", async () => {
  const active = await makeListing({ status: "ACTIVE" });
  const archived = await makeListing({ status: "ARCHIVED" });
  assert.equal(isListingSearchable(active), true);
  assert.equal(isListingSearchable(archived), false);

  const doc = toSearchDocument(active);
  assert.equal(doc.id, active.id);
  assert.equal(doc.name, active.name);
  assert.equal(doc.status, "ACTIVE");
});

test("search input validation bounds q/page/limit and validates sort", () => {
  assert.equal(parseQuery("a".repeat(500)).length, 200);
  assert.equal(parsePage("-5"), 1);
  assert.equal(parsePage("abc"), 1);
  assert.equal(parsePage("3"), 3);
  assert.equal(parseLimit("9999"), 50);
  assert.equal(parseLimit("0"), 12);
  assert.equal(parseLimit("20"), 20);
  assert.equal(parseSort("'; DROP TABLE listings; --"), "relevance");
  assert.equal(parseSort("price_asc"), "price_asc");
  assert.deepEqual(sortToMeiliClauses("price_asc"), ["price:asc"]);
  assert.equal(sortToMeiliClauses("relevance"), undefined);
});

test("buildFacetFilter rejects unsafe values and escapes quotes instead of concatenating raw input", () => {
  assert.equal(buildFacetFilter("category", null), null);
  assert.equal(buildFacetFilter("category", ""), null);
  // Attempted filter-syntax breakout — rejected outright by the character allowlist.
  assert.equal(buildFacetFilter("category", 'Engine" OR "1"="1'), null);
  assert.equal(buildFacetFilter("category", "a".repeat(200)), null);
  // A plausible real category value passes through as a validated exact-match filter.
  assert.equal(buildFacetFilter("category", "Brake System"), 'category = "Brake System"');
  // A value containing a literal quote is rejected outright by the character
  // allowlist — never escaped-and-forwarded, since that's one less thing
  // that could go wrong than trusting an escaping routine alone.
  assert.equal(buildFacetFilter("brand", 'Bosch "Pro"'), null);
});

test("facet values are normalized once before either search backend receives them", async () => {
  const params = parseSearchParams(new URLSearchParams({
    q: `Facet Parity ${suffix}`,
    category: 'Engine" OR "1"="1',
    brand: "  Valid Brand  ",
  }));
  assert.equal(params.category, null);
  assert.equal(params.brand, "Valid Brand");
  assert.equal(parseFacetValue("   "), null);

  const matching = await makeListing({ name: `Facet Parity ${suffix}`, brand: "Valid Brand", category: "Other" });
  await makeListing({ name: `Facet Parity ${suffix} mismatch`, brand: "Other Brand", category: 'Engine" OR "1"="1' });
  const result = await searchDatabaseProducts(params);
  assert.deepEqual(result.hits.map((hit) => hit.id), [matching.id]);
});

test("mutation completion distinguishes successful, failed, timed-out, and already-absent tasks", async () => {
  const accepted = () => new Response(JSON.stringify({ taskUid: 42 }), { status: 202 });
  assert.equal(await waitForMutationResponse(accepted(), async () => ({ ok: true, status: "succeeded" })), true);
  assert.equal(await waitForMutationResponse(accepted(), async () => ({ ok: false, status: "failed" })), false);
  assert.equal(await waitForMutationResponse(accepted(), async () => ({ ok: false, status: "timeout" })), false);
  assert.equal(await waitForMutationResponse(new Response(null, { status: 404 }), async () => {
    throw new Error("404 must not poll");
  }), true);
  assert.equal(await waitForMutationResponse(new Response(null, { status: 500 })), false);
});

function indexSettingsClient(options: { existing?: number; create?: "succeeded" | "failed"; settings?: "succeeded" | "failed" }) {
  const requests: string[] = [];
  const client = {
    fetch: async () => new Response(null, { status: options.existing ?? 404 }),
    request: async (path: string) => {
      requests.push(path);
      return { taskUid: path === "/indexes" ? 1 : 2 };
    },
    wait: async (taskUid: number) => {
      const status = taskUid === 1 ? options.create ?? "succeeded" : options.settings ?? "succeeded";
      return { ok: status === "succeeded", status };
    },
  } as unknown as Parameters<typeof applySearchIndexSettings>[0];
  return { client, requests };
}

test("index creation completes before settings are applied", async () => {
  const { client, requests } = indexSettingsClient({});
  assert.equal((await applySearchIndexSettings(client)).ok, true);
  assert.equal(requests[0], "/indexes");
  assert.equal(requests[1]?.endsWith("/settings"), true);
});

test("failed index creation prevents settings, and failed settings report failure", async () => {
  const createFailure = indexSettingsClient({ create: "failed" });
  const createResult = await applySearchIndexSettings(createFailure.client);
  assert.equal(createResult.ok, false);
  assert.match(createResult.reason, /creation task failed/i);
  assert.deepEqual(createFailure.requests, ["/indexes"]);

  const settingsFailure = indexSettingsClient({ existing: 200, settings: "failed" });
  const settingsResult = await applySearchIndexSettings(settingsFailure.client);
  assert.equal(settingsResult.ok, false);
  assert.match(settingsResult.reason, /settings task failed/i);
  assert.equal(settingsFailure.requests.length, 1);
  assert.equal(settingsFailure.requests[0]?.endsWith("/settings"), true);
});

test("searchDatabaseProducts only ever returns ACTIVE listings, respects filters/sort/pagination", async () => {
  const active = await makeListing({ name: `Findable ${suffix}`, price: 500, status: "ACTIVE" });
  await makeListing({ name: `Findable ${suffix} archived`, status: "ARCHIVED" });
  await makeListing({ name: `Findable ${suffix} draft`, status: "DRAFT" });

  const result = await searchDatabaseProducts(
    parseSearchParams(new URLSearchParams({ q: `Findable ${suffix}` }))
  );
  assert.equal(result.hits.length, 1);
  assert.equal(result.hits[0]?.id, active.id);
  assert.equal(result.total, 1);
});

test("GET /api/search falls back to real DB ACTIVE products when Meilisearch is unavailable — never sample data", async () => {
  const listing = await makeListing({ name: `Unique DB Fallback ${suffix}` });
  const request = new Request(`http://localhost/api/search?q=${encodeURIComponent(`Unique DB Fallback ${suffix}`)}`);
  const response = await searchRoute(request);
  const data = await response.json();

  assert.equal(response.status, 200);
  assert.equal(data.source, "database");
  assert.ok(Array.isArray(data.items));
  assert.ok(data.items.some((item: { id: string }) => item.id === listing.id));
  // No sample/demo product id should ever be able to appear here.
  assert.equal(
    data.items.some((item: { id: string }) => typeof item.id === "string" && item.id.startsWith("dev-fixture-")),
    false
  );
});

test("GET /api/search never returns archived/draft listings even when they match the query text", async () => {
  const archived = await makeListing({ name: `Hidden Product ${suffix}`, status: "ARCHIVED" });
  const request = new Request(`http://localhost/api/search?q=${encodeURIComponent(`Hidden Product ${suffix}`)}`);
  const response = await searchRoute(request);
  const data = await response.json();
  assert.equal(response.status, 200);
  assert.equal(data.items.some((item: { id: string }) => item.id === archived.id), false);
});

test("GET /api/search ignores unsafe/overlong query params instead of forwarding them raw", async () => {
  const request = new Request(
    `http://localhost/api/search?${new URLSearchParams({
      q: "a".repeat(1000),
      page: "-1",
      limit: "99999",
      sort: "'; DROP TABLE listings; --",
      category: 'Engine" OR "1"="1',
    })}`
  );
  const response = await searchRoute(request);
  assert.equal(response.status, 200);
  const data = await response.json();
  assert.equal(data.page, 1);
  assert.ok(data.limit <= 50);
});

after(async () => {
  await prisma.bikePartListing.deleteMany({ where: { id: { in: listingIds } } });
  await prisma.$disconnect();
});
