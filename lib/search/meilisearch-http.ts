// Orchestration layer over the low-level Meilisearch client — index
// settings, per-listing sync, and search. Deliberately has no sample-data
// or DB fallback logic itself; see app/api/search/route.ts (API-level
// fallback) and scripts/reindex-meilisearch.ts (real full rebuild) for
// those. See Fix 8.
import type { BikePartListing } from "@prisma/client";
import { isListingSearchable, toSearchDocument, type SearchDocument } from "./search-document";
import {
  getIndexUid,
  indexPath,
  isMeilisearchConfigured,
  MeilisearchError,
  meiliFetch,
  meiliRequest,
  waitForMeiliTask,
} from "./meilisearch-client";

export { isMeilisearchConfigured, waitForMeiliTask, MeilisearchError };

const SEARCHABLE_ATTRIBUTES = ["name", "brand", "category", "productType", "searchTags", "compatibleModels"];
const FILTERABLE_ATTRIBUTES = ["brand", "category", "productType", "status", "condition"];
const SORTABLE_ATTRIBUTES = ["price", "createdAt"];

/**
 * Creates the index if it doesn't exist yet and applies explicit
 * searchable/filterable/sortable settings — deliberately never seeds any
 * documents (sample or otherwise). Safe to call repeatedly/idempotently.
 */
export async function ensureSearchIndexSettings(): Promise<{ ok: boolean; reason: string }> {
  if (!isMeilisearchConfigured()) {
    return { ok: false, reason: "Meilisearch environment variables are missing." };
  }

  try {
    const existing = await meiliFetch(indexPath());
    if (!existing.ok && existing.status !== 404) {
      throw new MeilisearchError(`Unexpected status checking index: ${existing.status}`);
    }
    if (!existing.ok) {
      await meiliRequest("/indexes", { method: "POST", body: { uid: getIndexUid(), primaryKey: "id" } });
    }

    await meiliRequest(indexPath("/settings"), {
      method: "PATCH",
      body: {
        searchableAttributes: SEARCHABLE_ATTRIBUTES,
        filterableAttributes: FILTERABLE_ATTRIBUTES,
        sortableAttributes: SORTABLE_ATTRIBUTES,
      },
    });

    return { ok: true, reason: "Index settings applied." };
  } catch (error) {
    console.error("[search] ensureSearchIndexSettings failed:", error);
    return { ok: false, reason: error instanceof MeilisearchError ? error.message : "Unexpected error." };
  }
}

/**
 * Keeps one listing's search document in sync with its current DB state —
 * called after every admin create/update/delete (see
 * lib/actions/admin-products-core.ts). ACTIVE upserts the document;
 * anything else (DRAFT/RESERVED/SOLD/ARCHIVED) deletes it, so a listing can
 * never remain searchable after it stops being storefront-visible.
 *
 * Returns whether the *desired* state was actually reached — true for a
 * successful upsert AND for a successful delete-because-no-longer-
 * searchable. The caller uses this (not "was it an add") to set
 * `searchSynced`.
 */
export async function syncListingSearch(listing: BikePartListing): Promise<boolean> {
  if (!isMeilisearchConfigured()) return false;

  try {
    if (!isListingSearchable(listing)) {
      const response = await meiliFetch(indexPath(`/documents/${encodeURIComponent(listing.id)}`), {
        method: "DELETE",
      });
      return response.ok || response.status === 404;
    }

    const response = await meiliFetch(indexPath("/documents"), {
      method: "POST",
      body: [toSearchDocument(listing)],
    });
    return response.ok;
  } catch (error) {
    // The DB row remains saved and is simply marked unsynced — see
    // lib/actions/admin-products-core.ts and scripts/reconcile-search.ts.
    console.error("[search] syncListingSearch failed for", listing.id, error);
    return false;
  }
}

/** Explicit delete for a hard-deleted product — no need to fabricate a partial listing just to reuse syncListingSearch. */
export async function deleteListingSearchDocument(id: string): Promise<boolean> {
  if (!isMeilisearchConfigured()) return false;
  try {
    const response = await meiliFetch(indexPath(`/documents/${encodeURIComponent(id)}`), { method: "DELETE" });
    return response.ok || response.status === 404;
  } catch (error) {
    console.error("[search] deleteListingSearchDocument failed for", id, error);
    return false;
  }
}

export async function pingMeilisearch(): Promise<boolean> {
  if (!isMeilisearchConfigured()) return false;
  try {
    const response = await meiliFetch("/health", { timeoutMs: 3000 });
    return response.ok;
  } catch {
    return false;
  }
}

export type MeiliSearchOptions = {
  filter?: string[];
  sort?: string[];
  limit: number;
  offset: number;
};

export type MeiliSearchResult = { hits: SearchDocument[]; estimatedTotalHits: number };

/** Pure Meilisearch search — callers decide what to do on failure (see app/api/search/route.ts's DB fallback). */
export async function searchMeilisearchIndex(query: string, options: MeiliSearchOptions): Promise<MeiliSearchResult> {
  const payload = await meiliRequest<{ estimatedTotalHits?: number; hits?: SearchDocument[] }>(indexPath("/search"), {
    method: "POST",
    body: {
      q: query,
      filter: options.filter && options.filter.length > 0 ? options.filter : undefined,
      sort: options.sort && options.sort.length > 0 ? options.sort : undefined,
      limit: options.limit,
      offset: options.offset,
    },
  });

  return { hits: payload.hits ?? [], estimatedTotalHits: payload.estimatedTotalHits ?? payload.hits?.length ?? 0 };
}
