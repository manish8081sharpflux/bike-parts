// DEVELOPMENT-ONLY fixture seeding for the Meilisearch search showcase
// (/search page + components/marketplace-search.tsx). This is NOT the
// production catalog and must never be run against a production index —
// production search reads real ACTIVE listings straight from PostgreSQL
// (see scripts/reindex-meilisearch.ts, which is what production/deploy
// tooling should use instead). Refuses to run when NODE_ENV=production.
//
// Talks to the Meilisearch REST API directly rather than through the app's
// /api/search/index route, which is admin-session-protected and settings-
// only (see Fix 8) — this script has no admin session to present, nor
// should a raw dev-fixture seed need one.
//
// Usage: pnpm meilisearch:seed  (requires `pnpm meilisearch:up` running)
try {
  process.loadEnvFile(".env.local");
} catch {
  try {
    process.loadEnvFile(".env");
  } catch {}
}

if (process.env.NODE_ENV === "production") {
  console.error("Refusing to seed sample/demo data in production. Use `pnpm reindex:search` instead.");
  process.exit(1);
}

const host = process.env.MEILISEARCH_HOST;
const apiKey = process.env.MEILISEARCH_API_KEY;
if (!host || !apiKey) {
  console.error("MEILISEARCH_HOST and MEILISEARCH_API_KEY must be set first (see .env.local).");
  process.exit(1);
}

const baseUrl = `${process.env.MEILISEARCH_PROTOCOL ?? "http"}://${host}:${process.env.MEILISEARCH_PORT ?? 7700}`;
const indexUid = process.env.MEILISEARCH_INDEX ?? "bike_parts";
const headers = { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` };

// Matches lib/search/search-document.ts's SearchDocument shape — kept as an
// inline, obviously-fake fixture set (ids prefixed "dev-fixture-") rather
// than reusing lib/products/sample-products.ts's older BikePart shape,
// which predates the real search-document schema.
const devFixtures = [
  {
    id: "dev-fixture-brake-disc",
    name: "Front Brake Disc Rotor (dev fixture)",
    slug: "dev-fixture-front-brake-disc-rotor",
    brand: "Apollo",
    category: "Braking",
    productType: "Brake Disc",
    condition: "NEW",
    price: 1850,
    gstRate: 18,
    imageUrl: null,
    stock: 14,
    description: "Precision-machined rotor for commuter and sport bikes.",
    compatibleModels: ["Pulsar 150", "Apache RTR 160"],
    searchTags: ["disc", "front", "street"],
    status: "ACTIVE",
    createdAt: Date.now(),
  },
  {
    id: "dev-fixture-chain-kit",
    name: "Heavy Duty Chain Sprocket Kit (dev fixture)",
    slug: "dev-fixture-heavy-duty-chain-sprocket-kit",
    brand: "MotoLink",
    category: "Drivetrain",
    productType: "Chain Kit",
    condition: "NEW",
    price: 2499,
    gstRate: 18,
    imageUrl: null,
    stock: 8,
    description: "Sealed chain kit built for high-mileage daily riding.",
    compatibleModels: ["Xpulse 200"],
    searchTags: ["chain", "sprocket", "touring"],
    status: "ACTIVE",
    createdAt: Date.now(),
  },
  {
    id: "dev-fixture-led-headlamp",
    name: "H4 LED Headlamp Assembly (dev fixture)",
    slug: "dev-fixture-h4-led-headlamp-assembly",
    brand: "Lumora",
    category: "Electrical",
    productType: "Headlamp",
    condition: "REFURBISHED",
    price: 1199,
    gstRate: 18,
    imageUrl: null,
    stock: 5,
    description: "Bright replacement assembly with tested wiring harness.",
    compatibleModels: ["Classic 350"],
    searchTags: ["led", "headlamp", "night"],
    status: "ACTIVE",
    createdAt: Date.now(),
  },
  {
    id: "dev-fixture-clutch-plate",
    name: "Clutch Plate Set (dev fixture)",
    slug: "dev-fixture-clutch-plate-set",
    brand: "RidePro",
    category: "Engine",
    productType: "Clutch Plate",
    condition: "NEW",
    price: 899,
    gstRate: 18,
    imageUrl: null,
    stock: 22,
    description: "Friction plate set for smooth power transfer.",
    compatibleModels: ["Unicorn 160"],
    searchTags: ["clutch", "engine", "commuter"],
    status: "ACTIVE",
    createdAt: Date.now(),
  },
];

async function main() {
  const existing = await fetch(`${baseUrl}/indexes/${indexUid}`, { headers });
  if (!existing.ok && existing.status !== 404) {
    console.error("Unexpected status checking index:", existing.status, await existing.text());
    process.exit(1);
  }
  if (!existing.ok) {
    const created = await fetch(`${baseUrl}/indexes`, {
      method: "POST",
      headers,
      body: JSON.stringify({ uid: indexUid, primaryKey: "id" }),
    });
    if (!created.ok) {
      console.error("Failed to create index:", await created.text());
      process.exit(1);
    }
  }

  const settings = await fetch(`${baseUrl}/indexes/${indexUid}/settings`, {
    method: "PATCH",
    headers,
    body: JSON.stringify({
      searchableAttributes: ["name", "brand", "category", "productType", "searchTags", "compatibleModels"],
      filterableAttributes: ["brand", "category", "productType", "status", "condition"],
      sortableAttributes: ["price", "createdAt"],
    }),
  });
  if (!settings.ok) {
    console.error("Failed to apply index settings:", await settings.text());
    process.exit(1);
  }

  const seeded = await fetch(`${baseUrl}/indexes/${indexUid}/documents`, {
    method: "POST",
    headers,
    body: JSON.stringify(devFixtures),
  });
  if (!seeded.ok) {
    console.error("Failed to seed dev fixtures:", await seeded.text());
    process.exit(1);
  }

  console.log(
    `Seeded ${devFixtures.length} development fixture(s) into "${indexUid}". This is NOT real inventory — for real data, run \`pnpm reindex:search\`.`
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
