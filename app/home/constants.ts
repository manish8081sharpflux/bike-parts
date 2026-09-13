// Static/derived data for the customer storefront — brand & category
// catalogs, price/sort filter options, seed addresses, order-status display
// metadata, etc. Extracted from the former monolithic home-client.tsx.
import type { LucideIcon } from "lucide-react";
import { Bike, Building2, CheckCircle2, CircleDot, Clock, Cog, Disc3, Droplet, Filter, Gauge, Home as HomeIcon, MapPin, Plus, Search, Star, Store, Truck, Wrench, X, XCircle, Zap } from "lucide-react";
import type { Product } from "@/lib/storefront-catalog";
import type { Address, BikeHotspot, OrderStatus } from "./types";
import { parsePrice } from "./format";

export const brands = [
  {
    name: "Honda",
    logo: "HONDA",
    modalLogo: "HONDA",
    tagline: "The Power of Dreams",
    color: "text-red-600",
    image: "/assets/home/bike-honda.png",
    card: "/complete_bike_brand_cards/card-honda.png",
  },
  {
    name: "Hero",
    logo: "Hero",
    modalLogo: "Hero",
    tagline: "Make New Tracks",
    color: "text-red-600",
    image: "/assets/home/bike-hero.png",
    card: "/complete_bike_brand_cards/card-hero.png",
  },
  {
    name: "TVS",
    logo: "TVS",
    modalLogo: "TVS",
    tagline: "Racing DNA Unleashed",
    color: "text-blue-800",
    image: "/assets/home/bike-tvs.png",
    card: "/complete_bike_brand_cards/card-tvs.png",
  },
  {
    name: "Bajaj",
    logo: "BAJAJ",
    modalLogo: "BAJAJ",
    tagline: "World's Favourite Indian",
    color: "text-blue-700",
    image: "/assets/home/bike-bajaj.png",
    card: "/complete_bike_brand_cards/card-bajaj.png",
  },
  {
    name: "Yamaha",
    logo: "YAMAHA",
    modalLogo: "YAMAHA",
    tagline: "Revs Your Heart",
    color: "text-red-600",
    image: "/assets/home/bike-yamaha.png",
    card: "/complete_bike_brand_cards/card-yamaha.png",
  },
  {
    name: "Royal Enfield",
    logo: "Royal Enfield",
    modalLogo: "Royal Enfield",
    tagline: "Pure Motorcycling",
    color: "text-orange-700",
    image: "/assets/home/bike-royal-enfield.png",
    card: "/complete_bike_brand_cards/card-royal-enfield.png",
  },
  {
    name: "Suzuki",
    logo: "SUZUKI",
    modalLogo: "SUZUKI",
    tagline: "Way of Life",
    color: "text-blue-700",
    image: "/assets/home/bike-suzuki.png",
    card: "/complete_bike_brand_cards/card-suzuki.png",
  },
  {
    name: "KTM",
    logo: "KTM",
    modalLogo: "KTM",
    tagline: "Ready To Race",
    color: "text-orange-600",
    image: "/assets/home/bike-bajaj.png",
    card: "/complete_bike_brand_cards/card-ktm.png",
  },
  {
    name: "Jawa",
    logo: "JAWA",
    modalLogo: "JAWA",
    tagline: "Forever Heroes",
    color: "text-red-700",
    image: "/assets/home/bike-royal-enfield.png",
    card: "/complete_bike_brand_cards/card-jawa.png",
  },
  {
    name: "Aprilia",
    logo: "aprilia",
    modalLogo: "aprilia",
    tagline: "Be A Racer",
    color: "text-red-600",
    image: "/assets/home/bike-yamaha.png",
    card: "/complete_bike_brand_cards/card-aprilia.png",
  },
  {
    name: "Kawasaki",
    logo: "Kawasaki",
    modalLogo: "Kawasaki",
    tagline: "Let The Good Times Roll",
    color: "text-zinc-950",
    image: "/assets/home/bike-tvs.png",
    card: "/complete_bike_brand_cards/card-kawasaki.png",
  },
  {
    name: "BMW",
    logo: "BMW",
    modalLogo: "BMW",
    tagline: "Make Life A Ride",
    color: "text-zinc-950",
    image: "/assets/home/bike-suzuki.png",
    card: "/complete_bike_brand_cards/card-bmw.png",
  },
];

// Curated left-to-right order for the "Choose Your Bike Brand" fan carousel —
// performance/premium marques fanned out on one side, mainstream commuter
// brands centered on Honda, heritage/global brands on the other side.

export const brandCarouselOrder = [
  "KTM",
  "Suzuki",
  "Royal Enfield",
  "Yamaha",
  "Honda",
  "Hero",
  "TVS",
  "Bajaj",
  "Jawa",
  "Aprilia",
  "Kawasaki",
  "BMW",
];

export const carouselBrands = brandCarouselOrder.map(
  (name) => brands.find((brand) => brand.name === name)!
);

export const initialCarouselBrandIndex = brandCarouselOrder.indexOf("Honda");


export const categories = [
  {
    title: "Engine Parts",
    detail: "Piston | Cylinder | Crankshaft | Camshaft",
    image: "/assets/home/part-engine.png",
  },
  {
    title: "Brake Parts",
    detail: "Disc Rotor | Caliper | Master Cylinder | ABS",
    image: "/assets/home/part-brake.png",
  },
  {
    title: "Electrical Parts",
    detail: "ECU | Stator | Wiring Harness | Rectifier",
    image: "/assets/home/part-fuel.png",
  },
  {
    title: "Filters",
    detail: "Air Filter | Oil Filter | Service Kit",
    image: "/assets/home/part-filters.png",
  },
  {
    title: "Suspension",
    detail: "Front Fork | Rear Shock | Seal Kit",
    image: "/assets/home/part-suspension.png",
  },
  {
    title: "Transmission",
    detail: "Clutch Assembly | Gear Set | Sprocket",
    image: "/assets/home/part-transmission.png",
  },
  {
    title: "Body Parts",
    detail: "Headlight | Tail Light | Fairing | Panels",
    image: "/assets/home/part-body.png",
  },
  {
    title: "Tyres & Wheels",
    detail: "Alloy Wheels | Wheel Hub | Bearing Kit",
    image: "/assets/home/part-tyres.png",
  },
  {
    title: "Lubricants",
    detail: "Engine Oil | Coolant | Chain Lube",
    image: "/assets/home/part-lubricants.png",
  },
  {
    title: "Accessories",
    detail: "Helmet | Guards | Mirrors | Covers",
    image: "/assets/home/part-helmet.png",
  },
];


export const headerCategories = [
  "All Categories",
  "Engine Parts",
  "Brake Parts",
  "Electrical Parts",
  "Suspension",
  "Body Parts",
  "Tyres & Wheels",
  "Lubricants",
  "Accessories",
];

// Curated part-type names shown in each header category's dropdown — a
// fixed taxonomy, not "whatever happens to be in stock right now" (which is
// what filtering the live `products` list would give, and could be sparse
// or empty for a category depending on what's seeded). Clicking one runs it
// as a search (see handleSelectCategoryPartType in home-client.tsx), so it
// still surfaces real matching products if any exist.
export const categoryPartTypes: Record<string, string[]> = {
  "Engine Parts": ["Air Filter", "Oil Filter", "Piston Kit", "Cylinder Kit", "Clutch Plate", "Timing Chain"],
  "Brake Parts": ["Brake Pads", "Brake Shoes", "Brake Disc", "Brake Caliper", "Brake Cable", "Brake Master Cylinder"],
  "Electrical Parts": ["Battery", "Spark Plug", "Wiring Harness", "Voltage Regulator", "Starter Motor", "Ignition Coil"],
  Suspension: ["Front Fork", "Rear Shock Absorber", "Suspension Spring", "Fork Oil Seal", "Suspension Bush", "Swing Arm"],
  "Body Parts": ["Side Fairing", "Fuel Tank Cover", "Mudguard", "Seat Cover", "Side Panel", "Headlight Fairing"],
  "Tyres & Wheels": ["Front Tyre", "Rear Tyre", "Alloy Wheel", "Wheel Bearing", "Spoke Wheel", "Tyre Tube"],
  Lubricants: ["Engine Oil", "Chain Lube", "Coolant", "Grease", "Fork Oil", "Brake Fluid"],
  Accessories: ["Helmet", "Riding Gloves", "Mobile Holder", "Side Mirror", "Bike Cover", "Saddle Bag"],
};

// Maps each homepage category tile to how the catalog should be filtered
// once the user picks a bike: an exact `category` match (see the `category`
// field on `products`) where one exists 1:1, otherwise a keyword `query`.

export const homeCategoryFilters: Record<string, { category?: string; query?: string }> = {
  "Engine Parts": { category: "Engine" },
  "Brake Parts": { category: "Brake System" },
  "Electrical Parts": { category: "Electrical" },
  Filters: { query: "filter" },
  Suspension: { category: "Suspension" },
  Transmission: { category: "Chain & Sprocket" },
  "Body Parts": { category: "Body Parts" },
  "Tyres & Wheels": { category: "Tyres & Wheels" },
  Lubricants: { query: "oil" },
  Accessories: { category: "Handlebar & Controls" },
};


export const searchPlaceholders = [
  "Search engine oil for Royal Enfield...",
  "Search brake pads by OEM number...",
  "Search Honda Activa service kit...",
  "Search Yamaha R15 clutch plate...",
  "Search tyres, helmets, filters...",
];


export const brandModels = {
  Honda: [
    { name: "Activa 6G", image: "/assets/home/bike-honda.png" },
    { name: "Activa 125", image: "/assets/home/bike-honda.png" },
    { name: "Shine", image: "/assets/home/bike-honda.png" },
    { name: "SP 125", image: "/assets/home/bike-honda.png" },
    { name: "Unicorn", image: "/assets/home/bike-honda.png" },
    { name: "Hornet 2.0", image: "/assets/home/bike-honda.png" },
    { name: "CB 200X", image: "/assets/home/bike-honda.png" },
    { name: "CB Shine", image: "/assets/home/bike-honda.png" },
    { name: "Dio", image: "/assets/home/bike-honda.png" },
    { name: "Livo", image: "/assets/home/bike-honda.png" },
    { name: "X-Blade", image: "/assets/home/bike-honda.png" },
    { name: "CB 350", image: "/assets/home/bike-honda.png" },
  ],
  Hero: [
    { name: "Splendor Plus", image: "/assets/home/bike-hero.png" },
    { name: "HF Deluxe", image: "/assets/home/bike-hero.png" },
    { name: "Passion Pro", image: "/assets/home/bike-hero.png" },
    { name: "Glamour", image: "/assets/home/bike-hero.png" },
    { name: "Xtreme 125R", image: "/assets/home/bike-hero.png" },
    { name: "Xtreme 160R", image: "/assets/home/bike-hero.png" },
    { name: "Xpulse 200", image: "/assets/home/bike-hero.png" },
    { name: "Maestro Edge", image: "/assets/home/bike-hero.png" },
  ],
  TVS: [
    { name: "Apache RTR 160", image: "/assets/home/bike-tvs.png" },
    { name: "Apache RTR 200", image: "/assets/home/bike-tvs.png" },
    { name: "Apache RR 310", image: "/assets/home/bike-tvs.png" },
    { name: "Raider 125", image: "/assets/home/bike-tvs.png" },
    { name: "Jupiter", image: "/assets/home/bike-tvs.png" },
    { name: "Ntorq 125", image: "/assets/home/bike-tvs.png" },
    { name: "Sport", image: "/assets/home/bike-tvs.png" },
    { name: "Star City Plus", image: "/assets/home/bike-tvs.png" },
  ],
  Bajaj: [
    { name: "Pulsar 125", image: "/assets/home/bike-bajaj.png" },
    { name: "Pulsar 150", image: "/assets/home/bike-bajaj.png" },
    { name: "Pulsar NS200", image: "/assets/home/bike-bajaj.png" },
    { name: "Pulsar N160", image: "/assets/home/bike-bajaj.png" },
    { name: "Dominar 250", image: "/assets/home/bike-bajaj.png" },
    { name: "Dominar 400", image: "/assets/home/bike-bajaj.png" },
    { name: "Avenger 160", image: "/assets/home/bike-bajaj.png" },
    { name: "Platina 110", image: "/assets/home/bike-bajaj.png" },
  ],
  Yamaha: [
    { name: "R15 V4", image: "/assets/home/bike-yamaha.png" },
    { name: "MT 15", image: "/assets/home/bike-yamaha.png" },
    { name: "FZ-S FI", image: "/assets/home/bike-yamaha.png" },
    { name: "FZ-X", image: "/assets/home/bike-yamaha.png" },
    { name: "Fascino 125", image: "/assets/home/bike-yamaha.png" },
    { name: "RayZR 125", image: "/assets/home/bike-yamaha.png" },
    { name: "Aerox 155", image: "/assets/home/bike-yamaha.png" },
    { name: "Fazer", image: "/assets/home/bike-yamaha.png" },
  ],
  "Royal Enfield": [
    { name: "Classic 350", image: "/assets/home/bike-royal-enfield.png" },
    { name: "Bullet 350", image: "/assets/home/bike-royal-enfield.png" },
    { name: "Hunter 350", image: "/assets/home/bike-royal-enfield.png" },
    { name: "Meteor 350", image: "/assets/home/bike-royal-enfield.png" },
    { name: "Himalayan", image: "/assets/home/bike-royal-enfield.png" },
    { name: "Scram 411", image: "/assets/home/bike-royal-enfield.png" },
    { name: "Interceptor 650", image: "/assets/home/bike-royal-enfield.png" },
    { name: "Continental GT", image: "/assets/home/bike-royal-enfield.png" },
  ],
  Suzuki: [
    { name: "Gixxer", image: "/assets/home/bike-suzuki.png" },
    { name: "Gixxer SF", image: "/assets/home/bike-suzuki.png" },
    { name: "Access 125", image: "/assets/home/bike-suzuki.png" },
    { name: "Burgman Street", image: "/assets/home/bike-suzuki.png" },
    { name: "V-Strom SX", image: "/assets/home/bike-suzuki.png" },
    { name: "Hayabusa", image: "/assets/home/bike-suzuki.png" },
    { name: "Avenis", image: "/assets/home/bike-suzuki.png" },
    { name: "Intruder", image: "/assets/home/bike-suzuki.png" },
  ],
  KTM: [
    { name: "Duke 125", image: "/assets/home/bike-bajaj.png" },
    { name: "Duke 200", image: "/assets/home/bike-bajaj.png" },
    { name: "Duke 250", image: "/assets/home/bike-bajaj.png" },
    { name: "Duke 390", image: "/assets/home/bike-bajaj.png" },
    { name: "RC 125", image: "/assets/home/bike-bajaj.png" },
    { name: "RC 200", image: "/assets/home/bike-bajaj.png" },
    { name: "RC 390", image: "/assets/home/bike-bajaj.png" },
    { name: "Adventure 390", image: "/assets/home/bike-bajaj.png" },
  ],
  Jawa: [
    { name: "Jawa 42", image: "/assets/home/bike-royal-enfield.png" },
    { name: "Jawa Classic", image: "/assets/home/bike-royal-enfield.png" },
    { name: "Perak", image: "/assets/home/bike-royal-enfield.png" },
    { name: "42 Bobber", image: "/assets/home/bike-royal-enfield.png" },
  ],
  Aprilia: [
    { name: "SR 125", image: "/assets/home/bike-yamaha.png" },
    { name: "SR 160", image: "/assets/home/bike-yamaha.png" },
    { name: "SXR 125", image: "/assets/home/bike-yamaha.png" },
    { name: "SXR 160", image: "/assets/home/bike-yamaha.png" },
    { name: "RS 457", image: "/assets/home/bike-yamaha.png" },
  ],
  Kawasaki: [
    { name: "Ninja 300", image: "/assets/home/bike-tvs.png" },
    { name: "Ninja 400", image: "/assets/home/bike-tvs.png" },
    { name: "Ninja ZX-4R", image: "/assets/home/bike-tvs.png" },
    { name: "Z650", image: "/assets/home/bike-tvs.png" },
    { name: "Versys 650", image: "/assets/home/bike-tvs.png" },
    { name: "Vulcan S", image: "/assets/home/bike-tvs.png" },
  ],
  BMW: [
    { name: "G 310 R", image: "/assets/home/bike-suzuki.png" },
    { name: "G 310 GS", image: "/assets/home/bike-suzuki.png" },
    { name: "G 310 RR", image: "/assets/home/bike-suzuki.png" },
    { name: "S 1000 RR", image: "/assets/home/bike-suzuki.png" },
    { name: "R 1250 GS", image: "/assets/home/bike-suzuki.png" },
    { name: "F 850 GS", image: "/assets/home/bike-suzuki.png" },
  ],
};


export const years = ["2024", "2023", "2022", "2021"];

/** localStorage key the customer's phone number (login state) is persisted under. */

export const AUTH_STORAGE_KEY = "bikeparts_auth_phone";

/** localStorage key the header search bar's recent-search history is persisted under. */
export const RECENT_SEARCHES_STORAGE_KEY = "bikeparts_recent_searches";
export const MAX_RECENT_SEARCHES = 6;

/** localStorage key the shopping cart's contents are persisted under. */
export const CART_STORAGE_KEY = "bikeparts_cart";

/**
 * sessionStorage key the "which screen am I on" view state (selected
 * product, viewed order, My Orders panel, bike/category browsing) is
 * persisted under — this app renders every screen as client-side state
 * under a single "/" URL rather than real routes, so without this a plain
 * browser refresh always dropped the customer back on the homepage no
 * matter what they were looking at. sessionStorage (not localStorage) is
 * deliberate: it should survive a refresh, but a brand new tab/visit should
 * still start fresh at the homepage rather than reopening whatever the
 * customer looked at last time.
 */
export const VIEW_STORAGE_KEY = "bikeparts_view";


export const partCategories: Array<{ name: string; icon: LucideIcon }> = [
  { name: "Engine", icon: Gauge },
  { name: "Brake", icon: Disc3 },
  { name: "Electrical", icon: Zap },
  { name: "Filters", icon: Filter },
  { name: "Suspension", icon: Wrench },
  { name: "Transmission", icon: Cog },
  { name: "Body Parts", icon: CircleDot },
  { name: "Tyres & Wheels", icon: CircleDot },
  { name: "Oils & Fluids", icon: Droplet },
];


export const bikeHotspots: BikeHotspot[] = [
  { name: "Handlebar & Controls", dot: { x: 60, y: 22 }, label: { x: 78, y: 9 } },
  { name: "Fuel System", dot: { x: 52, y: 38 }, label: { x: 50, y: 8 } },
  { name: "Seat & Comfort", dot: { x: 28, y: 41 }, label: { x: 14, y: 14 } },
  { name: "Lighting", dot: { x: 80, y: 36 }, label: { x: 92, y: 25 } },
  { name: "Body Parts", dot: { x: 13, y: 40 }, label: { x: 7, y: 44 } },
  { name: "Suspension", dot: { x: 68, y: 52 }, label: { x: 91, y: 49 } },
  { name: "Electrical", dot: { x: 30, y: 52 }, label: { x: 10, y: 58 } },
  { name: "Brake System", dot: { x: 79, y: 76 }, label: { x: 92, y: 72 } },
  { name: "Engine", dot: { x: 48, y: 66 }, label: { x: 48, y: 82 } },
  { name: "Chain & Sprocket", dot: { x: 28, y: 76 }, label: { x: 28, y: 90 } },
  { name: "Exhaust System", dot: { x: 12, y: 74 }, label: { x: 8, y: 86 } },
  { name: "Tyres & Wheels", dot: { x: 79, y: 88 }, label: { x: 91, y: 92 } },
];


export const priceFilterOptions = [
  { label: "Under ₹500", test: (product: Product) => parsePrice(product.price) < 500 },
  {
    label: "₹500 - ₹1,000",
    test: (product: Product) =>
      parsePrice(product.price) >= 500 && parsePrice(product.price) <= 1000,
  },
  {
    label: "₹1,000 - ₹2,000",
    test: (product: Product) =>
      parsePrice(product.price) > 1000 && parsePrice(product.price) <= 2000,
  },
  { label: "Above ₹2,000", test: (product: Product) => parsePrice(product.price) > 2000 },
];


export const sortOptions = [
  { value: "popularity", label: "Popularity" },
  { value: "price-asc", label: "Price: Low to High" },
  { value: "price-desc", label: "Price: High to Low" },
  { value: "rating-desc", label: "Rating: High to Low" },
] as const;


export type SortOption = (typeof sortOptions)[number]["value"];


// Fixture addresses for local development only, so the storefront has
// something to show before logging in and calling /api/addresses. Production
// must never show fake customer addresses — see Fix 6 — so this array is
// forced empty outside development and the UI always loads the customer's
// real saved addresses from the server once authenticated.
const devDemoAddresses: Address[] = [
  {
    id: "dev-home",
    label: "Home",
    flatNo: "H.No. 102",
    floor: "",
    area: "Boring Road",
    landmark: "Patna Junction",
    city: "Patna",
    pincode: "800001",
    contactName: "Dev Tester",
    phone: "9999999999",
    isDefault: true,
    deliveryEstimate: "Delivery in 2-4 days",
    availabilityNote: "All parts available at this location",
    availabilityOk: true,
  },
];

export const initialAddresses: Address[] =
  process.env.NODE_ENV === "production" ? [] : devDemoAddresses;


export const addressIcons: Record<string, { icon: LucideIcon; className: string }> = {
  Home: { icon: HomeIcon, className: "bg-[#fff0eb] text-[#ff4b1f]" },
  Office: { icon: Building2, className: "bg-blue-50 text-blue-600" },
  Shop: { icon: Store, className: "bg-violet-50 text-violet-600" },
  Other: { icon: MapPin, className: "bg-emerald-50 text-emerald-600" },
};


export const addressTypeOptions: Array<{ label: string; icon: LucideIcon }> = [
  { label: "Home", icon: HomeIcon },
  { label: "Shop", icon: Store },
  { label: "Other", icon: MapPin },
];


export const orderStatusMeta: Record<
  OrderStatus,
  { label: string; icon: LucideIcon; iconClassName: string; bannerClassName: string }
> = {
  processing: {
    label: "Processing",
    icon: Clock,
    iconClassName: "bg-amber-50 text-amber-600",
    bannerClassName: "bg-amber-50 text-amber-700",
  },
  out_for_delivery: {
    label: "Out for Delivery",
    icon: Truck,
    iconClassName: "bg-blue-50 text-blue-600",
    bannerClassName: "bg-blue-50 text-blue-700",
  },
  delivered: {
    label: "Delivered",
    icon: CheckCircle2,
    iconClassName: "bg-emerald-50 text-emerald-600",
    bannerClassName: "bg-emerald-50 text-emerald-700",
  },
  cancelled: {
    label: "Cancelled",
    icon: XCircle,
    iconClassName: "bg-red-50 text-red-600",
    bannerClassName: "bg-red-50 text-red-700",
  },
};


export const orderTrackingSteps = ["Order Placed", "Preparing", "Out for Delivery", "Delivered"];

/** Which tracking step (0-based) each order status has just reached. Cancelled orders skip the stepper entirely. */

export const stepIndexForStatus: Partial<Record<OrderStatus, number>> = {
  processing: 1,
  out_for_delivery: 2,
  delivered: 3,
};

/** The raw DB OrderStatus a status-change event recorded, if any — parsed from the messages admin-orders.ts writes ("Status changed to X...", "Dispatched via Porter..."). */

export const riderRoster = [
  { name: "Ravi Kumar", initials: "RK" },
  { name: "Suresh Yadav", initials: "SY" },
  { name: "Amit Singh", initials: "AS" },
  { name: "Vikram Rana", initials: "VR" },
];

/** Deterministic mock rider for an order — stable across renders since it's derived from the order id. */

export const footerSocialLinks: Array<{ name: string; icon: "facebook" | "instagram" | "linkedin" | "twitter" }> = [
  { name: "LinkedIn", icon: "linkedin" },
  { name: "Instagram", icon: "instagram" },
  { name: "Facebook", icon: "facebook" },
  { name: "Twitter", icon: "twitter" },
];


export const footerCities = ["Patna", "Delhi", "Mumbai", "Bangalore", "Pune"];

/** Simple line-art social glyphs, drawn in-house since the icon set has no brand marks. */

export const DEFAULT_MAP_CENTER = { lat: 25.5941, lon: 85.1376 }; // Patna


export const orderStatusFilters: Array<{ key: OrderStatus | "all"; label: string }> = [
  { key: "all", label: "All Orders" },
  { key: "processing", label: "Processing" },
  { key: "out_for_delivery", label: "Out for Delivery" },
  { key: "delivered", label: "Delivered" },
  { key: "cancelled", label: "Cancelled" },
];


export const WAREHOUSE_CITY = "Patna";

/**
 * Real embedded map (OpenStreetMap via Leaflet) showing the pickup
 * (warehouse) and drop (customer) cities with a route line between them.
 * This is a city-level approximation, not a street-level or live position —
 * nothing in this app captures a real geocoded address or a live rider GPS
 * feed yet (see lib/city-coordinates.ts and lib/porter.ts's unused
 * PorterAddress.lat/lng). Said plainly in the caption below rather than
 * implying more precision than this actually has.
 */

export const orderStatusHeadline: Record<OrderStatus, string> = {
  processing: "Your order is being prepared!",
  out_for_delivery: "Your order is on the way!",
  delivered: "Your order has been delivered!",
  cancelled: "Your order was cancelled",
};

