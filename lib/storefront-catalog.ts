import type { BikePartListing } from "@prisma/client";
import { specificationsSchema, vehiclesSchema, type Specification, type CompatibleVehicle } from "@/lib/products/product-details";
import { prisma } from "@/lib/db";

/** Shape the storefront UI (app/home-client.tsx) renders — mapped from a `BikePartListing` DB row. */
export type Product = {
  id: string;
  name: string;
  brand: string;
  category: string;
  /** Comma-grouped, no currency symbol — e.g. "2,450" — matches how every render site already interpolates `₹{product.price}`. */
  price: string;
  image: string;
  images: string[];
  stock: number;
  description: string;
  sku: string | null;
  oemPartNumber: string | null;
  productType: string | null;
  specifications: Specification[];
  compatibleVehicles: CompatibleVehicle[];
  features: string[];
  searchTags: string[];
  material: string | null;
  finish: string | null;
  packIncludes: string | null;
  weightKg: number | null;
  warrantyMonths: number | null;
  countryOfOrigin: string | null;
  rating: number | null;
  deliveryDaysMin: number | null;
  deliveryDaysMax: number | null;
  offerLabel: string | null;
  compatibleModels: string[];
};

const FALLBACK_IMAGE = "/assets/home/part-engine.png";

/** Converts one admin-managed `BikePartListing` row into the shape the storefront renders. */
export function mapListingToProduct(listing: BikePartListing): Product {
  return {
    id: listing.id,
    name: listing.name,
    brand: listing.brand,
    category: listing.category,
    price: Math.round(Number(listing.price)).toLocaleString("en-IN"),
    image: listing.imageUrl || FALLBACK_IMAGE,
    images: listing.images,
    stock: listing.stock,
    description: listing.description,
    sku: listing.sku,
    oemPartNumber: listing.oemPartNumber,
    productType: listing.productType,
    specifications: specificationsSchema.parse(listing.specifications ?? []),
    compatibleVehicles: vehiclesSchema.parse(listing.compatibleVehicles ?? []),
    features: listing.features ?? [],
    searchTags: listing.searchTags ?? [],
    material: listing.material,
    finish: listing.finish,
    packIncludes: listing.packIncludes,
    weightKg: listing.weightKg !== null ? Number(listing.weightKg) : null,
    warrantyMonths: listing.warrantyMonths,
    countryOfOrigin: listing.countryOfOrigin,
    rating: listing.rating !== null ? Number(listing.rating) : null,
    deliveryDaysMin: listing.deliveryDaysMin,
    deliveryDaysMax: listing.deliveryDaysMax,
    offerLabel: listing.offerLabel,
    compatibleModels: listing.compatibleModels,
  };
}

/** Live storefront catalog — every ACTIVE admin-managed listing, newest first. Server-only (reads Prisma directly). */
export async function getStorefrontProducts(): Promise<Product[]> {
  const listings = await prisma.bikePartListing.findMany({
    where: { status: "ACTIVE" },
    orderBy: { createdAt: "desc" },
  });
  return listings.map(mapListingToProduct);
}

// Legacy static catalog — no longer what the storefront displays (see
// getStorefrontProducts above, which now reads the real BikePartListing
// table). Kept only so `lib/checkout-stock.ts` can still resolve/release
// stock for any order that reserved against this catalog's ids *before*
// the DB-backed catalog shipped — safe to delete once no such order can
// still be mid-checkout (its ProductStock-backed reservation released).
export const legacyStorefrontCatalog = [
  // Engine
  { id: "cylinder-kit", name: "Cylinder Kit", price: "2,450", image: "/assets/home/part-engine.png", category: "Engine", stock: 18 },
  { id: "piston-kit", name: "Piston Kit", price: "850", image: "/assets/home/part-engine.png", category: "Engine", stock: 19 },
  { id: "engine-gasket-set", name: "Engine Gasket Set", price: "520", image: "/assets/home/part-cooling.png", category: "Engine", stock: 22 },
  { id: "air-filter", name: "Air Filter", price: "320", image: "/assets/home/part-filters.png", category: "Engine", stock: 22 },
  { id: "spark-plug-ngk", name: "Spark Plug (NGK)", price: "180", image: "/assets/home/part-fuel.png", category: "Engine", stock: 30 },
  { id: "engine-oil-filter", name: "Engine Oil Filter", price: "220", image: "/assets/home/part-filters.png", category: "Engine", stock: 21 },
  { id: "crankshaft-assembly", name: "Crankshaft Assembly", price: "2,800", image: "/assets/home/part-transmission.png", category: "Engine", stock: 35 },
  { id: "engine-valve-set", name: "Engine Valve Set", price: "620", image: "/assets/home/part-engine.png", category: "Engine", stock: 39 },
  { id: "rocker-arm", name: "Rocker Arm", price: "480", image: "/assets/home/part-engine.png", category: "Engine", stock: 26 },
  { id: "engine-mount", name: "Engine Mount", price: "350", image: "/assets/home/part-engine.png", category: "Engine", stock: 25 },
  { id: "timing-chain-guide", name: "Timing Chain Guide", price: "290", image: "/assets/home/part-transmission.png", category: "Engine", stock: 34 },
  { id: "clutch-plate-set", name: "Clutch Plate Set", price: "1,150", image: "/assets/home/part-transmission.png", category: "Engine", stock: 6 },
  { id: "cam-chain", name: "Cam Chain", price: "420", image: "/assets/home/part-transmission.png", category: "Engine", stock: 32 },
  { id: "oil-pump", name: "Oil Pump", price: "1,750", image: "/assets/home/part-lubricants.png", category: "Engine", stock: 24 },
  { id: "connecting-rod-kit", name: "Connecting Rod Kit", price: "950", image: "/assets/home/part-engine.png", category: "Engine", stock: 24 },
  { id: "engine-bolt-set", name: "Engine Bolt Set", price: "180", image: "/assets/home/part-engine.png", category: "Engine", stock: 6 },
  { id: "oil-seal-set", name: "Oil Seal Set", price: "260", image: "/assets/home/part-cooling.png", category: "Engine", stock: 30 },
  { id: "cylinder-head", name: "Cylinder Head", price: "1,950", image: "/assets/home/part-engine.png", category: "Engine", stock: 16 },
  { id: "push-rod", name: "Push Rod", price: "150", image: "/assets/home/part-engine.png", category: "Engine", stock: 23 },
  { id: "valve-spring-set", name: "Valve Spring Set", price: "320", image: "/assets/home/part-engine.png", category: "Engine", stock: 30 },
  { id: "camshaft", name: "Camshaft", price: "1,680", image: "/assets/home/part-transmission.png", category: "Engine", stock: 6 },

  // Brake System
  { id: "front-disc-rotor", name: "Front Disc Rotor", price: "1,250", image: "/assets/home/part-brake.png", category: "Brake System", stock: 35 },
  { id: "brake-caliper-assembly", name: "Brake Caliper Assembly", price: "1,850", image: "/assets/home/part-brake.png", category: "Brake System", stock: 6 },
  { id: "brake-pads-front", name: "Brake Pads (Front)", price: "380", image: "/assets/home/part-brake.png", category: "Brake System", stock: 29 },
  { id: "brake-master-cylinder", name: "Brake Master Cylinder", price: "950", image: "/assets/home/part-brake.png", category: "Brake System", stock: 30 },
  { id: "brake-lever-set", name: "Brake Lever Set", price: "290", image: "/assets/home/part-brake.png", category: "Brake System", stock: 40 },

  // Electrical
  { id: "starter-motor", name: "Starter Motor", price: "2,200", image: "/assets/home/part-battery.png", category: "Electrical", stock: 14 },
  { id: "magneto-coil", name: "Magneto Coil", price: "890", image: "/assets/home/part-battery.png", category: "Electrical", stock: 40 },
  { id: "voltage-regulator", name: "Voltage Regulator", price: "850", image: "/assets/home/part-battery.png", category: "Electrical", stock: 35 },
  { id: "wiring-harness", name: "Wiring Harness", price: "1,250", image: "/assets/home/part-battery.png", category: "Electrical", stock: 16 },
  { id: "battery-12v", name: "Battery (12V)", price: "1,950", image: "/assets/home/part-battery.png", category: "Electrical", stock: 40 },

  // Suspension
  { id: "front-fork-assembly", name: "Front Fork Assembly", price: "3,200", image: "/assets/home/part-suspension.png", category: "Suspension", stock: 6 },
  { id: "rear-shock-absorber", name: "Rear Shock Absorber", price: "1,650", image: "/assets/home/part-suspension.png", category: "Suspension", stock: 3 },
  { id: "suspension-bush-kit", name: "Suspension Bush Kit", price: "280", image: "/assets/home/part-suspension.png", category: "Suspension", stock: 28 },
  { id: "fork-oil-seal-kit", name: "Fork Oil Seal Kit", price: "320", image: "/assets/home/part-suspension.png", category: "Suspension", stock: 11 },

  // Body Parts
  { id: "side-fairing-panel", name: "Side Fairing Panel", price: "2,100", image: "/assets/home/part-body.png", category: "Body Parts", stock: 30 },
  { id: "fuel-tank-cover", name: "Fuel Tank Cover", price: "1,450", image: "/assets/home/part-body.png", category: "Body Parts", stock: 12 },
  { id: "mudguard-set", name: "Mudguard Set", price: "650", image: "/assets/home/part-body.png", category: "Body Parts", stock: 21 },
  { id: "side-panel-set", name: "Side Panel Set", price: "980", image: "/assets/home/part-body.png", category: "Body Parts", stock: 6 },

  // Tyres & Wheels
  { id: "front-tyre-tubeless", name: "Front Tyre (Tubeless)", price: "2,450", image: "/assets/home/part-tyres.png", category: "Tyres & Wheels", stock: 31 },
  { id: "rear-tyre-tubeless", name: "Rear Tyre (Tubeless)", price: "2,750", image: "/assets/home/part-tyres.png", category: "Tyres & Wheels", stock: 18 },
  { id: "alloy-wheel-rim", name: "Alloy Wheel Rim", price: "3,800", image: "/assets/home/part-tyres.png", category: "Tyres & Wheels", stock: 17 },
  { id: "wheel-bearing-kit", name: "Wheel Bearing Kit", price: "380", image: "/assets/home/part-tyres.png", category: "Tyres & Wheels", stock: 10 },

  // Fuel System
  { id: "throttle-body", name: "Throttle Body", price: "1,450", image: "/assets/home/part-fuel.png", category: "Fuel System", stock: 34 },
  { id: "fuel-pump-assembly", name: "Fuel Pump Assembly", price: "1,650", image: "/assets/home/part-fuel.png", category: "Fuel System", stock: 11 },
  { id: "carburetor-kit", name: "Carburetor Kit", price: "1,450", image: "/assets/home/part-fuel.png", category: "Fuel System", stock: 13 },
  { id: "fuel-filter", name: "Fuel Filter", price: "220", image: "/assets/home/part-fuel.png", category: "Fuel System", stock: 20 },

  // Lighting
  { id: "led-headlight-assembly", name: "LED Headlight Assembly", price: "1,850", image: "/assets/home/part-body.png", category: "Lighting", stock: 38 },
  { id: "tail-light-assembly", name: "Tail Light Assembly", price: "420", image: "/assets/home/part-body.png", category: "Lighting", stock: 19 },
  { id: "turn-indicator-set", name: "Turn Indicator Set", price: "350", image: "/assets/home/part-body.png", category: "Lighting", stock: 15 },

  // Seat & Comfort
  { id: "seat-assembly", name: "Seat Assembly", price: "1,650", image: "/assets/home/part-body.png", category: "Seat & Comfort", stock: 11 },
  { id: "seat-foam-cushion", name: "Seat Foam Cushion", price: "580", image: "/assets/home/part-body.png", category: "Seat & Comfort", stock: 30 },
  { id: "grab-rail", name: "Grab Rail", price: "450", image: "/assets/home/part-body.png", category: "Seat & Comfort", stock: 10 },

  // Handlebar & Controls
  { id: "handlebar-grip-set", name: "Handlebar Grip Set", price: "280", image: "/assets/home/part-body.png", category: "Handlebar & Controls", stock: 40 },
  { id: "clutch-lever-assembly", name: "Clutch Lever Assembly", price: "420", image: "/assets/home/part-body.png", category: "Handlebar & Controls", stock: 14 },
  { id: "side-mirror-set", name: "Side Mirror Set", price: "650", image: "/assets/home/part-body.png", category: "Handlebar & Controls", stock: 31 },
  { id: "throttle-cable", name: "Throttle Cable", price: "180", image: "/assets/home/part-body.png", category: "Handlebar & Controls", stock: 31 },

  // Chain & Sprocket
  { id: "drive-chain-428h", name: "Drive Chain (428H)", price: "950", image: "/assets/home/part-transmission.png", category: "Chain & Sprocket", stock: 40 },
  { id: "rear-sprocket", name: "Rear Sprocket", price: "650", image: "/assets/home/part-transmission.png", category: "Chain & Sprocket", stock: 19 },
  { id: "front-sprocket-14t", name: "Front Sprocket (14T)", price: "350", image: "/assets/home/part-transmission.png", category: "Chain & Sprocket", stock: 28 },
  { id: "chain-sprocket-kit", name: "Chain Sprocket Kit", price: "1,650", image: "/assets/home/part-transmission.png", category: "Chain & Sprocket", stock: 25 },

  // Exhaust System
  { id: "exhaust-muffler", name: "Exhaust Muffler", price: "3,200", image: "/assets/home/part-engine.png", category: "Exhaust System", stock: 13 },
  { id: "exhaust-pipe-header", name: "Exhaust Pipe (Header)", price: "1,850", image: "/assets/home/part-engine.png", category: "Exhaust System", stock: 10 },
  { id: "exhaust-gasket-kit", name: "Exhaust Gasket Kit", price: "180", image: "/assets/home/part-engine.png", category: "Exhaust System", stock: 6 },
];
