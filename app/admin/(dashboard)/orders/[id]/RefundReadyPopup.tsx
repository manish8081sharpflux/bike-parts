"use client";

import { useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Banknote } from "lucide-react";

/**
 * Auto-shown right after the admin cancels a paid order — see the
 * `refundReady=1` redirect in updateOrderStatusAction (lib/actions/admin-orders.ts),
 * which also auto-creates the refund request this popup is pointing at.
 * `show` is derived server-side from the URL so this stays correct across a
 * hard refresh; dismissing strips the flag so it doesn't reappear on one.
 */
export function RefundReadyPopup({
  show,
  amountLabel,
}: {
  show: boolean;
  amountLabel: string;
}) {
  const router = useRouter();
  const pathname = usePathname();

  // Re-derive `open` from the `show` prop during render (rather than syncing
  // it via a useEffect) so a fresh `refundReady=1` redirect reopens this even
  // if the component instance was already mounted from an earlier visit to
  // this same order page — see https://react.dev/learn/you-might-not-need-an-effect#adjusting-some-state-when-a-prop-changes.
  const [open, setOpen] = useState(show);
  const [prevShow, setPrevShow] = useState(show);
  if (show !== prevShow) {
    setPrevShow(show);
    setOpen(show);
  }

  if (!open) {
    return null;
  }

  const dismiss = () => {
    setOpen(false);
    router.replace(pathname);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
      <div className="w-full max-w-sm rounded-xl bg-white p-5 shadow-xl">
        <span className="grid size-10 place-items-center rounded-full bg-amber-50 text-amber-600">
          <Banknote className="size-5" />
        </span>
        <h3 className="mt-3 text-base font-black text-[#070e2b]">Refund needed</h3>
        <p className="mt-2 text-sm text-zinc-600">
          This order was paid and has just been cancelled. A refund request of{" "}
          <span className="font-bold text-zinc-900">{amountLabel}</span> was created automatically —
          review it in the Refund card below.
        </p>
        <button
          type="button"
          onClick={dismiss}
          className="mt-4 h-10 w-full rounded-lg bg-zinc-950 text-sm font-bold text-white"
        >
          Got it
        </button>
      </div>
    </div>
  );
}
