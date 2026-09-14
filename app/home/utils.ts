// Pure helper functions for the customer storefront — price formatting,
// Razorpay script loading, order-status mapping, address formatting, the
// deterministic mock rider/ETA generators, etc. Extracted from the former
// monolithic home-client.tsx.
import { MapPin } from "lucide-react";
import type { Product } from "@/lib/storefront-catalog";
import type { Address, Order, OrderEventEntry, OrderStatus, PartialRefundStatus, PartialReturnStatus, RefundStatus, ReturnStatus } from "./types";
import { addressIcons, riderRoster, stepIndexForStatus } from "./constants";
import { parsePrice, formatPrice } from "./format";

// Re-exported so every file that already imports these from "./utils"
// (most of them) keeps working unchanged.
export { parsePrice, formatPrice };

/**
 * Builds the product detail gallery strip from the product's own images
 * only — never other products' photos. Main image first, deduplicated
 * (an admin could accidentally list the main image again in the gallery
 * array), with falsy entries dropped.
 */
export function buildGalleryImages(product: Pick<Product, "image" | "images">): string[] {
  return Array.from(new Set([product.image, ...product.images].filter(Boolean)));
}

/**
 * Formats a real delivery window from whichever of deliveryDaysMin/Max the
 * admin actually set. Returns null when neither is set — callers must hide
 * the delivery text (or show a neutral checkout-time label) rather than
 * inventing a number, since a fake "2-3 days" reads as a real commitment.
 */
export function formatDeliveryEstimate(min: number | null, max: number | null): string | null {
  if (min != null && max != null) {
    return min === max ? `${min} days` : `${min}-${max} days`;
  }
  if (min != null) return `From ${min} days`;
  if (max != null) return `Up to ${max} days`;
  return null;
}

/** Display metadata derived from verified customer reviews and product delivery settings. */
export function getProductDisplayMeta(products: Product[], product: Product) {
  const productIndex = products.findIndex((item) => item.name === product.name);
  const rating = product.ratingAverage;
  const ratingCount = product.ratingCount;
  const deliveryDays = formatDeliveryEstimate(product.deliveryDaysMin, product.deliveryDaysMax);
  const offerLabel =
    product.offerLabel ??
    (productIndex % 3 === 0
      ? "20% OFF ON SERVICE KITS"
      : productIndex % 3 === 1
      ? "FREE FITMENT CHECK"
      : "OEM QUALITY ASSURED");
  return { rating, ratingCount, deliveryDays, offerLabel };
}


export let razorpayScriptPromise: Promise<void> | null = null;

/** Injects Razorpay's Checkout script once and resolves when it's ready to use. */

export const loadRazorpayCheckout = () => {
  if (typeof window === "undefined") {
    return Promise.reject(new Error("Razorpay checkout is only available in the browser."));
  }
  if (window.Razorpay) {
    return Promise.resolve();
  }
  if (razorpayScriptPromise) {
    return razorpayScriptPromise;
  }

  razorpayScriptPromise = new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = "https://checkout.razorpay.com/v1/checkout.js";
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("Could not load the Razorpay checkout script."));
    document.body.appendChild(script);
  });

  return razorpayScriptPromise;
};

/** Maps the backend's OrderStatus enum to this UI's simpler status vocabulary. */

export const mapDbOrderStatus = (status: string): OrderStatus => {
  if (status === "OUT_FOR_DELIVERY") return "out_for_delivery";
  if (status === "DELIVERED") return "delivered";
  if (status === "CANCELLED") return "cancelled";
  return "processing";
};

/** Maps the backend's RefundStatus enum to this UI's lowercased vocabulary. */
export const mapDbRefundStatus = (status: string): RefundStatus => {
  if (status === "REQUESTED") return "requested";
  if (status === "PROCESSING") return "processing";
  if (status === "REJECTED") return "rejected";
  if (status === "REFUNDED") return "refunded";
  return "none";
};

/** Maps the backend's ReturnStatus enum to this UI's lowercased vocabulary. */
export const mapDbReturnStatus = (status: string): ReturnStatus => {
  if (status === "REQUESTED") return "requested";
  if (status === "REJECTED") return "rejected";
  if (status === "APPROVED") return "approved";
  if (status === "PICKUP_SCHEDULED") return "pickup_scheduled";
  if (status === "PICKED_UP") return "picked_up";
  if (status === "RECEIVED") return "received";
  return "none";
};

/** Maps the backend's OrderReturnStatus enum (one item/quantity-level return) to this UI's lowercased vocabulary — no "none" case since a PartialReturn only ever exists once actually requested. */
export const mapDbPartialReturnStatus = (status: string): PartialReturnStatus => {
  if (status === "APPROVED") return "approved";
  if (status === "PICKUP_SCHEDULED") return "pickup_scheduled";
  if (status === "PICKED_UP") return "picked_up";
  if (status === "RECEIVED") return "received";
  if (status === "REJECTED") return "rejected";
  return "requested";
};

/** Maps the backend's OrderReturnRefundStatus enum. */
export const mapDbPartialRefundStatus = (status: string): PartialRefundStatus => {
  if (status === "REQUESTED") return "requested";
  if (status === "PROCESSING") return "processing";
  if (status === "REFUNDED") return "refunded";
  if (status === "FAILED") return "failed";
  return "none";
};


export const getAddressIcon = (label: string) =>
  addressIcons[label] ?? { icon: MapPin, className: "bg-zinc-100 text-zinc-600" };


export const formatAddressLines = (address: Address) => {
  const primary = [address.flatNo, address.floor ? `${address.floor} Floor` : ""]
    .filter(Boolean)
    .join(", ");

  const secondaryParts = [
    address.area,
    address.landmark ? `Near ${address.landmark}` : "",
  ].filter(Boolean);

  const secondary = `${secondaryParts.join(", ")} - ${address.city} - ${address.pincode}`;

  return { primary, secondary };
};


export const extractEventStatus = (event: OrderEventEntry): string | null => {
  if (event.type === "ORDER_PLACED") return "PENDING";
  if (event.type === "DISPATCHED") return "SHIPPED";
  const match = /Status changed to (\w+)/.exec(event.message);
  return match ? match[1] : null;
};

/**
 * Real timestamp for when an order first reached a tracking step, from its
 * activity log — falls back to a guessed offset from `placedAt` when there's
 * no event history yet (e.g. the demo orders shown before a real fetch
 * resolves, or an order whose events haven't loaded).
 */

export const findStepTime = (
  events: OrderEventEntry[] | undefined,
  matches: (rawStatus: string) => boolean,
  fallback: number
): number => {
  const candidates = (events ?? [])
    .map((event) => ({ event, rawStatus: extractEventStatus(event) }))
    .filter((entry): entry is { event: OrderEventEntry; rawStatus: string } => entry.rawStatus !== null)
    .filter((entry) => matches(entry.rawStatus))
    .sort((a, b) => a.event.createdAt - b.event.createdAt);
  return candidates[0]?.event.createdAt ?? fallback;
};


export const getRiderForOrder = (order: Order) => {
  const seed = order.id.split("").reduce((sum, char) => sum + char.charCodeAt(0), 0);
  const rider = riderRoster[seed % riderRoster.length];
  return {
    ...rider,
    rating: (4.6 + (seed % 4) / 10).toFixed(1),
    deliveries: 1800 + ((seed * 37) % 2200),
    distanceKm: (1.2 + (seed % 5)).toFixed(1),
  };
};


export const parseEstimateDayRange = (estimate: string) => {
  const rangeMatch = estimate.match(/(\d+)\s*-\s*(\d+)/);
  if (rangeMatch) {
    return { min: Number(rangeMatch[1]), max: Number(rangeMatch[2]) };
  }

  const singleMatch = estimate.match(/(\d+)/);
  if (singleMatch) {
    const days = Number(singleMatch[1]);
    return { min: days, max: days };
  }

  return { min: 2, max: 4 };
};


export const computeExpectedDeliveryLabel = (placedAt: number, deliveryEstimate: string) => {
  const dayMs = 24 * 60 * 60 * 1000;
  const { min, max } = parseEstimateDayRange(deliveryEstimate);
  const minDate = new Date(placedAt + min * dayMs);
  const maxDate = new Date(placedAt + max * dayMs);

  if (min === max) {
    return maxDate.toLocaleDateString("en-IN", {
      day: "numeric",
      month: "short",
      year: "numeric",
    });
  }

  const minLabel = minDate.toLocaleDateString("en-IN", { day: "numeric", month: "short" });
  const maxLabel = maxDate.toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });

  return `${minLabel} - ${maxLabel}`;
};


export function buildMapEmbedUrl(center: { lat: number; lon: number }) {
  const latPad = 0.045;
  const lonPad = 0.06;
  const bbox = [
    center.lon - lonPad,
    center.lat - latPad,
    center.lon + lonPad,
    center.lat + latPad,
  ].join(",");

  return `https://www.openstreetmap.org/export/embed.html?bbox=${bbox}&layer=mapnik&marker=${center.lat},${center.lon}`;
}


export const formatClockTime = (ms: number) =>
  new Date(ms).toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit" });

