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


export type CartLine = {
  product: Product;
  quantity: number;
  unitPrice?: number;
  orderItemId?: string;
  listingId?: string | null;
  canReview?: boolean;
  review?: import("@/lib/reviews/types").CustomerReview | null;
  /** Non-REJECTED quantity already covered by an item-level return (see partialReturns on Order). */
  returnedQuantity?: number;
  /** How many more units of this line item can still be returned — purchased minus returnedQuantity, 0 once the order is no longer delivered. */
  remainingReturnable?: number;
};


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


export type OrderStatus = "processing" | "shipped" | "out_for_delivery" | "delivered" | "cancelled";

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

/** Mirrors the DB's OrderReturnStatus enum, lowercased to match this file's other status vocabularies. Deliberately separate from ReturnStatus above — an order can have several PartialReturns, each moving through this independently, alongside (or instead of) one legacy whole-order return. */
export type PartialReturnStatus =
  | "requested"
  | "approved"
  | "pickup_scheduled"
  | "picked_up"
  | "received"
  | "rejected";

/** Mirrors the DB's OrderReturnRefundStatus enum. */
export type PartialRefundStatus = "none" | "requested" | "processing" | "refunded" | "failed";

/** Mirrors the DB's ShippingProvider enum — SHIPROCKET (long-haul) and BORZO (local Pune delivery) are active; PORTER only ever appears on historical rows dispatched before the Shiprocket migration. */
export type ShippingProviderName = "PORTER" | "SHIPROCKET" | "BORZO";

export type PartialReturnLine = { orderItemId: string; quantity: number; productName: string };

/** One item/quantity-level return request — see OrderReturn in the DB. */
export type PartialReturn = {
  id: string;
  status: PartialReturnStatus;
  reason: string;
  adminNote: string | null;
  requestedAt: number;
  approvedAt: number | null;
  receivedAt: number | null;
  condition: "RESELLABLE" | "DAMAGED" | null;
  shippingProvider: ShippingProviderName | null;
  shippingStatus: string | null;
  shippingTrackingUrl: string | null;
  shippingAwbCode: string | null;
  shippingCourierName: string | null;
  refundStatus: PartialRefundStatus;
  refundAmount: number | null;
  refundProcessedAt: number | null;
  items: PartialReturnLine[];
};

export type Order = {
  id: string;
  /** Full, untruncated DB id — `id` above is shortened for display, this is what refund/reorder calls to the server actually address. */
  dbId: string;
  placedAt: number;
  status: OrderStatus;
  statusNote: string;
  expectedDeliveryDate: string | null;
  shippingOrderId?: string | null;
  shippingShipmentId?: string | null;
  /** Optional provider values. Leave absent until supplied and stored by an integration. */
  shippingEstimatedDeliveryAt?: string | null;
  shippingLastUpdatedAt?: string | null;
  deliveryExecutiveName?: string | null;
  deliveryExecutivePhone?: string | null;
  supportEmail?: string | null;
  supportPhone?: string | null;
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
  /** Real, provider-backed forward-shipment info — "PORTER" only ever appears on historical orders dispatched before the Shiprocket migration (see the Prisma ShippingProvider enum). Used by provider-neutral shipment cards. */
  shippingProvider: ShippingProviderName | null;
  shippingStatus: string | null;
  shippingTrackingUrl: string | null;
  shippingAwbCode: string | null;
  shippingCourierName: string | null;
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
  returnShippingProvider: ShippingProviderName | null;
  returnShippingTrackingUrl: string | null;
  returnShippingAwbCode: string | null;
  returnShippingCourierName: string | null;
  returnReceivedAt: number | null;
  /** Item/quantity-level returns — independent of returnStatus above, each with its own lifecycle. See OrderReturn in the DB. */
  partialReturns: PartialReturn[];
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

