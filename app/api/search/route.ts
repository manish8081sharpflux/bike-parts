import { NextResponse } from "next/server";
import { isMeilisearchConfigured, searchMeilisearchIndex } from "@/lib/search/meilisearch-http";
import { searchDatabaseProducts } from "@/lib/search/db-fallback";
import { buildFacetFilter, parseSearchParams, sortToMeiliClauses } from "@/lib/search/search-query";
import { assertSearchRateLimit, getClientIp, SearchRateLimitError } from "@/lib/search/rate-limit";

/**
 * Public search endpoint. Meilisearch first when configured; on any failure
 * (unconfigured, timed out, erroring) it falls back to PostgreSQL — never
 * to sample/demo data (see Fix 8). Both paths return the same response
 * shape so the frontend never needs source-specific rendering logic.
 */
export async function GET(request: Request) {
  const ip = getClientIp(request);
  try {
    await assertSearchRateLimit(ip);
  } catch (error) {
    if (error instanceof SearchRateLimitError) {
      return NextResponse.json({ error: "Too many search requests. Please slow down." }, { status: 429 });
    }
    throw error;
  }

  const { searchParams } = new URL(request.url);
  const params = parseSearchParams(searchParams);

  if (isMeilisearchConfigured()) {
    try {
      const filters = [buildFacetFilter("category", params.category), buildFacetFilter("brand", params.brand)].filter(
        (filter): filter is string => filter !== null
      );

      const result = await searchMeilisearchIndex(params.q, {
        filter: filters,
        sort: sortToMeiliClauses(params.sort),
        limit: params.limit,
        offset: (params.page - 1) * params.limit,
      });

      return NextResponse.json({
        items: result.hits,
        total: result.estimatedTotalHits,
        page: params.page,
        limit: params.limit,
        source: "meilisearch",
      });
    } catch (error) {
      // Provider detail (which can include request/host info) stays
      // server-side only — the client just silently gets the DB fallback.
      console.error("[search] Meilisearch search failed, falling back to database:", error);
    }
  }

  try {
    const result = await searchDatabaseProducts(params);
    return NextResponse.json({
      items: result.hits,
      total: result.total,
      page: params.page,
      limit: params.limit,
      source: "database",
    });
  } catch (error) {
    console.error("[search] Database fallback failed:", error);
    return NextResponse.json({ error: "Search is temporarily unavailable." }, { status: 503 });
  }
}
