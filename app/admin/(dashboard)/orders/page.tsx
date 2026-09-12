import Link from "next/link";
import { prisma } from "@/lib/db";
import { formatInr } from "@/lib/format";
import type { OrderStatus, PaymentStatus, RefundStatus } from "@prisma/client";
import { AdminPagination, parsePage } from "../admin-pagination";
import { AutoSubmitFilterForm } from "../auto-submit-filter-form";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 10;

// Matches the same 4 customer-facing stages (plus Cancelled) as the "Update
// status" dropdown on the order detail page — see toCustomerVisibleStatus
// there. "Preparing" groups the 4 internal-only stages the customer never
// sees (Pending/Paid/Packed/Shipped) into one filter option.
const STATUS_FILTERS: Array<{
  value: "PREPARING" | "OUT_FOR_DELIVERY" | "DELIVERED" | "CANCELLED";
  label: string;
  dbStatuses: OrderStatus[];
}> = [
  { value: "PREPARING", label: "Preparing", dbStatuses: ["PENDING", "PAID", "PACKED", "SHIPPED"] },
  { value: "OUT_FOR_DELIVERY", label: "Out for Delivery", dbStatuses: ["OUT_FOR_DELIVERY"] },
  { value: "DELIVERED", label: "Delivered", dbStatuses: ["DELIVERED"] },
  { value: "CANCELLED", label: "Cancelled", dbStatuses: ["CANCELLED"] },
];

const STATUS_STYLES: Record<string, string> = {
  PENDING: "bg-zinc-100 text-zinc-700",
  PAID: "bg-blue-50 text-blue-700",
  PACKED: "bg-amber-50 text-amber-700",
  SHIPPED: "bg-violet-50 text-violet-700",
  OUT_FOR_DELIVERY: "bg-violet-50 text-violet-700",
  DELIVERED: "bg-emerald-50 text-emerald-700",
  CANCELLED: "bg-red-50 text-red-700",
};

const PAYMENT_STATUS_VALUES: PaymentStatus[] = ["PENDING", "PAID", "FAILED", "REFUNDED"];

// "NONE" (no refund ever requested) is deliberately left out — it's the
// default state for the vast majority of orders, so it wouldn't be a useful
// filter option; admins filtering by refund status want to find the ones
// that need attention or that resolved a particular way.
const REFUND_STATUS_VALUES: RefundStatus[] = ["REQUESTED", "PROCESSING", "REJECTED", "REFUNDED"];

const REFUND_STATUS_STYLES: Record<string, string> = {
  REQUESTED: "bg-amber-50 text-amber-700",
  PROCESSING: "bg-blue-50 text-blue-700",
  REJECTED: "bg-red-50 text-red-700",
  REFUNDED: "bg-emerald-50 text-emerald-700",
};

export default async function AdminOrdersPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; payment?: string; refund?: string; q?: string; page?: string }>;
}) {
  const params = await searchParams;
  const statusFilter = STATUS_FILTERS.find((filter) => filter.value === params.status);
  const paymentFilter = PAYMENT_STATUS_VALUES.find((value) => value === params.payment);
  const refundFilter = REFUND_STATUS_VALUES.find((value) => value === params.refund);
  const query = params.q?.trim();
  const page = parsePage(params.page);

  const where = {
    ...(statusFilter ? { status: { in: statusFilter.dbStatuses } } : {}),
    ...(paymentFilter ? { paymentStatus: paymentFilter } : {}),
    ...(refundFilter ? { refundStatus: refundFilter } : {}),
    ...(query
      ? {
          OR: [
            { id: { contains: query, mode: "insensitive" as const } },
            { customerName: { contains: query, mode: "insensitive" as const } },
            { customerPhone: { contains: query, mode: "insensitive" as const } },
          ],
        }
      : {}),
  };

  const [totalCount, orders] = await Promise.all([
    prisma.order.count({ where }),
    prisma.order.findMany({
      where,
      orderBy: { createdAt: "desc" },
      include: { items: true },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
    }),
  ]);
  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));
  const buildHref = (targetPage: number) => {
    const qs = new URLSearchParams();
    if (statusFilter) qs.set("status", statusFilter.value);
    if (paymentFilter) qs.set("payment", paymentFilter);
    if (refundFilter) qs.set("refund", refundFilter);
    if (query) qs.set("q", query);
    if (targetPage > 1) qs.set("page", String(targetPage));
    const str = qs.toString();
    return str ? `/admin/orders?${str}` : "/admin/orders";
  };

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-2xl font-black">Orders</h1>
        <p className="text-sm text-zinc-500">
          {totalCount} order(s) — page {page} of {totalPages}
        </p>
      </div>

      {/*
        Keyed on the resolved filter state so the whole form remounts
        whenever it changes (including a "Clear filters" reset) — otherwise
        a client-side (soft) navigation patches the existing <select>/<input>
        DOM nodes instead of recreating them, and `defaultValue` only ever
        applies on first mount, so a control whose value actually changed
        would keep showing its old pick even though the server is
        (correctly) filtering by the new one underneath.
      */}
      <AutoSubmitFilterForm
        key={[query, statusFilter?.value, paymentFilter, refundFilter].join("|")}
        className="flex flex-wrap items-center gap-2"
        action="/admin/orders"
      >
        <input
          type="text"
          name="q"
          defaultValue={query}
          placeholder="Search order id, name, or phone…"
          className="h-10 w-64 shrink-0 rounded-lg border border-zinc-300 px-3 text-sm outline-none focus:border-zinc-500"
        />

        <select
          name="status"
          defaultValue={statusFilter?.value ?? ""}
          className="h-10 rounded-lg border border-zinc-300 bg-white px-3 text-sm text-zinc-700 outline-none focus:border-zinc-500"
        >
          <option value="">All statuses</option>
          {STATUS_FILTERS.map((filter) => (
            <option key={filter.value} value={filter.value}>
              {filter.label}
            </option>
          ))}
        </select>

        <select
          name="payment"
          defaultValue={paymentFilter ?? ""}
          className="h-10 rounded-lg border border-zinc-300 bg-white px-3 text-sm text-zinc-700 outline-none focus:border-zinc-500"
        >
          <option value="">All payments</option>
          {PAYMENT_STATUS_VALUES.map((value) => (
            <option key={value} value={value}>
              {value}
            </option>
          ))}
        </select>

        <select
          name="refund"
          defaultValue={refundFilter ?? ""}
          className="h-10 rounded-lg border border-zinc-300 bg-white px-3 text-sm text-zinc-700 outline-none focus:border-zinc-500"
        >
          <option value="">All refunds</option>
          {REFUND_STATUS_VALUES.map((value) => (
            <option key={value} value={value}>
              Refund: {value}
            </option>
          ))}
        </select>

        {statusFilter || paymentFilter || refundFilter || query ? (
          <Link
            href="/admin/orders"
            className="h-10 shrink-0 rounded-lg px-3 text-xs font-bold leading-10 text-zinc-500 hover:text-zinc-800"
          >
            Clear filters
          </Link>
        ) : null}
      </AutoSubmitFilterForm>

      <div className="overflow-x-auto rounded-xl bg-white shadow-sm ring-1 ring-zinc-100">
        <table className="w-full min-w-[720px] text-left text-sm">
          <thead>
            <tr className="border-b border-zinc-100 text-xs font-bold uppercase text-zinc-500">
              <th className="px-4 py-3">Order</th>
              <th className="px-4 py-3">Customer</th>
              <th className="px-4 py-3">Items</th>
              <th className="px-4 py-3">Amount</th>
              <th className="px-4 py-3">Payment</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody>
            {orders.map((order) => (
              <tr key={order.id} className="border-b border-zinc-50 last:border-0">
                <td className="px-4 py-3 font-mono text-xs text-zinc-500">
                  #{order.id.slice(-8)}
                  <div className="text-[10px] text-zinc-400">
                    {order.createdAt.toLocaleString("en-IN")}
                  </div>
                </td>
                <td className="px-4 py-3">
                  <div className="font-bold">{order.customerName}</div>
                  <div className="text-xs text-zinc-500">{order.customerPhone}</div>
                </td>
                <td className="px-4 py-3 text-zinc-500">{order.items.length} item(s)</td>
                <td className="px-4 py-3 font-bold">{formatInr(order.amount)}</td>
                <td className="px-4 py-3">
                  <span
                    className={`rounded-full px-2.5 py-1 text-[11px] font-bold ${
                      order.paymentStatus === "PAID"
                        ? "bg-emerald-50 text-emerald-700"
                        : "bg-zinc-100 text-zinc-700"
                    }`}
                  >
                    {order.paymentStatus}
                  </span>
                  {order.refundStatus !== "NONE" ? (
                    <span
                      className={`ml-1.5 inline-block rounded-full px-2.5 py-1 text-[11px] font-bold ${
                        REFUND_STATUS_STYLES[order.refundStatus] ?? "bg-zinc-100 text-zinc-700"
                      }`}
                    >
                      Refund: {order.refundStatus}
                    </span>
                  ) : null}
                </td>
                <td className="px-4 py-3">
                  <span
                    className={`rounded-full px-2.5 py-1 text-[11px] font-bold ${
                      STATUS_STYLES[order.status] ?? "bg-zinc-100 text-zinc-700"
                    }`}
                  >
                    {order.status.replaceAll("_", " ")}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <Link
                    href={`/admin/orders/${order.id}`}
                    className="text-xs font-bold text-[#ff4b1f]"
                  >
                    View
                  </Link>
                </td>
              </tr>
            ))}

            {orders.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-sm text-zinc-400">
                  No orders match this filter.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>

      <AdminPagination currentPage={page} totalPages={totalPages} buildHref={buildHref} />
    </div>
  );
}
