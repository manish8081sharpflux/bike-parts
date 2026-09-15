import { AdminActionForm } from "../../admin-feedback";
import Link from "next/link";
import { createCustomerAction } from "@/lib/actions/admin-customers";

export default async function NewCustomerPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;

  return (
    <div className="flex flex-col gap-4">
      <div>
        <Link href="/admin/customers" className="text-xs font-bold text-zinc-500">
          ← Back to customers
        </Link>
        <h1 className="mt-1 text-2xl font-black">Add customer</h1>
        <p className="text-sm text-zinc-500">
          Manually add a customer record (e.g. for a phone/offline order).
        </p>
      </div>

      {error ? (
        <p className="max-w-xl rounded-lg bg-red-50 px-3 py-2 text-sm font-medium text-red-700">
          {error}
        </p>
      ) : null}

      <div className="rounded-xl bg-white p-4 shadow-sm ring-1 ring-zinc-100">
        <AdminActionForm action={createCustomerAction} className="flex max-w-xl flex-col gap-3">
          <label className="flex flex-col gap-1 text-sm font-bold text-zinc-700">
            Name
            <input
              type="text"
              name="name"
              required
              className="h-11 rounded-lg border border-zinc-300 px-3 text-sm outline-none focus:border-zinc-500"
            />
          </label>

          <div className="grid grid-cols-2 gap-3">
            <label className="flex flex-col gap-1 text-sm font-bold text-zinc-700">
              Phone
              <input
                type="tel"
                name="phone"
                placeholder="98765 00001"
                className="h-11 rounded-lg border border-zinc-300 px-3 text-sm outline-none focus:border-zinc-500"
              />
            </label>

            <label className="flex flex-col gap-1 text-sm font-bold text-zinc-700">
              Email
              <input
                type="email"
                name="email"
                placeholder="customer@example.com"
                className="h-11 rounded-lg border border-zinc-300 px-3 text-sm outline-none focus:border-zinc-500"
              />
            </label>
          </div>
          <p className="text-xs text-zinc-400">Provide at least a phone number or an email.</p>

          <button
            type="submit"
            className="mt-2 h-11 rounded-lg bg-zinc-950 text-sm font-bold text-white transition hover:bg-zinc-800"
          >
            Add customer
          </button>
        </AdminActionForm>
      </div>
    </div>
  );
}
