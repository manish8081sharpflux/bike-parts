/**
 * Local-delivery (Borzo) eligibility — for now, only a Pune warehouse
 * shipping to a Pune customer address qualifies (see Part 7 of the Borzo
 * integration task). No fuzzy/radius matching: this app has no reliable
 * per-address geocoding (see lib/city-coordinates.ts's doc comment — it's
 * only approximate city-center points for a demo map, never real
 * lat/lng), so eligibility is a plain, exact, case-insensitive city-name
 * match — plus one narrow, verifiable exception below — rather than an
 * invented distance calculation.
 */

/** Trims, lowercases, and collapses whitespace — enough to compare "Pune", " pune ", "PUNE" as the same city without pretending to handle spelling variants it hasn't been told about. */
export function normalizeCityName(city: string | null | undefined): string {
  return (city ?? "").trim().toLowerCase().replace(/\s+/g, " ");
}

const PUNE = "pune";

/**
 * Real, publicly documented India Post fact (not an invented radius): every
 * Pune circle pincode starts with "411" (411001–411062 and a handful of
 * PO-specific codes beyond that, all still "411xxx"). Customers routinely
 * type a locality/suburb name ("Wakad", "Mhalunge", "Hinjewadi") instead of
 * literally "Pune" as their delivery city, which an exact city-string match
 * alone would wrongly reject even though the address is genuinely inside
 * Pune. This is a fallback signal only — a city name that literally says
 * "Pune" is still checked first.
 */
function isPunePincode(pincode: string | null | undefined): boolean {
  return /^411\d{3}$/.test((pincode ?? "").trim());
}

export type LocalDeliveryEligibility =
  | { eligible: true }
  | { eligible: false; reason: string };

/**
 * Both the warehouse (pickup) and the customer's delivery address (drop)
 * must be Pune for a Borzo local delivery to make sense — Borzo here is a
 * same-city courier, not a long-haul network. `warehouseCity` is read from
 * WAREHOUSE_CITY (the same env var the forward-dispatch address already
 * uses — see lib/actions/admin-orders.ts's warehouseAddress()), never
 * hardcoded, so a deployment whose warehouse isn't actually in Pune
 * correctly never sees Borzo offered at all. `customerPincode` is optional
 * only for backward compatibility with existing callers that don't have it
 * handy — pass it whenever available so a Pune suburb name isn't wrongly
 * rejected (see isPunePincode above).
 */
export function checkLocalDeliveryEligibility(
  warehouseCity: string | null | undefined,
  customerCity: string | null | undefined,
  customerPincode?: string | null
): LocalDeliveryEligibility {
  if (normalizeCityName(warehouseCity) !== PUNE) {
    return { eligible: false, reason: "Borzo local delivery is currently enabled only for Pune addresses." };
  }
  if (normalizeCityName(customerCity) !== PUNE && !isPunePincode(customerPincode)) {
    return { eligible: false, reason: "Borzo local delivery is currently enabled only for Pune addresses." };
  }
  return { eligible: true };
}
