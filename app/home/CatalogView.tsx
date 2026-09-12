"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import { Bike, Calendar, ChevronDown, Filter, Package, Search, SlidersHorizontal } from "lucide-react";
import type { Product } from "@/lib/storefront-catalog";
import { SUBCATEGORIES_BY_CATEGORY } from "@/lib/product-subcategories";
import type { SortOption } from "./constants";
import { brands, partCategories, priceFilterOptions, sortOptions, bikeHotspots, homeCategoryFilters, years as fallbackYears } from "./constants";
import { getProductDisplayMeta, parsePrice } from "./utils";
import { ProductCard, ProductCardSkeleton } from "./ProductComponents";

function expandYearRange(yearRange: string) {
  const match = /^(\d{4})(?:\s*-\s*(\d{4}))?$/.exec(yearRange.trim());
  if (!match) return [];
  const start = Number(match[1]);
  const end = Number(match[2] ?? match[1]);
  return Array.from({ length: end - start + 1 }, (_, index) => String(end - index));
}

export function CatalogView({
  products,
  selectedBrand,
  selectedModel,
  selectedYear,
  activeCategory,
  modelImage,
  selectedProduct,
  onModelClick,
  onYearChange,
  onCategoryChange,
  onProductSelect,
  onAddToCart,
  cart,
  onIncrementCartItem,
  onDecrementCartItem,
  searchQuery,
  onSearchQueryChange,
}: {
  products: Product[];
  selectedBrand: (typeof brands)[number] | undefined;
  selectedModel: string;
  selectedYear: string;
  activeCategory: string;
  modelImage: string;
  selectedProduct: Product | null;
  onModelClick: () => void;
  onYearChange: (year: string) => void;
  onCategoryChange: (category: string) => void;
  onProductSelect: (product: Product) => void;
  onAddToCart: (product: Product, quantity: number) => void;
  cart: Record<string, number>;
  onIncrementCartItem: (name: string) => void;
  onDecrementCartItem: (name: string) => void;
  searchQuery: string;
  onSearchQueryChange: (query: string) => void;
}) {
  const PRODUCT_PAGE_SIZE = 12;
  const compatibleWith = selectedBrand
    ? `${selectedBrand.name} ${selectedModel} (${selectedYear})`.trim()
    : "All Bike Models";
  const availableYears = selectedBrand && selectedModel
    ? Array.from(new Set(products.flatMap((product) => product.compatibleVehicles
      .filter((vehicle) => vehicle.brand.toLowerCase() === selectedBrand.name.toLowerCase()
        && vehicle.model.toLowerCase() === selectedModel.toLowerCase())
      .flatMap((vehicle) => expandYearRange(vehicle.yearRange))))).sort((a, b) => Number(b) - Number(a))
    : [];
  const displayYears = availableYears.length ? availableYears : fallbackYears;
  const trimmedQuery = searchQuery.trim().toLowerCase();
  const catalogCategories = Array.from(
    new Set(products.map((product) => product.category))
  );
  const [activePriceFilter, setActivePriceFilter] = useState<string | null>(null);
  const [sortOption, setSortOption] = useState<SortOption>("popularity");
  const [isFilterMenuOpen, setIsFilterMenuOpen] = useState(false);
  const [isSortMenuOpen, setIsSortMenuOpen] = useState(false);
  const [filterMenuPos, setFilterMenuPos] = useState({ top: 0, left: 0 });
  const [sortMenuPos, setSortMenuPos] = useState({ top: 0, left: 0 });
  const filterButtonRef = useRef<HTMLButtonElement>(null);
  const sortButtonRef = useRef<HTMLButtonElement>(null);
  // Which category pill's "related parts" dropdown is open, if any — same
  // fixed-positioning trick as Filter/Sort below (own bounding rect at open
  // time), since these pills live in the same clipping scroll row.
  const [openCategoryPill, setOpenCategoryPill] = useState<string | null>(null);
  const [categoryPillMenuPos, setCategoryPillMenuPos] = useState({ top: 0, left: 0 });

  // The Filter/Sort/category pills live inside a horizontally-scrolling row,
  // whose `overflow-x-auto` implicitly clips vertical overflow too — so
  // their dropdowns are rendered `fixed` (positioned from the button's own
  // bounding rect) to escape that clipping instead of `absolute` inside it.
  useEffect(() => {
    if (!isFilterMenuOpen && !isSortMenuOpen && !openCategoryPill) {
      return;
    }

    const closeMenus = () => {
      setIsFilterMenuOpen(false);
      setIsSortMenuOpen(false);
      setOpenCategoryPill(null);
    };

    window.addEventListener("scroll", closeMenus, true);
    window.addEventListener("resize", closeMenus);

    return () => {
      window.removeEventListener("scroll", closeMenus, true);
      window.removeEventListener("resize", closeMenus);
    };
  }, [isFilterMenuOpen, isSortMenuOpen, openCategoryPill]);

  // Searching while a category tab is active only searches within that
  // category. If the typed query has no match there but matches a part in
  // another category, drop back to "All Parts" so the search result is
  // actually visible instead of showing "No parts found".
  useEffect(() => {
    if (!trimmedQuery || !activeCategory) {
      return;
    }

    const matchesActiveCategory = products.some(
      (product) => product.category === activeCategory && [product.name, product.brand, product.category, product.productType, product.oemPartNumber, product.sku, ...product.searchTags].filter(Boolean).join(" ").toLowerCase().includes(trimmedQuery)
    );

    if (matchesActiveCategory) {
      return;
    }

    const matchesAnyCategory = products.some((product) => [product.name, product.brand, product.category, product.productType, product.oemPartNumber, product.sku, ...product.searchTags].filter(Boolean).join(" ").toLowerCase().includes(trimmedQuery));

    if (matchesAnyCategory) {
      onCategoryChange("");
    }
  }, [trimmedQuery, activeCategory, onCategoryChange, products]);

  const categoryFiltered = activeCategory
    ? products.filter((product) => product.category === activeCategory)
    : products;
  const priceFiltered = activePriceFilter
    ? categoryFiltered.filter(
        (product) => priceFilterOptions.find((option) => option.label === activePriceFilter)?.test(product) ?? true
      )
    : categoryFiltered;
  const searchFiltered = trimmedQuery
    ? priceFiltered.filter((product) => [product.name, product.brand, product.category, product.productType, product.oemPartNumber, product.sku, ...product.searchTags].filter(Boolean).join(" ").toLowerCase().includes(trimmedQuery))
    : priceFiltered;
  const filteredProducts = [...searchFiltered].sort((a, b) => {
    if (sortOption === "price-asc") return parsePrice(a.price) - parsePrice(b.price);
    if (sortOption === "price-desc") return parsePrice(b.price) - parsePrice(a.price);
    if (sortOption === "rating-desc")
      return getProductDisplayMeta(products, b).rating - getProductDisplayMeta(products, a).rating;
    return 0;
  });
  const title = activeCategory
    ? `${activeCategory} Parts`
    : selectedModel
    ? `${selectedModel} Parts`
    : "All Parts";
  const [visibleCount, setVisibleCount] = useState(PRODUCT_PAGE_SIZE);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  // Mirrors isLoadingMore for the intersection callback to read without being
  // an effect dependency — see the note below on why that distinction matters.
  const isLoadingMoreRef = useRef(false);
  const loadMoreRef = useRef<HTMLDivElement | null>(null);
  const visibleProducts = filteredProducts.slice(0, visibleCount);
  const hasMoreProducts = visibleCount < filteredProducts.length;

  // Reset pagination when the active filters change. Adjusted during render
  // (React's documented pattern for this) rather than in an effect, so the
  // page doesn't flash the old (unfiltered-length) slice for a frame first.
  const filterKey = `${activeCategory}|${activePriceFilter ?? ""}|${sortOption}|${trimmedQuery}`;
  const [lastFilterKey, setLastFilterKey] = useState(filterKey);
  if (filterKey !== lastFilterKey) {
    setLastFilterKey(filterKey);
    setVisibleCount(PRODUCT_PAGE_SIZE);
  }

  useEffect(() => {
    const loadMoreNode = loadMoreRef.current;

    if (!loadMoreNode || !hasMoreProducts) {
      return;
    }

    // isLoadingMore was previously a dependency here too. That meant the
    // moment the callback below called setIsLoadingMore(true), this effect
    // re-ran — tearing down and cancelling the very timer it had just
    // started, before it ever got a chance to fire. The skeleton then never
    // resolved. isLoadingMoreRef lets the callback guard against
    // re-triggering mid-load without the effect itself depending on that
    // state (and thus without self-cancelling its own timer).
    let loadingTimer: number | undefined;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry?.isIntersecting || isLoadingMoreRef.current) {
          return;
        }

        isLoadingMoreRef.current = true;
        setIsLoadingMore(true);
        loadingTimer = window.setTimeout(() => {
          setVisibleCount((current) =>
            Math.min(current + PRODUCT_PAGE_SIZE, filteredProducts.length)
          );
          isLoadingMoreRef.current = false;
          setIsLoadingMore(false);
        }, 120);
      },
      { rootMargin: "800px 0px" }
    );

    observer.observe(loadMoreNode);

    return () => {
      observer.disconnect();
      if (loadingTimer) {
        window.clearTimeout(loadingTimer);
      }
    };
  }, [filteredProducts.length, hasMoreProducts]);

  return (
    <section className="relative mx-auto w-full max-w-[1770px]">
      <div className="flex flex-col gap-4 pb-5 pt-1 sm:pb-6 lg:pt-2">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <div className="mb-4 flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={onModelClick}
                className="inline-flex items-center gap-2 rounded-full border border-zinc-200 bg-white py-1 pl-1 pr-3 text-xs font-bold text-zinc-700 shadow-sm transition hover:border-zinc-300 hover:text-zinc-950"
              >
                <span className="relative grid size-8 place-items-center overflow-hidden rounded-full bg-zinc-100">
                  <Image
                    src={modelImage}
                    alt={compatibleWith}
                    width={72}
                    height={72}
                    className="h-full w-full object-contain"
                  />
                </span>
                {selectedModel ? "Change Bike" : "Select Bike"}
                <ChevronDown className="size-3.5" />
              </button>
              {selectedModel ? (
                <span className="text-xs font-bold text-zinc-950">
                  {selectedModel}
                </span>
              ) : null}
            </div>

            <h1 className="text-xl font-black leading-tight tracking-normal text-zinc-950 sm:text-2xl lg:text-3xl">
              {title}
            </h1>
            <p className="mt-3 max-w-3xl text-[11px] font-medium leading-6 text-zinc-700 sm:text-xs">
              Compatible genuine and aftermarket parts for {compatibleWith}.
            </p>
          </div>

          <div className="no-scrollbar flex gap-2 overflow-x-auto pb-1 lg:max-w-[420px]">
            {displayYears.map((year) => (
              <button
                type="button"
                key={year}
                onClick={() => onYearChange(year)}
                className={`inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full border px-3 text-[10px] font-bold shadow-sm transition sm:text-[11px] ${
                  selectedYear === year
                    ? "border-zinc-950 bg-zinc-950 text-white"
                    : "border-zinc-200 bg-white text-zinc-700 hover:border-zinc-300 hover:text-zinc-950"
                }`}
              >
                <Calendar className="size-3.5" />
                {year}
              </button>
            ))}
          </div>
        </div>

        <div className="no-scrollbar flex gap-2 overflow-x-auto pb-1">
          <div className="shrink-0">
            <button
              type="button"
              ref={filterButtonRef}
              onClick={() => {
                setIsFilterMenuOpen((open) => {
                  const next = !open;
                  if (next) {
                    const rect = filterButtonRef.current?.getBoundingClientRect();
                    if (rect) setFilterMenuPos({ top: rect.bottom + 8, left: rect.left });
                  }
                  return next;
                });
                setIsSortMenuOpen(false);
              }}
              className={`inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full border px-3 text-[10px] font-bold shadow-sm transition ${
                activePriceFilter
                  ? "border-zinc-950 bg-zinc-950 text-white"
                  : "border-zinc-200 bg-white text-zinc-950 hover:border-zinc-300"
              }`}
            >
              <SlidersHorizontal className="size-3.5" />
              {activePriceFilter ? "Filter (1)" : "Filter"}
            </button>

            {isFilterMenuOpen ? (
              <>
                <button
                  type="button"
                  aria-label="Close filter menu"
                  className="fixed inset-0 z-40 cursor-default"
                  onClick={() => setIsFilterMenuOpen(false)}
                />
                <div
                  className="fixed z-50 w-56 rounded-lg border border-zinc-200 bg-white p-2 shadow-lg"
                  style={{ top: filterMenuPos.top, left: filterMenuPos.left }}
                >
                  <p className="px-2 py-1 text-[10px] font-black uppercase tracking-wide text-zinc-400">
                    Price
                  </p>
                  {priceFilterOptions.map((option) => (
                    <button
                      type="button"
                      key={option.label}
                      onClick={() => {
                        setActivePriceFilter((current) => (current === option.label ? null : option.label));
                        setIsFilterMenuOpen(false);
                      }}
                      className={`flex w-full items-center justify-between rounded-md px-2 py-1.5 text-left text-xs font-bold transition ${
                        activePriceFilter === option.label
                          ? "bg-[#fff0eb] text-[#ff4b1f]"
                          : "text-zinc-700 hover:bg-zinc-50"
                      }`}
                    >
                      {option.label}
                    </button>
                  ))}
                  {activePriceFilter ? (
                    <button
                      type="button"
                      onClick={() => {
                        setActivePriceFilter(null);
                        setIsFilterMenuOpen(false);
                      }}
                      className="mt-1 flex w-full items-center justify-center rounded-md px-2 py-1.5 text-xs font-bold text-zinc-500 transition hover:bg-zinc-50"
                    >
                      Clear filter
                    </button>
                  ) : null}
                </div>
              </>
            ) : null}
          </div>

          <div className="shrink-0">
            <button
              type="button"
              ref={sortButtonRef}
              onClick={() => {
                setIsSortMenuOpen((open) => {
                  const next = !open;
                  if (next) {
                    const rect = sortButtonRef.current?.getBoundingClientRect();
                    if (rect) setSortMenuPos({ top: rect.bottom + 8, left: rect.left });
                  }
                  return next;
                });
                setIsFilterMenuOpen(false);
              }}
              className={`inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full border px-3 text-[10px] font-bold shadow-sm transition ${
                sortOption !== "popularity"
                  ? "border-zinc-950 bg-zinc-950 text-white"
                  : "border-zinc-200 bg-white text-zinc-950 hover:border-zinc-300"
              }`}
            >
              {sortOptions.find((option) => option.value === sortOption)?.label ?? "Sort By"}
              <ChevronDown className="size-3.5" />
            </button>

            {isSortMenuOpen ? (
              <>
                <button
                  type="button"
                  aria-label="Close sort menu"
                  className="fixed inset-0 z-40 cursor-default"
                  onClick={() => setIsSortMenuOpen(false)}
                />
                <div
                  className="fixed z-50 w-52 rounded-lg border border-zinc-200 bg-white p-2 shadow-lg"
                  style={{ top: sortMenuPos.top, left: sortMenuPos.left }}
                >
                  {sortOptions.map((option) => (
                    <button
                      type="button"
                      key={option.value}
                      onClick={() => {
                        setSortOption(option.value);
                        setIsSortMenuOpen(false);
                      }}
                      className={`flex w-full items-center justify-between rounded-md px-2 py-1.5 text-left text-xs font-bold transition ${
                        sortOption === option.value
                          ? "bg-[#fff0eb] text-[#ff4b1f]"
                          : "text-zinc-700 hover:bg-zinc-50"
                      }`}
                    >
                      {option.label}
                    </button>
                  ))}
                </div>
              </>
            ) : null}
          </div>

          <button
            type="button"
            onClick={() => onCategoryChange("")}
            className={`inline-flex h-9 shrink-0 items-center rounded-full border px-3 text-[10px] font-bold shadow-sm transition ${
              activeCategory
                ? "border-zinc-200 bg-white text-zinc-950 hover:border-zinc-300"
                : "border-zinc-950 bg-zinc-950 text-white"
            }`}
          >
            All Parts
          </button>

          {catalogCategories.map((category) => {
            const CategoryIcon =
              partCategories.find((item) => item.name === category)?.icon ?? Package;
            const isOpen = openCategoryPill === category;
            // Curated subcategory names (same list the admin's Category →
            // Subcategory field and the header nav's dropdown use), not
            // "whatever happens to be stocked right now" — keeps this
            // consistent regardless of what's actually seeded.
            const subcategories = SUBCATEGORIES_BY_CATEGORY[category] ?? [];

            return (
              <div key={category} className="relative shrink-0">
                <button
                  type="button"
                  onClick={(event) => {
                    // Read the rect synchronously, before any setState call —
                    // React can clear a synthetic event's `currentTarget` by
                    // the time a state updater callback actually runs, so
                    // reading it from inside setOpenCategoryPill's updater
                    // (rather than here, up front) intermittently threw
                    // "Cannot read properties of null". Same reason the
                    // Filter/Sort buttons above use a persistent ref instead.
                    const willOpen = openCategoryPill !== category;
                    if (willOpen) {
                      const rect = event.currentTarget.getBoundingClientRect();
                      // Clamp so the w-60 (240px) panel never runs past the
                      // right edge of the viewport for pills near the end of
                      // this scrolling row — anchor its right edge to the
                      // viewport instead of overflowing off-screen.
                      const menuWidth = 240;
                      const margin = 12;
                      const left = Math.min(rect.left, window.innerWidth - menuWidth - margin);
                      setCategoryPillMenuPos({ top: rect.bottom + 8, left: Math.max(margin, left) });
                    }
                    setOpenCategoryPill(willOpen ? category : null);
                    setIsFilterMenuOpen(false);
                    setIsSortMenuOpen(false);
                  }}
                  aria-expanded={isOpen}
                  className={`inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full border px-3 text-[10px] font-bold shadow-sm transition ${
                    activeCategory === category
                      ? "border-zinc-950 bg-zinc-950 text-white"
                      : "border-zinc-200 bg-white text-zinc-950 hover:border-zinc-300"
                  }`}
                >
                  <CategoryIcon className="size-3.5" />
                  {category}
                  <ChevronDown className={`size-3.5 transition-transform ${isOpen ? "rotate-180" : ""}`} />
                </button>

                {isOpen ? (
                  <>
                    <button
                      type="button"
                      aria-label="Close category menu"
                      className="fixed inset-0 z-40 cursor-default"
                      onClick={() => setOpenCategoryPill(null)}
                    />
                    <div
                      className="fixed z-50 w-60 overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-[0_16px_40px_rgba(24,24,27,0.16)]"
                      style={{ top: categoryPillMenuPos.top, left: categoryPillMenuPos.left }}
                    >
                      {subcategories.length > 0 ? (
                        <ul className="max-h-64 overflow-y-auto py-1">
                          {subcategories.map((subcategory) => (
                            <li key={subcategory}>
                              <button
                                type="button"
                                onClick={() => {
                                  // Selects the category tab and narrows
                                  // further via the search filter, so real
                                  // matching products (if any are stocked
                                  // under this subcategory) show up
                                  // immediately in the grid below.
                                  onCategoryChange(category);
                                  onSearchQueryChange(subcategory);
                                  setOpenCategoryPill(null);
                                }}
                                className="flex w-full items-center gap-2.5 px-4 py-2 text-left text-xs font-bold text-zinc-700 transition hover:bg-zinc-50"
                              >
                                <CategoryIcon className="size-3.5 shrink-0 text-zinc-400" />
                                <span className="truncate">{subcategory}</span>
                              </button>
                            </li>
                          ))}
                        </ul>
                      ) : (
                        <p className="px-4 py-3 text-center text-xs font-medium text-zinc-400">
                          No parts listed yet
                        </p>
                      )}
                      <button
                        type="button"
                        onClick={() => {
                          onCategoryChange(category);
                          setOpenCategoryPill(null);
                        }}
                        className="flex w-full items-center justify-center gap-1 border-t border-zinc-100 px-4 py-2.5 text-xs font-black text-[#ff4b1f] transition hover:bg-[#fff3ef]"
                      >
                        Show all {category} parts
                        <ChevronDown className="size-3.5 -rotate-90" />
                      </button>
                    </div>
                  </>
                ) : null}
              </div>
            );
          })}
        </div>
      </div>

      {activeCategory || trimmedQuery ? (
        <div className="mb-5 flex flex-wrap items-center justify-between gap-2">
          <p className="text-xs font-medium text-zinc-500">
            {filteredProducts.length > 0
              ? `${filteredProducts.length} ${activeCategory ? `${activeCategory} ` : ""}part${
                  filteredProducts.length === 1 ? "" : "s"
                }${trimmedQuery ? ` for "${searchQuery.trim()}"` : ""} — ${compatibleWith}`
              : `No parts found${activeCategory ? ` in ${activeCategory}` : ""}${
                  trimmedQuery ? ` for "${searchQuery.trim()}"` : ""
                }`}
          </p>
          {activeCategory ? (
            <button
              type="button"
              onClick={() => onCategoryChange("")}
              className="text-xs font-black text-[#ff4b1f] hover:underline"
            >
              Show all parts
            </button>
          ) : null}
        </div>
      ) : null}

      {filteredProducts.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-2 rounded-lg bg-white py-16 text-center shadow-[0_10px_26px_rgba(15,23,42,0.07)] ring-1 ring-zinc-100">
          <Search className="size-8 text-zinc-300" />
          <p className="text-sm font-bold text-[#070e2b]">No matching parts found</p>
          <p className="max-w-xs text-xs text-zinc-500">
            Try a different search term, or browse all parts for {compatibleWith}.
          </p>
          {activeCategory ? (
            <button
              type="button"
              onClick={() => onCategoryChange("")}
              className="mt-1 text-xs font-bold text-[#ff4b1f] hover:underline"
            >
              Show all parts
            </button>
          ) : null}
        </div>
      ) : (
        <>
          <h2 className="mb-5 text-lg font-black leading-tight tracking-normal text-zinc-950 sm:text-xl">
            Parts to explore
          </h2>

          <div className="grid grid-cols-2 gap-x-3 gap-y-6 sm:gap-x-8 sm:gap-y-8 lg:grid-cols-4">
            {visibleProducts.map((product) => {
              const meta = getProductDisplayMeta(products, product);
              return (
                <ProductCard
                  key={product.name}
                  product={product}
                  isSelected={selectedProduct?.name === product.name}
                  compatibleWith={compatibleWith}
                  quantity={cart[product.name] ?? 0}
                  onSelect={() => onProductSelect(product)}
                  onAddToCart={() => onAddToCart(product, 1)}
                  onIncrement={() => onIncrementCartItem(product.name)}
                  onDecrement={() => onDecrementCartItem(product.name)}
                  rating={meta.rating}
                  deliveryDays={meta.deliveryDays}
                  offerLabel={meta.offerLabel}
                />
              );
            })}
          </div>

          <div ref={loadMoreRef} className="py-7">
            {isLoadingMore ? (
              <div className="grid grid-cols-2 gap-x-3 gap-y-6 sm:gap-x-8 sm:gap-y-8 lg:grid-cols-4">
                {Array.from({
                  length: Math.min(4, filteredProducts.length - visibleCount),
                }).map((_, index) => (
                  <ProductCardSkeleton key={index} />
                ))}
              </div>
            ) : !hasMoreProducts ? (
              <div className="flex min-h-20 items-center justify-center">
                <span className="text-xs font-bold text-zinc-400">
                  You&apos;ve explored all matching parts
                </span>
              </div>
            ) : null}
          </div>
        </>
      )}

    </section>
  );
}

