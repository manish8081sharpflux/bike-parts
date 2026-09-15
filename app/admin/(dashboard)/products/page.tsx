import Link from "next/link";
import Image from "next/image";
import { prisma } from "@/lib/db";
import { deleteProductAction } from "@/lib/actions/admin-products";
import { formatInr } from "@/lib/format";
import { AdminPagination, parsePage } from "../admin-pagination";
import { AutoSubmitFilterForm } from "../auto-submit-filter-form";
import { DeleteConfirmButton } from "../DeleteConfirmButton";
import { SuccessPopup } from "../SuccessPopup";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 10;

const STATUS_STYLES: Record<string, string> = {
  DRAFT: "bg-zinc-100 text-zinc-700",
  ACTIVE: "bg-emerald-50 text-emerald-700",
  RESERVED: "bg-amber-50 text-amber-700",
  SOLD: "bg-blue-50 text-blue-700",
  ARCHIVED: "bg-red-50 text-red-700",
};

const STATUS_VALUES = ["DRAFT", "ACTIVE", "RESERVED", "SOLD", "ARCHIVED"] as const;

const STOCK_FILTERS = [
  { value: "in", label: "In stock (6+)" },
  { value: "low", label: "Low stock (1–5)" },
  { value: "out", label: "Out of stock (0)" },
] as const;

export default async function AdminProductsPage({
  searchParams,
}: {
  searchParams: Promise<{
    q?: string;
    page?: string;
    brand?: string;
    category?: string;
    status?: string;
    stock?: string;
    model?: string;
    created?: string;
    updated?: string;
  }>;
}) {
  const { q, page: pageRaw, brand, category, status, stock, model, created, updated } = await searchParams;
  const query = q?.trim();
  const brandFilter = brand?.trim() || undefined;
  const categoryFilter = category?.trim() || undefined;
  const statusFilter = STATUS_VALUES.find((value) => value === status);
  const stockFilter = STOCK_FILTERS.find((filter) => filter.value === stock)?.value;
  const page = parsePage(pageRaw);

  // Model options come from what's actually listed right now (every distinct
  // value in compatibleModels across current products — narrowed to the
  // selected brand's own listings, or every listed brand's when no brand is
  // picked), not the full reference catalogue in lib/bike-brand-models.ts —
  // so this filter only ever offers models a product actually exists for.
  // Prisma's `distinct` doesn't unwind array columns, so this dedupes in JS.
  // Runs alongside brandOptions/categoryOptions below (all three are
  // independent of the row-level `where`) rather than blocking before them —
  // only totalCount/products actually need to wait on modelFilter.
  const [modelSourceListings, brandOptions, categoryOptions] = await Promise.all([
    prisma.bikePartListing.findMany({
      where: brandFilter ? { brand: brandFilter } : undefined,
      select: { compatibleModels: true },
    }),
    prisma.bikePartListing.findMany({
      distinct: ["brand"],
      select: { brand: true },
      orderBy: { brand: "asc" },
    }),
    prisma.bikePartListing.findMany({
      distinct: ["category"],
      select: { category: true },
      orderBy: { category: "asc" },
    }),
  ]);
  const modelOptions = Array.from(
    new Set(modelSourceListings.flatMap((listing) => listing.compatibleModels))
  ).sort((a, b) => a.localeCompare(b));
  // Only accept a model filter that's actually in that list, so a stale
  // value left over from switching brands (e.g. brand=KTM&model=Splendor
  // Plus) is silently ignored rather than producing a confusing zero-result
  // page.
  const modelFilter = model && modelOptions.includes(model) ? model : undefined;

  const conditions = [];
  if (query) {
    conditions.push({
      OR: [
        { name: { contains: query, mode: "insensitive" as const } },
        { brand: { contains: query, mode: "insensitive" as const } },
        { category: { contains: query, mode: "insensitive" as const } },
      ],
    });
  }
  if (brandFilter) conditions.push({ brand: brandFilter });
  if (categoryFilter) conditions.push({ category: categoryFilter });
  if (statusFilter) conditions.push({ status: statusFilter });
  if (stockFilter === "in") conditions.push({ stock: { gt: 5 } });
  if (stockFilter === "low") conditions.push({ stock: { gt: 0, lte: 5 } });
  if (stockFilter === "out") conditions.push({ stock: 0 });
  if (modelFilter) conditions.push({ compatibleModels: { has: modelFilter } });
  const where = conditions.length ? { AND: conditions } : undefined;

  const [totalCount, products] = await Promise.all([
    prisma.bikePartListing.count({ where }),
    prisma.bikePartListing.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
    }),
  ]);
  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));
  const buildHref = (targetPage: number) => {
    const params = new URLSearchParams();
    if (query) params.set("q", query);
    if (brandFilter) params.set("brand", brandFilter);
    if (categoryFilter) params.set("category", categoryFilter);
    if (statusFilter) params.set("status", statusFilter);
    if (stockFilter) params.set("stock", stockFilter);
    if (modelFilter) params.set("model", modelFilter);
    if (targetPage > 1) params.set("page", String(targetPage));
    const qs = params.toString();
    return qs ? `/admin/products?${qs}` : "/admin/products";
  };
  const hasFilters = Boolean(
    query || brandFilter || categoryFilter || statusFilter || stockFilter || modelFilter
  );

  return (
    <div className="flex flex-col gap-4">
      <SuccessPopup
        show={created === "1" || updated === "1"}
        message={created === "1" ? "Product created successfully." : "Product updated successfully."}
      />
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-black">Products</h1>
          <p className="text-sm text-zinc-500">
            {totalCount} product(s) — page {page} of {totalPages}
          </p>
        </div>
        <Link
          href="/admin/products/new"
          className="h-10 shrink-0 rounded-lg bg-[#025632] px-4 text-sm font-bold leading-10 text-white hover:bg-[#013720]"
        >
          + Add product
        </Link>
      </div>

      {/*
        Keyed on the resolved filter state so the whole form (and every
        uncontrolled input/select inside it) remounts whenever it changes —
        including clearing back to nothing. Without this, a client-side
        (soft) navigation — e.g. clicking "Clear filters", a <Link> — patches
        the existing DOM nodes instead of recreating them, and `defaultValue`
        only ever applies on first mount, so a select whose value actually
        changed would keep showing its old pick even though the server is
        (correctly) filtering by the new one underneath.
      */}
      <AutoSubmitFilterForm
        key={[query, brandFilter, categoryFilter, statusFilter, stockFilter, modelFilter].join("|")}
        className="flex flex-nowrap items-center gap-2 overflow-x-auto pb-1"
        action="/admin/products"
      >
        <input
          type="text"
          name="q"
          defaultValue={query}
          placeholder="Search by name, brand, or category…"
          className="h-10 min-w-[160px] flex-[2] rounded-lg border border-zinc-300 px-3 text-sm outline-none focus:border-zinc-500"
        />

        <select
          name="brand"
          defaultValue={brandFilter ?? ""}
          className="h-10 min-w-[120px] flex-1 rounded-lg border border-zinc-300 bg-white px-3 text-sm text-zinc-700 outline-none focus:border-zinc-500"
        >
          <option value="">All bikes</option>
          {brandOptions.map(({ brand: value }) => (
            <option key={value} value={value}>
              {value}
            </option>
          ))}
        </select>

        {/* Narrowed to the selected bike's own listed models (see
            modelOptions above) — picking a bike above and re-submitting is
            what populates this, so it only ever offers models that bike
            actually has products for. */}
        <select
          name="model"
          defaultValue={modelFilter ?? ""}
          className="h-10 min-w-[140px] flex-1 rounded-lg border border-zinc-300 bg-white px-3 text-sm text-zinc-700 outline-none focus:border-zinc-500"
        >
          <option value="">{brandFilter ? `All ${brandFilter} models` : "All models"}</option>
          {modelOptions.map((value) => (
            <option key={value} value={value}>
              {value}
            </option>
          ))}
        </select>

        <select
          name="category"
          defaultValue={categoryFilter ?? ""}
          className="h-10 min-w-[130px] flex-1 rounded-lg border border-zinc-300 bg-white px-3 text-sm text-zinc-700 outline-none focus:border-zinc-500"
        >
          <option value="">All categories</option>
          {categoryOptions.map(({ category: value }) => (
            <option key={value} value={value}>
              {value}
            </option>
          ))}
        </select>

        <select
          name="status"
          defaultValue={statusFilter ?? ""}
          className="h-10 min-w-[120px] flex-1 rounded-lg border border-zinc-300 bg-white px-3 text-sm text-zinc-700 outline-none focus:border-zinc-500"
        >
          <option value="">All statuses</option>
          {STATUS_VALUES.map((value) => (
            <option key={value} value={value}>
              {value}
            </option>
          ))}
        </select>

        <select
          name="stock"
          defaultValue={stockFilter ?? ""}
          className="h-10 min-w-[140px] flex-1 rounded-lg border border-zinc-300 bg-white px-3 text-sm text-zinc-700 outline-none focus:border-zinc-500"
        >
          <option value="">All stock levels</option>
          {STOCK_FILTERS.map((filter) => (
            <option key={filter.value} value={filter.value}>
              {filter.label}
            </option>
          ))}
        </select>

        {hasFilters ? (
          <Link
            href="/admin/products"
            className="h-10 shrink-0 rounded-lg px-3 text-xs font-bold leading-10 text-zinc-500 hover:text-zinc-800"
          >
            Clear filters
          </Link>
        ) : null}
      </AutoSubmitFilterForm>

      <div className="overflow-x-auto rounded-xl bg-white shadow-sm ring-1 ring-zinc-100">
        <table className="w-full min-w-[720px] text-left text-sm">
          <thead>
            <tr className="border-b border-zinc-100 text-xs font-bold uppercase text-zinc-500">
              <th className="px-4 py-3">Product</th>
              <th className="px-4 py-3">Brand</th>
              <th className="px-4 py-3">Category</th>
              <th className="px-4 py-3">Price</th>
              <th className="px-4 py-3">Stock</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody>
            {products.map((product) => (
              <tr key={product.id} className="border-b border-zinc-50 last:border-0">
                <td className="px-4 py-3">
                  <div className="flex items-center gap-3">
                    {product.imageUrl ? (
                      <span className="relative size-10 shrink-0 overflow-hidden rounded-md bg-zinc-50">
                        <Image
                          src={product.imageUrl}
                          alt={product.name}
                          fill
                          className="object-contain"
                        />
                      </span>
                    ) : (
                      <span className="grid size-10 shrink-0 place-items-center rounded-md bg-zinc-100 text-[10px] text-zinc-400">
                        No img
                      </span>
                    )}
                    <span className="font-bold">{product.name}</span>
                  </div>
                </td>
                <td className="px-4 py-3 text-zinc-600">{product.brand}</td>
                <td className="px-4 py-3 text-zinc-600">{product.category}</td>
                <td className="px-4 py-3 font-bold">{formatInr(product.price)}</td>
                <td className="px-4 py-3">
                  <span className={product.stock <= 5 ? "font-bold text-amber-600" : ""}>
                    {product.stock}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <span
                    className={`rounded-full px-2.5 py-1 text-[11px] font-bold ${
                      STATUS_STYLES[product.status] ?? "bg-zinc-100 text-zinc-700"
                    }`}
                  >
                    {product.status}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-3">
                    <Link
                      href={`/admin/products/${product.id}`}
                      className="inline-flex h-8 items-center justify-center rounded-lg border border-zinc-200 px-3 text-xs font-bold text-zinc-700 transition hover:border-[#a7f3d0] hover:bg-[#ecfdf5] hover:text-[#047857]"
                    >
                      Edit
                    </Link>
                    <DeleteConfirmButton
                      itemLabel={product.name}
                      title="Delete this product?"
                      action={deleteProductAction.bind(null, product.id)}
                    />
                  </div>
                </td>
              </tr>
            ))}

            {products.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-sm text-zinc-400">
                  No products yet. Add your first one.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>

      <AdminPagination currentPage={page} totalPages={totalPages} buildHref={buildHref} />
    </div>
  );
}
