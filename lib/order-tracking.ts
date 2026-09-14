import type { Order, OrderEventEntry } from "@/app/home/types";

export const TRACKING_STEPS = ["Order Placed", "Preparing", "Shipped", "Out for Delivery", "Delivered"] as const;
export const TRACKING_INDEX = { processing: 1, shipped: 2, out_for_delivery: 3, delivered: 4 };

/** Both historical enum messages and current human-readable activity messages. */
export function trackingEventStatus(event: OrderEventEntry): string | null {
  if (event.type === "ORDER_PLACED") return "PENDING";
  if (event.type === "DISPATCHED") return "SHIPPED";
  if (event.type !== "STATUS_CHANGE") return null;
  const status = /Status changed to (Out for Delivery|OUT_FOR_DELIVERY|Preparing|PENDING|PAID|PACKED|SHIPPED|Shipped|Delivered|DELIVERED|Cancelled|CANCELLED)\b/i.exec(event.message)?.[1];
  return status ? status.toUpperCase().replaceAll(" ", "_") : null;
}

export function getTrackingSteps(order: Pick<Order, "status" | "events" | "placedAt">) {
  const current = order.status === "cancelled" ? -1 : TRACKING_INDEX[order.status];
  const statuses = [["PENDING"], ["PAID", "PACKED", "PREPARING"], ["SHIPPED"], ["OUT_FOR_DELIVERY"], ["DELIVERED"]];
  return TRACKING_STEPS.map((label, index) => {
    const times = (order.events ?? []).filter((event) => statuses[index].includes(trackingEventStatus(event) ?? ""))
      .map((event) => event.createdAt).filter(Number.isFinite);
    const timestamp = times.length ? Math.min(...times) : index === 0 && Number.isFinite(order.placedAt) ? order.placedAt : null;
    return {
      label, timestamp: index <= current ? timestamp : null,
      state: order.status === "delivered" || index < current ? "completed" : index === current ? "active" : "pending",
    };
  });
}

export function safeTrackingUrl(value?: string | null) {
  if (!value) return null;
  try {
    const url = new URL(value);
    return ["http:", "https:"].includes(url.protocol) && !url.username && !url.password ? url.href : null;
  } catch { return null; }
}

export function formatTrackingDate(value: string | number, withTime = false) {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return null;
  return new Intl.DateTimeFormat("en-IN", {
    timeZone: "Asia/Kolkata", day: "numeric", month: "short", year: "numeric",
    ...(withTime ? { hour: "numeric", minute: "2-digit" } as const : {}),
  }).format(date);
}

export function expectedDelivery(order: Pick<Order, "shippingEstimatedDeliveryAt" | "expectedDeliveryDate" | "status">, now = Date.now()) {
  if (order.status === "delivered" || order.status === "cancelled") return null;
  const eta = order.shippingEstimatedDeliveryAt;
  if (eta && formatTrackingDate(eta)) {
    const day = (date: number) => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(new Date(date));
    return `${day(new Date(eta).getTime()) === day(now) ? "Today, " : ""}${formatTrackingDate(eta)}`;
  }
  return order.expectedDeliveryDate?.trim() || null;
}

export function shipmentStatus(order: Pick<Order, "status" | "shippingStatus">) {
  if (order.status === "delivered") return "Delivered";
  if (order.status === "cancelled") return "Cancelled";
  const raw = order.shippingStatus?.trim();
  if (raw && !["CREATING", "DISPATCHING", "RECONCILIATION_REQUIRED"].includes(raw)) return raw.replaceAll("_", " ").replace(/\b\w+/g, (word) => word[0].toUpperCase() + word.slice(1).toLowerCase());
  return { processing: "Preparing", shipped: "Shipped", out_for_delivery: "Out for Delivery" }[order.status];
}

export function lastTrackingUpdate(order: Pick<Order, "shippingLastUpdatedAt" | "events">) {
  if (order.shippingLastUpdatedAt && formatTrackingDate(order.shippingLastUpdatedAt)) return formatTrackingDate(order.shippingLastUpdatedAt, true);
  const times = (order.events ?? []).filter((event) => event.type !== "ORDER_PLACED" && trackingEventStatus(event) !== null)
    .map((event) => event.createdAt).filter(Number.isFinite);
  return times.length ? formatTrackingDate(Math.max(...times), true) : null;
}
