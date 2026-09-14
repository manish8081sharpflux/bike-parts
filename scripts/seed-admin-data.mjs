// Seeds realistic Products, Customers, and Orders (with items + status-history
// events) into the database so the admin Dashboard/Orders/Products/Customers
// pages all have real data to check against instead of empty tables. Safe to
// re-run — products upsert by slug, customers upsert by phone, and seeded
// orders (tagged via razorpayOrderId) are deleted and recreated fresh each
// run so the data stays consistent.
//
// Usage: npm run db:seed

import { PrismaClient } from "@prisma/client";

try {
  process.loadEnvFile(".env.local");
} catch {
  try {
    process.loadEnvFile(".env");
  } catch {
    // Rely on whatever's already in the environment.
  }
}

const prisma = new PrismaClient();

function slugify(name) {
  return (
    name
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/(^-|-$)/g, "") || "part"
  );
}

const products = [
  {
    name: "Cylinder Kit",
    brand: "Honda",
    category: "Engine",
    description:
      "High-quality cylinder kit designed for Honda Activa 6G / 125. Ensures superior performance, durability, and smooth engine operation. Manufactured to OEM standards with precision fitment.",
    price: 2450,
    stock: 14,
    imageUrl: "/assets/home/part-engine.png",
    images: ["/assets/home/part-engine.png", "/assets/home/part-cooling.png"],
    sku: "HRO-CK-1024",
    material: "Aluminum Alloy",
    finish: "Matte Black",
    packIncludes: "1 Cylinder, 1 Piston, 1 Piston Pin, Piston Rings (Set)",
    weightKg: 0.45,
    warrantyMonths: 6,
    countryOfOrigin: "India",
    deliveryDaysMin: 2,
    deliveryDaysMax: 3,
    offerLabel: "OEM QUALITY ASSURED",
    compatibleModels: ["Activa 6G", "Activa 125", "Dio"],
    status: "ACTIVE",
  },
  {
    name: "Front Brake Disc Rotor",
    brand: "Hero",
    category: "Brake System",
    description:
      "Precision-machined front disc rotor for Hero commuter and sport bikes. Consistent braking performance with corrosion-resistant coating.",
    price: 1250,
    stock: 22,
    imageUrl: "/assets/home/part-brake.png",
    images: ["/assets/home/part-brake.png"],
    sku: "HER-BD-2201",
    material: "Stainless Steel",
    finish: "Brushed Silver",
    packIncludes: "1 Disc Rotor, Mounting Bolts (Set)",
    weightKg: 0.62,
    warrantyMonths: 12,
    countryOfOrigin: "India",
    deliveryDaysMin: 2,
    deliveryDaysMax: 4,
    offerLabel: "20% OFF ON SERVICE KITS",
    compatibleModels: ["Splendor Plus", "HF Deluxe", "Passion Pro"],
    status: "ACTIVE",
  },
  {
    name: "Voltage Regulator",
    brand: "TVS",
    category: "Electrical",
    description:
      "OEM-spec voltage regulator rectifier for stable charging output. Prevents battery overcharge and protects the wiring harness.",
    price: 850,
    stock: 3,
    imageUrl: "/assets/home/part-battery.png",
    images: ["/assets/home/part-battery.png"],
    sku: "TVS-VR-0450",
    material: "Aluminum Housing",
    finish: "Silver",
    packIncludes: "1 Voltage Regulator, Wiring Connector",
    weightKg: 0.18,
    warrantyMonths: 6,
    countryOfOrigin: "India",
    deliveryDaysMin: 3,
    deliveryDaysMax: 5,
    offerLabel: "FREE FITMENT CHECK",
    compatibleModels: ["Apache RTR 160", "Apache RTR 200", "Jupiter"],
    status: "ACTIVE",
  },
  {
    name: "Rear Shock Absorber",
    brand: "Bajaj",
    category: "Suspension",
    description:
      "Adjustable rear mono-shock absorber for a firmer, more responsive ride. Preload adjustable for rider weight and road conditions.",
    price: 1650,
    stock: 9,
    imageUrl: "/assets/home/part-suspension.png",
    images: ["/assets/home/part-suspension.png"],
    sku: "BAJ-RS-3390",
    material: "Steel & Gas-Charged Canister",
    finish: "Black / Red Spring",
    packIncludes: "1 Rear Shock Absorber, Mounting Hardware",
    weightKg: 1.1,
    warrantyMonths: 12,
    countryOfOrigin: "India",
    deliveryDaysMin: 3,
    deliveryDaysMax: 4,
    offerLabel: "OEM QUALITY ASSURED",
    compatibleModels: ["Pulsar 150", "Pulsar NS200", "Dominar 250"],
    status: "ACTIVE",
  },
  {
    name: "Side Fairing Panel",
    brand: "Yamaha",
    category: "Body Parts",
    description:
      "Direct-fit side fairing panel with factory-matched finish. Impact-resistant ABS plastic construction.",
    price: 2100,
    stock: 6,
    imageUrl: "/assets/home/part-body.png",
    images: ["/assets/home/part-body.png"],
    sku: "YAM-SF-1187",
    material: "ABS Plastic",
    finish: "Racing Blue",
    packIncludes: "1 Side Fairing Panel, Clips (Set)",
    weightKg: 0.35,
    warrantyMonths: 3,
    countryOfOrigin: "India",
    deliveryDaysMin: 4,
    deliveryDaysMax: 6,
    offerLabel: "FREE FITMENT CHECK",
    compatibleModels: ["R15 V4", "MT 15"],
    status: "ACTIVE",
  },
  {
    name: "Front Tyre (Tubeless)",
    brand: "Royal Enfield",
    category: "Tyres & Wheels",
    description:
      "Tubeless front tyre engineered for stability and grip across wet and dry surfaces. DOT-approved tread compound.",
    price: 2450,
    stock: 18,
    imageUrl: "/assets/home/part-tyres.png",
    images: ["/assets/home/part-tyres.png"],
    sku: "RE-FT-9002",
    material: "Rubber Compound",
    finish: "Black",
    packIncludes: "1 Tubeless Tyre",
    weightKg: 4.2,
    warrantyMonths: 24,
    countryOfOrigin: "India",
    deliveryDaysMin: 2,
    deliveryDaysMax: 3,
    offerLabel: "20% OFF ON SERVICE KITS",
    compatibleModels: ["Classic 350", "Hunter 350", "Meteor 350"],
    status: "ACTIVE",
  },
  {
    name: "Carburetor Kit",
    brand: "Suzuki",
    category: "Fuel System",
    description:
      "Complete carburetor rebuild kit for smoother idling and improved fuel efficiency. Includes all wear-prone internals.",
    price: 1450,
    stock: 11,
    imageUrl: "/assets/home/part-fuel.png",
    images: ["/assets/home/part-fuel.png"],
    sku: "SUZ-CB-6620",
    material: "Brass & Zinc Alloy",
    finish: "Natural Metal",
    packIncludes: "Float Valve, Jets (Set), Gaskets, O-Rings",
    weightKg: 0.4,
    warrantyMonths: 6,
    countryOfOrigin: "India",
    deliveryDaysMin: 3,
    deliveryDaysMax: 5,
    offerLabel: "FREE FITMENT CHECK",
    compatibleModels: ["Gixxer", "Gixxer SF", "Access 125"],
    status: "ACTIVE",
  },
  {
    name: "Drive Chain (428H)",
    brand: "KTM",
    category: "Chain & Sprocket",
    description:
      "Heavy-duty 428H drive chain with sealed O-rings for extended service life under high-performance riding.",
    price: 950,
    stock: 27,
    imageUrl: "/assets/home/part-transmission.png",
    images: ["/assets/home/part-transmission.png"],
    sku: "KTM-DC-4280",
    material: "Hardened Steel",
    finish: "Gold / Black",
    packIncludes: "1 Chain (120 links), Master Link",
    weightKg: 1.3,
    warrantyMonths: 12,
    countryOfOrigin: "India",
    deliveryDaysMin: 2,
    deliveryDaysMax: 3,
    offerLabel: "OEM QUALITY ASSURED",
    compatibleModels: ["Duke 125", "Duke 200", "RC 200"],
    status: "ACTIVE",
  },
  {
    name: "Air Filter",
    brand: "Jawa",
    category: "Engine",
    description:
      "High-flow air filter for cleaner intake and consistent throttle response. Washable and reusable design.",
    price: 320,
    stock: 40,
    imageUrl: "/assets/home/part-filters.png",
    images: ["/assets/home/part-filters.png"],
    sku: "JWA-AF-0087",
    material: "Cotton Gauze",
    finish: "Red",
    packIncludes: "1 Air Filter Element",
    weightKg: 0.12,
    warrantyMonths: 6,
    countryOfOrigin: "India",
    deliveryDaysMin: 2,
    deliveryDaysMax: 3,
    offerLabel: "20% OFF ON SERVICE KITS",
    compatibleModels: ["Jawa 42", "Jawa Classic", "Perak"],
    status: "ACTIVE",
  },
  {
    name: "Side Mirror Set",
    brand: "Aprilia",
    category: "Handlebar & Controls",
    description:
      "Aerodynamic side mirror set with wide-angle glass for improved rear visibility. Vibration-dampened mount.",
    price: 650,
    stock: 15,
    imageUrl: "/assets/home/part-body.png",
    images: ["/assets/home/part-body.png"],
    sku: "APR-SM-0231",
    material: "ABS Plastic & Glass",
    finish: "Gloss Black",
    packIncludes: "2 Mirrors (Left + Right)",
    weightKg: 0.22,
    warrantyMonths: 6,
    countryOfOrigin: "India",
    deliveryDaysMin: 3,
    deliveryDaysMax: 5,
    offerLabel: "FREE FITMENT CHECK",
    compatibleModels: ["SR 160", "SXR 160"],
    status: "ACTIVE",
  },
  {
    name: "Exhaust Muffler",
    brand: "Kawasaki",
    category: "Exhaust System",
    description:
      "Performance exhaust muffler with a deeper tone and improved mid-range power. Ceramic-coated for heat resistance.",
    price: 3200,
    stock: 4,
    imageUrl: "/assets/home/part-engine.png",
    images: ["/assets/home/part-engine.png"],
    sku: "KAW-EM-7710",
    material: "Stainless Steel",
    finish: "Brushed Chrome",
    packIncludes: "1 Muffler, Gasket, Mounting Bracket",
    weightKg: 2.1,
    warrantyMonths: 12,
    countryOfOrigin: "India",
    deliveryDaysMin: 4,
    deliveryDaysMax: 6,
    offerLabel: "OEM QUALITY ASSURED",
    compatibleModels: ["Ninja 300", "Ninja 400", "Z650"],
    status: "ACTIVE",
  },
  {
    name: "LED Headlight Assembly",
    brand: "BMW",
    category: "Lighting",
    description:
      "Full-LED headlight assembly with DRL ring for a modern look and stronger night-time visibility. Plug-and-play harness.",
    price: 1850,
    stock: 0,
    imageUrl: "/assets/home/part-body.png",
    images: ["/assets/home/part-body.png"],
    sku: "BMW-LH-5501",
    material: "Polycarbonate Lens",
    finish: "Clear / Black Housing",
    packIncludes: "1 Headlight Assembly, Wiring Harness",
    weightKg: 0.85,
    warrantyMonths: 12,
    countryOfOrigin: "Germany",
    deliveryDaysMin: 5,
    deliveryDaysMax: 7,
    offerLabel: "FREE FITMENT CHECK",
    compatibleModels: ["G 310 R", "G 310 GS"],
    status: "DRAFT",
  },
];

const hoursAgo = (h) => new Date(Date.now() - h * 60 * 60 * 1000);

// The "self-registered" customers here share phone numbers with the order
// seeds below, so each order gets a real buyerId — standing in for a
// customer who signed up / checked out on the storefront themselves (see
// prisma.user.upsert in app/api/checkout/route.ts, the real code path this
// mirrors). The last three have no matching order and addedByAdmin: true —
// standing in for a customer an admin added by hand (e.g. a phone order).
// Starting stock for the storefront catalog (see lib/storefront-catalog.ts,
// the single source of truth this mirrors — ids/names must match exactly).
// Seeds the ProductStock table checkout atomically reserves against. One
// item (rear-shock-absorber) is deliberately seeded at stock: 1 so the
// last-unit race-condition scenario is easy to reproduce for testing.
const storefrontStockSeeds = [
  { id: "cylinder-kit", name: "Cylinder Kit", stock: 18 },
  { id: "piston-kit", name: "Piston Kit", stock: 19 },
  { id: "engine-gasket-set", name: "Engine Gasket Set", stock: 22 },
  { id: "air-filter", name: "Air Filter", stock: 22 },
  { id: "spark-plug-ngk", name: "Spark Plug (NGK)", stock: 30 },
  { id: "engine-oil-filter", name: "Engine Oil Filter", stock: 21 },
  { id: "crankshaft-assembly", name: "Crankshaft Assembly", stock: 35 },
  { id: "engine-valve-set", name: "Engine Valve Set", stock: 39 },
  { id: "rocker-arm", name: "Rocker Arm", stock: 26 },
  { id: "engine-mount", name: "Engine Mount", stock: 25 },
  { id: "timing-chain-guide", name: "Timing Chain Guide", stock: 34 },
  { id: "clutch-plate-set", name: "Clutch Plate Set", stock: 6 },
  { id: "cam-chain", name: "Cam Chain", stock: 32 },
  { id: "oil-pump", name: "Oil Pump", stock: 24 },
  { id: "connecting-rod-kit", name: "Connecting Rod Kit", stock: 24 },
  { id: "engine-bolt-set", name: "Engine Bolt Set", stock: 6 },
  { id: "oil-seal-set", name: "Oil Seal Set", stock: 30 },
  { id: "cylinder-head", name: "Cylinder Head", stock: 16 },
  { id: "push-rod", name: "Push Rod", stock: 23 },
  { id: "valve-spring-set", name: "Valve Spring Set", stock: 30 },
  { id: "camshaft", name: "Camshaft", stock: 6 },
  { id: "front-disc-rotor", name: "Front Disc Rotor", stock: 35 },
  { id: "brake-caliper-assembly", name: "Brake Caliper Assembly", stock: 6 },
  { id: "brake-pads-front", name: "Brake Pads (Front)", stock: 29 },
  { id: "brake-master-cylinder", name: "Brake Master Cylinder", stock: 30 },
  { id: "brake-lever-set", name: "Brake Lever Set", stock: 40 },
  { id: "starter-motor", name: "Starter Motor", stock: 14 },
  { id: "magneto-coil", name: "Magneto Coil", stock: 40 },
  { id: "voltage-regulator", name: "Voltage Regulator", stock: 35 },
  { id: "wiring-harness", name: "Wiring Harness", stock: 16 },
  { id: "battery-12v", name: "Battery (12V)", stock: 40 },
  { id: "front-fork-assembly", name: "Front Fork Assembly", stock: 6 },
  { id: "rear-shock-absorber", name: "Rear Shock Absorber", stock: 1 },
  { id: "suspension-bush-kit", name: "Suspension Bush Kit", stock: 28 },
  { id: "fork-oil-seal-kit", name: "Fork Oil Seal Kit", stock: 11 },
  { id: "side-fairing-panel", name: "Side Fairing Panel", stock: 30 },
  { id: "fuel-tank-cover", name: "Fuel Tank Cover", stock: 12 },
  { id: "mudguard-set", name: "Mudguard Set", stock: 21 },
  { id: "side-panel-set", name: "Side Panel Set", stock: 6 },
  { id: "front-tyre-tubeless", name: "Front Tyre (Tubeless)", stock: 31 },
  { id: "rear-tyre-tubeless", name: "Rear Tyre (Tubeless)", stock: 18 },
  { id: "alloy-wheel-rim", name: "Alloy Wheel Rim", stock: 17 },
  { id: "wheel-bearing-kit", name: "Wheel Bearing Kit", stock: 10 },
  { id: "throttle-body", name: "Throttle Body", stock: 34 },
  { id: "fuel-pump-assembly", name: "Fuel Pump Assembly", stock: 11 },
  { id: "carburetor-kit", name: "Carburetor Kit", stock: 13 },
  { id: "fuel-filter", name: "Fuel Filter", stock: 20 },
  { id: "led-headlight-assembly", name: "LED Headlight Assembly", stock: 38 },
  { id: "tail-light-assembly", name: "Tail Light Assembly", stock: 19 },
  { id: "turn-indicator-set", name: "Turn Indicator Set", stock: 15 },
  { id: "seat-assembly", name: "Seat Assembly", stock: 11 },
  { id: "seat-foam-cushion", name: "Seat Foam Cushion", stock: 30 },
  { id: "grab-rail", name: "Grab Rail", stock: 10 },
  { id: "handlebar-grip-set", name: "Handlebar Grip Set", stock: 40 },
  { id: "clutch-lever-assembly", name: "Clutch Lever Assembly", stock: 14 },
  { id: "side-mirror-set", name: "Side Mirror Set", stock: 31 },
  { id: "throttle-cable", name: "Throttle Cable", stock: 31 },
  { id: "drive-chain-428h", name: "Drive Chain (428H)", stock: 40 },
  { id: "rear-sprocket", name: "Rear Sprocket", stock: 19 },
  { id: "front-sprocket-14t", name: "Front Sprocket (14T)", stock: 28 },
  { id: "chain-sprocket-kit", name: "Chain Sprocket Kit", stock: 25 },
  { id: "exhaust-muffler", name: "Exhaust Muffler", stock: 13 },
  { id: "exhaust-pipe-header", name: "Exhaust Pipe (Header)", stock: 10 },
  { id: "exhaust-gasket-kit", name: "Exhaust Gasket Kit", stock: 6 },
];

const customerSeeds = [
  { name: "Manish Prasad", phone: "9876500001", addedByAdmin: false },
  { name: "Priya Singh", phone: "9876500002", addedByAdmin: false },
  { name: "Ravi Kumar", phone: "9876500003", addedByAdmin: false },
  { name: "Ankita Verma", phone: "9876500004", addedByAdmin: false },
  { name: "Suresh Yadav", phone: "9876500005", addedByAdmin: false },
  { name: "Neha Sharma", phone: "9876500006", addedByAdmin: false },
  { name: "Amit Singh", phone: "9876500007", addedByAdmin: false },
  { name: "Kavita Rao", phone: "9876500008", addedByAdmin: false },
  { name: "Sanjay Mehta", phone: "9876500009", addedByAdmin: false },
  { name: "Deepak Mehra", phone: "9876500010", addedByAdmin: true },
  { name: "Anita Roy", email: "anita.roy@example.com", addedByAdmin: true },
  { name: "Vikas Chauhan", phone: "9876500011", email: "vikas.chauhan@example.com", addedByAdmin: true },
];

// Each entry's `timeline` is the status history to write as OrderEvents (oldest
// first); the order's own `status` should match the timeline's last entry.
// `dispatch` (optional) fills in the generic shipping fields as if the order
// had actually been dispatched through Shiprocket, matching what
// dispatchOrderAction/refreshDeliveryStatusAction would have written (see
// lib/shipping/service.ts).
const orderSeeds = [
  {
    marker: "seed_order_01",
    customerName: "Manish Prasad",
    customerPhone: "9876500001",
    bikeLabel: "Honda Activa 6G (2024)",
    address: {
      label: "Home",
      contactName: "Manish Prasad",
      flatNo: "H.No. 102",
      area: "Boring Road",
      landmark: "Patna Junction",
      city: "Patna",
      pincode: "800001",
    },
    items: [
      { productName: "Cylinder Kit", quantity: 1 },
      { productName: "Air Filter", quantity: 1 },
    ],
    deliveryCharge: 0,
    discount: 50,
    status: "DELIVERED",
    paymentStatus: "PAID",
    placedHoursAgo: 148,
    timeline: [
      { status: "PENDING", hoursAgo: 148, message: "Order placed." },
      { status: "PAID", hoursAgo: 147.8, message: "Status changed to PAID" },
      { status: "PACKED", hoursAgo: 140, message: "Status changed to PACKED" },
      { status: "SHIPPED", hoursAgo: 120, message: "Status changed to SHIPPED" },
      { status: "OUT_FOR_DELIVERY", hoursAgo: 100, message: "Status changed to OUT_FOR_DELIVERY" },
      { status: "DELIVERED", hoursAgo: 96, message: "Status changed to DELIVERED" },
    ],
    dispatch: { status: "delivered", trackingUrl: "https://shiprocket.co/tracking/seed_order_01" },
  },
  {
    marker: "seed_order_02",
    customerName: "Priya Singh",
    customerPhone: "9876500002",
    bikeLabel: "Hero Splendor Plus (2023)",
    address: {
      label: "Home",
      contactName: "Priya Singh",
      flatNo: "Flat 4B, Sunrise Apartments",
      area: "Karol Bagh",
      city: "Delhi",
      pincode: "110005",
    },
    items: [{ productName: "Front Brake Disc Rotor", quantity: 1 }],
    deliveryCharge: 50,
    discount: 0,
    status: "OUT_FOR_DELIVERY",
    paymentStatus: "PAID",
    placedHoursAgo: 30,
    timeline: [
      { status: "PENDING", hoursAgo: 30, message: "Order placed." },
      { status: "PAID", hoursAgo: 29.9, message: "Status changed to PAID" },
      { status: "PACKED", hoursAgo: 24, message: "Status changed to PACKED" },
      { status: "SHIPPED", hoursAgo: 12, message: "Status changed to SHIPPED" },
      { status: "OUT_FOR_DELIVERY", hoursAgo: 2, message: "Status changed to OUT_FOR_DELIVERY" },
    ],
    dispatch: { status: "out_for_delivery", trackingUrl: "https://shiprocket.co/tracking/seed_order_02" },
  },
  {
    marker: "seed_order_03",
    customerName: "Ravi Kumar",
    customerPhone: "9876500003",
    bikeLabel: "Suzuki Gixxer (2024)",
    address: {
      label: "Shop",
      contactName: "Ravi Kumar",
      flatNo: "ASP Tower, 3rd Floor",
      area: "Frazer Road",
      city: "Patna",
      pincode: "800001",
    },
    items: [{ productName: "Carburetor Kit", quantity: 1 }],
    deliveryCharge: 0,
    discount: 0,
    status: "PACKED",
    paymentStatus: "PAID",
    placedHoursAgo: 12,
    timeline: [
      { status: "PENDING", hoursAgo: 12, message: "Order placed." },
      { status: "PAID", hoursAgo: 11.9, message: "Status changed to PAID" },
      { status: "PACKED", hoursAgo: 3, message: "Status changed to PACKED" },
    ],
  },
  {
    marker: "seed_order_04",
    customerName: "Ankita Verma",
    customerPhone: "9876500004",
    bikeLabel: "KTM Duke 200 (2024)",
    address: {
      label: "Home",
      contactName: "Ankita Verma",
      flatNo: "B-12, Lokhandwala Complex",
      area: "Andheri West",
      city: "Mumbai",
      pincode: "400053",
    },
    items: [{ productName: "Drive Chain (428H)", quantity: 1 }],
    deliveryCharge: 50,
    discount: 0,
    status: "PENDING",
    paymentStatus: "PENDING",
    placedHoursAgo: 2,
    timeline: [{ status: "PENDING", hoursAgo: 2, message: "Order placed." }],
  },
  {
    marker: "seed_order_05",
    customerName: "Suresh Yadav",
    customerPhone: "9876500005",
    bikeLabel: "BMW G 310 R (2023)",
    address: {
      label: "Home",
      contactName: "Suresh Yadav",
      flatNo: "204, Green Valley",
      area: "Koramangala",
      city: "Bengaluru",
      pincode: "560034",
    },
    items: [{ productName: "LED Headlight Assembly", quantity: 1 }],
    deliveryCharge: 0,
    discount: 0,
    status: "CANCELLED",
    paymentStatus: "FAILED",
    placedHoursAgo: 72,
    timeline: [
      { status: "PENDING", hoursAgo: 72, message: "Order placed." },
      { status: "CANCELLED", hoursAgo: 71.5, message: "Status changed to CANCELLED — Payment failed" },
    ],
  },
  {
    marker: "seed_order_06",
    customerName: "Neha Sharma",
    customerPhone: "9876500006",
    bikeLabel: "Bajaj Pulsar NS200 (2024)",
    address: {
      label: "Home",
      contactName: "Neha Sharma",
      flatNo: "H.No. 55, Shanti Vihar",
      area: "Kankarbagh",
      city: "Patna",
      pincode: "800020",
    },
    items: [
      { productName: "Rear Shock Absorber", quantity: 1 },
      { productName: "Voltage Regulator", quantity: 1 },
    ],
    deliveryCharge: 0,
    discount: 100,
    status: "SHIPPED",
    paymentStatus: "PAID",
    placedHoursAgo: 48,
    timeline: [
      { status: "PENDING", hoursAgo: 48, message: "Order placed." },
      { status: "PAID", hoursAgo: 47.8, message: "Status changed to PAID" },
      { status: "PACKED", hoursAgo: 40, message: "Status changed to PACKED" },
      { status: "SHIPPED", hoursAgo: 20, message: "Status changed to SHIPPED" },
    ],
    dispatch: { status: "in_transit", trackingUrl: "https://shiprocket.co/tracking/seed_order_06" },
  },
  {
    marker: "seed_order_07",
    customerName: "Amit Singh",
    customerPhone: "9876500007",
    bikeLabel: "Yamaha R15 V4 (2024)",
    address: {
      label: "Home",
      contactName: "Amit Singh",
      flatNo: "12, Model Town",
      area: "GT Road",
      city: "Delhi",
      pincode: "110009",
    },
    items: [{ productName: "Side Fairing Panel", quantity: 2 }],
    deliveryCharge: 0,
    discount: 0,
    status: "DELIVERED",
    paymentStatus: "PAID",
    placedHoursAgo: 192,
    timeline: [
      { status: "PENDING", hoursAgo: 192, message: "Order placed." },
      { status: "PAID", hoursAgo: 191.9, message: "Status changed to PAID" },
      { status: "PACKED", hoursAgo: 185, message: "Status changed to PACKED" },
      { status: "SHIPPED", hoursAgo: 170, message: "Status changed to SHIPPED" },
      { status: "OUT_FOR_DELIVERY", hoursAgo: 150, message: "Status changed to OUT_FOR_DELIVERY" },
      { status: "DELIVERED", hoursAgo: 146, message: "Status changed to DELIVERED" },
    ],
    dispatch: { status: "delivered", trackingUrl: "https://shiprocket.co/tracking/seed_order_07" },
  },
  {
    marker: "seed_order_08",
    customerName: "Kavita Rao",
    customerPhone: "9876500008",
    bikeLabel: "Kawasaki Ninja 300 (2023)",
    address: {
      label: "Home",
      contactName: "Kavita Rao",
      flatNo: "7, Anna Nagar",
      area: "2nd Avenue",
      city: "Chennai",
      pincode: "600040",
    },
    items: [{ productName: "Exhaust Muffler", quantity: 1 }],
    deliveryCharge: 0,
    discount: 0,
    status: "PAID",
    paymentStatus: "PAID",
    placedHoursAgo: 4,
    timeline: [
      { status: "PENDING", hoursAgo: 4, message: "Order placed." },
      { status: "PAID", hoursAgo: 3.9, message: "Status changed to PAID" },
    ],
  },
  {
    marker: "seed_order_09",
    customerName: "Sanjay Mehta",
    customerPhone: "9876500009",
    bikeLabel: "Royal Enfield Classic 350 (2024)",
    address: {
      label: "Shop",
      contactName: "Sanjay Mehta",
      flatNo: "ASP Tower, 3rd Floor",
      area: "Frazer Road",
      city: "Patna",
      pincode: "800001",
    },
    items: [
      { productName: "Side Mirror Set", quantity: 1 },
      { productName: "Air Filter", quantity: 1 },
      { productName: "Front Tyre (Tubeless)", quantity: 1 },
    ],
    deliveryCharge: 0,
    discount: 0,
    status: "DELIVERED",
    paymentStatus: "PAID",
    placedHoursAgo: 240,
    timeline: [
      { status: "PENDING", hoursAgo: 240, message: "Order placed." },
      { status: "PAID", hoursAgo: 239.9, message: "Status changed to PAID" },
      { status: "PACKED", hoursAgo: 232, message: "Status changed to PACKED" },
      { status: "SHIPPED", hoursAgo: 220, message: "Status changed to SHIPPED" },
      { status: "OUT_FOR_DELIVERY", hoursAgo: 200, message: "Status changed to OUT_FOR_DELIVERY" },
      { status: "DELIVERED", hoursAgo: 196, message: "Status changed to DELIVERED" },
    ],
    dispatch: { status: "delivered", trackingUrl: "https://shiprocket.co/tracking/seed_order_09" },
  },
];

async function main() {
  const savedProducts = new Map();

  for (const product of products) {
    const slug = slugify(product.name);
    const saved = await prisma.bikePartListing.upsert({
      where: { slug },
      update: { ...product, slug },
      create: { ...product, slug },
    });
    savedProducts.set(product.name, saved);
    console.log(`  ✓ ${product.brand.padEnd(14)} ${product.name}`);
  }
  console.log(`\nSeeded ${products.length} products.`);

  console.log("");
  for (const seed of storefrontStockSeeds) {
    await prisma.productStock.upsert({
      where: { id: seed.id },
      update: { name: seed.name, stock: seed.stock },
      create: seed,
    });
  }
  console.log(`Seeded ${storefrontStockSeeds.length} storefront stock rows (reset to starting values).`);

  console.log("");
  const customersByPhone = new Map();
  for (const customer of customerSeeds) {
    // Both phone and email are unique columns — upsert on whichever this
    // seed entry actually has, so re-running the script updates the same
    // row instead of erroring on a duplicate.
    const uniqueWhere = customer.phone ? { phone: customer.phone } : { email: customer.email };
    const saved = await prisma.user.upsert({
      where: uniqueWhere,
      update: customer,
      create: customer,
    });
    if (customer.phone) {
      customersByPhone.set(customer.phone, saved);
    }
    console.log(`  ✓ ${saved.addedByAdmin ? "Admin-added   " : "Self-registered"} ${saved.name}`);
  }
  console.log(`\nSeeded ${customerSeeds.length} customers.`);

  console.log("");
  for (const seed of orderSeeds) {
    // Re-run safety: wipe out this seed order (if it exists from a previous
    // run) and recreate it fresh, rather than trying to diff/update items
    // and events by hand.
    const existing = await prisma.order.findFirst({ where: { razorpayOrderId: seed.marker } });
    if (existing) {
      await prisma.order.delete({ where: { id: existing.id } });
    }

    const items = seed.items.map(({ productName, quantity }) => {
      const product = savedProducts.get(productName);
      if (!product) {
        throw new Error(`Seed order ${seed.marker} references unknown product "${productName}"`);
      }
      return {
        listingId: product.id,
        productName: product.name,
        productImage: product.imageUrl,
        quantity,
        unitPrice: product.price,
      };
    });

    const itemsTotal = items.reduce((sum, item) => sum + Number(item.unitPrice) * item.quantity, 0);
    const taxAmount = 0;
    const amount = itemsTotal + taxAmount + seed.deliveryCharge - seed.discount;

    const order = await prisma.order.create({
      data: {
        buyerId: customersByPhone.get(seed.customerPhone)?.id ?? null,
        customerName: seed.customerName,
        customerPhone: seed.customerPhone,
        status: seed.status,
        paymentStatus: seed.paymentStatus,
        itemsTotal,
        taxAmount,
        deliveryCharge: seed.deliveryCharge,
        discount: seed.discount,
        amount,
        deliveryAddress: seed.address,
        bikeLabel: seed.bikeLabel,
        razorpayOrderId: seed.marker,
        razorpayPaymentId: seed.paymentStatus === "PAID" ? `${seed.marker}_pay` : null,
        shippingProvider: seed.dispatch ? "SHIPROCKET" : null,
        shippingOrderId: seed.dispatch ? `${seed.marker}_order` : null,
        shippingShipmentId: seed.dispatch ? `${seed.marker}_shipment` : null,
        shippingAwbCode: seed.dispatch ? `${seed.marker}_awb` : null,
        shippingCourierName: seed.dispatch ? "Delhivery" : null,
        shippingStatus: seed.dispatch?.status ?? null,
        shippingTrackingUrl: seed.dispatch?.trackingUrl ?? null,
        createdAt: hoursAgo(seed.placedHoursAgo),
        items: { create: items },
        events: {
          create: seed.timeline.map((step) => ({
            type: step.status === "PENDING" && step === seed.timeline[0] ? "ORDER_PLACED" : "STATUS_CHANGE",
            message: step.message,
            createdAt: hoursAgo(step.hoursAgo),
          })),
        },
      },
    });

    console.log(`  ✓ ${order.customerName.padEnd(16)} ${seed.status.padEnd(16)} ${items.length} item(s)`);
  }
  console.log(`\nSeeded ${orderSeeds.length} orders.`);
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
