"use client";

import { LogOut, MapPin, Package, User } from "lucide-react";
import { footerSocialLinks } from "./constants";

export function SocialIcon({ type }: { type: (typeof footerSocialLinks)[number]["icon"] }) {
  const common = "size-4";
  if (type === "facebook") {
    return (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" className={common}>
        <path d="M15 3h-2a5 5 0 0 0-5 5v3H6v4h2v6h4v-6h3l1-4h-4V8a1 1 0 0 1 1-1h3Z" strokeLinejoin="round" />
      </svg>
    );
  }
  if (type === "instagram") {
    return (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" className={common}>
        <rect x="3" y="3" width="18" height="18" rx="5" />
        <circle cx="12" cy="12" r="4.2" />
        <circle cx="17.4" cy="6.6" r="1" fill="currentColor" stroke="none" />
      </svg>
    );
  }
  if (type === "linkedin") {
    return (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" className={common}>
        <rect x="3" y="3" width="18" height="18" rx="3" />
        <circle cx="7.5" cy="7.5" r="0.6" fill="currentColor" stroke="none" />
        <path d="M7.5 10.5v7M11.5 17.5v-4a2.2 2.2 0 0 1 4.4 0v4M11.5 13v4.5" strokeLinecap="round" />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" className={common}>
      <path d="m4 4 16 16M20 4 4 20" strokeLinecap="round" />
    </svg>
  );
}


export function AccountMenu({
  isOpen,
  authPhone,
  onClose,
  onOpenAddresses,
  onOpenOrders,
  onLogout,
}: {
  isOpen: boolean;
  authPhone: string | null;
  onClose: () => void;
  onOpenAddresses: () => void;
  onOpenOrders: () => void;
  onLogout: () => void;
}) {
  if (!isOpen) {
    return null;
  }

  return (
    <>
      <button
        type="button"
        aria-label="Close menu"
        onClick={onClose}
        className="fixed inset-0 z-40 cursor-default"
      />

      <div className="absolute right-0 top-full z-50 mt-2 w-72 overflow-hidden rounded-xl bg-white shadow-2xl shadow-zinc-950/20 ring-1 ring-zinc-200">
        <div className="flex items-center gap-3 border-b border-zinc-100 px-4 py-4">
          <span className="grid size-11 shrink-0 place-items-center rounded-full bg-[#fff0eb] text-[#ff4b1f]">
            <User className="size-5" />
          </span>
          <span className="min-w-0">
            <span className="block text-sm font-black text-[#070e2b]">
              My Account
            </span>
            <span className="block truncate text-xs text-zinc-500">
              {authPhone ? `+91 ${authPhone}` : "Welcome back"}
            </span>
          </span>
        </div>

        <div className="p-1.5">
          <button
            type="button"
            onClick={onOpenAddresses}
            className="flex h-11 w-full items-center gap-3 rounded-lg px-3 text-left text-sm font-bold text-[#070e2b] transition hover:bg-zinc-50"
          >
            <MapPin className="size-4.5 text-zinc-500" />
            Saved Addresses
          </button>
          <button
            type="button"
            onClick={onOpenOrders}
            className="flex h-11 w-full items-center gap-3 rounded-lg px-3 text-left text-sm font-bold text-[#070e2b] transition hover:bg-zinc-50"
          >
            <Package className="size-4.5 text-zinc-500" />
            My Orders
          </button>
          <div className="my-1 h-px bg-zinc-100" />
          <button
            type="button"
            onClick={onLogout}
            className="flex h-11 w-full items-center gap-3 rounded-lg px-3 text-left text-sm font-bold text-[#ff4b1f] transition hover:bg-[#fff0eb]"
          >
            <LogOut className="size-4.5" />
            Logout
          </button>
        </div>
      </div>
    </>
  );
}

