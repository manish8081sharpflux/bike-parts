import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { formatInr } from "@/lib/format";
import {
  approveRefundAction,
  dispatchOrderAction,
  refreshDeliveryStatusAction,
  rejectRefundAction,
  updateOrderStatusAction,
} from "@/lib/actions/admin-orders";
import { RefundReadyPopup } from "./RefundReadyPopup";
import { ActivityLog } from "./ActivityLog";

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
    },
  });

  if (!order) {
    notFound();
  }

  const address = (order.deliveryAddress ?? {}) as DeliveryAddress;
  const boundDispatch = dispatchOrderAction.bind(null, order.id);
  const boundRefresh = refreshDeliveryStatusAction.bind(null, order.id);
  const boundUpdateStatus = updateOrderStatusAction.bind(null, order.id);
  const boundApproveRefund = approveRefundAction.bind(null, order.id);
  const boundRejectRefund = rejectRefundAction.bind(null, order.id);

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
          <h1 className="mt-1 text-2xl font-black">Order #{order.id.slice(-8)}</h1>
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
                  <form action={boundApproveRefund} className="flex flex-col gap-2">
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
                  </form>
                  <form action={boundRejectRefund} className="flex flex-col gap-2">
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
                  </form>
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
            <form action={boundUpdateStatus} className="mt-3 flex flex-col gap-2">
              <select
                name="status"
                defaultValue={toCustomerVisibleStatus(order.status)}
                className="h-10 rounded-lg border border-zinc-300 px-3 text-sm outline-none focus:border-zinc-500"
              >
                {STATUS_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
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
            </form>
          </div>

          <div className="rounded-xl bg-white p-4 shadow-sm ring-1 ring-zinc-100">
            <h2 className="text-base font-black">Delivery (Porter)</h2>

            {order.porterOrderId ? (
              <div className="mt-2 flex flex-col gap-1 text-sm">
                <p>
                  Porter order: <span className="font-mono text-xs">{order.porterOrderId}</span>
                </p>
                <p>
                  Status: <span className="font-bold">{order.porterStatus ?? "unknown"}</span>
                </p>
                {order.porterTrackingUrl ? (
                  <a
                    href={order.porterTrackingUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="text-xs font-bold text-[#ff4b1f]"
                  >
                    Track shipment ↗
                  </a>
                ) : null}

                <form action={boundRefresh} className="mt-2">
                  <button
                    type="submit"
                    className="h-9 w-full rounded-lg border border-zinc-200 text-xs font-bold text-zinc-700 hover:bg-zinc-50"
                  >
                    Refresh delivery status
                  </button>
                </form>
              </div>
            ) : (
              <form action={boundDispatch} className="mt-3">
                <p className="mb-2 text-xs text-zinc-500">
                  Creates a Porter delivery order for this shipment. The order must be paid
                  first.
                </p>
                <button
                  type="submit"
                  disabled={order.paymentStatus !== "PAID"}
                  className="h-10 w-full rounded-lg bg-[#ff4b1f] text-sm font-bold text-white transition hover:bg-[#e8330e] disabled:cursor-not-allowed disabled:opacity-40"
                >
                  Dispatch with Porter
                </button>
              </form>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
