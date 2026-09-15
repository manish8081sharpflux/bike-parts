import { checkLocalDeliveryEligibility, isBorzoConfigured, quoteLocalDelivery } from "@/lib/shipping/service";
import { calculateTotalWeightKg } from "@/lib/shipping/package";

export type CheckoutDeliveryAddress = {
  contactName: string;
  phone: string;
  flatNo: string | null;
  floor: string | null;
  area: string;
  landmark: string | null;
  city: string;
  pincode: string;
};

export type CheckoutDeliveryQuote = {
  /** What the customer is actually charged for delivery — always a real number, never fabricated. 0 whenever a genuine quote can't be obtained (see `isRealQuote`). */
  amount: number;
  /** True only when `amount` is a real Borzo quote for this exact address/cart. False means it fell back to free — because the address isn't Pune-eligible, Borzo isn't configured, or the live quote call failed — so the UI can be honest about why. */
  isRealQuote: boolean;
  /** Present only when `isRealQuote` is false and there's a specific, real reason to show (e.g. "outside Pune") rather than a generic fallback. */
  reason?: string;
};

/**
 * A real Borzo quote for a customer's actual address and cart — the same
 * calculate-order call admin uses before booking a delivery, reused here so
 * both the cart preview (before an order exists) and the real checkout
 * charge are computed identically and never diverge. Falls back to free
 * (0) — never throws, never blocks checkout — when the address isn't
 * Pune-eligible, Borzo isn't configured, a product is missing its shipping
 * weight, or the live quote call itself fails for any reason (network,
 * timeout, Borzo downtime). Payments must stay independent of a courier's
 * live status; this is a pricing calculation, not a booking, so there is
 * nothing to reconcile if it can't be computed right now.
 */
export async function quoteCheckoutDelivery(
  address: CheckoutDeliveryAddress,
  items: Array<{ name: string; quantity: number; weightKg: number | null }>
): Promise<CheckoutDeliveryQuote> {
  if (!isBorzoConfigured()) return { amount: 0, isRealQuote: false };

  const eligibility = checkLocalDeliveryEligibility(process.env.WAREHOUSE_CITY, address.city, address.pincode);
  if (!eligibility.eligible) return { amount: 0, isRealQuote: false, reason: eligibility.reason };

  if (
    !process.env.WAREHOUSE_CONTACT_NAME ||
    !process.env.WAREHOUSE_PHONE ||
    !process.env.WAREHOUSE_ADDRESS_LINE1 ||
    !process.env.WAREHOUSE_CITY ||
    !process.env.WAREHOUSE_PINCODE
  ) {
    return { amount: 0, isRealQuote: false };
  }

  try {
    const totalWeightKg = calculateTotalWeightKg(
      items.map((item) => ({ productName: item.name, quantity: item.quantity, weightKg: item.weightKg }))
    );
    const line1 = [address.flatNo, address.floor, address.area].filter(Boolean).join(", ");
    const quote = await quoteLocalDelivery({
      pickup: {
        contactName: process.env.WAREHOUSE_CONTACT_NAME,
        contactPhone: process.env.WAREHOUSE_PHONE,
        line1: process.env.WAREHOUSE_ADDRESS_LINE1,
        city: process.env.WAREHOUSE_CITY,
        pincode: process.env.WAREHOUSE_PINCODE,
      },
      drop: {
        contactName: address.contactName,
        contactPhone: address.phone,
        line1,
        line2: address.landmark ?? "",
        city: address.city,
        pincode: address.pincode,
      },
      matter: items.map((item) => `${item.name} x${item.quantity}`).join(", ").slice(0, 5000),
      totalWeightKg,
    });
    if (quote.deliveryFeeAmount == null) return { amount: 0, isRealQuote: false };
    return { amount: quote.deliveryFeeAmount, isRealQuote: true };
  } catch (error) {
    console.error("[checkout] Real Borzo delivery quote failed; defaulting to free delivery.", error);
    return { amount: 0, isRealQuote: false };
  }
}
