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

function escapeFilterValue(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

/** Returns a single validated `field = "value"` filter clause, or null if the input isn't a plausible facet value. */
export function buildFacetFilter(field: "category" | "brand", raw: string | null): string | null {
  if (!raw) return null;
  const value = raw.trim();
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
  const rawCategory = searchParams.get("category");
  const rawBrand = searchParams.get("brand");
  return {
    q: parseQuery(searchParams.get("q")),
    // Kept as plain trimmed strings here for the DB fallback (which uses a
    // parameterized Prisma `equals`, not a hand-built filter string) —
    // buildFacetFilter's allowlist is applied only where a raw filter
    // string is actually being constructed, i.e. the Meilisearch path.
    category: rawCategory && rawCategory.trim() ? rawCategory.trim().slice(0, 80) : null,
    brand: rawBrand && rawBrand.trim() ? rawBrand.trim().slice(0, 80) : null,
    sort: parseSort(searchParams.get("sort")),
    page: parsePage(searchParams.get("page")),
    limit: parseLimit(searchParams.get("limit")),
  };
}
