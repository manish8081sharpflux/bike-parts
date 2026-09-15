"use client";

import { createContext, Suspense, useContext, useEffect, useId, useRef, useState, type ReactNode } from "react";
import { useFormStatus } from "react-dom";
import { useSearchParams, unstable_rethrow } from "next/navigation";
import { CheckCircle2, CircleAlert, Loader2, Trash2 } from "lucide-react";

type Notice = { kind: "success" | "error"; message: string };
const FeedbackContext = createContext<(notice: Notice) => void>(() => {});

export function AdminPopup({ kind, title, message, onClose, onConfirm }: {
  kind: "success" | "error" | "confirm"; title: string; message: string; onClose: () => void; onConfirm?: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const id = useId();
  useEffect(() => { const dialog = ref.current; dialog?.showModal(); return () => dialog?.close(); }, []);
  const Icon = kind === "success" ? CheckCircle2 : kind === "confirm" ? Trash2 : CircleAlert;
  return <dialog ref={ref} onCancel={onClose} aria-labelledby={`${id}-title`} aria-describedby={`${id}-message`} className="fixed inset-0 m-auto w-[calc(100%-2rem)] max-w-sm rounded-2xl border-0 bg-white p-6 text-center text-zinc-900 shadow-2xl backdrop:bg-black/40 backdrop:backdrop-blur-sm">
    <span className={`mx-auto mb-4 flex size-16 items-center justify-center rounded-full ${kind === "success" ? "bg-emerald-50 text-emerald-600" : "bg-red-50 text-red-600"}`}><Icon size={34} aria-hidden="true" /></span>
    <h2 id={`${id}-title`} className="text-xl font-bold">{title}</h2>
    <p id={`${id}-message`} className="mt-2 break-words text-sm leading-6 text-zinc-500">{message}</p>
    <div className="mt-6 flex gap-3">
      <button autoFocus type="button" onClick={onClose} className={`flex-1 rounded-xl px-4 py-3 text-sm font-semibold ${onConfirm ? "border border-zinc-200 text-zinc-700" : "bg-[#025632] text-white"}`}>{onConfirm ? "Cancel" : "OK"}</button>
      {onConfirm ? <button type="button" onClick={onConfirm} className="flex-1 rounded-xl bg-red-600 px-4 py-3 text-sm font-semibold text-white hover:bg-red-700">Yes, delete</button> : null}
    </div>
  </dialog>;
}

const messages: Record<string, string> = {
  "product-created": "Product added successfully.", "product-saved": "Product changes saved successfully.",
  "product-deleted": "Product removed successfully.", "customer-created": "Customer added successfully.", "customer-deleted": "Customer deleted successfully.",
};

function UrlFeedback() {
  const params = useSearchParams();
  const error = params.get("error");
  const message = error || messages[params.get("notice") ?? ""] || (params.get("saved") === "1" ? "Settings saved successfully." : null);
  function dismiss() {
    const url = new URL(window.location.href);
    for (const key of ["notice", "error", "saved"]) url.searchParams.delete(key);
    window.history.replaceState(null, "", `${url.pathname}${url.search}${url.hash}`);
  }
  return message ? <AdminPopup key={params.toString()} kind={error ? "error" : "success"} title={error ? "Action unsuccessful" : "Success!"} message={message} onClose={dismiss} /> : null;
}

export function AdminFeedbackProvider({ children }: { children: ReactNode }) {
  const [notice, setNotice] = useState<Notice | null>(null);
  return <FeedbackContext.Provider value={setNotice}>
    {children}
    <Suspense><UrlFeedback /></Suspense>
    {notice ? <AdminPopup {...notice} title={notice.kind === "success" ? "Success!" : "Action unsuccessful"} onClose={() => setNotice(null)} /> : null}
  </FeedbackContext.Provider>;
}

function PendingFields({ children }: { children: ReactNode }) {
  const { pending } = useFormStatus();
  return <><fieldset disabled={pending} className="contents">{children}</fieldset>{pending ? <span role="status" className="inline-flex items-center gap-1 text-xs text-zinc-500"><Loader2 size={14} className="animate-spin" aria-hidden="true" />Please wait…</span> : null}</>;
}

/** Preserve Server Action redirects and native form validation, with explicit delete confirmation. */
export function AdminActionForm({ action, children, className, confirmDelete, successMessage = "Changes saved successfully." }: {
  action: (data: FormData) => void | Promise<unknown>; children: ReactNode; className?: string; confirmDelete?: string; successMessage?: string;
}) {
  const notify = useContext(FeedbackContext);
  const form = useRef<HTMLFormElement>(null);
  const approved = useRef(false);
  const [confirming, setConfirming] = useState(false);
  return <>
    <form ref={form} className={className} onSubmit={(event) => {
      if (confirmDelete && !approved.current) { event.preventDefault(); setConfirming(true); }
      else approved.current = false;
    }} action={async (data) => {
      try { await action(data); notify({ kind: "success", message: successMessage }); }
      catch (error) {
        unstable_rethrow(error);
        notify({ kind: "error", message: "The action could not be completed. Please try again." });
      }
    }}><PendingFields>{children}</PendingFields></form>
    {confirming ? <AdminPopup kind="confirm" title="Confirm deletion" message={confirmDelete!} onClose={() => setConfirming(false)} onConfirm={() => { setConfirming(false); approved.current = true; form.current?.requestSubmit(); }} /> : null}
  </>;
}
