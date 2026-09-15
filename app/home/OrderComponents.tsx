"use client";

import { OrderStatusCard, ShipmentDetails, ShipmentTracking } from "./ShipmentComponents";
import { formatTrackingDate, safeTrackingUrl } from "@/lib/order-tracking";
import { PurchaseReviewEditor } from "./ReviewComponents";

import { useState } from "react";
import Image from "next/image";
import { ArrowRight, Banknote, Bike, CheckCircle2, ChevronLeft, ChevronRight, FileText, Gift, HelpCircle, Home as HomeIcon, Loader2, MessageCircle, Package, Phone, RotateCw, Star, Store, Trash2, Zap } from "lucide-react";
import type { Order, OrderStatus } from "./types";
import {
  orderStatusMeta,
  orderTrackingSteps,
  stepIndexForStatus,
  orderStatusFilters,
} from "./constants";
import { getAddressIcon, formatAddressLines, parsePrice, formatPrice } from "./utils";
import { formatOrderNumber } from "@/lib/format";

export function OrderMiniTracker({ order }: { order: Order }) {
  const currentStepIndex = stepIndexForStatus[order.status];
  if (currentStepIndex === undefined) {
    return null;
  }

  return (
    <div className="flex w-full max-w-[280px] items-start">
      {orderTrackingSteps.map((step, index) => {
        const done = index < currentStepIndex;
        const isCurrent = index === currentStepIndex;
        const StepIcon = index === 2 ? Bike : HomeIcon;

        return (
          <div key={step} className="flex flex-1 flex-col items-center text-center last:flex-none">
            <div className="flex w-full items-center">
              <span
                className={`grid size-6 shrink-0 place-items-center rounded-full text-white ${
                  done || isCurrent ? "bg-[#ff4b1f]" : "bg-zinc-200 text-zinc-400"
                }`}
              >
                {done ? <CheckCircle2 className="size-3.5" /> : <StepIcon className="size-3" />}
              </span>
              {index < orderTrackingSteps.length - 1 ? (
                <span className={`mx-0.5 h-0.5 flex-1 rounded-full ${done ? "bg-[#ff4b1f]" : "bg-zinc-200"}`} />
              ) : null}
            </div>
            <span className={`mt-1 text-[9px] font-bold leading-tight ${done || isCurrent ? "text-[#070e2b]" : "text-zinc-400"}`}>
              {step}
            </span>
          </div>
        );
      })}
    </div>
  );
}


export function OrderListRow({
  order,
  onOpen,
  onReorder,
}: {
  order: Order;
  onOpen: () => void;
  onReorder: () => void;
}) {
  const meta = orderStatusMeta[order.status];
  const StatusIcon = meta.icon;
  const itemCount = order.items.reduce((sum, item) => sum + item.quantity, 0);
  const isActive = order.status === "processing" || order.status === "shipped" || order.status === "out_for_delivery";
  const firstProduct = order.items[0]?.product;
  const dateLabel = new Date(order.placedAt).toLocaleDateString("en-IN", {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
  });
  const timeLabel = new Date(order.placedAt).toLocaleTimeString("en-IN", {
    hour: "numeric",
    minute: "2-digit",
  });

  return (
    <div className="flex w-full flex-col gap-4 rounded-xl border border-zinc-100 bg-white p-4 shadow-sm transition hover:shadow-md sm:flex-row sm:items-center sm:gap-5 sm:p-5">
      <button type="button" onClick={onOpen} className="flex min-w-0 flex-1 items-center gap-4 text-left">
        {firstProduct ? (
          <span className="grid size-16 shrink-0 place-items-center overflow-hidden rounded-lg bg-[#fbfbfa] p-1.5 ring-1 ring-zinc-100 sm:size-20">
            <Image
              src={firstProduct.image}
              alt={firstProduct.name}
              width={72}
              height={72}
              className="h-full w-full object-contain"
            />
          </span>
        ) : null}

        <span className="min-w-0 flex-1">
          <span className="block truncate text-base font-black text-[#070e2b]">{order.bikeLabel}</span>
          <span className="block truncate text-xs text-zinc-500">
            {order.address.area}, {order.address.city}
          </span>
          <span className="mt-1 block truncate text-sm text-zinc-600">
            {order.items.map(({ product }) => product.name).join(", ")}
          </span>
          <span className="mt-1 block text-xs font-bold text-zinc-500">
            {itemCount} item{itemCount === 1 ? "" : "s"} &bull; &#8377;{formatPrice(order.total)}
          </span>
        </span>
      </button>

      <div className="flex shrink-0 flex-col items-start gap-2 border-t border-zinc-100 pt-3 sm:items-end sm:border-t-0 sm:pt-0 sm:text-right">
        {isActive ? (
          <>
            <span className="inline-flex items-center gap-1.5 text-sm font-black text-emerald-600">
              <Bike className="size-4" />
              {order.status === "out_for_delivery" ? "Out for delivery" : order.status === "shipped" ? "Shipped" : "Preparing your order"}
            </span>
            <OrderMiniTracker order={order} />
          </>
        ) : (
          <>
            <span
              className={`inline-flex items-center gap-1.5 text-sm font-black ${
                order.status === "cancelled" ? "text-red-600" : "text-emerald-600"
              }`}
            >
              <StatusIcon className="size-4" />
              {meta.label}
            </span>
            <span className="text-xs text-zinc-500">
              {dateLabel}, {timeLabel}
            </span>
          </>
        )}

        {order.returnStatus !== "none" ? (
          <span
            className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-black uppercase tracking-wide ${
              order.returnStatus === "received"
                ? "bg-emerald-50 text-emerald-700"
                : order.returnStatus === "rejected"
                ? "bg-red-50 text-red-700"
                : "bg-blue-50 text-blue-700"
            }`}
          >
            <RotateCw className="size-3" />
            Return {order.returnStatus.replace(/_/g, " ")}
          </span>
        ) : null}

        {order.refundStatus !== "none" ? (
          <span
            className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-black uppercase tracking-wide ${
              order.refundStatus === "refunded"
                ? "bg-emerald-50 text-emerald-700"
                : order.refundStatus === "rejected"
                ? "bg-red-50 text-red-700"
                : "bg-amber-50 text-amber-700"
            }`}
          >
            <Banknote className="size-3" />
            Refund {order.refundStatus}
          </span>
        ) : null}

        <span className="mt-1 flex shrink-0 gap-2">
          {order.status === "delivered" ? (
            <button
              type="button"
              onClick={onReorder}
              className="inline-flex items-center gap-1.5 rounded-full border border-[#ff4b1f] px-3 py-1.5 text-xs font-bold text-[#ff4b1f] transition hover:bg-[#fff0eb]"
            >
              <RotateCw className="size-3.5" />
              Reorder
            </button>
          ) : null}
          <button
            type="button"
            onClick={onOpen}
            className="rounded-full border border-zinc-200 px-3 py-1.5 text-xs font-bold text-zinc-700 transition hover:border-zinc-400"
          >
            View Details
          </button>
        </span>
      </div>
    </div>
  );
}


export function OrdersListPage({
  orders,
  onOpenOrder,
  onReorder,
}: {
  orders: Order[];
  onOpenOrder: (orderId: string) => void;
  onReorder: (order: Order) => void;
}) {
  const ORDERS_PAGE_SIZE = 6;
  const [activeFilter, setActiveFilter] = useState<OrderStatus | "all">("all");
  const [currentPage, setCurrentPage] = useState(1);
  const filteredOrders = activeFilter === "all" ? orders : orders.filter((order) => order.status === activeFilter);
  const totalPages = Math.max(1, Math.ceil(filteredOrders.length / ORDERS_PAGE_SIZE));
  const pagedOrders = filteredOrders.slice(
    (currentPage - 1) * ORDERS_PAGE_SIZE,
    currentPage * ORDERS_PAGE_SIZE
  );

  return (
    <div className="min-h-[calc(100vh-64px)] w-full bg-zinc-50 px-4 py-6 sm:px-6 lg:px-14 lg:py-8">
      <div className="mx-auto w-full max-w-[1000px]">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h1 className="text-2xl font-black text-[#070e2b] sm:text-3xl">My Orders</h1>
            <p className="mt-1 text-sm text-zinc-500">View and track all your past and current orders</p>
          </div>

          <div className="no-scrollbar flex gap-2 overflow-x-auto">
            {orderStatusFilters.map((filter) => (
              <button
                type="button"
                key={filter.key}
                onClick={() => {
                  setActiveFilter(filter.key);
                  setCurrentPage(1);
                }}
                className={`inline-flex h-9 flex-auto items-center justify-center gap-2 rounded-xl border px-3 text-xs font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#c73510] ${
                  activeFilter === filter.key
                    ? "border-[#ff4b1f] bg-[#fff0eb] text-[#ff4b1f]"
                    : "border-zinc-200 bg-white text-zinc-700 hover:border-zinc-300"
                }`}
              >
                {filter.label}
              </button>
            ))}
          </div>
        </div>

        <div className="mt-6 space-y-4">
          {filteredOrders.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-3 rounded-xl border border-zinc-100 bg-white py-16 text-center shadow-sm">
              <span className="grid size-16 place-items-center rounded-full bg-zinc-100 text-zinc-400">
                <Package className="size-7" />
              </span>
              <p className="text-sm font-bold text-[#070e2b]">No orders here</p>
              <p className="text-xs text-zinc-500">
                {activeFilter === "all" ? "Orders you place will show up here." : "Try a different filter."}
              </p>
            </div>
          ) : (
            pagedOrders.map((order) => (
              <OrderListRow
                key={order.id}
                order={order}
                onOpen={() => onOpenOrder(order.id)}
                onReorder={() => onReorder(order)}
              />
            ))
          )}
        </div>

        {totalPages > 1 ? (
          <div className="mt-6 flex items-center justify-center gap-2">
            <button
              type="button"
              onClick={() => setCurrentPage((page) => Math.max(1, page - 1))}
              disabled={currentPage === 1}
              aria-label="Previous page"
              className="grid size-9 place-items-center rounded-full border border-zinc-200 bg-white text-zinc-600 transition hover:border-zinc-300 disabled:cursor-not-allowed disabled:opacity-40"
            >
              <ChevronLeft className="size-4" />
            </button>

            {Array.from({ length: totalPages }, (_, index) => index + 1).map((page) => (
              <button
                type="button"
                key={page}
                onClick={() => setCurrentPage(page)}
                aria-current={page === currentPage ? "page" : undefined}
                className={`grid size-9 place-items-center rounded-full text-xs font-bold transition ${
                  page === currentPage
                    ? "bg-zinc-950 text-white"
                    : "border border-zinc-200 bg-white text-zinc-700 hover:border-zinc-300"
                }`}
              >
                {page}
              </button>
            ))}

            <button
              type="button"
              onClick={() => setCurrentPage((page) => Math.min(totalPages, page + 1))}
              disabled={currentPage === totalPages}
              aria-label="Next page"
              className="grid size-9 place-items-center rounded-full border border-zinc-200 bg-white text-zinc-600 transition hover:border-zinc-300 disabled:cursor-not-allowed disabled:opacity-40"
            >
              <ChevronRight className="size-4" />
            </button>
          </div>
        ) : null}
      </div>
    </div>
  );
}

// Default pickup point: the warehouse city dispatchOrderAction uses
// (process.env.WAREHOUSE_CITY, defaulting to "Patna" — see
// lib/actions/admin-orders.ts's warehouseAddress()). Not read from env here
// since this is a client component and that var isn't (and shouldn't be)
// public.

export function OrderDetailView({
  order,
  onReviewSaved,
  onBack,
  onRequestReturn,
  isRequestingReturn,
  returnRequestError,
  onRequestPartialReturn,
  isRequestingPartialReturn,
  partialReturnError,
  onCancelOrder,
  isCancellingOrder,
  cancelOrderError,
}: {
  order: Order;
  onReviewSaved: () => void;
  onBack: () => void;
  /** Submits a return request with the given reason for this order. */
  onRequestReturn: (reason: string) => void;
  isRequestingReturn: boolean;
  returnRequestError: string | null;
  /** Submits an item/quantity-level return request. Resolves true only once the server has actually accepted it. */
  onRequestPartialReturn: (reason: string, lines: Array<{ orderItemId: string; quantity: number }>) => Promise<boolean>;
  isRequestingPartialReturn: boolean;
  partialReturnError: string | null;
  /** Cancels this order outright — a paid order's refund is then requested automatically, no separate step needed. */
  onCancelOrder: () => void;
  isCancellingOrder: boolean;
  cancelOrderError: string | null;
}) {
  const [isReturnFormOpen, setIsReturnFormOpen] = useState(false);
  const [returnReasonDraft, setReturnReasonDraft] = useState("");
  const [isPartialReturnFormOpen, setIsPartialReturnFormOpen] = useState(false);
  const [partialReturnReasonDraft, setPartialReturnReasonDraft] = useState("");
  const [partialReturnQuantities, setPartialReturnQuantities] = useState<Record<string, number>>({});
  const [isCancelConfirmOpen, setIsCancelConfirmOpen] = useState(false);
  const isDelivered = order.status === "delivered";
  const isCancelled = order.status === "cancelled";
  const trackingUrl = safeTrackingUrl(order.shippingTrackingUrl);
  const supportUrl = order.supportEmail ? `mailto:${order.supportEmail}?subject=Order%20${encodeURIComponent(order.dbId)}` : order.supportPhone ? `tel:${order.supportPhone.replace(/[^+\d]/g, "")}` : null;
  const canReturn = order.isPaid && isDelivered && ((order.returnStatus === "none" || order.returnStatus === "rejected") || order.items.some(item => (item.remainingReturnable ?? 0) > 0));

  return (
    <div className="min-h-[calc(100vh-64px)] w-full bg-zinc-50 px-4 py-6 sm:px-6 lg:px-14 lg:py-8">
      <button
        type="button"
        onClick={onBack}
        className="mb-4 flex items-center gap-2 text-sm font-bold text-[#53607e] transition hover:text-[#ff4b1f]"
      >
        <ArrowRight className="size-4 rotate-180" />
        My Orders
      </button>

      <div className="mx-auto grid w-full max-w-[1400px] min-w-0 gap-5 lg:grid-cols-[minmax(0,1fr)_360px]">
        <div className="min-w-0 space-y-5">
          <OrderStatusCard order={order} />
          <div className="lg:hidden"><ShipmentTracking order={order} /></div>
          <ShipmentDetails order={order} />

          {/*
            Legacy whole-order Return card — no longer offered as a starting
            point for a NEW return (customers only ever get "Item Returns"
            below now, which covers the same ground per-item/quantity and
            is less confusing than offering two ways to return the same
            order). Still rendered — and still tracked end to end (Requested
            -> admin Approved/Rejected -> reverse shipment pickup ->
            Received) — whenever one is already in play, so an existing
            legacy return never becomes invisible. The refund itself is
            handled entirely by the Refund card below, which activates
            automatically once the admin confirms the returned item is back
            at the warehouse.
          */}
          {order.isPaid && order.returnStatus !== "none" ? (
            <div className="rounded-xl border border-zinc-100 bg-white p-5 shadow-sm">
              <h3 className="flex items-center gap-2 text-sm font-black text-[#070e2b]">
                <RotateCw className="size-4.5 text-zinc-500" />
                Return
              </h3>

              {order.returnStatus === "received" ? (
                <div className="mt-3 rounded-lg bg-emerald-50 px-4 py-3 text-xs font-medium text-emerald-700">
                  <p className="font-bold">We&apos;ve received your returned item.</p>
                  <p className="mt-1">Your refund is now being processed — see below.</p>
                </div>
              ) : order.returnStatus === "picked_up" ? (
                <div className="mt-3 rounded-lg bg-blue-50 px-4 py-3 text-xs font-medium text-blue-700">
                  <p className="font-bold">Picked up — on its way back to our warehouse.</p>
                  {order.returnShippingCourierName ? (
                    <p className="mt-1">
                      Courier: {order.returnShippingCourierName}
                      {order.returnShippingAwbCode ? ` · AWB: ${order.returnShippingAwbCode}` : ""}
                    </p>
                  ) : null}
                  {order.returnShippingTrackingUrl ? (
                    <a
                      href={order.returnShippingTrackingUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="mt-1 inline-block font-bold underline"
                    >
                      Track Shipment ↗
                    </a>
                  ) : null}
                </div>
              ) : order.returnStatus === "pickup_scheduled" ? (
                <div className="mt-3 rounded-lg bg-blue-50 px-4 py-3 text-xs font-medium text-blue-700">
                  <p className="font-bold">Pickup scheduled — our courier will collect the item soon.</p>
                  {order.returnShippingCourierName ? (
                    <p className="mt-1">
                      Courier: {order.returnShippingCourierName}
                      {order.returnShippingAwbCode ? ` · AWB: ${order.returnShippingAwbCode}` : ""}
                    </p>
                  ) : null}
                  {order.returnShippingTrackingUrl ? (
                    <a
                      href={order.returnShippingTrackingUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="mt-1 inline-block font-bold underline"
                    >
                      Track Shipment ↗
                    </a>
                  ) : null}
                </div>
              ) : order.returnStatus === "approved" ? (
                <div className="mt-3 rounded-lg bg-amber-50 px-4 py-3 text-xs font-medium text-amber-800">
                  <p className="font-bold">Return approved — pickup will be scheduled soon.</p>
                </div>
              ) : order.returnStatus === "requested" ? (
                <div className="mt-3 rounded-lg bg-amber-50 px-4 py-3 text-xs font-medium text-amber-800">
                  <p className="font-bold">Return requested — awaiting review.</p>
                  {order.returnReason ? <p className="mt-1">Your reason: {order.returnReason}</p> : null}
                </div>
              ) : (
                <>
                  {order.returnStatus === "rejected" ? (
                    <div className="mt-3 rounded-lg bg-red-50 px-4 py-3 text-xs font-medium text-red-700">
                      <p className="font-bold">Your return request was declined.</p>
                      {order.returnAdminNote ? <p className="mt-1">{order.returnAdminNote}</p> : null}
                    </div>
                  ) : null}

                  {isReturnFormOpen ? (
                    <div className="mt-3 flex flex-col gap-2">
                      <textarea
                        value={returnReasonDraft}
                        onChange={(event) => setReturnReasonDraft(event.target.value)}
                        placeholder="Tell us why you'd like to return this…"
                        rows={3}
                        className="rounded-lg border border-zinc-200 px-3 py-2 text-xs outline-none focus:border-zinc-500"
                      />
                      {returnRequestError ? (
                        <p className="text-xs font-medium text-red-600">{returnRequestError}</p>
                      ) : null}
                      <div className="flex gap-2">
                        <button
                          type="button"
                          disabled={!returnReasonDraft.trim() || isRequestingReturn}
                          onClick={() => {
                            // Don't close the form here — closing immediately
                            // hid the error message on failure (the form and
                            // its error text unmount before the request even
                            // resolves). On success, order.returnStatus moves
                            // to "requested" via refreshOrders, which makes
                            // the branch above take over and the form
                            // disappear naturally; on failure it stays open
                            // with returnRequestError now visible.
                            onRequestReturn(returnReasonDraft.trim());
                          }}
                          className="flex h-9 flex-1 items-center justify-center gap-1.5 rounded-lg bg-[#ff4b1f] text-xs font-black text-white transition hover:bg-[#e8330e] disabled:cursor-not-allowed disabled:opacity-40"
                        >
                          {isRequestingReturn ? <Loader2 className="size-3.5 animate-spin" /> : null}
                          Submit request
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setIsReturnFormOpen(false);
                            setReturnReasonDraft("");
                          }}
                          className="h-9 rounded-lg border border-zinc-200 px-3 text-xs font-bold text-zinc-600 hover:bg-zinc-50"
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setIsReturnFormOpen(true)}
                      className="mt-3 flex h-9 w-full items-center justify-center gap-1.5 rounded-lg border border-zinc-200 text-xs font-bold text-zinc-700 transition hover:bg-zinc-50"
                    >
                      {order.returnStatus === "rejected" ? "Request return again" : "Return product"}
                    </button>
                  )}
                </>
              )}
            </div>
          ) : null}

          {/*
            Item Returns card — return only specific items/quantities from
            this order instead of the whole thing (see the legacy Return card
            above, which still returns everything). Each request becomes its
            own independent OrderReturn with its own status; the "already
            returned" quantity per item comes from the server
            (remainingReturnable), never computed client-side, since only the
            server's row-locked check is authoritative.
          */}
          {order.isPaid && (isDelivered || order.partialReturns.length > 0) ? (
            <div id="order-return-card" className="rounded-xl border border-zinc-100 bg-white p-5 shadow-sm">
              <h3 className="flex items-center gap-2 text-sm font-black text-[#070e2b]">
                <RotateCw className="size-4.5 text-zinc-500" />
                Item Returns
              </h3>

              {order.partialReturns.map((partialReturn, index) => (
                <div key={partialReturn.id} className="mt-3 rounded-lg border border-zinc-100 bg-zinc-50 px-4 py-3 text-xs">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-black text-[#070e2b]">Return #{index + 1}</span>
                    <span
                      className={`rounded-full px-2 py-0.5 text-[10px] font-black uppercase tracking-wide ${
                        partialReturn.status === "received"
                          ? "bg-emerald-100 text-emerald-700"
                          : partialReturn.status === "rejected"
                          ? "bg-red-100 text-red-700"
                          : "bg-amber-100 text-amber-800"
                      }`}
                    >
                      {partialReturn.status.replace(/_/g, " ")}
                    </span>
                  </div>
                  <p className="mt-1 font-medium text-zinc-600">
                    {partialReturn.items.map((line) => `${line.productName} × ${line.quantity}`).join(", ")}
                  </p>
                  {partialReturn.status === "rejected" && partialReturn.adminNote ? (
                    <p className="mt-1 font-medium text-red-600">{partialReturn.adminNote}</p>
                  ) : null}
                  {(partialReturn.status === "pickup_scheduled" || partialReturn.status === "picked_up") && partialReturn.shippingCourierName ? (
                    <p className="mt-1 text-zinc-600">
                      Courier: {partialReturn.shippingCourierName}
                      {partialReturn.shippingAwbCode ? ` · AWB: ${partialReturn.shippingAwbCode}` : ""}
                    </p>
                  ) : null}
                  {partialReturn.shippingTrackingUrl && (partialReturn.status === "pickup_scheduled" || partialReturn.status === "picked_up") ? (
                    <a href={partialReturn.shippingTrackingUrl} target="_blank" rel="noreferrer" className="mt-1 inline-block font-bold text-blue-700 underline">
                      Track Shipment ↗
                    </a>
                  ) : null}
                  {partialReturn.refundStatus !== "none" ? (
                    <p className="mt-1 font-bold text-zinc-700">
                      Refund: {partialReturn.refundStatus === "refunded" ? `₹${formatPrice(partialReturn.refundAmount ?? 0)} refunded` : partialReturn.refundStatus}
                    </p>
                  ) : null}
                </div>
              ))}

              {isDelivered ? (
                isPartialReturnFormOpen ? (
                  <div className="mt-3 flex flex-col gap-3">
                    <div className="space-y-2">
                      {order.items
                        .filter((item) => (item.remainingReturnable ?? 0) > 0)
                        .map((item) => {
                          const max = item.remainingReturnable ?? 0;
                          const key = item.orderItemId ?? item.product.name;
                          const selected = partialReturnQuantities[key] ?? 0;
                          return (
                            <div key={key} className="flex items-center justify-between gap-2 rounded-lg border border-zinc-200 px-3 py-2">
                              <div className="min-w-0">
                                <p className="truncate text-xs font-bold text-[#070e2b]">{item.product.name}</p>
                                <p className="text-[10px] text-zinc-500">{max} of {item.quantity} eligible to return</p>
                              </div>
                              <div className="flex shrink-0 items-center gap-2">
                                <button
                                  type="button"
                                  onClick={() => setPartialReturnQuantities((prev) => ({ ...prev, [key]: Math.max(0, (prev[key] ?? 0) - 1) }))}
                                  disabled={selected <= 0}
                                  className="grid size-6 place-items-center rounded-full border border-zinc-200 text-xs font-black text-zinc-600 disabled:opacity-30"
                                >
                                  −
                                </button>
                                <span className="w-4 text-center text-xs font-black text-[#070e2b]">{selected}</span>
                                <button
                                  type="button"
                                  onClick={() => setPartialReturnQuantities((prev) => ({ ...prev, [key]: Math.min(max, (prev[key] ?? 0) + 1) }))}
                                  disabled={selected >= max}
                                  className="grid size-6 place-items-center rounded-full border border-zinc-200 text-xs font-black text-zinc-600 disabled:opacity-30"
                                >
                                  +
                                </button>
                              </div>
                            </div>
                          );
                        })}
                    </div>
                    <textarea
                      value={partialReturnReasonDraft}
                      onChange={(event) => setPartialReturnReasonDraft(event.target.value)}
                      placeholder="Tell us why you'd like to return these item(s)…"
                      rows={2}
                      className="rounded-lg border border-zinc-200 px-3 py-2 text-xs outline-none focus:border-zinc-500"
                    />
                    {partialReturnError ? <p className="text-xs font-medium text-red-600">{partialReturnError}</p> : null}
                    <div className="flex gap-2">
                      <button
                        type="button"
                        disabled={
                          !partialReturnReasonDraft.trim() ||
                          isRequestingPartialReturn ||
                          Object.values(partialReturnQuantities).every((qty) => qty <= 0)
                        }
                        onClick={async () => {
                          const lines = Object.entries(partialReturnQuantities)
                            .filter(([, qty]) => qty > 0)
                            .map(([orderItemId, quantity]) => ({ orderItemId, quantity }));
                          const succeeded = await onRequestPartialReturn(partialReturnReasonDraft.trim(), lines);
                          if (succeeded) {
                            setIsPartialReturnFormOpen(false);
                            setPartialReturnReasonDraft("");
                            setPartialReturnQuantities({});
                          }
                        }}
                        className="flex h-9 flex-1 items-center justify-center gap-1.5 rounded-lg bg-[#ff4b1f] text-xs font-black text-white transition hover:bg-[#e8330e] disabled:cursor-not-allowed disabled:opacity-40"
                      >
                        {isRequestingPartialReturn ? <Loader2 className="size-3.5 animate-spin" /> : null}
                        Submit request
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setIsPartialReturnFormOpen(false);
                          setPartialReturnReasonDraft("");
                          setPartialReturnQuantities({});
                        }}
                        className="h-9 rounded-lg border border-zinc-200 px-3 text-xs font-bold text-zinc-600 hover:bg-zinc-50"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : order.items.some((item) => (item.remainingReturnable ?? 0) > 0) ? (
                  <button
                    type="button"
                    onClick={() => setIsPartialReturnFormOpen(true)}
                    className="mt-3 flex h-9 w-full items-center justify-center gap-1.5 rounded-lg border border-zinc-200 text-xs font-bold text-zinc-700 transition hover:bg-zinc-50"
                  >
                    Return specific item(s)
                  </button>
                ) : null
              ) : null}
            </div>
          ) : null}

          {/*
            Refund card — the money side, kept separate from the Return
            card above. Only ever activates once a refund has actually been
            requested: automatically for a cancelled order (see the Cancel
            order card below and onCancelOrder) or once a return reaches
            "received" (see the Return card above) — there's no direct
            customer-facing "request a refund" action anymore.
          */}
          {order.isPaid && (isCancelled || order.refundStatus !== "none") ? (
            <div className="rounded-xl border border-zinc-100 bg-white p-5 shadow-sm">
              <h3 className="flex items-center gap-2 text-sm font-black text-[#070e2b]">
                <Banknote className="size-4.5 text-zinc-500" />
                Refund
              </h3>

              {order.refundStatus === "refunded" ? (
                <div className="mt-3 rounded-lg bg-emerald-50 px-4 py-3 text-xs font-bold text-emerald-700">
                  Refunded &#8377;{formatPrice(order.refundAmount ?? order.total)}
                  {order.refundProcessedAt
                    ? ` on ${new Date(order.refundProcessedAt).toLocaleDateString("en-IN", {
                        day: "numeric",
                        month: "short",
                        year: "numeric",
                      })}`
                    : ""}
                  .
                </div>
              ) : order.refundStatus === "requested" ? (
                <div className="mt-3 rounded-lg bg-amber-50 px-4 py-3 text-xs font-medium text-amber-800">
                  <p className="font-bold">Refund requested — awaiting review.</p>
                  {order.refundReason ? <p className="mt-1">Your reason: {order.refundReason}</p> : null}
                </div>
              ) : order.refundStatus === "processing" ? (
                <div className="mt-3 rounded-lg bg-blue-50 px-4 py-3 text-xs font-medium text-blue-700">
                  Your refund has been approved and is being processed — this usually reaches your original
                  payment method within a few business days.
                </div>
              ) : order.refundStatus === "rejected" ? (
                <div className="mt-3 rounded-lg bg-red-50 px-4 py-3 text-xs font-medium text-red-700">
                  <p className="font-bold">Your last refund request was declined.</p>
                  {order.refundAdminNote ? <p className="mt-1">{order.refundAdminNote}</p> : null}
                </div>
              ) : (
                <div className="mt-3 rounded-lg bg-zinc-50 px-4 py-3 text-xs font-medium text-zinc-600">
                  This order was cancelled. If you paid for it, we&apos;re processing your refund — no
                  need to request it separately.
                </div>
              )}
            </div>
          ) : null}

          {/* Items + bill card */}
          <div id="order-items-card" className="scroll-mt-24 rounded-xl border border-zinc-100 bg-white p-5 shadow-sm">
            <div className="flex items-center justify-between gap-3 border-b border-zinc-100 pb-4">
              <span className="flex min-w-0 items-center gap-3">
                <span className="grid size-11 shrink-0 place-items-center rounded-lg bg-[#fbfbfa] ring-1 ring-zinc-100">
                  <Store className="size-5 text-zinc-500" />
                </span>
                <span className="min-w-0">
                  <span className="block truncate text-sm font-black text-[#070e2b]">Deep Automobiles</span>
                  <span className="block truncate text-xs text-zinc-500">For {order.bikeLabel}</span>
                </span>
              </span>
              <span className="shrink-0 text-xs font-bold text-zinc-500">
                Order {formatOrderNumber(new Date(order.placedAt))}
                <span className="mt-1 block text-[10px] font-normal">Placed on {formatTrackingDate(order.placedAt, true)}</span>
              </span>
            </div>

            <div className="mt-4 space-y-3">
              {order.items.map(({ product, quantity, unitPrice, orderItemId, canReview, review }) => (
                <div key={orderItemId ?? product.name}>
                <div className="flex items-center gap-3">
                  <CheckCircle2 className="size-4 shrink-0 fill-emerald-100 text-emerald-600" />
                  <span className="min-w-0 flex-1 truncate text-sm font-bold text-[#070e2b]">
                    {product.name}
                  </span>
                  <span className="shrink-0 text-xs text-zinc-500">&times; {quantity}</span>
                  <span className="shrink-0 text-sm font-black text-[#070e2b]">
                    &#8377;{formatPrice((unitPrice ?? parsePrice(product.price)) * quantity)}
                  </span>
                </div>
                {orderItemId && (canReview || review) ? <PurchaseReviewEditor orderId={order.dbId} orderItemId={orderItemId} productName={product.name} review={review ?? null} onSaved={onReviewSaved} /> : null}
                </div>
              ))}
            </div>

            <div className="mt-4 space-y-2 border-t border-dashed border-zinc-200 pt-4 text-sm">
              <div className="flex items-center justify-between text-zinc-600">
                <span>Item Total</span>
                <span className="font-bold text-[#070e2b]">&#8377;{formatPrice(order.itemTotal)}</span>
              </div>
              <div className="flex items-center justify-between text-zinc-600">
                <span>GST</span>
                <span className="font-bold text-[#070e2b]">&#8377;{formatPrice(order.taxAmount)}</span>
              </div>
              <div className="flex items-center justify-between text-zinc-600">
                <span>Delivery Fee</span>
                <span className="font-bold text-[#070e2b]">
                  {order.deliveryCharge > 0 ? (
                    `₹${formatPrice(order.deliveryCharge)}`
                  ) : (
                    <span className="text-emerald-600">FREE</span>
                  )}
                </span>
              </div>
              {order.discount > 0 ? (
                <div className="flex items-center justify-between text-zinc-600">
                  <span>Discount</span>
                  <span className="font-bold text-emerald-600">-&#8377;{formatPrice(order.discount)}</span>
                </div>
              ) : null}
            </div>
            <div className="mt-3 flex items-center justify-between border-t border-zinc-200 pt-3">
              <span className="text-sm font-black text-[#070e2b]">Grand Total</span>
              <span className="text-lg font-black text-[#070e2b]">&#8377;{formatPrice(order.total)}</span>
            </div>
          </div>

          {/* Address card */}
          <div className="rounded-xl border border-zinc-100 bg-white p-5 shadow-sm">
            <h3 className="text-sm font-black text-[#070e2b]">Delivery Address</h3>
            <div className="mt-3 flex items-start gap-3">
              {(() => {
                const { icon: AddressIcon, className: addressIconClassName } = getAddressIcon(order.address.label);
                return (
                  <span className={`grid size-9 shrink-0 place-items-center rounded-lg ${addressIconClassName}`}>
                    <AddressIcon className="size-4.5" />
                  </span>
                );
              })()}
              <p className="text-xs leading-5 text-zinc-600">
                <span className="block text-sm font-bold text-[#070e2b]">{order.address.label}</span>
                {formatAddressLines(order.address).primary}
                <br />
                {formatAddressLines(order.address).secondary}
              </p>
            </div>
          </div>

          {/*
            Cancel order card — available for any order still in flight
            (not yet delivered, not already cancelled), regardless of layout
            (this used to only appear for out-for-delivery orders, in the
            right rail below — moved here so it's available from the moment
            an order is placed, right under the address it's being sent to).
          */}
          {!isCancelled && !isDelivered ? (
            <div className="overflow-hidden rounded-xl border border-zinc-100 bg-white shadow-sm">
              {isCancelConfirmOpen ? (
                <div className="flex flex-col gap-2 p-5">
                  <p className="text-sm font-bold text-[#070e2b]">Cancel this order?</p>
                  <p className="text-xs text-zinc-500">
                    {order.isPaid
                      ? "We'll automatically start your refund once it's cancelled."
                      : "This can't be undone."}
                  </p>
                  {cancelOrderError ? (
                    <p className="text-xs font-medium text-red-600">{cancelOrderError}</p>
                  ) : null}
                  <div className="flex gap-2">
                    <button
                      type="button"
                      disabled={isCancellingOrder}
                      onClick={onCancelOrder}
                      className="flex h-9 flex-1 items-center justify-center gap-1.5 rounded-lg bg-red-600 text-xs font-black text-white transition hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      {isCancellingOrder ? <Loader2 className="size-3.5 animate-spin" /> : null}
                      Yes, cancel order
                    </button>
                    <button
                      type="button"
                      onClick={() => setIsCancelConfirmOpen(false)}
                      disabled={isCancellingOrder}
                      className="h-9 rounded-lg border border-zinc-200 px-3 text-xs font-bold text-zinc-600 hover:bg-zinc-50"
                    >
                      Keep order
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => setIsCancelConfirmOpen(true)}
                  className="flex w-full items-center gap-3 p-5 text-left transition hover:bg-zinc-50"
                >
                  <Trash2 className="size-4.5 shrink-0 text-zinc-500" />
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-bold text-[#070e2b]">Cancel order</span>
                    <span className="block truncate text-xs text-zinc-500">You can cancel within a few minutes</span>
                  </span>
                  <ChevronRight className="size-4 shrink-0 text-zinc-300" />
                </button>
              )}
            </div>
          ) : null}
        </div>

        <aside className="min-w-0 space-y-5">
          <div className="hidden lg:block"><ShipmentTracking order={order} /></div>
          <section aria-label="Order help" className="rounded-xl border border-zinc-200 bg-white p-5 shadow-sm">
            <h3 className="text-base font-bold text-[#070e2b]">Need help with your order?</h3>
            <div className="mt-4 flex flex-col gap-3 text-sm font-semibold">
              {trackingUrl ? <a href={trackingUrl} target="_blank" rel="noreferrer" className="rounded-lg border border-zinc-200 p-3 text-center">Track my order</a> : null}
              {canReturn ? <button type="button" onClick={() => document.getElementById("order-return-card")?.scrollIntoView({ behavior: "smooth" })} className="rounded-lg border border-zinc-200 p-3">Return or exchange</button> : null}
              {supportUrl ? <a href={supportUrl} className="rounded-lg border border-zinc-200 p-3 text-center">Contact support</a> : <button type="button" disabled className="rounded-lg border border-zinc-200 p-3 text-zinc-400" title="Support contact details have not been configured">Contact support</button>}
              <button type="button" disabled className="rounded-lg border border-zinc-200 p-3 text-zinc-400" title="Invoices are not available in this store yet">View invoice</button>
              <button type="button" onClick={() => document.getElementById("order-items-card")?.scrollIntoView({ behavior: "smooth" })} className="text-xs text-orange-700 underline">View order details</button>
            </div>
          </section>
        </aside>
      </div>
    </div>
  );
}
