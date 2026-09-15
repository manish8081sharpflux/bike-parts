import Link from "next/link";
import { ArrowRight, ArrowUpRight, ShoppingBag, Clock3, IndianRupee, Package, RotateCcw, Undo2, Plus, CircleAlert, Truck, CreditCard, type LucideIcon } from "lucide-react";
import { prisma } from "@/lib/db";
import { isRazorpayConfigured } from "@/lib/razorpay";
import { isShippingConfigured, isShiprocketConfigured, isBorzoConfigured } from "@/lib/shipping/service";
import { formatInr } from "@/lib/format";

export const dynamic = "force-dynamic";
const STATUS_STYLES: Record<string, string> = {
  PENDING: "bg-zinc-100 text-zinc-600", PAID: "bg-blue-50 text-blue-700",
  PACKED: "bg-amber-50 text-amber-700", SHIPPED: "bg-violet-50 text-violet-700",
  OUT_FOR_DELIVERY: "bg-violet-50 text-violet-700", DELIVERED: "bg-emerald-50 text-emerald-700",
  CANCELLED: "bg-red-50 text-red-600",
};
export default async function AdminDashboardPage() {
  const [orderCount, pendingCount, paidRevenue, recentOrders, lowStockCount, pendingRefundCount, pendingReturnCount] = await Promise.all([
    prisma.order.count(),
    prisma.order.count({ where: { status: { in: ["PENDING", "PAID", "PACKED"] } } }),
    prisma.order.aggregate({ where: { paymentStatus: "PAID" }, _sum: { amount: true } }),
    prisma.order.findMany({ orderBy: { createdAt: "desc" }, take: 8, include: { items: true } }),
    prisma.bikePartListing.count({ where: { stock: { lte: 5 }, status: "ACTIVE" } }),
    prisma.order.count({ where: { refundStatus: "REQUESTED" } }),
    prisma.order.count({ where: { returnStatus: "REQUESTED" } }),
  ]);
  const razorpayReady = isRazorpayConfigured();
  const shippingReady = isShippingConfigured();
  const shiprocketReady = isShiprocketConfigured();
  const borzoReady = isBorzoConfigured();
  return <div className="flex flex-col gap-6">
    <div className="flex flex-wrap items-center justify-between gap-4">
      <div><p className="mb-2 text-[10px] font-semibold uppercase tracking-[0.2em] text-zinc-500">Your store at a glance</p><h1 className="text-3xl font-bold tracking-tight">Dashboard</h1><p className="mt-2 text-sm text-zinc-500">Keep track of orders, revenue, and what needs your attention.</p></div>
      <Link href="/admin/products/new" className="inline-flex items-center gap-2 rounded-xl bg-[#ff4b1f] px-4 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-[#e83b11]"><Plus size={17} aria-hidden="true" />Add product</Link>
    </div>
    <div className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,220px),1fr))] gap-3">
      <StatCard label="Total orders" value={orderCount.toLocaleString("en-IN")} detail="All-time orders" icon={ShoppingBag} href="/admin/orders" />
      <StatCard label="Active / pending" value={pendingCount.toString()} detail="Pending, paid, or packed" icon={Clock3} href="/admin/orders" />
      <StatCard label="Paid revenue" value={formatInr(paidRevenue._sum.amount ?? 0)} detail="All-time paid orders" icon={IndianRupee} href="/admin/orders?payment=PAID" featured />
      <StatCard label="Low stock" value={lowStockCount.toString()} detail="Active products with 5 or fewer" icon={Package} href="/admin/products" warn={lowStockCount > 0} />
      <StatCard label="Pending refunds" value={pendingRefundCount.toString()} detail={pendingRefundCount ? "Awaiting your review" : "No refunds to review"} icon={RotateCcw} href="/admin/orders?refund=REQUESTED" warn={pendingRefundCount > 0} />
      <StatCard label="Pending returns" value={pendingReturnCount.toString()} detail={pendingReturnCount ? "Awaiting your review" : "No returns to review"} icon={Undo2} href="/admin/returns?return=REQUESTED" warn={pendingReturnCount > 0} />
    </div>
    {!razorpayReady || !shippingReady ? <div className="flex items-start gap-3 rounded-xl border border-amber-200/80 bg-amber-50/70 px-4 py-3.5"><CircleAlert size={18} className="mt-0.5 shrink-0 text-amber-600" aria-hidden="true" /><div className="text-xs leading-relaxed text-amber-900"><p className="font-semibold">Store setup needs attention</p><p className="mt-0.5 text-amber-800">{!shippingReady ? "Shipment creation is unavailable until Shiprocket or Borzo is configured. " : ""}{!razorpayReady ? "Online payments are unavailable until Razorpay is configured." : ""}</p></div></div> : null}
    <section className="relative overflow-hidden rounded-2xl border border-zinc-200/80 bg-white shadow-sm">
      <div className="flex items-center justify-between gap-4 px-5 py-5 sm:px-6"><div className="flex items-center gap-3"><span className="hidden size-10 items-center justify-center rounded-xl bg-zinc-100 text-zinc-600 sm:flex"><ShoppingBag size={18} aria-hidden="true" /></span><div><h2 className="text-base font-semibold">Recent orders</h2><p className="mt-1 text-xs text-zinc-500">The latest activity in your store</p></div></div><Link href="/admin/orders" className="inline-flex shrink-0 items-center gap-2 rounded-lg border border-zinc-200 px-3 py-2 text-xs font-semibold text-zinc-600 hover:bg-zinc-50">View all orders<ArrowRight size={14} aria-hidden="true" /></Link></div>
      <div className="overflow-x-auto"><table className="w-full min-w-[720px] text-left text-sm"><caption className="sr-only">Eight most recent orders</caption><thead className="border-y border-zinc-100 bg-zinc-50/80 text-[10px] uppercase tracking-wider text-zinc-500"><tr>{["Order", "Customer", "Items", "Amount", "Status", ""].map((label, i) => <th key={i} scope="col" className="px-5 py-3 font-semibold">{label || <span className="sr-only">Details</span>}</th>)}</tr></thead><tbody>
        {recentOrders.map(order => <tr key={order.id} className="border-b border-zinc-100 transition-colors last:border-0 hover:bg-zinc-50/70"><td className="px-5 py-4"><Link href={`/admin/orders/${order.id}`} className="font-mono text-xs font-medium text-zinc-700 hover:text-orange-600">#{order.id.slice(-8)}</Link><p className="mt-1 text-[11px] text-zinc-400">{new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Kolkata" }).format(order.createdAt)}</p></td><td className="px-5 py-4"><div className="flex items-center gap-3"><span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-orange-50 text-[10px] font-semibold text-orange-700" aria-hidden="true">{order.customerName.split(" ").filter(Boolean).slice(0, 2).map(n => n[0]).join("")}</span><span className="font-medium">{order.customerName}</span></div></td><td className="px-5 py-4 text-xs text-zinc-500">{order.items.length} {order.items.length === 1 ? "item" : "items"}</td><td className="whitespace-nowrap px-5 py-4 font-semibold tabular-nums">{formatInr(order.amount)}</td><td className="px-5 py-4"><span className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-1 text-[10px] font-medium ${STATUS_STYLES[order.status] ?? "bg-zinc-100 text-zinc-700"}`}><span className="size-1.5 rounded-full bg-current" />{order.status.toLowerCase().replaceAll("_", " ").replace(/^./, c => c.toUpperCase())}</span></td><td className="px-5 py-4"><Link href={`/admin/orders/${order.id}`} aria-label={`View order ${order.id.slice(-8)}`} className="inline-flex size-8 items-center justify-center rounded-lg border border-zinc-200 text-zinc-500 hover:border-orange-200 hover:bg-orange-50 hover:text-orange-600"><ArrowUpRight size={16} aria-hidden="true" /></Link></td></tr>)}
        {!recentOrders.length ? <tr><td colSpan={6} className="px-5 py-16 text-center"><ShoppingBag size={28} className="mx-auto mb-3 text-zinc-300" aria-hidden="true" /><p className="font-medium">No orders yet</p><p className="mt-1 text-xs text-zinc-500">New orders will appear here when customers check out.</p></td></tr> : null}
      </tbody></table></div>
      <div className="border-t border-zinc-100 px-5 py-3 text-[11px] text-zinc-500">Showing {recentOrders.length} of {orderCount.toLocaleString("en-IN")} orders</div>
    </section>
    <div className="flex flex-wrap items-center gap-x-6 gap-y-3 px-1 text-[11px] text-zinc-500"><span className="font-medium text-zinc-600">Connected services</span><span className="inline-flex items-center gap-2"><CreditCard size={14} aria-hidden="true" />Payments<span className={`size-1.5 rounded-full ${razorpayReady ? "bg-emerald-500" : "bg-amber-500"}`} />{razorpayReady ? "Configured" : "Setup required"}</span><span className="inline-flex items-center gap-2"><Truck size={14} aria-hidden="true" />Shiprocket<span className={`size-1.5 rounded-full ${shiprocketReady ? "bg-emerald-500" : "bg-amber-500"}`} />{shiprocketReady ? "Configured" : "Setup required"}</span><span className="inline-flex items-center gap-2"><Truck size={14} aria-hidden="true" />Borzo (Pune local)<span className={`size-1.5 rounded-full ${borzoReady ? "bg-emerald-500" : "bg-amber-500"}`} />{borzoReady ? "Configured" : "Setup required"}</span></div>
  </div>;
}
function StatCard({ label, value, detail, icon: Icon, href, warn, featured }: { label: string; value: string; detail: string; icon: LucideIcon; href: string; warn?: boolean; featured?: boolean }) {
  return <Link href={href} className={`group min-w-0 rounded-xl border p-4 shadow-sm transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange-500 ${featured ? "border-[#24272d] bg-[#24272d] text-white hover:bg-[#30343b]" : "border-zinc-200/80 bg-white hover:border-orange-200"}`}><div className="flex items-center justify-between gap-2"><span className={`text-xs font-medium ${featured ? "text-zinc-300" : "text-zinc-500"}`}>{label}</span><Icon size={17} aria-hidden="true" className={`shrink-0 ${featured ? "text-orange-400" : warn ? "text-amber-500" : "text-zinc-400"}`} /></div><p className={`mt-3 break-words text-2xl font-semibold leading-tight tracking-tight tabular-nums ${warn ? "text-amber-600" : ""}`}>{value}</p><p className={`mt-1 text-xs leading-relaxed ${featured ? "text-zinc-400" : "text-zinc-500"}`}>{detail}</p></Link>;
}

