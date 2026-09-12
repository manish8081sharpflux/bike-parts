import Link from "next/link";
import { prisma } from "@/lib/db";
import { formatInr } from "@/lib/format";
import { deleteCustomerAction } from "@/lib/actions/admin-customers";
import { AdminPagination, parsePage } from "../admin-pagination";
import { AutoSubmitFilterForm } from "../auto-submit-filter-form";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 10;

export default async function AdminCustomersPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; page?: string; error?: string; source?: string }>;
}) {
  const { q, page: pageRaw, error, source } = await searchParams;
  const query = q?.trim();
  const sourceFilter = source === "admin" || source === "self" ? source : undefined;
  const page = parsePage(pageRaw);

  const conditions = [];
  if (query) {
    conditions.push({
      OR: [
        { name: { contains: query, mode: "insensitive" as const } },
        { phone: { contains: query, mode: "insensitive" as const } },
        { email: { contains: query, mode: "insensitive" as const } },
      ],
    });
  }
  if (sourceFilter) {
    conditions.push({ addedByAdmin: sourceFilter === "admin" });
  }
  const where = conditions.length ? { AND: conditions } : undefined;

  const [totalCount, customers] = await Promise.all([
    prisma.user.count({ where }),
    prisma.user.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      include: {
        _count: { select: { orders: true } },
        orders: { select: { amount: true, paymentStatus: true } },
      },
    }),
  ]);
  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));
  const buildHref = (targetPage: number) => {
    const params = new URLSearchParams();
    if (query) params.set("q", query);
    if (sourceFilter) params.set("source", sourceFilter);
    if (targetPage > 1) params.set("page", String(targetPage));
    const qs = params.toString();
    return qs ? `/admin/customers?${qs}` : "/admin/customers";
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-black">Customers</h1>
          <p className="text-sm text-zinc-500">
            {totalCount} customer(s) — page {page} of {totalPages}
          </p>
        </div>
        <Link
          href="/admin/customers/new"
          className="h-10 shrink-0 rounded-lg bg-[#ff4b1f] px-4 text-sm font-bold leading-10 text-white hover:bg-[#e8330e]"
        >
          + Add customer
        </Link>
      </div>

      {error ? (
        <p className="rounded-lg bg-red-50 px-3 py-2 text-sm font-medium text-red-700">{error}</p>
      ) : null}

      {/*
        Keyed on the resolved filter state so the form remounts whenever it
        changes (including a "Clear filters" reset) — see the matching note
        on the Products page filter form for why this matters.
      */}
      <AutoSubmitFilterForm
        key={[query, sourceFilter].join("|")}
        className="flex flex-wrap items-center gap-2"
        action="/admin/customers"
      >
        <input
          type="text"
          name="q"
          defaultValue={query}
          placeholder="Search by name, phone, or email…"
          className="h-10 w-64 shrink-0 rounded-lg border border-zinc-300 px-3 text-sm outline-none focus:border-zinc-500"
        />

        <select
          name="source"
          defaultValue={sourceFilter ?? ""}
          className="h-10 rounded-lg border border-zinc-300 bg-white px-3 text-sm text-zinc-700 outline-none focus:border-zinc-500"
        >
          <option value="">All sources</option>
          <option value="admin">Added by Admin</option>
          <option value="self">Self-Registered</option>
        </select>

        {query || sourceFilter ? (
          <Link
            href="/admin/customers"
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
              <th className="px-4 py-3">Customer</th>
              <th className="px-4 py-3">Contact</th>
              <th className="px-4 py-3">Source</th>
              <th className="px-4 py-3">Orders</th>
              <th className="px-4 py-3">Total Spent</th>
              <th className="px-4 py-3">Joined</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody>
            {customers.map((customer) => {
              const totalSpent = customer.orders
                .filter((order) => order.paymentStatus === "PAID")
                .reduce((sum, order) => sum + Number(order.amount), 0);

              return (
                <tr key={customer.id} className="border-b border-zinc-50 last:border-0">
                  <td className="px-4 py-3">
                    <span className="font-bold">{customer.name ?? "—"}</span>
                  </td>
                  <td className="px-4 py-3 text-zinc-600">
                    <div>{customer.phone ?? "—"}</div>
                    {customer.email ? (
                      <div className="text-xs text-zinc-400">{customer.email}</div>
                    ) : null}
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`rounded-full px-2.5 py-1 text-[11px] font-bold ${
                        customer.addedByAdmin
                          ? "bg-violet-50 text-violet-700"
                          : "bg-emerald-50 text-emerald-700"
                      }`}
                    >
                      {customer.addedByAdmin ? "Added by Admin" : "Self-Registered"}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-zinc-600">{customer._count.orders}</td>
                  <td className="px-4 py-3 font-bold">
                    {totalSpent > 0 ? formatInr(totalSpent) : "—"}
                  </td>
                  <td className="px-4 py-3 text-zinc-500">
                    {customer.createdAt.toLocaleDateString("en-IN")}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      <Link
                        href={`/admin/customers/${customer.id}`}
                        className="text-xs font-bold text-[#ff4b1f]"
                      >
                        View
                      </Link>
                      <form action={deleteCustomerAction.bind(null, customer.id)}>
                        <button
                          type="submit"
                          className="text-xs font-bold text-zinc-400 hover:text-red-600"
                        >
                          Delete
                        </button>
                      </form>
                    </div>
                  </td>
                </tr>
              );
            })}

            {customers.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-sm text-zinc-400">
                  No customers yet — they&apos;ll show up here once someone checks out or logs
                  in, or you add one manually.
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
