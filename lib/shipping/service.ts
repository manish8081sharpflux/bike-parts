/**
 * Generic shipping service — the ONLY module the rest of the app (order
 * state machines, admin actions, UI) should import for shipping
 * functionality. It resolves the configured provider and delegates to that
 * provider's implementation; nothing outside lib/shipping/ should import
 * from lib/shipping/providers/* directly.
 *
 * Today there is exactly one real provider (Shiprocket), selected via
 * SHIPPING_PROVIDER=SHIPROCKET. A second provider would mean adding a file
 * under providers/, a branch in resolveProvider() below, and nothing else —
 * Order/OrderReturn's shippingProvider column already stores the provider
 * name per-shipment specifically so historical shipments (including
 * pre-migration "PORTER" rows — see the Prisma ShippingProvider enum and the
 * migration note on Order.shippingProvider) remain distinguishable forever.
 */
import * as shiprocket from "./providers/shiprocket";
import type {
  AwbResult,
  CancelShipmentResult,
  CheckServiceabilityInput,
  CourierOption,
  CreateShipmentInput,
  CreateShipmentResult,
  PickupResult,
  ReverseShipmentInput,
  ShippingProvider,
  TrackingResult,
} from "./types";

export { ShippingProviderError } from "./providers/shiprocket";
export * from "./types";

function resolveProvider(): ShippingProvider {
  const configured = (process.env.SHIPPING_PROVIDER || "SHIPROCKET").toUpperCase();
  if (configured !== "SHIPROCKET") {
    throw new Error(`Unsupported SHIPPING_PROVIDER "${configured}". Only SHIPROCKET is implemented today.`);
  }
  return "SHIPROCKET";
}

export function getConfiguredProvider(): ShippingProvider {
  return resolveProvider();
}

export function isShippingConfigured(): boolean {
  try {
    return resolveProvider() === "SHIPROCKET" && shiprocket.isShiprocketConfigured();
  } catch {
    return false;
  }
}

export function assertShippingConfigured(): void {
  resolveProvider();
  shiprocket.assertShiprocketConfigured();
}

export async function checkServiceability(input: CheckServiceabilityInput): Promise<CourierOption[]> {
  resolveProvider();
  return shiprocket.checkServiceability(input);
}

/** Creates a forward shipment for a paid order. */
export async function createShipment(input: CreateShipmentInput): Promise<CreateShipmentResult> {
  resolveProvider();
  return shiprocket.createForwardShipment(input);
}

/** Creates a reverse shipment for a return — pickup = customer address, drop = warehouse. Only ever pass the returned items/quantities, never the full order (see lib/order-returns/service.ts). */
export async function createReverseShipment(input: ReverseShipmentInput): Promise<CreateShipmentResult> {
  resolveProvider();
  return shiprocket.createReverseShipment(input);
}

export async function assignAwb(shippingShipmentId: string, courierCompanyId?: string): Promise<AwbResult> {
  resolveProvider();
  return shiprocket.assignAwb(shippingShipmentId, courierCompanyId);
}

export async function schedulePickup(shippingShipmentId: string): Promise<PickupResult> {
  resolveProvider();
  return shiprocket.generatePickup(shippingShipmentId);
}

/** Tracks a shipment, preferring the AWB (the provider's tracking granularity is per-AWB, not per-order) and falling back to the shipment id if no AWB exists yet. */
export async function trackShipment(identifiers: { awbCode?: string | null; shippingShipmentId?: string | null }): Promise<TrackingResult> {
  resolveProvider();
  if (identifiers.awbCode) return shiprocket.trackByAwb(identifiers.awbCode);
  if (identifiers.shippingShipmentId) return shiprocket.trackByShipmentId(identifiers.shippingShipmentId);
  throw new Error("trackShipment requires an AWB code or a shipment id.");
}

/** Only attempt when the shipment's state actually allows cancellation (see the admin action for the exact allowed states) — the provider itself will also reject a cancellation past pickup. */
export async function cancelShipment(shippingOrderId: string): Promise<CancelShipmentResult> {
  resolveProvider();
  return shiprocket.cancelOrder(shippingOrderId);
}
