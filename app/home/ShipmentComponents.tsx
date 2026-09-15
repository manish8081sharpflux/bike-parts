"use client";

import { Check, ExternalLink, Package, Phone, Truck, User } from "lucide-react";
import type { Order } from "./types";
import { expectedDelivery, formatTrackingDate, getTrackingSteps, lastTrackingUpdate, safeTrackingUrl, shipmentStatus } from "@/lib/order-tracking";
import { buildMapEmbedUrl } from "./utils";

function Rows({ rows }: { rows: Array<[string, string | null | undefined]> }) {
  return <dl className="mt-4 space-y-3 text-sm">{rows.filter(([, value]) => value?.trim()).map(([label, value]) =>
    <div key={label} className="grid min-w-0 gap-1 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
      <dt className="text-zinc-500">{label}</dt><dd className="min-w-0 break-words font-semibold text-[#070e2b] [overflow-wrap:anywhere]">{value}</dd>
    </div>)}
  </dl>;
}

export function OrderStatusCard({ order }: { order: Order }) {
  const steps = getTrackingSteps(order);
  const eta = expectedDelivery(order);
  const deliveredAt = steps[4].timestamp;
  const headline = { processing: "Your order is being prepared", shipped: "Your order is on the way!", out_for_delivery: "Your order is out for delivery!", delivered: "Your order has been delivered!", cancelled: "Your order was cancelled" }[order.status];
  const label = { processing: "Preparing", shipped: "Shipped", out_for_delivery: "Out for Delivery", delivered: "Delivered", cancelled: "Cancelled" }[order.status];
  return <section aria-label="Order status" className="min-w-0 rounded-xl border border-zinc-200 bg-white p-5 shadow-sm">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <h2 className="max-w-md text-xl font-bold leading-tight text-[#070e2b] sm:text-2xl">{headline}</h2>
      <span className={`rounded-full px-3 py-1 text-xs font-semibold ${order.status === "delivered" ? "bg-emerald-50 text-emerald-700" : order.status === "cancelled" ? "bg-red-50 text-red-700" : "bg-orange-50 text-orange-700"}`}>{label}</span>
    </div>
    {eta ? <p className="mt-2 text-sm font-semibold text-zinc-600">Expected {eta.startsWith("Today,") ? eta.replace("Today,", "today,") : eta}</p> : null}
    {order.status === "delivered" && deliveredAt !== null ? <p className="mt-2 text-sm text-emerald-700">Delivered on {formatTrackingDate(deliveredAt, true)}</p> : null}
    {order.status !== "cancelled" ? <ol aria-label="Delivery progress" className="mt-6 grid grid-cols-5">
      {steps.map((step, index) => <li key={step.label} aria-current={step.state === "active" ? "step" : undefined} data-state={step.state} className="relative min-w-0 text-center">
        {index < steps.length - 1 ? <span aria-hidden="true" className={`absolute left-1/2 right-[-50%] top-4 h-0.5 ${step.state === "completed" ? "bg-emerald-500" : "bg-zinc-200"}`} /> : null}
        <span className={`relative mx-auto grid size-8 place-items-center rounded-full ${step.state === "completed" ? "bg-emerald-600 text-white" : step.state === "active" ? "bg-[#ff4b1f] text-white ring-4 ring-orange-50" : "bg-zinc-100 text-zinc-400"}`}>
          {step.state === "completed" ? <Check size={16} aria-hidden="true" /> : index >= 2 && index <= 3 ? <Truck size={15} aria-hidden="true" /> : <Package size={15} aria-hidden="true" />}
        </span>
        <span className="mt-2 block px-0.5 text-[10px] font-semibold leading-tight text-[#070e2b] sm:text-xs">{step.label}</span>
        {step.timestamp !== null ? <time dateTime={new Date(step.timestamp).toISOString()} className="mt-1 block break-words px-0.5 text-[9px] leading-tight text-zinc-500 sm:text-[10px]">{formatTrackingDate(step.timestamp, true)}</time> : null}
      </li>)}
    </ol> : null}
  </section>;
}

function providerDisplayName(provider: Order["shippingProvider"]) {
  if (provider === "SHIPROCKET") return "Shiprocket";
  if (provider === "BORZO") return "Borzo";
  if (provider === "PORTER") return "Porter";
  return null;
}

export function ShipmentDetails({ order }: { order: Order }) {
  const provider = providerDisplayName(order.shippingProvider);
  const isBorzo = order.shippingProvider === "BORZO";
  const orderId = order.shippingOrderId && !["CREATING", "DISPATCHING"].includes(order.shippingOrderId) ? order.shippingOrderId : null;
  const hasExecutive = Boolean(order.deliveryExecutiveName?.trim() || order.deliveryExecutivePhone?.trim());
  const hasLiveLocation = order.deliveryExecutiveLatitude != null && order.deliveryExecutiveLongitude != null;
  return <section aria-label="Shipment details" className="min-w-0 rounded-xl border border-zinc-200 bg-white p-5 shadow-sm">
    <h3 className="text-base font-bold text-[#070e2b]">Shipment Details</h3>
    <Rows rows={[
      ["Provider", provider], [isBorzo ? "Courier/Rider" : "Courier Partner", order.shippingCourierName], ["AWB Number", order.shippingAwbCode],
      [isBorzo ? "Borzo Order ID" : provider ? `Order ID (${provider})` : "Shipment Order ID", orderId],
      ["Shipment ID", order.shippingShipmentId], ["Current Status", shipmentStatus(order)],
      ["Last Update", lastTrackingUpdate(order)], ["Expected Delivery", expectedDelivery(order)],
    ]} />
    {hasExecutive ? <div className="mt-5 border-t border-zinc-100 pt-4">
      <h4 className="text-sm font-semibold text-[#070e2b]">Delivery Executive</h4>
      <div className="mt-2 flex items-center gap-3">
        {/* A real photo only — Borzo's genuine photo_url, never a generated avatar/initials (Part 6). Plain <img>, not next/image: the host is whatever Borzo's own CDN happens to be, which can't be allow-listed in advance. */}
        {order.deliveryExecutivePhotoUrl?.trim() ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={order.deliveryExecutivePhotoUrl} alt="" className="size-10 shrink-0 rounded-full object-cover" />
        ) : (
          <span className="grid size-10 shrink-0 place-items-center rounded-full bg-zinc-100 text-zinc-400"><User size={18} aria-hidden="true" /></span>
        )}
        <div className="min-w-0">
          {order.deliveryExecutiveName?.trim() ? <p className="break-words text-sm font-semibold">{order.deliveryExecutiveName}</p> : null}
          {order.deliveryExecutivePhone?.trim() ? <p className="mt-0.5 flex flex-wrap items-center gap-3 text-sm">
            <span>{order.deliveryExecutivePhone}</span>
            {/^[+\d\s()-]{7,25}$/.test(order.deliveryExecutivePhone) ? <a href={`tel:${order.deliveryExecutivePhone.replace(/[^+\d]/g, "")}`} className="inline-flex items-center gap-1 rounded-lg border border-zinc-200 px-3 py-2"><Phone size={14} aria-hidden="true" />Call</a> : null}
          </p> : null}
        </div>
      </div>
      {/* Rider live-state line — real signals only (Part 12): a courier
          reporting a live position vs. one merely assigned. */}
      {isBorzo ? <p className="mt-3 text-xs text-zinc-500">{hasLiveLocation ? "Your rider is on the way." : "Delivery executive assigned."}</p> : null}
    </div> : isBorzo ? <p className="mt-4 text-xs text-zinc-500">Borzo delivery created.</p> : null}
  </section>;
}

export function ShipmentTracking({ order }: { order: Order }) {
  const url = safeTrackingUrl(order.shippingTrackingUrl);
  const provider = providerDisplayName(order.shippingProvider);
  const isBorzo = order.shippingProvider === "BORZO";
  const hasLiveLocation = order.deliveryExecutiveLatitude != null && order.deliveryExecutiveLongitude != null;
  return <section aria-label="Shipment tracking" className="min-w-0 rounded-xl border border-zinc-200 bg-white p-5 shadow-sm">
    <h3 className="flex items-center gap-2 text-base font-bold text-[#070e2b]"><Truck size={19} className="text-orange-600" aria-hidden="true" />{isBorzo ? "Live Delivery Tracking" : "Shipment Tracking"}</h3>
    {/* Only Shiprocket gets "Powered by" co-branding — Borzo and legacy Porter rows just state the provider plainly (Part 26: no Shiprocket branding on a Borzo delivery). */}
    {provider ? <p className="mt-1 text-xs text-zinc-500">{provider === "Shiprocket" ? "Powered by Shiprocket" : `Provider: ${provider}`}</p> : null}
    {/* A real rider map only when Borzo actually returned live coordinates — never derived from an address, pincode, or city center (Part 7). */}
    {isBorzo ? (
      hasLiveLocation ? (
        <div className="mt-4 aspect-[4/3] w-full overflow-hidden rounded-lg border border-zinc-200">
          <iframe
            key={`${order.deliveryExecutiveLatitude},${order.deliveryExecutiveLongitude}`}
            title="Rider location"
            src={buildMapEmbedUrl({ lat: order.deliveryExecutiveLatitude!, lon: order.deliveryExecutiveLongitude! })}
            className="h-full w-full border-0"
            loading="lazy"
          />
        </div>
      ) : (
        <p className="mt-3 text-xs text-zinc-500">Live courier location is not available yet.</p>
      )
    ) : null}
    <Rows rows={[["Courier Partner", order.shippingCourierName], ["AWB Number", order.shippingAwbCode], ["Current Status", shipmentStatus(order)], ["Last Update", lastTrackingUpdate(order)], ["Estimated Delivery", expectedDelivery(order)]]} />
    {url ? <a href={url} target="_blank" rel="noreferrer" className="mt-5 flex w-full items-center justify-center gap-2 rounded-lg bg-[#ff4b1f] px-4 py-3 text-sm font-semibold text-white hover:bg-[#e83b11]">{isBorzo ? "Track Delivery" : "Track Shipment"}<ExternalLink size={15} aria-hidden="true" /></a> : <p className="mt-4 text-xs text-zinc-500">{order.shippingAwbCode ? "Use the AWB above when contacting the courier." : "Tracking details will appear when available."}</p>}
  </section>;
}
