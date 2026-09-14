// Curated subcategory (part-type) *suggestions* per admin product category —
// the same top-level categories the admin's Category dropdown and every
// BikePartListing row already use (see CATEGORIES in the admin product form
// and homeCategoryFilters' underlying category values). Single source of
// truth used by:
//   - the admin product form's Category → Subcategory dependent combobox
//     (stored in the existing `productType` column — no schema change)
//   - the storefront catalog's category-pill dropdown, so it shows a
//     consistent curated list instead of just whatever's currently stocked
//
// Neither list is exhaustive or enforced — both the admin's Category and
// Subcategory fields are free-text comboboxes (a <datalist> of these values
// plus whatever's typed), so a genuinely new spare-part type or category
// (e.g. "Relay" or a brand-new "Stands" category) can always be entered
// without a code change. These arrays exist purely to make the common cases
// fast to pick and keep the storefront's dropdown suggestions useful.
export const SUBCATEGORIES_BY_CATEGORY: Record<string, string[]> = {
  Engine: ["Air Filter", "Oil Filter", "Piston Kit", "Cylinder Kit", "Clutch Plate", "Timing Chain", "Engine Gasket", "Bearing"],
  "Brake System": ["Brake Pads", "Brake Shoes", "Brake Disc", "Brake Caliper", "Brake Cable", "Brake Master Cylinder"],
  Electrical: ["Battery", "Spark Plug", "Wiring Harness", "Voltage Regulator", "Starter Motor", "Ignition Coil", "Relay", "Horn"],
  Suspension: ["Front Fork", "Rear Shock Absorber", "Suspension Spring", "Fork Oil Seal", "Suspension Bush", "Swing Arm"],
  "Body Parts": ["Side Fairing", "Fuel Tank Cover", "Mudguard", "Seat Cover", "Side Panel", "Headlight Fairing"],
  "Tyres & Wheels": ["Front Tyre", "Rear Tyre", "Alloy Wheel", "Wheel Bearing", "Spoke Wheel", "Tyre Tube"],
  "Fuel System": ["Carburetor", "Fuel Pump", "Fuel Injector", "Fuel Tank", "Fuel Filter", "Throttle Body"],
  Lighting: ["Headlight", "Tail Light", "Indicator", "Bulb", "LED Bulb", "Fog Lamp", "Wiring Connector"],
  "Seat & Comfort": ["Seat Cover", "Seat Foam", "Backrest", "Grab Rail", "Footpeg", "Footrest", "Seat Lock"],
  "Handlebar & Controls": ["Handlebar Grip", "Clutch Lever", "Brake Lever", "Clutch Cable", "Throttle Cable", "Accelerator Cable", "Mirror", "Horn Switch", "Switch"],
  "Chain & Sprocket": ["Drive Chain", "Chain", "Chain Kit", "Front Sprocket", "Rear Sprocket", "Chain Lock", "Chain Guard", "Sprocket Bolt Kit"],
  "Exhaust System": ["Exhaust Muffler", "Exhaust Pipe", "Silencer", "Catalytic Converter", "Exhaust Gasket", "Heat Shield"],
  Accessories: ["Side Stand", "Centre Stand", "Mobile Holder", "Helmet Lock", "Bike Cover", "USB Charger"],
};
