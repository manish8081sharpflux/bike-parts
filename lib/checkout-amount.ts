export type CheckoutAmountItem = {
  price: number;
  gstRate: number;
  quantity: number;
};

export type CheckoutTotals = {
  itemsTotal: number;
  taxAmount: number;
  deliveryCharge: number;
  discount: number;
  amount: number;
};

/**
 * `deliveryCharge` defaults to 0 (free) — the cart preview (CartDrawer,
 * before an address is chosen) has no real address/weight to quote against
 * yet, so it shows this pre-address estimate. The actual checkout API
 * route computes a real delivery charge (a live Borzo quote for the
 * customer's chosen address, when eligible) and passes it in explicitly —
 * that computed value, not this default, is what the customer is actually
 * charged.
 */
export function calculateCheckoutTotals(items: CheckoutAmountItem[], deliveryCharge = 0): CheckoutTotals {
  const itemsTotal = items.reduce((sum, item) => sum + item.price * item.quantity, 0);
  const taxAmount = items.reduce(
    (sum, item) => sum + item.price * item.quantity * (item.gstRate / 100),
    0
  );
  const discount = 0;

  return {
    itemsTotal,
    taxAmount,
    deliveryCharge,
    discount,
    amount: itemsTotal + taxAmount + deliveryCharge - discount,
  };
}