import { AdminActionForm } from "../admin-feedback";
import { requireAdminPage } from "@/lib/auth/require-admin";
import { getStoreSettings, updateStoreSettingsAction } from "@/lib/actions/admin-settings";

export const dynamic = "force-dynamic";

export default async function AdminSettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ saved?: string; error?: string }>;
}) {
  const [email, settings, { saved, error }] = await Promise.all([
    requireAdminPage(),
    getStoreSettings(),
    searchParams,
  ]);

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-2xl font-black">Settings</h1>
        <p className="text-sm text-zinc-500">Store details and admin account info.</p>
      </div>

      {saved ? (
        <p className="rounded-lg bg-emerald-50 px-3 py-2 text-sm font-medium text-emerald-700">
          Settings saved.
        </p>
      ) : null}
      {error ? (
        <p className="rounded-lg bg-red-50 px-3 py-2 text-sm font-medium text-red-700">{error}</p>
      ) : null}

      <div className="rounded-xl bg-white p-4 shadow-sm ring-1 ring-zinc-100">
        <h2 className="text-sm font-black text-zinc-900">Store info</h2>
        <p className="mt-1 text-xs text-zinc-500">
          Shown to customers on invoices, order updates, and support contact.
        </p>

        <AdminActionForm
          action={updateStoreSettingsAction}
          className="mt-4 flex max-w-xl flex-col gap-3"
        >
          <label className="flex flex-col gap-1 text-sm font-bold text-zinc-700">
            Store name
            <input
              type="text"
              name="storeName"
              required
              defaultValue={settings.storeName}
              className="h-11 rounded-lg border border-zinc-300 px-3 text-sm outline-none focus:border-zinc-500"
            />
          </label>

          <div className="grid grid-cols-2 gap-3">
            <label className="flex flex-col gap-1 text-sm font-bold text-zinc-700">
              Support email
              <input
                type="email"
                name="supportEmail"
                placeholder="support@example.com"
                defaultValue={settings.supportEmail ?? ""}
                className="h-11 rounded-lg border border-zinc-300 px-3 text-sm outline-none focus:border-zinc-500"
              />
            </label>

            <label className="flex flex-col gap-1 text-sm font-bold text-zinc-700">
              Support phone
              <input
                type="tel"
                name="supportPhone"
                placeholder="98765 00000"
                defaultValue={settings.supportPhone ?? ""}
                className="h-11 rounded-lg border border-zinc-300 px-3 text-sm outline-none focus:border-zinc-500"
              />
            </label>
          </div>

          <label className="flex flex-col gap-1 text-sm font-bold text-zinc-700">
            Address
            <input
              type="text"
              name="addressLine"
              placeholder="Shop no., street, city, state, PIN"
              defaultValue={settings.addressLine ?? ""}
              className="h-11 rounded-lg border border-zinc-300 px-3 text-sm outline-none focus:border-zinc-500"
            />
          </label>

          <label className="flex flex-col gap-1 text-sm font-bold text-zinc-700">
            GST number
            <input
              type="text"
              name="gstNumber"
              placeholder="22AAAAA0000A1Z5"
              defaultValue={settings.gstNumber ?? ""}
              className="h-11 rounded-lg border border-zinc-300 px-3 text-sm outline-none focus:border-zinc-500"
            />
          </label>

          <button
            type="submit"
            className="mt-2 h-11 rounded-lg bg-zinc-950 text-sm font-bold text-white transition hover:bg-zinc-800"
          >
            Save settings
          </button>
        </AdminActionForm>
      </div>

      <div className="rounded-xl bg-white p-4 shadow-sm ring-1 ring-zinc-100">
        <h2 className="text-sm font-black text-zinc-900">Admin account</h2>
        <p className="mt-1 text-xs text-zinc-500">
          Login email and password are configured via environment variables
          (<code className="rounded bg-zinc-100 px-1 py-0.5">ADMIN_EMAIL</code> /{" "}
          <code className="rounded bg-zinc-100 px-1 py-0.5">ADMIN_PASSWORD</code>), not from this
          page — change them on the server and restart to update credentials.
        </p>
        <div className="mt-3 max-w-xl rounded-lg bg-zinc-50 px-3 py-2 text-sm">
          <span className="font-bold text-zinc-700">Logged in as:</span>{" "}
          <span className="text-zinc-600">{email}</span>
        </div>
      </div>
    </div>
  );
}
