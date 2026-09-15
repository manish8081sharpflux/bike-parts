"use client";
import { AdminActionForm } from "./admin-feedback";

export function DeleteConfirmButton({ itemLabel, title = "Delete this item?", triggerLabel = "Delete", triggerClassName = "inline-flex h-8 items-center justify-center rounded-lg border border-red-200 px-3 text-xs font-bold text-red-600 transition hover:bg-red-50", action }: {
  itemLabel: string; title?: string; triggerLabel?: string; triggerClassName?: string; action: () => Promise<void>;
}) {
  return <AdminActionForm action={action} confirmDelete={`${title} ?${itemLabel}? will be removed. Products linked to reviews are archived to preserve their history.`} successMessage="Item removed successfully.">
    <button type="submit" className={triggerClassName}>{triggerLabel}</button>
  </AdminActionForm>;
}
