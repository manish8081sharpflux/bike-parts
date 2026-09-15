import assert from "node:assert/strict";
import test from "node:test";
import { calculateCheckoutTotals } from "@/lib/checkout-amount";

test("calculateCheckoutTotals defaults to free delivery when no charge is passed", () => {
  const totals = calculateCheckoutTotals([{ price: 100, gstRate: 18, quantity: 2 }]);
  assert.equal(totals.itemsTotal, 200);
  assert.equal(totals.taxAmount, 36);
  assert.equal(totals.deliveryCharge, 0);
  assert.equal(totals.amount, 236);
});

// The real checkout API route passes in a real, computed Borzo delivery
// charge (see app/api/checkout/route.ts's computeRealDeliveryCharge) —
// never fabricated, and reflected in the final payable amount.
test("a real delivery charge is added into the final amount when provided", () => {
  const totals = calculateCheckoutTotals([{ price: 100, gstRate: 18, quantity: 2 }], 82);
  assert.equal(totals.deliveryCharge, 82);
  assert.equal(totals.amount, 318);
});

test("sums correctly across multiple lines with different GST rates", () => {
  const totals = calculateCheckoutTotals(
    [
      { price: 500, gstRate: 18, quantity: 1 },
      { price: 200, gstRate: 5, quantity: 3 },
    ],
    50
  );
  assert.equal(totals.itemsTotal, 1100);
  assert.equal(Math.round(totals.taxAmount * 100) / 100, 120);
  assert.equal(totals.deliveryCharge, 50);
  assert.equal(Math.round(totals.amount * 100) / 100, 1270);
});
