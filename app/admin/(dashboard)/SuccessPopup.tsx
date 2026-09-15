"use client";

import { useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { AdminPopup } from "./admin-feedback";

/**
 * Shared "it worked" confirmation modal for admin create/edit flows — save
 * actions used to redirect back to the list silently, with no feedback at
 * all. `show` is derived server-side from a `?created=1`/`?updated=1`-style
 * query param the action's own redirect sets (see admin-products.ts /
 * admin-customers.ts), the same pattern RefundReadyPopup already uses on
 * the order detail page, so this stays correct across a hard refresh.
 * Dismissing strips the flag so it doesn't reappear on one.
 */
export function SuccessPopup({ show, message }: { show: boolean; message: string }) {
  const router = useRouter();
  const pathname = usePathname();

  // Re-derive `open` from the `show` prop during render (rather than
  // syncing it via a useEffect) so a fresh redirect reopens this even if
  // the component instance was already mounted from an earlier visit to
  // this same list page.
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

  return <AdminPopup kind="success" title="Success!" message={message} onClose={dismiss} />;
}
