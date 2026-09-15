import type { ShippingPackage } from "./types";

/** Thrown when a shipment's package cannot be safely computed — the message always names the specific product/reason, since it's shown directly to the admin. */
export class PackageBuildError extends Error {}

export type PackageLineItem = {
  productName: string;
  quantity: number;
  weightKg: number | null;
  lengthCm: number | null;
  breadthCm: number | null;
  heightCm: number | null;
};

// A business-approved, explicitly configured fallback parcel size — never
// invented per-order. Only ever used for a multi-distinct-product order
// (see buildPackage below), and only after the admin has explicitly
// confirmed it in the dispatch UI (see the admin dispatch action/form).
const DEFAULT_PARCEL_LENGTH_CM = Number(process.env.SHIPPING_DEFAULT_PARCEL_LENGTH_CM ?? 30);
const DEFAULT_PARCEL_BREADTH_CM = Number(process.env.SHIPPING_DEFAULT_PARCEL_BREADTH_CM ?? 20);
const DEFAULT_PARCEL_HEIGHT_CM = Number(process.env.SHIPPING_DEFAULT_PARCEL_HEIGHT_CM ?? 10);

export type BuiltPackage = {
  package: ShippingPackage;
  /**
   * True only when the dimensions are a specific product's own real,
   * admin-entered measurements (a single-distinct-product order). False
   * means the configured default parcel size was used instead (a
   * multi-distinct-product order) — callers (the admin dispatch action)
   * must require an explicit admin confirmation before creating a shipment
   * whenever this is false; see lib/actions/admin-orders.ts.
   */
  usesRealDimensions: boolean;
};

/**
 * Turns purchased (or returned) line items into one physical parcel
 * description for the shipping provider.
 *
 * Weight is always the real, computed total — productWeight × quantity,
 * summed across every line — never approximated or defaulted. Any line
 * missing a shipping weight blocks shipment creation entirely (throws,
 * naming the product) — see BikePartListing.weightKg.
 *
 * Dimensions:
 *  - Exactly one distinct product on the shipment (any quantity) uses that
 *    product's own length/breadth/height directly — a real, non-fabricated
 *    value. Missing dimensions in this case also blocks shipment creation
 *    (never falls back to the default; a single product's own package
 *    should always be knowable).
 *  - More than one distinct product falls back to the configured default
 *    parcel size (SHIPPING_DEFAULT_PARCEL_*_CM) rather than summing
 *    per-product dimensions (which would badly overstate the real packed
 *    volume) or inventing a volumetric calculation this app has no real
 *    packing data to support. `usesRealDimensions: false` signals the
 *    caller to require admin confirmation before proceeding.
 */
export function buildPackage(lines: PackageLineItem[]): BuiltPackage {
  const missingWeight = lines.find((line) => line.weightKg === null || line.weightKg <= 0);
  if (missingWeight) {
    throw new PackageBuildError(
      `"${missingWeight.productName}" has no shipping weight configured. Set it in the product's Pricing & Inventory section before creating a shipment.`
    );
  }

  const weightKg = lines.reduce((sum, line) => sum + (line.weightKg as number) * line.quantity, 0);

  const distinctProductNames = new Set(lines.map((line) => line.productName));

  if (distinctProductNames.size === 1) {
    const only = lines[0];
    if (only.lengthCm === null || only.breadthCm === null || only.heightCm === null) {
      throw new PackageBuildError(
        `"${only.productName}" has no shipping dimensions (length/breadth/height) configured. Set them in the product's Pricing & Inventory section before creating a shipment.`
      );
    }
    return {
      package: { weightKg, lengthCm: only.lengthCm, breadthCm: only.breadthCm, heightCm: only.heightCm },
      usesRealDimensions: true,
    };
  }

  return {
    package: {
      weightKg,
      lengthCm: DEFAULT_PARCEL_LENGTH_CM,
      breadthCm: DEFAULT_PARCEL_BREADTH_CM,
      heightCm: DEFAULT_PARCEL_HEIGHT_CM,
    },
    usesRealDimensions: false,
  };
}

/**
 * Borzo's calculate/create-order requests only take a total weight — no
 * length/breadth/height field exists in its documented request shape (see
 * lib/shipping/providers/borzo.ts) — so local-delivery quotes/bookings use
 * this instead of buildPackage, rather than demanding dimensions Borzo
 * never asks for. Still never approximates weight itself: any line missing
 * a shipping weight blocks the quote/booking, naming the product.
 */
export function calculateTotalWeightKg(lines: Pick<PackageLineItem, "productName" | "quantity" | "weightKg">[]): number {
  const missingWeight = lines.find((line) => line.weightKg === null || line.weightKg <= 0);
  if (missingWeight) {
    throw new PackageBuildError(
      `"${missingWeight.productName}" has no shipping weight configured. Set it in the product's Pricing & Inventory section before creating a shipment.`
    );
  }
  return lines.reduce((sum, line) => sum + (line.weightKg as number) * line.quantity, 0);
}
