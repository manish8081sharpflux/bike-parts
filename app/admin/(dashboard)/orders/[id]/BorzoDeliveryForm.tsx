"use client";

import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";

type QuoteResponse =
  | { eligible: false; reason: string }
  | { eligible: true; deliveryFeeAmount: number | null; estimatedDeliveryAt: string | null }
  | { error: string };

/**
 * "Borzo Local Delivery" card — fetches a real price/ETA quote from
 * `quoteUrl` (see app/api/admin/orders/[id]/borzo-quote/route.ts) and shows
 * it before letting the admin book (Part 8/9 of the Borzo integration
 * task). Only ever shows a fee/ETA the quote endpoint actually returned —
 * never a fabricated price or delivery time. `action` (bound to
 * createBorzoDeliveryAction) is a plain no-argument server action — Borzo's
 * booking has no courier choice or dimension confirmation step the way the
 * Shiprocket dispatch form does (see ShipmentDispatchForm.tsx), since
 * Borzo's request shape doesn't take either.
 */
export function BorzoDeliveryForm({ action, quoteUrl }: { action: () => void; quoteUrl: string }) {
  const [quote, setQuote] = useState<QuoteResponse | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    fetch(quoteUrl)
      .then(async (response) => {
        const data = (await response.json().catch(() => ({ error: "Could not get a Borzo delivery quote." }))) as QuoteResponse;
        if (!cancelled) setQuote(response.ok ? data : { error: "error" in data ? data.error : "Could not get a Borzo delivery quote." });
      })
      .catch(() => {
        if (!cancelled) setQuote({ error: "Could not get a Borzo delivery quote. Check your connection and try again." });
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [quoteUrl]);

  if (loading) {
    return (
      <p className="flex items-center gap-2 text-xs text-zinc-500">
        <Loader2 className="size-3.5 animate-spin" /> Checking Borzo local delivery…
      </p>
    );
  }

  if (!quote || "error" in quote) {
    return <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs font-medium text-amber-800">{quote?.error ?? "Could not get a Borzo delivery quote."}</p>;
  }

  if (!quote.eligible) {
    return <p className="rounded-lg bg-zinc-50 px-3 py-2 text-xs text-zinc-500">{quote.reason}</p>;
  }

  return (
    <form action={action} className="flex flex-col gap-2">
      <div className="rounded-lg border border-zinc-200 p-3 text-xs">
        <p className="text-[10px] font-black uppercase tracking-wide text-zinc-400">Borzo Delivery</p>
        <p className="mt-1">
          Estimated Delivery Fee:{" "}
          <span className="font-bold text-zinc-800">{quote.deliveryFeeAmount != null ? `₹${quote.deliveryFeeAmount}` : "not returned by Borzo"}</span>
        </p>
        <p className="mt-1">
          Estimated Pickup/Delivery Time:{" "}
          <span className="font-bold text-zinc-800">{quote.estimatedDeliveryAt ?? "not returned by Borzo"}</span>
        </p>
      </div>
      <button
        type="submit"
        className="flex h-10 w-full items-center justify-center gap-1.5 rounded-lg bg-[#ff4b1f] text-sm font-bold text-white transition hover:bg-[#e8330e]"
      >
        Create Borzo Delivery
      </button>
    </form>
  );
}
