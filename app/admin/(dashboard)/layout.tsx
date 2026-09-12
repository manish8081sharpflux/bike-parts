import Link from "next/link";
import { ArrowUpRight, LogOut, ShieldCheck, Wrench } from "lucide-react";
import { requireAdminPage } from "@/lib/auth/require-admin";
import { logoutAdminAction } from "@/lib/actions/admin-auth";
import { AdminNav } from "./admin-nav";
export default async function AdminDashboardLayout({ children }: { children: React.ReactNode }) {
  const email = await requireAdminPage();
  return <div className="flex h-dvh min-h-0 overflow-hidden bg-[#f6f7f9] text-zinc-900">
    <aside className="hidden w-60 shrink-0 flex-col bg-[#141619] lg:flex">
      <Link href="/admin" className="flex items-center gap-3 px-6 py-8"><span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-[#ff4b1f] text-white"><Wrench size={21} aria-hidden="true" /></span><span className="text-base font-bold leading-tight text-white">Deep Automobiles<span className="mt-1 block text-[10px] font-medium uppercase tracking-[0.18em] text-zinc-500">Admin workspace</span></span></Link>
      <div className="flex-1 overflow-y-auto pt-5"><p className="mb-4 px-8 text-[10px] font-semibold uppercase tracking-[0.2em] text-zinc-500">Manage store</p><AdminNav /></div>
      <div className="mx-4 mb-4 rounded-xl border border-white/10 p-4"><div className="mb-4 flex items-center gap-3"><span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-zinc-800 text-xs font-bold text-orange-300">{email.slice(0, 1).toUpperCase()}</span><div className="min-w-0"><p className="text-xs font-semibold text-white">Administrator</p><p className="mt-1 truncate text-[11px] text-zinc-400" title={email}>{email}</p></div></div><form action={logoutAdminAction}><button type="submit" className="flex w-full items-center gap-2 rounded-lg py-2 text-xs font-medium text-zinc-400 hover:text-white"><LogOut size={15} aria-hidden="true" />Log out</button></form></div>
    </aside>
    <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
      <header className="flex h-16 shrink-0 items-center justify-between gap-3 border-b border-zinc-200/80 bg-white px-4 sm:px-8"><span className="text-sm font-semibold"><span className="lg:hidden">Deep Automobiles</span><span className="hidden items-center gap-2 text-zinc-500 lg:flex"><ShieldCheck size={16} aria-hidden="true" />Store administration</span></span><div className="flex items-center gap-4"><Link href="/" className="flex items-center gap-2 text-xs font-semibold text-zinc-600 hover:text-orange-600">View store<ArrowUpRight size={15} aria-hidden="true" /></Link><form action={logoutAdminAction} className="lg:hidden"><button type="submit" className="text-xs font-medium text-zinc-500">Log out</button></form></div></header>
      <div className="border-b border-zinc-200 bg-white lg:hidden"><AdminNav mobile /></div>
      <main className="min-h-0 flex-1 overscroll-contain overflow-y-auto p-4 sm:p-8"><div className="mx-auto max-w-[1600px]">{children}</div></main>
    </div>
  </div>;
}
