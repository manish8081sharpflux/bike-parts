// Production-safe search fallback for when Meilisearch is unavailable or
// unconfigured — queries real PostgreSQL rows through Prisma (which
// parameterizes everything itself, so there's no filter-injection surface
// here the way there is for hand-built Meilisearch filter strings) and maps
// them through the same toSearchDocument used everywhere else. This must
// never be sample/demo data — see Fix 8.
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { toSearchDocument, type SearchDocument } from "./search-document";
import type { ParsedSearchParams } from "./search-query";

export type DbSearchResult = { hits: SearchDocument[]; total: number };

export async function searchDatabaseProducts(params: ParsedSearchParams): Promise<DbSearchResult> {
  const where: Prisma.BikePartListingWhereInput = {
    status: "ACTIVE",
    ...(params.category ? { category: { equals: params.category, mode: "insensitive" } } : {}),
    ...(params.brand ? { brand: { equals: params.brand, mode: "insensitive" } } : {}),
    ...(params.q
      ? {
          OR: [
            { name: { contains: params.q, mode: "insensitive" } },
            { brand: { contains: params.q, mode: "insensitive" } },
            { category: { contains: params.q, mode: "insensitive" } },
          ],
        }
      : {}),
  };

  const orderBy: Prisma.BikePartListingOrderByWithRelationInput =
    params.sort === "price_asc"
      ? { price: "asc" }
      : params.sort === "price_desc"
      ? { price: "desc" }
      : { createdAt: "desc" };

  const [rows, total] = await Promise.all([
    prisma.bikePartListing.findMany({
      where,
      orderBy,
      skip: (params.page - 1) * params.limit,
      take: params.limit,
    }),
    prisma.bikePartListing.count({ where }),
  ]);

  return { hits: rows.map(toSearchDocument), total };
}
