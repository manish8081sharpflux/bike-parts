"use client";

import { useState } from "react";
import Image from "next/image";
import { ArrowRight, Banknote, Bike, CheckCircle2, ChevronLeft, ChevronRight, FileText, Gift, HelpCircle, Home as HomeIcon, Loader2, MessageCircle, Package, Phone, RotateCw, Star, Store, Trash2, Zap } from "lucide-react";
import type { Order, OrderStatus } from "./types";
import { coordinatesForCity } from "@/lib/city-coordinates";
import DeliveryMap from "./DeliveryMapDynamic";
import {
  orderStatusMeta,
  orderTrackingSteps,
  stepIndexForStatus,
  orderStatusFilters,
  WAREHOUSE_CITY,
  orderStatusHeadline,
} from "./constants";
import { getAddressIcon, formatAddressLines, getRiderForOrder, formatClockTime, findStepTime, parsePrice, formatPrice } from "./utils";

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
  const isActive = order.status === "processing" || order.status === "out_for_delivery";
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
              {order.status === "out_for_delivery" ? "Out for delivery" : "Preparing your order"}
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
  const ORDERS_PAGE_SIZE = 5;
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
// (process.env.WAREHOUSE_CITY, defaulting to "Patna" — see lib/porter.ts's
// caller in lib/actions/admin-orders.ts). Not read from env here since this
// is a client component and that var isn't (and shouldn't be) public.

export function DeliveryRouteMap({ rider, order }: { rider: ReturnType<typeof getRiderForOrder>; order: Order }) {
  const pickup = coordinatesForCity(WAREHOUSE_CITY);
  const drop = coordinatesForCity(order.address.city);

  return (
    <div className="overflow-hidden rounded-xl border border-zinc-100 bg-[#eef1ec] shadow-sm">
      <div className="relative h-[320px] w-full sm:h-[420px]">
        <span className="absolute right-3 top-3 z-[500] inline-flex items-center gap-1.5 rounded-full bg-white px-2.5 py-1 text-[10px] font-black text-zinc-950 shadow">
          <span className="relative flex size-1.5">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-red-500 opacity-75" />
            <span className="relative inline-flex size-1.5 rounded-full bg-red-500" />
          </span>
          TRACKING
        </span>

        <DeliveryMap
          pickup={pickup}
          pickupLabel={`Dispatched from ${WAREHOUSE_CITY}`}
          drop={drop}
          dropLabel={order.address.area || order.address.city}
          className="z-0"
        />

        <div className="absolute inset-x-3 bottom-3 z-[500] flex items-center gap-3 rounded-xl bg-white p-3 shadow-lg">
          <span className="grid size-9 shrink-0 place-items-center rounded-full bg-[#fff0eb] text-[#ff4b1f]">
            <Bike className="size-4.5" />
          </span>
          <span className="min-w-0">
            <span className="block truncate text-xs font-bold text-[#070e2b]">
              {rider.name} is {rider.distanceKm} km away from you
            </span>
            <span className="block text-[11px] text-zinc-500">
              Expected by <span className="font-bold text-emerald-600">{order.expectedDeliveryDate}</span>
            </span>
          </span>
        </div>
      </div>

      <p className="border-t border-zinc-100 bg-white px-3 py-2 text-center text-[10px] text-zinc-400">
        Approximate route by city — live rider GPS isn&apos;t connected yet.
      </p>
    </div>
  );
}


export function OrderDetailView({
  order,
  onBack,
  onRequestRefund,
  isRequestingRefund,
  refundRequestError,
  onCancelOrder,
  isCancellingOrder,
  cancelOrderError,
}: {
  order: Order;
  onBack: () => void;
  /** Submits a refund request with the given reason for this order. */
  onRequestRefund: (reason: string) => void;
  isRequestingRefund: boolean;
  refundRequestError: string | null;
  /** Cancels this order outright — a paid order's refund is then requested automatically, no separate step needed. */
  onCancelOrder: () => void;
  isCancellingOrder: boolean;
  cancelOrderError: string | null;
}) {
  const [isRefundFormOpen, setIsRefundFormOpen] = useState(false);
  const [refundReasonDraft, setRefundReasonDraft] = useState("");
  const [isCancelConfirmOpen, setIsCancelConfirmOpen] = useState(false);
  const currentStepIndex = stepIndexForStatus[order.status];
  const isOutForDelivery = order.status === "out_for_delivery";
  const isDelivered = order.status === "delivered";
  const isCancelled = order.status === "cancelled";
  const rider = getRiderForOrder(order);
  // Real timestamps from the order's activity log when available (falls back
  // to a guessed offset from placedAt for the demo orders / while events
  // haven't loaded yet — see findStepTime).
  const stepTimes = [
    order.placedAt,
    findStepTime(order.events, (raw) => raw !== "PENDING", order.placedAt + 7 * 60000),
    findStepTime(order.events, (raw) => raw === "OUT_FOR_DELIVERY", order.placedAt + 15 * 60000),
    findStepTime(order.events, (raw) => raw === "DELIVERED", order.placedAt + 40 * 60000),
  ];

  const statusSubtext = isCancelled
    ? { text: order.statusNote, className: "text-red-600" }
    : isDelivered
    ? { text: order.statusNote, className: "text-emerald-600" }
    : isOutForDelivery
    ? { text: `Expected by ${order.expectedDeliveryDate}`, className: "text-emerald-600" }
    : { text: order.statusNote, className: "text-amber-600" };

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

      <div
        className={
          isOutForDelivery
            ? "mx-auto grid w-full max-w-[1400px] gap-5 lg:grid-cols-[1fr_380px]"
            : "mx-auto w-full max-w-2xl"
        }
      >
        <div className="space-y-5">
          {/* Status + tracker card */}
          <div className="rounded-xl border border-zinc-100 bg-white p-5 shadow-sm">
            <div className="flex items-start justify-between gap-3">
              <h2 className="text-xl font-black leading-tight text-[#070e2b] sm:text-2xl">
                {orderStatusHeadline[order.status]}
              </h2>
              {!isCancelled && !isDelivered ? (
                <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-1 text-[11px] font-black text-emerald-700">
                  <Zap className="size-3.5" />
                  On time
                </span>
              ) : null}
            </div>
            <p className={`mt-1 text-sm font-bold ${statusSubtext.className}`}>{statusSubtext.text}</p>

            {!isCancelled && currentStepIndex !== undefined ? (
              <div className="mt-6 flex items-start justify-between">
                {orderTrackingSteps.map((step, index) => {
                  const done = isDelivered || index < currentStepIndex;
                  const isCurrent = !isDelivered && index === currentStepIndex;
                  const StepIcon = index === 2 ? Bike : HomeIcon;

                  return (
                    <div key={step} className="flex flex-1 flex-col items-center text-center last:flex-none">
                      <div className="flex w-full items-center">
                        <span
                          className={`grid size-9 shrink-0 place-items-center rounded-full text-white ${
                            done || isCurrent ? "bg-[#ff4b1f]" : "bg-zinc-200 text-zinc-400"
                          }`}
                        >
                          {done ? <CheckCircle2 className="size-4.5" /> : <StepIcon className="size-4.5" />}
                        </span>
                        {index < orderTrackingSteps.length - 1 ? (
                          <span
                            className={`mx-1 h-1 flex-1 rounded-full ${
                              index < currentStepIndex || isDelivered ? "bg-[#ff4b1f]" : "bg-zinc-200"
                            }`}
                          />
                        ) : null}
                      </div>
                      <span
                        className={`mt-2 text-[11px] font-bold leading-tight ${
                          done || isCurrent ? "text-[#070e2b]" : "text-zinc-400"
                        }`}
                      >
                        {step}
                      </span>
                      <span className="mt-0.5 text-[10px] text-zinc-400">
                        {done || isCurrent ? formatClockTime(stepTimes[index]) : ""}
                      </span>
                    </div>
                  );
                })}
              </div>
            ) : null}

            {isCancelled ? (
              <div className="mt-4 rounded-lg bg-red-50 px-4 py-3 text-xs font-medium text-red-700">
                If you have any questions, please contact our support team.
              </div>
            ) : null}
          </div>

          {/*
            Refund card — only relevant once the order was actually paid for,
            and (while there's no refund already in play) only once it's
            either been delivered (a post-delivery return/refund request) or
            cancelled (which auto-requests the refund itself — see the
            Cancel order card below and onCancelOrder). While an order is
            still processing/out for delivery there's nothing to show here:
            the right move at that stage is to cancel, not request a refund.
          */}
          {order.isPaid && (isDelivered || isCancelled || order.refundStatus !== "none") ? (
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
              ) : (
                <>
                  {order.refundStatus === "rejected" ? (
                    <div className="mt-3 rounded-lg bg-red-50 px-4 py-3 text-xs font-medium text-red-700">
                      <p className="font-bold">Your last refund request was declined.</p>
                      {order.refundAdminNote ? <p className="mt-1">{order.refundAdminNote}</p> : null}
                    </div>
                  ) : null}

                  {/*
                    Once an order is cancelled, our side already requests the
                    refund automatically (whichever of us — customer or admin —
                    cancelled it, see onCancelOrder here and
                    updateOrderStatusAction on the admin side) — so there's
                    nothing left for the customer to manually ask for here.
                  */}
                  {isCancelled ? (
                    <div className="mt-3 rounded-lg bg-zinc-50 px-4 py-3 text-xs font-medium text-zinc-600">
                      This order was cancelled. If you paid for it, we&apos;re processing your refund — no
                      need to request it separately.
                    </div>
                  ) : !isDelivered ? null : isRefundFormOpen ? (
                    <div className="mt-3 flex flex-col gap-2">
                      <textarea
                        value={refundReasonDraft}
                        onChange={(event) => setRefundReasonDraft(event.target.value)}
                        placeholder="Tell us why you'd like a refund…"
                        rows={3}
                        className="rounded-lg border border-zinc-200 px-3 py-2 text-xs outline-none focus:border-zinc-500"
                      />
                      {refundRequestError ? (
                        <p className="text-xs font-medium text-red-600">{refundRequestError}</p>
                      ) : null}
                      <div className="flex gap-2">
                        <button
                          type="button"
                          disabled={!refundReasonDraft.trim() || isRequestingRefund}
                          onClick={() => {
                            onRequestRefund(refundReasonDraft.trim());
                            setIsRefundFormOpen(false);
                            setRefundReasonDraft("");
                          }}
                          className="flex h-9 flex-1 items-center justify-center gap-1.5 rounded-lg bg-[#ff4b1f] text-xs font-black text-white transition hover:bg-[#e8330e] disabled:cursor-not-allowed disabled:opacity-40"
                        >
                          {isRequestingRefund ? <Loader2 className="size-3.5 animate-spin" /> : null}
                          Submit request
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setIsRefundFormOpen(false);
                            setRefundReasonDraft("");
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
                      onClick={() => setIsRefundFormOpen(true)}
                      className="mt-3 flex h-9 w-full items-center justify-center gap-1.5 rounded-lg border border-zinc-200 text-xs font-bold text-zinc-700 transition hover:bg-zinc-50"
                    >
                      {order.refundStatus === "rejected" ? "Request refund again" : "Request refund"}
                    </button>
                  )}
                </>
              )}
            </div>
          ) : null}

          {/* Rider card */}
          {isOutForDelivery ? (
            <div className="rounded-xl border border-zinc-100 bg-white p-5 shadow-sm">
              <h3 className="text-sm font-black text-[#070e2b]">Your rider is on the way</h3>
              <div className="mt-3 flex items-center gap-3">
                <span className="grid size-14 shrink-0 place-items-center rounded-full bg-[#fff0eb] text-lg font-black text-[#ff4b1f]">
                  {rider.initials}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-base font-black text-[#070e2b]">{rider.name}</span>
                  <span className="flex items-center gap-1 text-xs text-zinc-500">
                    <Star className="size-3 fill-amber-400 text-amber-400" />
                    {rider.rating} &bull; {rider.deliveries.toLocaleString("en-IN")}+ deliveries
                  </span>
                  <span className="mt-0.5 block text-xs text-zinc-500">Your parts are in safe hands!</span>
                </span>
                <span className="flex shrink-0 items-center gap-4">
                  <a href="tel:+911234567890" aria-label={`Call ${rider.name}`} className="flex flex-col items-center gap-1">
                    <span className="grid size-11 place-items-center rounded-full border border-zinc-200 text-zinc-700 transition hover:border-[#ff4b1f] hover:text-[#ff4b1f]">
                      <Phone className="size-4.5" />
                    </span>
                    <span className="text-[11px] font-bold text-zinc-600">Call</span>
                  </a>
                  <button type="button" aria-label={`Chat with ${rider.name}`} className="flex flex-col items-center gap-1">
                    <span className="grid size-11 place-items-center rounded-full border border-zinc-200 text-zinc-700 transition hover:border-[#ff4b1f] hover:text-[#ff4b1f]">
                      <MessageCircle className="size-4.5" />
                    </span>
                    <span className="text-[11px] font-bold text-zinc-600">Chat</span>
                  </button>
                </span>
              </div>
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
                Order #{order.id}
              </span>
            </div>

            <div className="mt-4 space-y-3">
              {order.items.map(({ product, quantity }) => (
                <div key={product.name} className="flex items-center gap-3">
                  <CheckCircle2 className="size-4 shrink-0 fill-emerald-100 text-emerald-600" />
                  <span className="min-w-0 flex-1 truncate text-sm font-bold text-[#070e2b]">
                    {product.name}
                  </span>
                  <span className="shrink-0 text-xs text-zinc-500">&times; {quantity}</span>
                  <span className="shrink-0 text-sm font-black text-[#070e2b]">
                    &#8377;{formatPrice(parsePrice(product.price) * quantity)}
                  </span>
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

        {isOutForDelivery ? (
          <div className="space-y-5">
            <DeliveryRouteMap rider={rider} order={order} />

            <div className="divide-y divide-zinc-100 rounded-xl border border-zinc-100 bg-white shadow-sm">
              {[
                { icon: HelpCircle, title: "Need help with your order?", caption: "Get instant support" },
                {
                  icon: FileText,
                  title: "View order details",
                  caption: `Order ID: #${order.id}`,
                  // Jumps down to the itemized bill card on this same page
                  // rather than navigating anywhere — there's no separate
                  // "order details" destination, this page already is one.
                  onClick: () =>
                    document.getElementById("order-items-card")?.scrollIntoView({ behavior: "smooth" }),
                },
              ].map((item) => (
                <button
                  type="button"
                  key={item.title}
                  onClick={item.onClick}
                  className="flex w-full items-center gap-3 px-4 py-3.5 text-left transition hover:bg-zinc-50"
                >
                  <item.icon className="size-4.5 shrink-0 text-zinc-500" />
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-bold text-[#070e2b]">{item.title}</span>
                    <span className="block truncate text-xs text-zinc-500">{item.caption}</span>
                  </span>
                  <ChevronRight className="size-4 shrink-0 text-zinc-300" />
                </button>
              ))}
            </div>

            <div className="flex items-center gap-3 rounded-xl border border-[#ffd9c7] bg-[#fff0eb] p-4">
              <Gift className="size-6 shrink-0 text-[#ff4b1f]" />
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-black text-[#ff4b1f]">Share your love for Deep Automobiles!</span>
                <span className="block text-xs text-zinc-600">Rate your order and rider</span>
              </span>
              <button
                type="button"
                className="shrink-0 rounded-full border border-[#ff4b1f] px-3 py-1.5 text-xs font-black text-[#ff4b1f] transition hover:bg-white"
              >
                Rate Now
              </button>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
