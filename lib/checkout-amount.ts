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

export function calculateCheckoutTotals(items: CheckoutAmountItem[]): CheckoutTotals {
  const itemsTotal = items.reduce((sum, item) => sum + item.price * item.quantity, 0);
  const taxAmount = items.reduce(
    (sum, item) => sum + item.price * item.quantity * (item.gstRate / 100),
    0
  );
  const deliveryCharge = 0;
  const discount = 0;

  return {
    itemsTotal,
    taxAmount,
    deliveryCharge,
    discount,
    amount: itemsTotal + taxAmount + deliveryCharge - discount,
  };
}