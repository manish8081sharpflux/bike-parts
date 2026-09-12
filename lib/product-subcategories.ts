// Curated subcategory (part-type) names per admin product category — the
// same 12 categories the admin's Category dropdown and every BikePartListing
// row already use (see CATEGORIES in the admin product form and
// homeCategoryFilters' underlying category values). Single source of truth
// used by:
//   - the admin product form's Category → Subcategory dependent dropdown
//     (stored in the existing `productType` column — no schema change)
//   - the storefront catalog's category-pill dropdown, so it shows a
//     consistent curated list instead of just whatever's currently stocked
export const SUBCATEGORIES_BY_CATEGORY: Record<string, string[]> = {
  Engine: ["Air Filter", "Oil Filter", "Piston Kit", "Cylinder Kit", "Clutch Plate", "Timing Chain"],
  "Brake System": ["Brake Pads", "Brake Shoes", "Brake Disc", "Brake Caliper", "Brake Cable", "Brake Master Cylinder"],
  Electrical: ["Battery", "Spark Plug", "Wiring Harness", "Voltage Regulator", "Starter Motor", "Ignition Coil"],
  Suspension: ["Front Fork", "Rear Shock Absorber", "Suspension Spring", "Fork Oil Seal", "Suspension Bush", "Swing Arm"],
  "Body Parts": ["Side Fairing", "Fuel Tank Cover", "Mudguard", "Seat Cover", "Side Panel", "Headlight Fairing"],
  "Tyres & Wheels": ["Front Tyre", "Rear Tyre", "Alloy Wheel", "Wheel Bearing", "Spoke Wheel", "Tyre Tube"],
  "Fuel System": ["Carburetor", "Fuel Pump", "Fuel Injector", "Fuel Tank", "Fuel Filter", "Throttle Body"],
  Lighting: ["Headlight", "Tail Light", "Indicator", "LED Bulb", "Fog Lamp", "Wiring Connector"],
  "Seat & Comfort": ["Seat Cover", "Seat Foam", "Backrest", "Grab Rail", "Footpeg", "Seat Lock"],
  "Handlebar & Controls": ["Handlebar Grip", "Clutch Lever", "Brake Lever", "Throttle Cable", "Mirror", "Horn Switch"],
  "Chain & Sprocket": ["Drive Chain", "Front Sprocket", "Rear Sprocket", "Chain Lock", "Chain Guard", "Sprocket Bolt Kit"],
  "Exhaust System": ["Exhaust Muffler", "Exhaust Pipe", "Silencer", "Catalytic Converter", "Exhaust Gasket", "Heat Shield"],
};
