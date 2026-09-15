import { AdminActionForm } from "../../admin-feedback";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronDown } from "lucide-react";
import { prisma } from "@/lib/db";
import { formatInr, formatOrderNumber } from "@/lib/format";
import {
  approveRefundAction,
  approveReturnAction,
  cancelShipmentAction,
  createBorzoDeliveryAction,
  createBorzoReturnPickupAction,
  markReturnReceivedAction,
  refreshDeliveryStatusAction,
  refreshReturnPickupStatusAction,
  rejectRefundAction,
  rejectReturnAction,
  updateOrderStatusAction,
} from "@/lib/actions/admin-orders";
import { RefundReadyPopup } from "./RefundReadyPopup";
import { ActivityLog } from "./ActivityLog";
import { PartialReturnsSection } from "./PartialReturnsSection";
import { BorzoDeliveryForm } from "./BorzoDeliveryForm";

/** Nicely-cased display label for a raw ShippingProvider enum value. */
function providerLabel(provider: string | null) {
  if (provider === "SHIPROCKET") return "Shiprocket";
  if (provider === "BORZO") return "Borzo";
  if (provider === "PORTER") return "Porter";
  return "Shiprocket";
}

export const dynamic = "force-dynamic";

// The DB tracks 7 granular fulfillment stages, but the customer-facing app
// only ever shows 4 of them (see mapDbOrderStatus in app/page.tsx, which
// folds PENDING/PAID/PACKED/SHIPPED all into "Preparing"). This dropdown
// mirrors that same 4-stage view (plus Cancelled, which the admin still
// needs as an action even though the customer's stepper never shows it as
// a step) instead of exposing internal-only states the customer never sees.
const STATUS_OPTIONS: Array<{ value: "PACKED" | "OUT_FOR_DELIVERY" | "DELIVERED" | "CANCELLED"; label: string }> = [
  { value: "PACKED", label: "Preparing" },
  { value: "OUT_FOR_DELIVERY", label: "Out for Delivery" },
  { value: "DELIVERED", label: "Delivered" },
  { value: "CANCELLED", label: "Cancelled" },
];

/** Collapses any of the 7 DB statuses down to whichever of the 4 customer-visible stages it belongs to. */
function toCustomerVisibleStatus(status: string) {
  if (status === "OUT_FOR_DELIVERY" || status === "DELIVERED" || status === "CANCELLED") {
    return status;
  }
  return "PACKED";
}

type DeliveryAddress = {
  label?: string;
  contactName?: string;
  flatNo?: string;
  floor?: string;
  area?: string;
  landmark?: string;
  city?: string;
  pincode?: string;
};

export default async function AdminOrderDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string; refundReady?: string }>;
}) {
  const { id } = await params;
  const { error, refundReady } = await searchParams;

  const order = await prisma.order.findUnique({
    where: { id },
    include: {
      items: true,
      events: { orderBy: { createdAt: "desc" } },
      orderReturns: { include: { items: true }, orderBy: { createdAt: "asc" } },
    },
  });

  if (!order) {
    notFound();
  }

  const address = (order.deliveryAddress ?? {}) as DeliveryAddress;
  const boundRefresh = refreshDeliveryStatusAction.bind(null, order.id);
  const boundUpdateStatus = updateOrderStatusAction.bind(null, order.id);
  const boundApproveRefund = approveRefundAction.bind(null, order.id);
  const boundRejectRefund = rejectRefundAction.bind(null, order.id);
  const boundApproveReturn = approveReturnAction.bind(null, order.id);
  const boundRejectReturn = rejectReturnAction.bind(null, order.id);
  const boundCreateBorzoReturnPickup = createBorzoReturnPickupAction.bind(null, order.id);
  const boundRefreshReturnPickup = refreshReturnPickupStatusAction.bind(null, order.id);
  const boundMarkReturnReceived = markReturnReceivedAction.bind(null, order.id);
  const boundCancelShipment = cancelShipmentAction.bind(null, order.id);
  const boundCreateBorzoDelivery = createBorzoDeliveryAction.bind(null, order.id);

  return (
    <div className="flex flex-col gap-4">
      <RefundReadyPopup
        show={refundReady === "1"}
        amountLabel={formatInr(order.refundAmount ?? order.amount)}
      />

      <div className="flex items-center justify-between gap-3">
        <div>
          <Link href="/admin/orders" className="text-xs font-bold text-zinc-500">
            ← Back to orders
          </Link>
          <h1 className="mt-1 text-2xl font-black">Order {formatOrderNumber(order.createdAt)}</h1>
          <p className="text-sm text-zinc-500">
            Placed {order.createdAt.toLocaleString("en-IN")}
          </p>
        </div>
      </div>

      {error ? (
        <p className="rounded-lg bg-red-50 px-3 py-2 text-sm font-medium text-red-700">{error}</p>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="flex flex-col gap-4">
          <div className="rounded-xl bg-white p-4 shadow-sm ring-1 ring-zinc-100">
            <h2 className="text-base font-black">Items</h2>
            <div className="mt-3 flex flex-col divide-y divide-zinc-50">
              {order.items.map((item) => (
                <div key={item.id} className="flex items-center justify-between gap-3 py-2.5">
                  <div>
                    <p className="text-sm font-bold">{item.productName}</p>
                    <p className="text-xs text-zinc-500">Qty {item.quantity}</p>
                  </div>
                  <p className="text-sm font-bold">
                    {formatInr(Number(item.unitPrice) * item.quantity)}
                  </p>
                </div>
              ))}
            </div>

            <div className="mt-3 flex flex-col gap-1 border-t border-zinc-100 pt-3 text-sm">
              <div className="flex justify-between text-zinc-500">
                <span>Items total</span>
                <span>{formatInr(order.itemsTotal)}</span>
              </div>
              <div className="flex justify-between text-zinc-500">
                <span>GST</span>
                <span>{formatInr(order.taxAmount)}</span>
              </div>
              <div className="flex justify-between text-zinc-500">
                <span>Delivery</span>
                <span>{Number(order.deliveryCharge) === 0 ? "Free" : formatInr(order.deliveryCharge)}</span>
              </div>
              {Number(order.discount) > 0 ? (
                <div className="flex justify-between text-emerald-600">
                  <span>Discount</span>
                  <span>-{formatInr(order.discount)}</span>
                </div>
              ) : null}
              <div className="flex justify-between text-base font-black text-[#070e2b]">
                <span>Total</span>
                <span>{formatInr(order.amount)}</span>
              </div>
            </div>
          </div>

          <div className="rounded-xl bg-white p-4 shadow-sm ring-1 ring-zinc-100">
            <h2 className="text-base font-black">Customer &amp; delivery address</h2>
            <p className="mt-2 text-sm font-bold">{order.customerName}</p>
            <p className="text-sm text-zinc-500">{order.customerPhone}</p>
            <p className="mt-2 text-sm text-zinc-600">
              {[address.flatNo, address.floor, address.area, address.landmark]
                .filter(Boolean)
                .join(", ")}
              {address.city ? `, ${address.city}` : ""} {address.pincode ?? ""}
            </p>
            {order.bikeLabel ? (
              <p className="mt-2 text-xs text-zinc-500">Bike: {order.bikeLabel}</p>
            ) : null}
          </div>

          <div className="rounded-xl bg-white p-4 shadow-sm ring-1 ring-zinc-100">
            <h2 className="text-base font-black">Activity</h2>
            <ActivityLog events={order.events} />
          </div>
        </div>

        <div className="flex flex-col gap-4">
          <div className="rounded-xl bg-white p-4 shadow-sm ring-1 ring-zinc-100">
            <h2 className="text-base font-black">Payment</h2>
            <p className="mt-2 text-sm">
              Status:{" "}
              <span
                className={`font-bold ${
                  order.paymentStatus === "PAID" ? "text-emerald-600" : "text-zinc-600"
                }`}
              >
                {order.paymentStatus}
              </span>
            </p>
            {order.razorpayOrderId ? (
              <p className="mt-1 break-all text-xs text-zinc-400">
                Razorpay order: {order.razorpayOrderId}
              </p>
            ) : null}
            {order.razorpayPaymentId ? (
              <p className="mt-1 break-all text-xs text-zinc-400">
                Payment id: {order.razorpayPaymentId}
              </p>
            ) : null}
          </div>

          {order.returnStatus !== "NONE" ? (
            <div className="rounded-xl bg-white p-4 shadow-sm ring-1 ring-zinc-100">
              <h2 className="text-base font-black">Return</h2>

              <p className="mt-2 text-sm">
                Status:{" "}
                <span
                  className={`font-bold ${
                    order.returnStatus === "REQUESTED"
                      ? "text-amber-600"
                      : order.returnStatus === "APPROVED" || order.returnStatus === "PICKUP_SCHEDULED"
                      ? "text-blue-600"
                      : order.returnStatus === "PICKED_UP"
                      ? "text-blue-600"
                      : order.returnStatus === "RECEIVED"
                      ? "text-emerald-600"
                      : "text-red-600"
                  }`}
                >
                  {(order.returnStatus ?? "NONE").replace(/_/g, " ")}
                </span>
              </p>

              {order.returnReason ? (
                <p className="mt-2 text-xs text-zinc-500">
                  <span className="font-bold text-zinc-700">Customer&apos;s reason: </span>
                  {order.returnReason}
                </p>
              ) : null}

              {order.returnStatus === "REQUESTED" ? (
                <div className="mt-3 flex flex-col gap-2">
                  <AdminActionForm action={boundApproveReturn} className="flex flex-col gap-2">
                    <textarea
                      name="returnAdminNote"
                      placeholder="Note for this return (optional)"
                      className="min-h-14 rounded-lg border border-zinc-300 px-3 py-2 text-sm outline-none focus:border-zinc-500"
                    />
                    <button
                      type="submit"
                      className="h-10 rounded-lg bg-emerald-600 text-sm font-bold text-white hover:bg-emerald-700"
                    >
                      Approve return
                    </button>
                  </AdminActionForm>
                  <AdminActionForm action={boundRejectReturn} className="flex flex-col gap-2">
                    <textarea
                      name="returnAdminNote"
                      required
                      placeholder="Reason for rejecting (required — the customer sees this)"
                      className="min-h-14 rounded-lg border border-zinc-300 px-3 py-2 text-sm outline-none focus:border-zinc-500"
                    />
                    <button
                      type="submit"
                      className="h-10 rounded-lg border border-red-200 text-sm font-bold text-red-700 hover:bg-red-50"
                    >
                      Reject return
                    </button>
                  </AdminActionForm>
                </div>
              ) : order.returnStatus === "APPROVED" ? (
                order.returnShippingReconciliationRequired ? (
                  <div className="mt-3 rounded-lg bg-amber-50 px-4 py-3 text-xs font-medium text-amber-800">
                    <p className="font-bold">Shipment outcome is uncertain.</p>
                    <p className="mt-1">Verify with the shipping provider before creating another shipment.</p>
                    {order.returnShippingLastError ? (
                      <p className="mt-2 text-[11px] text-amber-700">{order.returnShippingLastError}</p>
                    ) : null}
                  </div>
                ) : (
                  <div className="mt-3">
                    <p className="mb-2 text-xs text-zinc-500">
                      Creates a Borzo pickup — the customer&apos;s address becomes the pickup point, the warehouse the drop.
                    </p>
                    <BorzoDeliveryForm
                      action={boundCreateBorzoReturnPickup}
                      quoteUrl={`/api/admin/orders/${order.id}/borzo-return-quote`}
                      cardTitle="Borzo Return Pickup"
                      submitLabel="Create Return Pickup"
                    />
                  </div>
                )
              ) : order.returnStatus === "PICKUP_SCHEDULED" || order.returnStatus === "PICKED_UP" ? (
                <div className="mt-3 flex flex-col gap-2">
                  {order.returnShippingOrderId && order.returnShippingOrderId !== "CREATING" ? (
                    <p className="text-xs text-zinc-500">
                      Provider: <span className="font-bold">{providerLabel(order.returnShippingProvider)}</span> &bull;{" "}
                      {order.returnShippingProvider === "BORZO" ? "Courier/Rider" : "Courier"}:{" "}
                      <span className="font-bold">{order.returnShippingCourierName ?? "unknown"}</span>
                      {order.returnShippingAwbCode ? (
                        <>
                          {" "}
                          &bull; AWB: <span className="font-mono">{order.returnShippingAwbCode}</span>
                        </>
                      ) : null}
                    </p>
                  ) : null}
                  {order.returnShippingTrackingUrl ? (
                    <a
                      href={order.returnShippingTrackingUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="text-xs font-bold text-[#ff4b1f]"
                    >
                      {order.returnShippingProvider === "BORZO" ? "Track Delivery" : "Track Shipment"} ↗
                    </a>
                  ) : null}
                  <AdminActionForm action={boundRefreshReturnPickup}>
                    <button
                      type="submit"
                      className="h-9 w-full rounded-lg border border-zinc-200 text-xs font-bold text-zinc-700 hover:bg-zinc-50"
                    >
                      Refresh Tracking
                    </button>
                  </AdminActionForm>
                  <AdminActionForm action={boundMarkReturnReceived} className="flex flex-col gap-2">
                    <label className="text-xs font-bold text-zinc-700">
                      Return condition
                      <div className="relative mt-1">
                        <select
                          name="returnCondition"
                          required
                          defaultValue=""
                          className="h-10 w-full appearance-none rounded-lg border border-zinc-300 bg-white px-3 pr-9 text-sm font-semibold text-[#070e2b] outline-none transition focus:border-[#ff4b1f] focus:ring-2 focus:ring-[#ff4b1f]/15"
                        >
                          <option value="" disabled>
                            Choose condition…
                          </option>
                          <option value="RESELLABLE">Resellable — restock this item</option>
                          <option value="DAMAGED">Damaged / do not restock</option>
                        </select>
                        <ChevronDown className="pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2 text-zinc-400" />
                      </div>
                    </label>
                    <p className="text-[11px] text-zinc-500">
                      Only &quot;Resellable&quot; increases stock — and only once, even if this is submitted twice.
                    </p>
                    <textarea
                      name="returnAdminNote"
                      placeholder="Note on item condition (optional)"
                      className="min-h-14 rounded-lg border border-zinc-300 px-3 py-2 text-sm outline-none focus:border-zinc-500"
                    />
                    <button
                      type="submit"
                      className="h-10 rounded-lg bg-emerald-600 text-sm font-bold text-white hover:bg-emerald-700"
                    >
                      Mark received at warehouse
                    </button>
                  </AdminActionForm>
                </div>
              ) : order.returnStatus === "REJECTED" ? (
                <p className="mt-2 text-xs text-zinc-500">
                  <span className="font-bold text-zinc-700">Rejection note: </span>
                  {order.returnAdminNote}
                </p>
              ) : (
                <>
                  {order.returnCondition ? (
                    <p className="mt-2 text-xs text-zinc-500">
                      <span className="font-bold text-zinc-700">Condition: </span>
                      {order.returnCondition === "RESELLABLE" ? "Resellable" : "Damaged / not restocked"}
                      {order.returnCondition === "RESELLABLE" ? (
                        <span className={order.returnStockRestored ? "ml-1 text-emerald-600" : "ml-1 text-amber-600"}>
                          — stock {order.returnStockRestored ? "restored" : "not yet restored"}
                        </span>
                      ) : null}
                    </p>
                  ) : null}
                  {order.returnAdminNote ? (
                    <p className="mt-2 text-xs text-zinc-500">
                      <span className="font-bold text-zinc-700">Note: </span>
                      {order.returnAdminNote}
                    </p>
                  ) : null}
                  {order.returnReceivedAt ? (
                    <p className="mt-1 text-xs text-zinc-400">
                      Received {order.returnReceivedAt.toLocaleString("en-IN")} — see Refund below.
                    </p>
                  ) : null}
                </>
              )}
            </div>
          ) : null}

          <PartialReturnsSection
            orderId={order.id}
            orderReturns={order.orderReturns.map((orderReturn) => ({
              id: orderReturn.id,
              status: orderReturn.status,
              reason: orderReturn.reason,
              adminNote: orderReturn.adminNote,
              condition: orderReturn.condition,
              shippingProvider: orderReturn.shippingProvider,
              shippingOrderId: orderReturn.shippingOrderId,
              shippingShipmentId: orderReturn.shippingShipmentId,
              shippingAwbCode: orderReturn.shippingAwbCode,
              shippingCourierName: orderReturn.shippingCourierName,
              shippingStatus: orderReturn.shippingStatus,
              shippingTrackingUrl: orderReturn.shippingTrackingUrl,
              shippingReconciliationRequired: orderReturn.shippingReconciliationRequired,
              shippingLastError: orderReturn.shippingLastError,
              refundStatus: orderReturn.refundStatus,
              refundAmount: orderReturn.refundAmount === null ? null : Number(orderReturn.refundAmount),
              refundFailureReason: orderReturn.refundFailureReason,
              razorpayRefundId: orderReturn.razorpayRefundId,
              refundProcessedAt: orderReturn.refundProcessedAt,
              receivedAt: orderReturn.receivedAt,
              items: orderReturn.items.map((line) => ({
                orderItemId: line.orderItemId,
                quantity: line.quantity,
                productName: order.items.find((item) => item.id === line.orderItemId)?.productName ?? "Item",
              })),
            }))}
          />

          {order.refundStatus !== "NONE" ? (
            <div className="rounded-xl bg-white p-4 shadow-sm ring-1 ring-zinc-100">
              <h2 className="text-base font-black">Refund</h2>

              <p className="mt-2 text-sm">
                Status:{" "}
                <span
                  className={`font-bold ${
                    order.refundStatus === "REQUESTED"
                      ? "text-amber-600"
                      : order.refundStatus === "PROCESSING"
                      ? "text-blue-600"
                      : order.refundStatus === "REFUNDED"
                      ? "text-emerald-600"
                      : "text-red-600"
                  }`}
                >
                  {order.refundStatus}
                </span>
              </p>

              {order.refundReason ? (
                <p className="mt-2 text-xs text-zinc-500">
                  <span className="font-bold text-zinc-700">Customer&apos;s reason: </span>
                  {order.refundReason}
                </p>
              ) : null}

              {order.refundAmount ? (
                <p className="mt-1 text-xs text-zinc-500">
                  Amount: <span className="font-bold text-zinc-700">{formatInr(order.refundAmount)}</span>
                </p>
              ) : null}

              {order.refundStatus === "REQUESTED" ? (
                <div className="mt-3 flex flex-col gap-2">
                  <AdminActionForm action={boundApproveRefund} className="flex flex-col gap-2">
                    <textarea
                      name="refundAdminNote"
                      placeholder="Note for this refund (optional)"
                      className="min-h-14 rounded-lg border border-zinc-300 px-3 py-2 text-sm outline-none focus:border-zinc-500"
                    />
                    <button
                      type="submit"
                      className="h-10 rounded-lg bg-emerald-600 text-sm font-bold text-white hover:bg-emerald-700"
                    >
                      Approve &amp; refund via Razorpay
                    </button>
                  </AdminActionForm>
                  <AdminActionForm action={boundRejectRefund} className="flex flex-col gap-2">
                    <textarea
                      name="refundAdminNote"
                      required
                      placeholder="Reason for rejecting (required — the customer sees this)"
                      className="min-h-14 rounded-lg border border-zinc-300 px-3 py-2 text-sm outline-none focus:border-zinc-500"
                    />
                    <button
                      type="submit"
                      className="h-10 rounded-lg border border-red-200 text-sm font-bold text-red-700 hover:bg-red-50"
                    >
                      Reject refund
                    </button>
                  </AdminActionForm>
                </div>
              ) : order.refundStatus === "PROCESSING" ? (
                <p className="mt-3 rounded-lg bg-blue-50 px-3 py-2 text-xs font-medium text-blue-700">
                  Refund is being processed with Razorpay. If this stays stuck, check the Razorpay dashboard
                  for payment {order.razorpayPaymentId}.
                </p>
              ) : order.refundStatus === "REJECTED" ? (
                <p className="mt-2 text-xs text-zinc-500">
                  <span className="font-bold text-zinc-700">Rejection note: </span>
                  {order.refundAdminNote}
                </p>
              ) : (
                <>
                  {order.refundAdminNote ? (
                    <p className="mt-2 text-xs text-zinc-500">
                      <span className="font-bold text-zinc-700">Note: </span>
                      {order.refundAdminNote}
                    </p>
                  ) : null}
                  {order.razorpayRefundId ? (
                    <p className="mt-1 break-all text-xs text-zinc-400">
                      Razorpay refund id: {order.razorpayRefundId}
                    </p>
                  ) : null}
                  {order.refundProcessedAt ? (
                    <p className="mt-1 text-xs text-zinc-400">
                      Processed {order.refundProcessedAt.toLocaleString("en-IN")}
                    </p>
                  ) : null}
                </>
              )}
            </div>
          ) : null}

          <div className="rounded-xl bg-white p-4 shadow-sm ring-1 ring-zinc-100">
            <h2 className="text-base font-black">Update status</h2>
            <AdminActionForm action={boundUpdateStatus} className="mt-3 flex flex-col gap-2">
              <div className="relative">
                {/* key={order.status} forces a remount whenever the saved status
                    changes, so defaultValue re-applies — a plain re-render alone
                    doesn't move an uncontrolled select's value in React, which
                    previously left this dropdown stuck showing whatever status
                    was current on the very first page load. */}
                <select
                  key={order.status}
                  name="status"
                  defaultValue={toCustomerVisibleStatus(order.status)}
                  className="h-11 w-full appearance-none rounded-lg border border-zinc-300 bg-white px-3 pr-9 text-sm font-semibold text-[#070e2b] outline-none transition focus:border-[#ff4b1f] focus:ring-2 focus:ring-[#ff4b1f]/15"
                >
                  {STATUS_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
                <ChevronDown className="pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2 text-zinc-400" />
              </div>
              <textarea
                name="adminNote"
                placeholder="Internal note (optional)"
                defaultValue={order.adminNote ?? ""}
                className="min-h-16 rounded-lg border border-zinc-300 px-3 py-2 text-sm outline-none focus:border-zinc-500"
              />
              <button
                type="submit"
                className="h-10 rounded-lg bg-zinc-950 text-sm font-bold text-white"
              >
                Save status
              </button>
            </AdminActionForm>
          </div>

          <div className="rounded-xl bg-white p-4 shadow-sm ring-1 ring-zinc-100">
            <h2 className="text-base font-black">Shipping</h2>

            {order.shippingReconciliationRequired ? (
              <div className="mt-2 rounded-lg bg-amber-50 px-3 py-2 text-xs font-medium text-amber-800">
                <p className="font-bold">Shipment outcome is uncertain.</p>
                <p className="mt-1">Verify with the shipping provider before retrying.</p>
                {order.shippingLastError ? <p className="mt-2 text-[11px] text-amber-700">{order.shippingLastError}</p> : null}
              </div>
            ) : order.shippingOrderId && order.shippingOrderId !== "CREATING" ? (
              <div className="mt-2 flex flex-col gap-1 text-sm">
                <p>
                  Provider: <span className="font-bold">{providerLabel(order.shippingProvider)}</span>
                </p>
                {order.shippingCourierName ? (
                  <p>
                    {order.shippingProvider === "BORZO" ? "Courier/Rider" : "Courier"}: <span className="font-bold">{order.shippingCourierName}</span>
                  </p>
                ) : null}
                {/* Borzo has no AWB/label concept — shippingAwbCode is only ever populated for Shiprocket/Porter rows (see Part 11), so this simply never renders for a Borzo delivery. */}
                {order.shippingAwbCode ? (
                  <p>
                    AWB: <span className="font-mono text-xs">{order.shippingAwbCode}</span>
                  </p>
                ) : null}
                <p>
                  Status: <span className="font-bold">{order.shippingStatus ?? "unknown"}</span>
                </p>
                {order.shippingLastUpdatedAt ? (
                  <p className="text-xs text-zinc-500">Last update: {order.shippingLastUpdatedAt.toLocaleString("en-IN")}</p>
                ) : null}
                {order.shippingTrackingUrl ? (
                  <a
                    href={order.shippingTrackingUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="text-xs font-bold text-[#ff4b1f]"
                  >
                    Track Shipment ↗
                  </a>
                ) : null}
                {/* Optional — only ever a real Borzo waybill_document_url (Part 20); never required for the local-delivery workflow. */}
                {order.shippingWaybillUrl ? (
                  <a
                    href={order.shippingWaybillUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="text-xs font-bold text-zinc-700 underline"
                  >
                    Open Waybill ↗
                  </a>
                ) : null}

                <AdminActionForm action={boundRefresh} className="mt-2">
                  <button
                    type="submit"
                    className="h-9 w-full rounded-lg border border-zinc-200 text-xs font-bold text-zinc-700 hover:bg-zinc-50"
                  >
                    Refresh Tracking
                  </button>
                </AdminActionForm>
                {order.status !== "DELIVERED" && order.status !== "CANCELLED" ? (
                  <AdminActionForm action={boundCancelShipment}>
                    <button
                      type="submit"
                      className="h-9 w-full rounded-lg border border-red-200 text-xs font-bold text-red-700 hover:bg-red-50"
                    >
                      {order.shippingProvider === "BORZO" ? "Cancel Delivery" : "Cancel Shipment"}
                    </button>
                  </AdminActionForm>
                ) : null}
              </div>
            ) : (
              // Borzo is the store's only active delivery provider — new
              // shipments are never created through Shiprocket (see the
              // "Borzo Local Delivery" card below). This branch only shows
              // once payment/eligibility isn't ready yet for that card;
              // once paid, the card below takes over.
              <p className="mt-2 text-xs text-zinc-500">
                {order.paymentStatus === "PAID"
                  ? "Waiting for a Borzo delivery to be created below."
                  : "Delivery can be created once this order is paid."}
              </p>
            )}
          </div>

          {/*
            Borzo Local Delivery card — the store's only active forward-
            delivery provider. Shown whenever the order is paid and no
            shipment has been created yet, regardless of the pre-check
            eligibility signal below — the quote endpoint underneath (see
            BorzoDeliveryForm) always re-checks the real address server-side
            and reports clearly if a specific order genuinely isn't Pune,
            rather than silently hiding the only delivery option with no
            explanation. Never shows Shiprocket's AWB/label workflow (Part
            10) since Borzo's own create action never touches those fields.
          */}
          {order.paymentStatus === "PAID" && (!order.shippingOrderId || order.shippingOrderId === "CREATING") ? (
            <div className="rounded-xl bg-white p-4 shadow-sm ring-1 ring-zinc-100">
              <h2 className="text-base font-black">Borzo Local Delivery</h2>
              <p className="mt-1 text-xs text-zinc-500">Same-city courier for Pune-to-Pune orders.</p>
              <div className="mt-3">
                <BorzoDeliveryForm action={boundCreateBorzoDelivery} quoteUrl={`/api/admin/orders/${order.id}/borzo-quote`} />
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
