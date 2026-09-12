// Bootstraps the Meilisearch index (creates it + settings + bundled sample
// data) via the app's own /api/search/index route, then backfills every
// real ACTIVE admin-added product from Postgres — the part that actually
// makes search return real inventory instead of just sample data.
//
// Usage: pnpm meilisearch:seed  (requires `pnpm dev` and `pnpm meilisearch:up` running)
import { PrismaClient } from "@prisma/client";

try {
  process.loadEnvFile(".env.local");
} catch {
  try {
    process.loadEnvFile(".env");
  } catch {}
}

const appUrl = process.env.APP_URL ?? "http://localhost:3000";
const prisma = new PrismaClient();

async function bootstrapIndex() {
  const response = await fetch(`${appUrl}/api/search/index`, { method: "POST" });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    console.error("Index bootstrap failed:", payload);
    process.exit(1);
  }
  console.log("Index bootstrap:", payload);
}

/** Converts a listing the same way lib/search/meilisearch-http.ts's syncListingSearch does. */
function toSearchDocument(listing) {
  return {
    id: listing.id,
    name: listing.name,
    brand: listing.brand,
    category: listing.category,
    condition: listing.condition === "NEW" ? "New" : listing.condition === "USED" ? "Used" : "Refurbished",
    city: listing.city ?? "",
    price: Number(listing.price),
    stock: listing.stock,
    rating: Number(listing.rating ?? 0),
    description: listing.description,
    tags: [...listing.searchTags, ...listing.compatibleModels, listing.productType, listing.oemPartNumber, listing.sku].filter(Boolean),
  };
}

async function backfillRealProducts() {
  const listings = await prisma.bikePartListing.findMany({ where: { status: "ACTIVE" } });
  if (listings.length === 0) {
    console.log("No ACTIVE listings to backfill.");
    return;
  }

  const documents = listings.map(toSearchDocument);
  const meiliUrl = `${process.env.MEILISEARCH_PROTOCOL ?? "http"}://${process.env.MEILISEARCH_HOST}:${process.env.MEILISEARCH_PORT ?? 7700}/indexes/${process.env.MEILISEARCH_INDEX ?? "bike_parts"}/documents`;

  const response = await fetch(meiliUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${process.env.MEILISEARCH_API_KEY ?? ""}`,
    },
    body: JSON.stringify(documents),
  });

  if (!response.ok) {
    console.error("Backfill failed:", await response.text());
    process.exit(1);
  }

  await prisma.bikePartListing.updateMany({
    where: { id: { in: listings.map((l) => l.id) } },
    data: { searchSynced: true },
  });

  console.log(`Backfilled ${listings.length} real product(s) into Meilisearch.`);
}

async function main() {
  await bootstrapIndex();
  await backfillRealProducts();
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
