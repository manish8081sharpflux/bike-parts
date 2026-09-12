"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { LayoutDashboard, ShoppingBag, Package, Users, Settings } from "lucide-react";
const items = [
  { href: "/admin", label: "Dashboard", icon: LayoutDashboard },
  { href: "/admin/orders", label: "Orders", icon: ShoppingBag },
  { href: "/admin/products", label: "Products", icon: Package },
  { href: "/admin/customers", label: "Customers", icon: Users },
  { href: "/admin/settings", label: "Settings", icon: Settings },
];
export function AdminNav({ mobile = false }: { mobile?: boolean }) {
  const pathname = usePathname();
  return <nav aria-label={mobile ? "Mobile admin navigation" : "Admin navigation"} className={mobile ? "flex gap-1 overflow-x-auto p-3" : "flex flex-col gap-2 px-4"}>
    {items.map(({ href, label, icon: Icon }) => {
      const active = href === "/admin" ? pathname === href : pathname.startsWith(href);
      return <Link key={href} href={href} aria-current={active ? "page" : undefined} className={`flex shrink-0 items-center gap-3 rounded-xl px-4 py-3 text-sm font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange-500 ${active ? "bg-[#ff4b1f] text-white shadow-sm" : mobile ? "text-zinc-600 hover:bg-zinc-100" : "text-zinc-400 hover:bg-white/5 hover:text-white"}`}><Icon size={18} aria-hidden="true" />{label}</Link>;
    })}
  </nav>;
}
