export type BikePart = {
  id: string;
  name: string;
  brand: string;
  category: string;
  condition: "New" | "Used" | "Refurbished";
  city: string;
  price: number;
  stock: number;
  rating: number;
  tags: string[];
  description: string;
};

export const sampleProducts: BikePart[] = [
  {
    id: "brake-disc-apollo-220",
    name: "Front Brake Disc Rotor",
    brand: "Apollo",
    category: "Braking",
    condition: "New",
    city: "Pune",
    price: 1850,
    stock: 14,
    rating: 4.7,
    tags: ["disc", "front", "street"],
    description: "Precision-machined rotor for commuter and sport bikes.",
  },
  {
    id: "chain-kit-xpulse",
    name: "Heavy Duty Chain Sprocket Kit",
    brand: "MotoLink",
    category: "Drivetrain",
    condition: "New",
    city: "Bengaluru",
    price: 2499,
    stock: 8,
    rating: 4.6,
    tags: ["chain", "sprocket", "touring"],
    description: "Sealed chain kit built for high-mileage daily riding.",
  },
  {
    id: "led-headlamp-h4",
    name: "H4 LED Headlamp Assembly",
    brand: "Lumora",
    category: "Electrical",
    condition: "Refurbished",
    city: "Delhi",
    price: 1199,
    stock: 5,
    rating: 4.3,
    tags: ["led", "headlamp", "night"],
    description: "Bright replacement assembly with tested wiring harness.",
  },
  {
    id: "clutch-plate-unicorn",
    name: "Clutch Plate Set",
    brand: "RidePro",
    category: "Engine",
    condition: "New",
    city: "Hyderabad",
    price: 899,
    stock: 22,
    rating: 4.5,
    tags: ["clutch", "engine", "commuter"],
    description: "Friction plate set for smooth power transfer.",
  },
  {
    id: "mono-shock-duke",
    name: "Adjustable Rear Mono Shock",
    brand: "TrackForge",
    category: "Suspension",
    condition: "Used",
    city: "Mumbai",
    price: 5299,
    stock: 2,
    rating: 4.2,
    tags: ["suspension", "rear", "performance"],
    description: "Inspected rear shock with preload adjustment.",
  },
  {
    id: "air-filter-classic",
    name: "Performance Air Filter",
    brand: "BreatheMax",
    category: "Intake",
    condition: "New",
    city: "Chennai",
    price: 749,
    stock: 31,
    rating: 4.8,
    tags: ["filter", "intake", "service"],
    description: "Washable high-flow filter for routine maintenance.",
  },
];

export function searchSampleProducts(query: string, category?: string) {
  const normalizedQuery = query.trim().toLowerCase();
  const normalizedCategory = category?.trim().toLowerCase();

  return sampleProducts.filter((product) => {
    const matchesQuery =
      normalizedQuery.length === 0 ||
      [product.name, product.brand, product.category, product.description, ...product.tags]
        .join(" ")
        .toLowerCase()
        .includes(normalizedQuery);

    const matchesCategory =
      !normalizedCategory || product.category.toLowerCase() === normalizedCategory;

    return matchesQuery && matchesCategory;
  });
}
