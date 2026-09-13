// Single source of truth for "what a BikePartListing looks like in the
// search index" — used by product sync (on save), the full reindex script,
// and the reconciliation script alike, so there is never a second mapping
// that could silently drift from this one (see Fix 8).
import type { BikePartListing, ListingStatus } from "@prisma/client";

export type SearchDocument = {
  id: string;
  name: string;
  slug: string;
  brand: string;
  category: string;
  productType: string | null;
  condition: "NEW" | "USED" | "REFURBISHED";
  price: number;
  gstRate: number;
  imageUrl: string | null;
  stock: number;
  description: string;
  compatibleModels: string[];
  searchTags: string[];
  status: ListingStatus;
  /** Epoch ms — lets the index sort by recency without re-deriving it from an ISO string. */
  createdAt: number;
};

/**
 * PostgreSQL is the source of truth for which listings are allowed to be
 * searchable at all — Meilisearch only ever mirrors this. ACTIVE is the only
 * storefront-visible status today; DRAFT/RESERVED/SOLD/ARCHIVED must never
 * surface in search regardless of what's already sitting in the index.
 */
export function isListingSearchable(listing: Pick<BikePartListing, "status">): boolean {
  return listing.status === "ACTIVE";
}

export function toSearchDocument(listing: BikePartListing): SearchDocument {
  return {
    id: listing.id,
    name: listing.name,
    slug: listing.slug,
    brand: listing.brand,
    category: listing.category,
    productType: listing.productType,
    condition: listing.condition,
    price: Number(listing.price),
    gstRate: Number(listing.gstRate),
    imageUrl: listing.imageUrl,
    stock: listing.stock,
    description: listing.description,
    compatibleModels: listing.compatibleModels,
    searchTags: listing.searchTags,
    status: listing.status,
    createdAt: listing.createdAt.getTime(),
  };
}
