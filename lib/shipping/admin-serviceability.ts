import { checkServiceability } from "./service";
import { buildPackage, type PackageLineItem } from "./package";
import type { CourierOption } from "./types";

export type ServiceabilityCheckResult = {
  couriers: CourierOption[];
  usesRealDimensions: boolean;
  weightKg: number;
};

/**
 * Shared helper behind every "Check Couriers" admin action (forward
 * dispatch, legacy whole-order return, partial return) — builds the
 * package from the given line items, then asks the configured provider
 * which couriers can service this pickup/delivery pincode pair. Surfaced to
 * the admin before AWB generation so they can pick a courier (see Part 13 —
 * option B, admin choice) rather than only ever taking whatever the
 * provider recommends.
 */
export async function checkAdminServiceability(params: {
  pickupPincode: string;
  deliveryPincode: string;
  lines: PackageLineItem[];
}): Promise<ServiceabilityCheckResult> {
  const built = buildPackage(params.lines);
  const couriers = await checkServiceability({
    pickupPincode: params.pickupPincode,
    deliveryPincode: params.deliveryPincode,
    weightKg: built.package.weightKg,
    cod: false,
  });
  return { couriers, usesRealDimensions: built.usesRealDimensions, weightKg: built.package.weightKg };
}
