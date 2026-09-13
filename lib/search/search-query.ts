// Validates and bounds everything /api/search accepts from the client
// before it ever reaches Meilisearch or the DB fallback — untrusted input
// never gets concatenated into a Meilisearch filter string or forwarded as
// an arbitrary sort clause. See Fix 8.

export const MAX_QUERY_LENGTH = 200;
export const MAX_LIMIT = 50;
export const DEFAULT_LIMIT = 12;

export type SortOption = "relevance" | "price_asc" | "price_desc" | "newest";

/** User-facing sort name -> Meilisearch sort clause. `null` (relevance) means "omit sort, use Meilisearch's own ranking." */
const SORT_MAP: Record<SortOption, string[] | null> = {
  relevance: null,
  price_asc: ["price:asc"],
  price_desc: ["price:desc"],
  newest: ["createdAt:desc"],
};

export function parseSort(raw: string | null): SortOption {
  if (raw && raw in SORT_MAP) return raw as SortOption;
  return "relevance";
}

export function sortToMeiliClauses(sort: SortOption): string[] | undefined {
  return SORT_MAP[sort] ?? undefined;
}

/** Trims and hard-caps the free-text query — never forwarded past this length. */
export function parseQuery(raw: string | null): string {
  return (raw ?? "").trim().slice(0, MAX_QUERY_LENGTH);
}

export function parsePage(raw: string | null): number {
  const value = Number(raw);
  if (!Number.isFinite(value) || !Number.isInteger(value) || value < 1) return 1;
  return value;
}

export function parseLimit(raw: string | null): number {
  const value = Number(raw);
  if (!Number.isFinite(value) || !Number.isInteger(value) || value < 1) return DEFAULT_LIMIT;
  return Math.min(value, MAX_LIMIT);
}

// A facet value (category/brand) is never interpolated into a Meilisearch
// filter string as-is. It must first match this character allowlist — which
// already excludes quotes and backslashes, so no real category/brand name
// can break out of the `field = "value"` clause — and is then escaped
// anyway as a second, independent layer in case the allowlist is ever
// loosened later.
const SAFE_FACET_VALUE = /^[\w &.,'-]{1,80}$/;

export function parseFacetValue(raw: string | null): string | null {
  if (!raw) return null;
  const value = raw.trim();
  return value && SAFE_FACET_VALUE.test(value) ? value : null;
}

function escapeFilterValue(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

/** Returns a single validated `field = "value"` filter clause, or null if the input isn't a plausible facet value. */
export function buildFacetFilter(field: "category" | "brand", value: string | null): string | null {
  if (!value || !SAFE_FACET_VALUE.test(value)) return null;
  return `${field} = "${escapeFilterValue(value)}"`;
}

export type ParsedSearchParams = {
  q: string;
  category: string | null;
  brand: string | null;
  sort: SortOption;
  page: number;
  limit: number;
};

export function parseSearchParams(searchParams: URLSearchParams): ParsedSearchParams {
  return {
    q: parseQuery(searchParams.get("q")),
    category: parseFacetValue(searchParams.get("category")),
    brand: parseFacetValue(searchParams.get("brand")),
    sort: parseSort(searchParams.get("sort")),
    page: parsePage(searchParams.get("page")),
    limit: parseLimit(searchParams.get("limit")),
  };
}
