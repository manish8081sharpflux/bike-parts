import assert from "node:assert/strict";
import test from "node:test";
import { checkLocalDeliveryEligibility, normalizeCityName } from "@/lib/shipping/pune-eligibility";

test("normalizeCityName trims, lowercases, and collapses whitespace", () => {
  assert.equal(normalizeCityName("Pune"), "pune");
  assert.equal(normalizeCityName("  PUNE  "), "pune");
  assert.equal(normalizeCityName("Pune  City"), "pune city");
  assert.equal(normalizeCityName(null), "");
  assert.equal(normalizeCityName(undefined), "");
});

// 20. Pune-only eligibility
test("a Pune warehouse and a Pune customer address are eligible for Borzo", () => {
  const result = checkLocalDeliveryEligibility("Pune", "Pune");
  assert.equal(result.eligible, true);
});

test("eligibility is case-insensitive and tolerates surrounding whitespace", () => {
  assert.equal(checkLocalDeliveryEligibility("pune", " PUNE ").eligible, true);
});

// 21. non-Pune order is rejected from Borzo creation
test("a non-Pune customer address is not eligible, with a clear admin-facing reason", () => {
  const result = checkLocalDeliveryEligibility("Pune", "Mumbai");
  assert.equal(result.eligible, false);
  if (!result.eligible) assert.match(result.reason, /Pune/);
});

test("a non-Pune warehouse is never eligible, even if the customer happens to be in Pune", () => {
  const result = checkLocalDeliveryEligibility("Patna", "Pune");
  assert.equal(result.eligible, false);
});

test("a missing city on either side is not eligible", () => {
  assert.equal(checkLocalDeliveryEligibility(null, "Pune").eligible, false);
  assert.equal(checkLocalDeliveryEligibility("Pune", undefined).eligible, false);
  assert.equal(checkLocalDeliveryEligibility(null, null).eligible, false);
});

// A real Pune-circle pincode (411xxx) rescues a customer address whose city
// is a locality/suburb name rather than literally "Pune" — see the
// isPunePincode doc comment for why this is a verifiable fact, not a guess.
test("a 411xxx pincode makes a non-'Pune' locality name eligible", () => {
  assert.equal(checkLocalDeliveryEligibility("Pune", "Mhalunge", "411057").eligible, true);
  assert.equal(checkLocalDeliveryEligibility("Pune", "Wakad", "411057").eligible, true);
});

test("a non-411 pincode does not rescue a non-Pune city", () => {
  const result = checkLocalDeliveryEligibility("Pune", "Mumbai", "400001");
  assert.equal(result.eligible, false);
});

test("a malformed pincode is never treated as a Pune signal", () => {
  assert.equal(checkLocalDeliveryEligibility("Pune", "Mumbai", "4110571").eligible, false);
  assert.equal(checkLocalDeliveryEligibility("Pune", "Mumbai", "abc").eligible, false);
  assert.equal(checkLocalDeliveryEligibility("Pune", "Mumbai", "").eligible, false);
});
