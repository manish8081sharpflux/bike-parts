import Link from "next/link";

/**
 * Page-number pagination shared by the Products, Orders, and Customers admin
 * lists. `buildHref(page)` lets each page keep its own filter/search query
 * params (status, q, …) alongside the page number.
 */
export function AdminPagination({
  currentPage,
  totalPages,
  buildHref,
}: {
  currentPage: number;
  totalPages: number;
  buildHref: (page: number) => string;
}) {
  if (totalPages <= 1) {
    return null;
  }

  // Always show first, last, current ± 1, collapsing the rest into "…".
  const pages = new Set<number>([1, totalPages, currentPage - 1, currentPage, currentPage + 1]);
  const items: Array<number | "ellipsis"> = [];
  let previous = 0;
  for (const page of [...pages].filter((page) => page >= 1 && page <= totalPages).sort((a, b) => a - b)) {
    if (previous && page - previous > 1) {
      items.push("ellipsis");
    }
    items.push(page);
    previous = page;
  }

  return (
    <nav className="flex items-center justify-center gap-1" aria-label="Pagination">
      <PageLink
        href={buildHref(Math.max(1, currentPage - 1))}
        disabled={currentPage === 1}
        label="Previous page"
      >
        ← Prev
      </PageLink>

      {items.map((item, index) =>
        item === "ellipsis" ? (
          <span key={`ellipsis-${index}`} className="px-2 text-xs text-zinc-400">
            …
          </span>
        ) : (
          <Link
            key={item}
            href={buildHref(item)}
            aria-current={item === currentPage ? "page" : undefined}
            className={`grid size-9 place-items-center rounded-lg text-xs font-bold transition ${
              item === currentPage
                ? "bg-zinc-950 text-white"
                : "text-zinc-700 ring-1 ring-zinc-200 hover:bg-zinc-50"
            }`}
          >
            {item}
          </Link>
        )
      )}

      <PageLink
        href={buildHref(Math.min(totalPages, currentPage + 1))}
        disabled={currentPage === totalPages}
        label="Next page"
      >
        Next →
      </PageLink>
    </nav>
  );
}

function PageLink({
  href,
  disabled,
  label,
  children,
}: {
  href: string;
  disabled: boolean;
  label: string;
  children: React.ReactNode;
}) {
  if (disabled) {
    return (
      <span className="cursor-not-allowed rounded-lg px-3 py-1.5 text-xs font-bold text-zinc-300">
        {children}
      </span>
    );
  }

  return (
    <Link
      href={href}
      aria-label={label}
      className="rounded-lg px-3 py-1.5 text-xs font-bold text-zinc-700 ring-1 ring-zinc-200 transition hover:bg-zinc-50"
    >
      {children}
    </Link>
  );
}

/** Parses a `?page=` search param into a valid 1-based page number. */
export function parsePage(raw: string | undefined) {
  const page = Number(raw);
  return Number.isFinite(page) && page >= 1 ? Math.floor(page) : 1;
}
