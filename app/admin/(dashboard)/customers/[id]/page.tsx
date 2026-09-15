import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { formatInr, formatOrderNumber } from "@/lib/format";
import { deleteCustomerAction } from "@/lib/actions/admin-customers";
import { DeleteConfirmButton } from "../../DeleteConfirmButton";

export const dynamic = "force-dynamic";

const STATUS_STYLES: Record<string, string> = {
  PENDING: "bg-zinc-100 text-zinc-700",
  PAID: "bg-blue-50 text-blue-700",
  PACKED: "bg-amber-50 text-amber-700",
  SHIPPED: "bg-violet-50 text-violet-700",
  OUT_FOR_DELIVERY: "bg-violet-50 text-violet-700",
  DELIVERED: "bg-emerald-50 text-emerald-700",
  CANCELLED: "bg-red-50 text-red-700",
};

export default async function AdminCustomerDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const customer = await prisma.user.findUnique({
    where: { id },
    include: {
      orders: {
        orderBy: { createdAt: "desc" },
        include: { items: true },
      },
    },
  });

  if (!customer) {
    notFound();
  }

  const paidOrders = customer.orders.filter((order) => order.paymentStatus === "PAID");
  const totalSpent = paidOrders.reduce((sum, order) => sum + Number(order.amount), 0);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <Link href="/admin/customers" className="text-xs font-bold text-zinc-500">
            ← Back to customers
          </Link>
          <h1 className="mt-1 text-2xl font-black">{customer.name ?? "Unnamed customer"}</h1>
          <p className="text-sm text-zinc-500">
            Customer since {customer.createdAt.toLocaleDateString("en-IN")}
          </p>
        </div>
        <DeleteConfirmButton
          itemLabel={customer.name ?? "this customer"}
          title="Delete this customer?"
          triggerLabel="Delete customer"
          triggerClassName="inline-flex h-10 shrink-0 items-center justify-center rounded-lg border border-red-200 bg-white px-4 text-xs font-bold text-red-600 transition hover:bg-red-50"
          action={deleteCustomerAction.bind(null, customer.id)}
        />
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <div className="rounded-xl bg-white p-4 shadow-sm ring-1 ring-zinc-100">
          <p className="text-xs font-bold uppercase text-zinc-500">Contact</p>
          <p className="mt-1 text-sm font-bold text-[#070e2b]">{customer.phone ?? "—"}</p>
          {customer.email ? <p className="text-xs text-zinc-500">{customer.email}</p> : null}
        </div>
        <div className="rounded-xl bg-white p-4 shadow-sm ring-1 ring-zinc-100">
          <p className="text-xs font-bold uppercase text-zinc-500">Source</p>
          <span
            className={`mt-1 inline-block rounded-full px-2.5 py-1 text-[11px] font-bold ${
              customer.addedByAdmin
                ? "bg-violet-50 text-violet-700"
                : "bg-emerald-50 text-emerald-700"
            }`}
          >
            {customer.addedByAdmin ? "Added by Admin" : "Self-Registered"}
          </span>
        </div>
        <div className="rounded-xl bg-white p-4 shadow-sm ring-1 ring-zinc-100">
          <p className="text-xs font-bold uppercase text-zinc-500">Total Orders</p>
          <p className="mt-1 text-2xl font-black text-[#070e2b]">{customer.orders.length}</p>
        </div>
        <div className="rounded-xl bg-white p-4 shadow-sm ring-1 ring-zinc-100">
          <p className="text-xs font-bold uppercase text-zinc-500">Total Spent</p>
          <p className="mt-1 text-2xl font-black text-[#070e2b]">
            {totalSpent > 0 ? formatInr(totalSpent) : "—"}
          </p>
          <p className="text-xs text-zinc-400">Across {paidOrders.length} paid order(s)</p>
        </div>
      </div>

      <div className="rounded-xl bg-white p-4 shadow-sm ring-1 ring-zinc-100">
        <h2 className="text-base font-black">Order history</h2>

        <div className="mt-3 overflow-x-auto">
          <table className="w-full min-w-[640px] text-left text-sm">
            <thead>
              <tr className="border-b border-zinc-100 text-xs font-bold uppercase text-zinc-500">
                <th className="py-2 pr-3">Order</th>
                <th className="py-2 pr-3">Items</th>
                <th className="py-2 pr-3">Amount</th>
                <th className="py-2 pr-3">Payment</th>
                <th className="py-2 pr-3">Status</th>
                <th className="py-2 pr-3" />
              </tr>
            </thead>
            <tbody>
              {customer.orders.map((order) => (
                <tr key={order.id} className="border-b border-zinc-50 last:border-0">
                  <td className="py-2.5 pr-3 font-mono text-xs text-zinc-500">
                    {formatOrderNumber(order.createdAt)}
                    <div className="text-[10px] text-zinc-400">
                      {order.createdAt.toLocaleString("en-IN")}
                    </div>
                  </td>
                  <td className="py-2.5 pr-3 text-zinc-500">{order.items.length} item(s)</td>
                  <td className="py-2.5 pr-3 font-bold">{formatInr(order.amount)}</td>
                  <td className="py-2.5 pr-3">
                    <span
                      className={`rounded-full px-2.5 py-1 text-[11px] font-bold ${
                        order.paymentStatus === "PAID"
                          ? "bg-emerald-50 text-emerald-700"
                          : "bg-zinc-100 text-zinc-700"
                      }`}
                    >
                      {order.paymentStatus}
                    </span>
                  </td>
                  <td className="py-2.5 pr-3">
                    <span
                      className={`rounded-full px-2.5 py-1 text-[11px] font-bold ${
                        STATUS_STYLES[order.status] ?? "bg-zinc-100 text-zinc-700"
                      }`}
                    >
                      {order.status.replaceAll("_", " ")}
                    </span>
                  </td>
                  <td className="py-2.5 pr-3">
                    <Link
                      href={`/admin/orders/${order.id}`}
                      className="text-xs font-bold text-[#ff4b1f]"
                    >
                      View
                    </Link>
                  </td>
                </tr>
              ))}

              {customer.orders.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-6 text-center text-sm text-zinc-400">
                    This customer hasn&apos;t placed any orders yet.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
