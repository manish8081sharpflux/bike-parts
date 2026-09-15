import { AdminActionForm } from "../../admin-feedback";
import { ChevronDown } from "lucide-react";
import { formatInr } from "@/lib/format";
import type { ShippingProviderName } from "@/app/home/types";
import {
  approvePartialRefundAction,
  approvePartialReturnAction,
  createBorzoPartialReturnPickupAction,
  markPartialReturnReceivedAction,
  refreshPartialReturnPickupStatusAction,
  rejectPartialRefundAction,
  rejectPartialReturnAction,
} from "@/lib/actions/admin-orders";
import { BorzoDeliveryForm } from "./BorzoDeliveryForm";

type PartialReturn = {
  id: string;
  status: "REQUESTED" | "APPROVED" | "PICKUP_SCHEDULED" | "PICKED_UP" | "RECEIVED" | "REJECTED";
  reason: string;
  adminNote: string | null;
  condition: "RESELLABLE" | "DAMAGED" | null;
  shippingProvider: ShippingProviderName | null;
  shippingOrderId: string | null;
  shippingShipmentId: string | null;
  shippingAwbCode: string | null;
  shippingCourierName: string | null;
  shippingStatus: string | null;
  shippingTrackingUrl: string | null;
  shippingReconciliationRequired: boolean;
  shippingLastError: string | null;
  refundStatus: "NONE" | "REQUESTED" | "PROCESSING" | "REFUNDED" | "FAILED";
  refundAmount: number | null;
  refundFailureReason: string | null;
  razorpayRefundId: string | null;
  refundProcessedAt: Date | null;
  receivedAt: Date | null;
  items: Array<{ orderItemId: string; quantity: number; productName: string }>;
};

/**
 * One order can have several item/quantity-level returns (see
 * lib/order-returns/service.ts), each moving through REQUESTED -> APPROVED
 * -> PICKUP_SCHEDULED -> PICKED_UP -> RECEIVED independently — unlike the
 * legacy single "Return" card above (order.returnStatus), which only ever
 * tracks one whole-order return at a time.
 */
export function PartialReturnsSection({ orderId, orderReturns }: { orderId: string; orderReturns: PartialReturn[] }) {
  if (orderReturns.length === 0) return null;

  return (
    <div className="rounded-xl bg-white p-4 shadow-sm ring-1 ring-zinc-100">
      <h2 className="text-base font-black">Item Returns</h2>
      <div className="mt-3 flex flex-col gap-4">
        {orderReturns.map((orderReturn, index) => (
          <PartialReturnCard key={orderReturn.id} orderId={orderId} orderReturn={orderReturn} index={index} />
        ))}
      </div>
    </div>
  );
}

function PartialReturnCard({ orderId, orderReturn, index }: { orderId: string; orderReturn: PartialReturn; index: number }) {
  const boundApprove = approvePartialReturnAction.bind(null, orderId, orderReturn.id);
  const boundReject = rejectPartialReturnAction.bind(null, orderId, orderReturn.id);
  const boundCreateBorzoReturnPickup = createBorzoPartialReturnPickupAction.bind(null, orderId, orderReturn.id);
  const boundRefresh = refreshPartialReturnPickupStatusAction.bind(null, orderId, orderReturn.id);
  const boundMarkReceived = markPartialReturnReceivedAction.bind(null, orderId, orderReturn.id);
  const boundApproveRefund = approvePartialRefundAction.bind(null, orderId, orderReturn.id);
  const boundRejectRefund = rejectPartialRefundAction.bind(null, orderId, orderReturn.id);

  return (
    <div className="rounded-lg border border-zinc-100 p-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-black text-[#070e2b]">Return #{index + 1}</p>
        <span
          className={`text-xs font-bold ${
            orderReturn.status === "REQUESTED"
              ? "text-amber-600"
              : orderReturn.status === "RECEIVED"
              ? "text-emerald-600"
              : orderReturn.status === "REJECTED"
              ? "text-red-600"
              : "text-blue-600"
          }`}
        >
          {orderReturn.status.replace(/_/g, " ")}
        </span>
      </div>

      <p className="mt-1 text-xs text-zinc-500">
        {orderReturn.items.map((line) => `${line.productName} × ${line.quantity}`).join(", ")}
      </p>
      <p className="mt-1 text-xs text-zinc-500">
        <span className="font-bold text-zinc-700">Customer&apos;s reason: </span>
        {orderReturn.reason}
      </p>

      {orderReturn.status === "REQUESTED" ? (
        <div className="mt-3 flex flex-col gap-2">
          <AdminActionForm action={boundApprove} className="flex flex-col gap-2">
            <textarea
              name="returnAdminNote"
              placeholder="Note for this return (optional)"
              className="min-h-12 rounded-lg border border-zinc-300 px-3 py-2 text-xs outline-none focus:border-zinc-500"
            />
            <button type="submit" className="h-9 rounded-lg bg-emerald-600 text-xs font-bold text-white hover:bg-emerald-700">
              Approve return
            </button>
          </AdminActionForm>
          <AdminActionForm action={boundReject} className="flex flex-col gap-2">
            <textarea
              name="returnAdminNote"
              required
              placeholder="Reason for rejecting (required — the customer sees this)"
              className="min-h-12 rounded-lg border border-zinc-300 px-3 py-2 text-xs outline-none focus:border-zinc-500"
            />
            <button type="submit" className="h-9 rounded-lg border border-red-200 text-xs font-bold text-red-700 hover:bg-red-50">
              Reject return
            </button>
          </AdminActionForm>
        </div>
      ) : orderReturn.status === "APPROVED" ? (
        orderReturn.shippingReconciliationRequired ? (
          <div className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-xs font-medium text-amber-800">
            <p className="font-bold">Shipment outcome is uncertain.</p>
            <p className="mt-1">Verify with the shipping provider before creating another shipment.</p>
            {orderReturn.shippingLastError ? <p className="mt-2 text-[11px] text-amber-700">{orderReturn.shippingLastError}</p> : null}
          </div>
        ) : (
          <div className="mt-3">
            <p className="mb-2 text-xs text-zinc-500">
              Creates a Borzo pickup for only this return&apos;s item(s) — the customer&apos;s address becomes the pickup point, the warehouse the drop.
            </p>
            <BorzoDeliveryForm
              action={boundCreateBorzoReturnPickup}
              quoteUrl={`/api/admin/orders/${orderId}/returns/${orderReturn.id}/borzo-quote`}
              cardTitle="Borzo Return Pickup"
              submitLabel="Create Return Pickup"
            />
          </div>
        )
      ) : orderReturn.status === "PICKUP_SCHEDULED" || orderReturn.status === "PICKED_UP" ? (
        <div className="mt-3 flex flex-col gap-2">
          {orderReturn.shippingOrderId && orderReturn.shippingOrderId !== "CREATING" ? (
            <p className="text-xs text-zinc-500">
              Provider: <span className="font-bold">{orderReturn.shippingProvider === "BORZO" ? "Borzo" : orderReturn.shippingProvider === "PORTER" ? "Porter" : "Shiprocket"}</span> &bull;{" "}
              {orderReturn.shippingProvider === "BORZO" ? "Courier/Rider" : "Courier"}:{" "}
              <span className="font-bold">{orderReturn.shippingCourierName ?? "unknown"}</span>
              {orderReturn.shippingAwbCode ? (
                <>
                  {" "}
                  &bull; AWB: <span className="font-mono">{orderReturn.shippingAwbCode}</span>
                </>
              ) : null}
            </p>
          ) : null}
          {orderReturn.shippingTrackingUrl ? (
            <a href={orderReturn.shippingTrackingUrl} target="_blank" rel="noreferrer" className="text-xs font-bold text-[#025632]">
              {orderReturn.shippingProvider === "BORZO" ? "Track Delivery" : "Track Shipment"} ↗
            </a>
          ) : null}
          <AdminActionForm action={boundRefresh}>
            <button type="submit" className="h-9 w-full rounded-lg border border-zinc-200 text-xs font-bold text-zinc-700 hover:bg-zinc-50">
              Refresh Tracking
            </button>
          </AdminActionForm>
          <AdminActionForm action={boundMarkReceived} className="flex flex-col gap-2">
            <label className="text-xs font-bold text-zinc-700">
              Return condition
              <div className="relative mt-1">
                <select
                  name="returnCondition"
                  required
                  defaultValue=""
                  className="h-9 w-full appearance-none rounded-lg border border-zinc-300 bg-white px-3 pr-9 text-xs font-semibold text-[#070e2b] outline-none transition focus:border-[#025632] focus:ring-2 focus:ring-[#025632]/15"
                >
                  <option value="" disabled>Choose condition…</option>
                  <option value="RESELLABLE">Resellable — restock these items</option>
                  <option value="DAMAGED">Damaged / do not restock</option>
                </select>
                <ChevronDown className="pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2 text-zinc-400" />
              </div>
            </label>
            <p className="text-[11px] text-zinc-500">
              Only restocks the {orderReturn.items.reduce((sum, line) => sum + line.quantity, 0)} unit(s) on this return, and only once.
            </p>
            <textarea
              name="returnAdminNote"
              placeholder="Note on item condition (optional)"
              className="min-h-12 rounded-lg border border-zinc-300 px-3 py-2 text-xs outline-none focus:border-zinc-500"
            />
            <button type="submit" className="h-9 rounded-lg bg-emerald-600 text-xs font-bold text-white hover:bg-emerald-700">
              Mark received at warehouse
            </button>
          </AdminActionForm>
        </div>
      ) : orderReturn.status === "REJECTED" ? (
        <p className="mt-2 text-xs text-zinc-500">
          <span className="font-bold text-zinc-700">Rejection note: </span>
          {orderReturn.adminNote}
        </p>
      ) : (
        // RECEIVED — condition is set, refund lifecycle takes over below.
        <>
          {orderReturn.condition ? (
            <p className="mt-2 text-xs text-zinc-500">
              <span className="font-bold text-zinc-700">Condition: </span>
              {orderReturn.condition === "RESELLABLE" ? "Resellable — stock restored" : "Damaged / not restocked"}
            </p>
          ) : null}
          {orderReturn.receivedAt ? (
            <p className="mt-1 text-xs text-zinc-400">Received {orderReturn.receivedAt.toLocaleString("en-IN")}</p>
          ) : null}
        </>
      )}

      {orderReturn.refundStatus !== "NONE" ? (
        <div className="mt-3 border-t border-zinc-100 pt-3">
          <p className="text-xs">
            <span className="font-bold text-zinc-700">Refund: </span>
            <span
              className={
                orderReturn.refundStatus === "REQUESTED"
                  ? "font-bold text-amber-600"
                  : orderReturn.refundStatus === "PROCESSING"
                  ? "font-bold text-blue-600"
                  : orderReturn.refundStatus === "REFUNDED"
                  ? "font-bold text-emerald-600"
                  : "font-bold text-red-600"
              }
            >
              {orderReturn.refundStatus}
            </span>
            {orderReturn.refundAmount ? ` — ${formatInr(orderReturn.refundAmount)}` : ""}
          </p>

          {orderReturn.refundStatus === "REQUESTED" ? (
            <div className="mt-2 flex flex-col gap-2">
              <AdminActionForm action={boundApproveRefund} className="flex flex-col gap-2">
                <textarea
                  name="refundAdminNote"
                  placeholder="Note for this refund (optional)"
                  className="min-h-12 rounded-lg border border-zinc-300 px-3 py-2 text-xs outline-none focus:border-zinc-500"
                />
                <button type="submit" className="h-9 rounded-lg bg-emerald-600 text-xs font-bold text-white hover:bg-emerald-700">
                  Approve &amp; refund via Razorpay
                </button>
              </AdminActionForm>
              <AdminActionForm action={boundRejectRefund} className="flex flex-col gap-2">
                <textarea
                  name="refundAdminNote"
                  required
                  placeholder="Reason for rejecting (required — the customer sees this)"
                  className="min-h-12 rounded-lg border border-zinc-300 px-3 py-2 text-xs outline-none focus:border-zinc-500"
                />
                <button type="submit" className="h-9 rounded-lg border border-red-200 text-xs font-bold text-red-700 hover:bg-red-50">
                  Reject refund
                </button>
              </AdminActionForm>
            </div>
          ) : orderReturn.refundStatus === "PROCESSING" ? (
            <p className="mt-2 rounded-lg bg-blue-50 px-3 py-2 text-xs font-medium text-blue-700">
              Refund is being processed with Razorpay.
            </p>
          ) : orderReturn.refundStatus === "FAILED" ? (
            <p className="mt-1 text-xs text-zinc-500">
              <span className="font-bold text-zinc-700">Note: </span>
              {orderReturn.refundFailureReason}
            </p>
          ) : (
            <>
              {orderReturn.razorpayRefundId ? (
                <p className="mt-1 break-all text-xs text-zinc-400">Razorpay refund id: {orderReturn.razorpayRefundId}</p>
              ) : null}
              {orderReturn.refundProcessedAt ? (
                <p className="mt-1 text-xs text-zinc-400">Processed {orderReturn.refundProcessedAt.toLocaleString("en-IN")}</p>
              ) : null}
            </>
          )}
        </div>
      ) : null}
    </div>
  );
}
