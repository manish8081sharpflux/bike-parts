"use client";

import { useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";

const EVENTS_PAGE_SIZE = 8;

type ActivityEvent = {
  id: string;
  type: string;
  message: string;
  createdAt: Date;
};

/**
 * Orders that have bounced through a lot of status changes (see the repeated
 * PACKED/CANCELLED entries this was built for) can accumulate dozens of
 * events — paginate instead of dumping the whole history in one long list.
 * Newest-first order (as `events` already arrives, see the query in page.tsx)
 * is preserved; only the current page's slice is rendered.
 */
export function ActivityLog({ events }: { events: ActivityEvent[] }) {
  const [currentPage, setCurrentPage] = useState(1);
  const totalPages = Math.max(1, Math.ceil(events.length / EVENTS_PAGE_SIZE));
  const pagedEvents = events.slice(
    (currentPage - 1) * EVENTS_PAGE_SIZE,
    currentPage * EVENTS_PAGE_SIZE
  );

  return (
    <div className="mt-3 flex flex-col gap-2">
      {pagedEvents.map((event) => (
        <div key={event.id} className="text-sm">
          <span className="font-bold">{event.type.replaceAll("_", " ")}</span>
          <span className="text-zinc-500"> — {event.message}</span>
          <div className="text-[11px] text-zinc-400">{event.createdAt.toLocaleString("en-IN")}</div>
        </div>
      ))}
      {events.length === 0 ? <p className="text-sm text-zinc-400">No activity yet.</p> : null}

      {totalPages > 1 ? (
        <div className="mt-2 flex items-center justify-center gap-2 border-t border-zinc-100 pt-3">
          <button
            type="button"
            onClick={() => setCurrentPage((page) => Math.max(1, page - 1))}
            disabled={currentPage === 1}
            aria-label="Previous page"
            className="grid size-8 place-items-center rounded-full border border-zinc-200 text-zinc-600 transition hover:border-zinc-300 disabled:cursor-not-allowed disabled:opacity-40"
          >
            <ChevronLeft className="size-4" />
          </button>

          <span className="text-xs font-bold text-zinc-500">
            Page {currentPage} of {totalPages}
          </span>

          <button
            type="button"
            onClick={() => setCurrentPage((page) => Math.min(totalPages, page + 1))}
            disabled={currentPage === totalPages}
            aria-label="Next page"
            className="grid size-8 place-items-center rounded-full border border-zinc-200 text-zinc-600 transition hover:border-zinc-300 disabled:cursor-not-allowed disabled:opacity-40"
          >
            <ChevronRight className="size-4" />
          </button>
        </div>
      ) : null}
    </div>
  );
}
