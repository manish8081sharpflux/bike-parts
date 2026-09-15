import { loginAdminAction } from "@/lib/actions/admin-auth";

export const metadata = {
  title: "Admin Login — Deep Automobiles",
};

export default async function AdminLoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; next?: string }>;
}) {
  const params = await searchParams;

  return (
    <main className="flex min-h-screen items-center justify-center bg-[#fbfbfa] px-4">
      <div className="w-full max-w-sm rounded-xl bg-white p-6 shadow-[0_10px_30px_rgba(15,23,42,0.08)] ring-1 ring-zinc-100">
        <h1 className="text-xl font-black text-[#070e2b]">
          Deep <span className="text-[#025632]">Automobiles</span> Admin
        </h1>
        <p className="mt-1 text-sm text-zinc-500">Sign in to manage orders and products.</p>

        {params.error ? (
          <p className="mt-4 rounded-lg bg-red-50 px-3 py-2 text-sm font-medium text-red-700">
            {params.error}
          </p>
        ) : null}

        <form action={loginAdminAction} className="mt-6 flex flex-col gap-3">
          <input type="hidden" name="next" value={params.next ?? "/admin"} />

          <label className="flex flex-col gap-1 text-sm font-bold text-zinc-700">
            Email
            <input
              type="email"
              name="email"
              required
              autoComplete="username"
              className="h-11 rounded-lg border border-zinc-300 px-3 text-sm outline-none focus:border-zinc-500"
              placeholder="admin@bikeparts.com"
            />
          </label>

          <label className="flex flex-col gap-1 text-sm font-bold text-zinc-700">
            Password
            <input
              type="password"
              name="password"
              required
              autoComplete="current-password"
              className="h-11 rounded-lg border border-zinc-300 px-3 text-sm outline-none focus:border-zinc-500"
              placeholder="••••••••"
            />
          </label>

          <button
            type="submit"
            className="mt-2 h-11 rounded-lg bg-zinc-950 text-sm font-bold text-white transition hover:bg-zinc-800"
          >
            Sign in
          </button>
        </form>
      </div>
    </main>
  );
}
