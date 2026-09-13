// Shared types for the customer storefront, extracted from the former
// monolithic app/home-client.tsx (~6200 lines) so related pieces aren't all
// forced into one file. Pure type declarations only.
import type { Product } from "@/lib/storefront-catalog";

export type BikeHotspot = {
  name: string;
  dot: { x: number; y: number };
  label: { x: number; y: number };
};

// Coordinates are calibrated against the brand hero shots in
// public/assets/home/bike-*.png, which are all framed the same way
// (front-right 3/4 view, bike filling almost the entire canvas):
// tail/seat upper-left, tank/engine center, headlight/forks right, wheels
// along the bottom.

export type RazorpayPaymentResponse = {
  razorpay_order_id: string;
  razorpay_payment_id: string;
  razorpay_signature: string;
};


export type RazorpayCheckoutOptions = {
  key: string;
  amount: number;
  currency: string;
  order_id: string;
  name: string;
  description?: string;
  prefill?: { name?: string; contact?: string };
  theme?: { color?: string };
  handler: (response: RazorpayPaymentResponse) => void;
  modal?: { ondismiss?: () => void };
};


export type RazorpayCheckoutInstance = {
  open: () => void;
  on: (event: string, handler: (response: unknown) => void) => void;
};


declare global {
  interface Window {
    Razorpay?: new (options: RazorpayCheckoutOptions) => RazorpayCheckoutInstance;
  }
}


export type CartLine = { product: Product; quantity: number };


export type Address = {
  id: string;
  label: string;
  flatNo: string;
  floor: string;
  area: string;
  landmark: string;
  city: string;
  pincode: string;
  contactName: string;
  /** Delivery contact number — may differ from the logged-in account's own phone. */
  phone: string;
  isDefault?: boolean;
  deliveryEstimate: string;
  availabilityNote: string;
  availabilityOk: boolean;
};


export type OrderStatus = "processing" | "out_for_delivery" | "delivered" | "cancelled";

/** One entry from the order's real activity log (see OrderEvent in the DB) — used to give the tracking stepper real timestamps instead of guessed offsets. Absent for the demo orders shown before a real fetch resolves. */

export type OrderEventEntry = { type: string; message: string; createdAt: number };

/** Mirrors the DB's RefundStatus enum, lowercased to match this file's other status vocabularies. */
export type RefundStatus = "none" | "requested" | "processing" | "rejected" | "refunded";

/** Mirrors the DB's ReturnStatus enum, lowercased to match this file's other status vocabularies. */
export type ReturnStatus =
  | "none"
  | "requested"
  | "rejected"
  | "approved"
  | "pickup_scheduled"
  | "picked_up"
  | "received";

export type Order = {
  id: string;
  /** Full, untruncated DB id — `id` above is shortened for display, this is what refund/reorder calls to the server actually address. */
  dbId: string;
  placedAt: number;
  status: OrderStatus;
  statusNote: string;
  expectedDeliveryDate: string | null;
  bikeLabel: string;
  items: CartLine[];
  itemTotal: number;
  taxAmount: number;
  deliveryCharge: number;
  discount: number;
  total: number;
  address: Address;
  events?: OrderEventEntry[];
  /** Whether this order was actually paid for — a refund only ever makes sense against a paid order. */
  isPaid: boolean;
  refundStatus: RefundStatus;
  refundReason: string | null;
  refundAdminNote: string | null;
  refundAmount: number | null;
  refundRequestedAt: number | null;
  refundProcessedAt: number | null;
  returnStatus: ReturnStatus;
  returnReason: string | null;
  returnAdminNote: string | null;
  returnRequestedAt: number | null;
  returnPorterTrackingUrl: string | null;
  returnReceivedAt: number | null;
};

/**
 * The "which screen is the customer on" shape persisted to VIEW_STORAGE_KEY
 * (see home-client.tsx's restore/persist effects) — this app renders every
 * screen as client-side state under a single "/" URL rather than real
 * routes, so this is what lets a plain browser refresh land back where the
 * customer actually was instead of always resetting to the homepage.
 */
export type PersistedView =
  | { screen: "product"; name: string; brand: string | null; model: string | null; year: string }
  | { screen: "order"; orderId: string }
  | { screen: "ordersList" }
  | { screen: "catalog"; brand: string | null; model: string | null; year: string; browsingAll: boolean; category: string }
  | { screen: "home" };

