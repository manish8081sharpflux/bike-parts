import assert from "node:assert/strict";

function calculateCheckoutTotals(items) {
  const itemsTotal = items.reduce((sum, item) => sum + item.price * item.quantity, 0);
  const taxAmount = items.reduce(
    (sum, item) => sum + item.price * item.quantity * (item.gstRate / 100),
    0
  );
  const deliveryCharge = 0;
  const discount = 0;
  return { itemsTotal, taxAmount, deliveryCharge, discount, amount: itemsTotal + taxAmount };
}

const assertTotals = (items, expected) => {
  assert.deepEqual(calculateCheckoutTotals(items), expected);
};

assertTotals([{ price: 1000, gstRate: 18, quantity: 1 }], {
  itemsTotal: 1000,
  taxAmount: 180,
  deliveryCharge: 0,
  discount: 0,
  amount: 1180,
});
assertTotals([{ price: 1000, gstRate: 5, quantity: 1 }], {
  itemsTotal: 1000,
  taxAmount: 50,
  deliveryCharge: 0,
  discount: 0,
  amount: 1050,
});
assertTotals(
  [
    { price: 1000, gstRate: 18, quantity: 2 },
    { price: 500, gstRate: 5, quantity: 3 },
  ],
  { itemsTotal: 3500, taxAmount: 435, deliveryCharge: 0, discount: 0, amount: 3935 }
);

const tamperedRequest = {
  items: [{ price: 1000, gstRate: 18, quantity: 1 }],
  discount: 9000,
  taxRate: 0,
  deliveryCharge: 9000,
};
assert.equal(calculateCheckoutTotals(tamperedRequest.items).amount, 1180);

console.log("PASS: checkout amount calculations use per-line GST and ignore client totals");