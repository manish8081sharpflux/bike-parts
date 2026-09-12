import { platformEnv, getMeilisearchBaseUrl } from "@/lib/platform/service-env";
import type { BikePartListing } from "@prisma/client";
import {
  type BikePart,
  sampleProducts,
  searchSampleProducts,
} from "@/lib/products/sample-products";

export type ProductSearchResult = {
  hits: BikePart[];
  found: number;
  source: "meilisearch" | "local";
  setupRequired: boolean;
};

function getMeilisearchHeaders() {
  return {
    "Content-Type": "application/json",
    Authorization: `Bearer ${platformEnv.MEILISEARCH_API_KEY ?? ""}`,
  };
}

function documentsUrl() {
  return `${getMeilisearchBaseUrl()}/indexes/${platformEnv.MEILISEARCH_INDEX}/documents`;
}

/** Converts an admin listing into the flat shape the search index (and MarketplaceSearch) expects. */
function toSearchDocument(listing: BikePartListing): BikePart {
  return {
    id: listing.id,
    name: listing.name,
    brand: listing.brand,
    category: listing.category,
    condition:
      listing.condition === "NEW" ? "New" : listing.condition === "USED" ? "Used" : "Refurbished",
    city: listing.city ?? "",
    price: Number(listing.price),
    stock: listing.stock,
    rating: Number(listing.rating ?? 0),
    description: listing.description,
    tags: [
      ...listing.searchTags,
      ...listing.compatibleModels,
      listing.productType,
      listing.oemPartNumber,
      listing.sku,
    ].filter((value): value is string => Boolean(value)),
  };
}

/** Keep admin listings searchable — upserts on save, removes when a listing leaves ACTIVE status. */
export async function syncListingSearch(listing: BikePartListing): Promise<boolean> {
  if (!isMeilisearchConfigured()) return false;

  try {
    if (listing.status !== "ACTIVE") {
      const response = await fetch(`${documentsUrl()}/${encodeURIComponent(listing.id)}`, {
        method: "DELETE",
        headers: getMeilisearchHeaders(),
        signal: AbortSignal.timeout(3000),
      });
      return response.ok || response.status === 404;
    }

    const response = await fetch(documentsUrl(), {
      method: "POST",
      headers: getMeilisearchHeaders(),
      body: JSON.stringify([toSearchDocument(listing)]),
      signal: AbortSignal.timeout(3000),
    });
    return response.ok;
  } catch {
    // The listing remains saved and marked unsynced if search is unavailable.
    return false;
  }
}

export function isMeilisearchConfigured() {
  return Boolean(getMeilisearchBaseUrl() && platformEnv.MEILISEARCH_API_KEY);
}

export async function pingMeilisearch() {
  const baseUrl = getMeilisearchBaseUrl();
  if (!baseUrl || !platformEnv.MEILISEARCH_API_KEY) {
    return false;
  }

  const response = await fetch(`${baseUrl}/health`, {
    headers: getMeilisearchHeaders(),
    cache: "no-store",
  });

  return response.ok;
}

/** Creates the index (if missing), sets which fields are searchable/filterable, and seeds it with the bundled sample data. */
export async function ensureProductSearchIndex() {
  const baseUrl = getMeilisearchBaseUrl();
  if (!baseUrl || !platformEnv.MEILISEARCH_API_KEY) {
    return { ok: false, reason: "Meilisearch environment variables are missing." };
  }

  const indexUrl = `${baseUrl}/indexes/${platformEnv.MEILISEARCH_INDEX}`;
  const existing = await fetch(indexUrl, { headers: getMeilisearchHeaders(), cache: "no-store" });

  if (!existing.ok) {
    const created = await fetch(`${baseUrl}/indexes`, {
      method: "POST",
      headers: getMeilisearchHeaders(),
      body: JSON.stringify({ uid: platformEnv.MEILISEARCH_INDEX, primaryKey: "id" }),
      cache: "no-store",
    });
    if (!created.ok) {
      return { ok: false, reason: await created.text() };
    }
  }

  const settings = await fetch(`${indexUrl}/settings`, {
    method: "PATCH",
    headers: getMeilisearchHeaders(),
    body: JSON.stringify({
      searchableAttributes: ["name", "brand", "category", "tags", "description"],
      filterableAttributes: ["category", "brand", "condition", "city"],
      sortableAttributes: ["rating", "price"],
    }),
    cache: "no-store",
  });
  if (!settings.ok) {
    return { ok: false, reason: await settings.text() };
  }

  const imported = await fetch(`${indexUrl}/documents`, {
    method: "POST",
    headers: getMeilisearchHeaders(),
    body: JSON.stringify(sampleProducts),
    cache: "no-store",
  });

  return {
    ok: imported.ok,
    reason: imported.ok ? "Index created/updated and seeded." : await imported.text(),
  };
}

export async function searchProducts(
  query: string,
  options: { category?: string; page?: number } = {}
): Promise<ProductSearchResult> {
  if (!isMeilisearchConfigured()) {
    const hits = searchSampleProducts(query, options.category);
    return { hits, found: hits.length, source: "local", setupRequired: true };
  }

  const baseUrl = getMeilisearchBaseUrl();
  const perPage = 12;
  const page = options.page ?? 1;

  const response = await fetch(
    `${baseUrl}/indexes/${platformEnv.MEILISEARCH_INDEX}/search`,
    {
      method: "POST",
      headers: getMeilisearchHeaders(),
      body: JSON.stringify({
        q: query.trim(),
        filter: options.category ? `category = "${options.category}"` : undefined,
        sort: ["rating:desc"],
        limit: perPage,
        offset: (page - 1) * perPage,
      }),
      cache: "no-store",
    }
  );

  if (!response.ok) {
    const hits = searchSampleProducts(query, options.category);
    return { hits, found: hits.length, source: "local", setupRequired: true };
  }

  const payload = (await response.json()) as {
    estimatedTotalHits?: number;
    hits?: BikePart[];
  };

  const hits = payload.hits ?? [];

  return {
    hits,
    found: payload.estimatedTotalHits ?? hits.length,
    source: "meilisearch",
    setupRequired: false,
  };
}
