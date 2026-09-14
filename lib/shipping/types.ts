/**
 * Provider-neutral shipping types. Nothing here may name Shiprocket, Porter,
 * or any other courier — see lib/shipping/service.ts (the generic entry
 * point the rest of the app depends on) and lib/shipping/providers/shiprocket.ts
 * (the only concrete implementation today). Adding a second provider later
 * means adding another file under providers/ and a branch in service.ts's
 * provider resolver — nothing in Order/OrderReturn or the admin/customer UI
 * should ever need to change.
 */

/** The set of shipping providers this app can actively create NEW shipments through. Historical DB rows may also carry "PORTER" (see the Prisma ShippingProvider enum) for shipments created before this migration — that value is never returned here and never selectable as the active provider. */
export type ShippingProvider = "SHIPROCKET";

export type ShippingAddress = {
  contactName: string;
  contactPhone: string;
  line1: string;
  line2?: string;
  city: string;
  state?: string;
  pincode: string;
};

/** One physical parcel's weight/dimensions — see lib/shipping/package.ts for how an order's items are turned into this. */
export type ShippingPackage = {
  weightKg: number;
  lengthCm: number;
  breadthCm: number;
  heightCm: number;
};

export type ShippingOrderItem = {
  name: string;
  sku: string | null;
  quantity: number;
  unitPrice: number;
};

export type CreateShipmentInput = {
  /** Internal reference the provider echoes back — e.g. an Order id or `return-{orderReturnId}` — never guessed or reused across two different shipments. */
  referenceId: string;
  pickup: ShippingAddress;
  drop: ShippingAddress;
  package: ShippingPackage;
  items: ShippingOrderItem[];
  /** Total payable value of the shipment's contents, for the provider's invoice/manifest — never the cash-on-delivery amount (this app is prepaid-only; see codAmount). */
  declaredValue: number;
  /** Always 0 for this app today — checkout is prepaid via Razorpay, never COD. Threaded through explicitly (rather than hardcoded inside the provider) so that changes if COD is ever introduced. */
  codAmount: number;
  /** Which courier to book, once known (see checkServiceability/CourierOption below). Omitted for the initial order-creation call, before a courier has been chosen. */
  courierCompanyId?: string;
  instructions?: string;
};

export type CreateShipmentResult = {
  provider: ShippingProvider;
  shippingOrderId: string;
  shippingShipmentId: string | null;
  status: string;
  raw: unknown;
};

export type AwbResult = {
  awbCode: string;
  courierName: string;
  courierCompanyId: string | null;
  raw: unknown;
};

export type PickupResult = {
  status: string;
  raw: unknown;
};

export type TrackingResult = {
  /** The provider's raw status string, stored as-is (see Order.shippingStatus) — never discarded even when it maps to nothing internally. */
  rawStatus: string;
  trackingUrl: string | null;
  raw: unknown;
};

export type CancelShipmentResult = {
  cancelled: boolean;
  raw: unknown;
};

export type ReverseShipmentInput = {
  referenceId: string;
  /** The customer's address — pickup point for a reverse shipment. */
  pickup: ShippingAddress;
  /** The warehouse — drop point for a reverse shipment. */
  drop: ShippingAddress;
  package: ShippingPackage;
  /** Only the returned items/quantities, never the full original order — see lib/order-returns/service.ts. */
  items: ShippingOrderItem[];
  declaredValue: number;
  instructions?: string;
};

export type CourierOption = {
  courierCompanyId: string;
  courierName: string;
  rate: number;
  estimatedDeliveryDays: number | null;
  raw: unknown;
};

export type CheckServiceabilityInput = {
  pickupPincode: string;
  deliveryPincode: string;
  weightKg: number;
  cod: boolean;
};
