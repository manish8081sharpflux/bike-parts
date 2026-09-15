"use client";

import { useState } from "react";
import { ProductReviews } from "./ReviewComponents";
import { hasCustomerRating } from "@/lib/reviews/types";
import type { MouseEvent } from "react";
import Image from "next/image";
import { ArrowRight, Bike, CheckCircle2, FileText, ListChecks, Minus, Plus, ShoppingCart, Star } from "lucide-react";
import type { Product } from "@/lib/storefront-catalog";
import { brands, brandModels } from "./constants";
import { buildGalleryImages, formatDeliveryEstimate, getProductDisplayMeta, parsePrice, formatPrice } from "./utils";
import { BrandLogo } from "./BrandModals";

export function ProductCard({
  product,
  isSelected,
  compatibleWith,
  quantity,
  onSelect,
  onAddToCart,
  onIncrement,
  onDecrement,
  compact = false,
  deliveryDays,
  offerLabel,
}: {
  product: Product;
  isSelected: boolean;
  compatibleWith: string;
  quantity: number;
  onSelect: () => void;
  onAddToCart: () => void;
  onIncrement: () => void;
  onDecrement: () => void;
  compact?: boolean;
  /** Real per-product rating/delivery-window/offer label when set — see getProductDisplayMeta. null/absent means no data; never render a fake value. Unused in compact mode. */
  deliveryDays?: string | null;
  offerLabel?: string;
}) {
  if (!compact) {
    const hasRating = hasCustomerRating(product);
    const hasDelivery = Boolean(deliveryDays);

    return (
      <article
        role="button"
        tabIndex={0}
        onClick={onSelect}
        onKeyDown={(event) => {
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            onSelect();
          }
        }}
        className={`group cursor-pointer rounded-lg outline-none transition ${
          isSelected ? "ring-2 ring-[#025632]" : "focus-visible:ring-2 focus-visible:ring-[#025632]"
        }`}
      >
        <div className="relative aspect-[1.55] overflow-hidden rounded-xl bg-zinc-100 shadow-[0_12px_32px_rgba(15,23,42,0.08)] sm:rounded-[18px]">
          <Image
            src={product.image}
            alt={product.name}
            width={640}
            height={420}
            className="h-full w-full object-contain p-3 transition duration-300 group-hover:scale-105 sm:p-8"
          />
          <div className="absolute inset-x-0 bottom-0 h-14 bg-gradient-to-t from-zinc-950/85 to-transparent sm:h-20" />
          <span className="absolute bottom-2 left-2 right-2 line-clamp-1 text-[10px] font-black uppercase leading-none text-white drop-shadow sm:bottom-3 sm:left-4 sm:right-4 sm:text-sm">
            {offerLabel}
          </span>
        </div>

        <div className="px-1.5 pt-2 sm:px-3 sm:pt-3">
          <div className="flex items-start justify-between gap-1.5 sm:gap-3">
            <h3 className="min-w-0 flex-1 truncate text-xs font-black leading-tight text-zinc-950 sm:text-base">
              {product.name}
            </h3>

            {quantity > 0 ? (
              <div
                className="flex h-6 shrink-0 items-center justify-between gap-0.5 rounded-full bg-[#025632] px-1 shadow-sm shadow-[#a7f3d0] sm:h-8 sm:gap-1"
                onClick={(event) => event.stopPropagation()}
              >
                <button
                  type="button"
                  aria-label={`Decrease quantity of ${product.name}`}
                  onClick={onDecrement}
                  className="grid size-4.5 shrink-0 place-items-center rounded-full text-white transition hover:bg-white/20 active:scale-95 sm:size-6"
                >
                  <Minus className="size-2.5 sm:size-3.5" />
                </button>
                <span className="grid min-w-3 place-items-center text-[10px] font-black text-white sm:min-w-4 sm:text-xs">
                  {quantity}
                </span>
                <button
                  type="button"
                  aria-label={`Increase quantity of ${product.name}`}
                  onClick={onIncrement}
                  className="grid size-4.5 shrink-0 place-items-center rounded-full text-white transition hover:bg-white/20 active:scale-95 sm:size-6"
                >
                  <Plus className="size-2.5 sm:size-3.5" />
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={(event) => {
                  event.stopPropagation();
                  onAddToCart();
                }}
                className="inline-flex h-6 shrink-0 items-center justify-center rounded-full bg-[#025632] px-2 text-[9px] font-black text-white shadow-sm shadow-[#a7f3d0] transition hover:bg-[#013720] active:scale-95 sm:h-8 sm:px-4 sm:text-[11px]"
              >
                Add
              </button>
            )}
          </div>

          {hasRating || hasDelivery ? (
            <div className="mt-1 flex min-w-0 items-center gap-1 text-[10px] font-bold text-zinc-950 sm:gap-1.5 sm:text-xs">
              {hasRating ? (
                <>
                  <span className="grid size-4 shrink-0 place-items-center rounded-full bg-emerald-600 text-white sm:size-5">
                    <Star className="size-2.5 fill-current sm:size-3" />
                  </span>
                  <span>{product.ratingAverage!.toFixed(1)} ({product.ratingCount})</span>
                </>
              ) : null}
              {hasRating && hasDelivery ? <span className="text-zinc-950">&bull;</span> : null}
              {hasDelivery ? <span className="truncate">{deliveryDays}</span> : null}
            </div>
          ) : null}

          <p className="mt-1 truncate text-[10px] font-medium text-zinc-500 sm:text-xs">
            {product.category}, Genuine Parts, Compatible Fit
          </p>
          <p className="mt-1 truncate text-[10px] font-medium text-zinc-500 sm:text-xs">
            For {compatibleWith}
          </p>

          <p className="mt-1.5 text-xs font-black text-zinc-950 sm:mt-2 sm:text-sm">
            &#8377;{product.price}
          </p>
        </div>
      </article>
    );
  }

  return (
    <article
      role="button"
      tabIndex={0}
      onClick={onSelect}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onSelect();
        }
      }}
      className={`group relative flex ${
        compact ? "min-h-[148px] p-2" : "min-h-[178px] p-2.5"
      } cursor-pointer flex-col justify-between rounded-lg bg-white shadow-[0_10px_26px_rgba(15,23,42,0.07)] outline-none ring-1 transition ${
        isSelected
          ? "ring-[#025632]"
          : "ring-zinc-100 hover:ring-[#ffb9a4]"
      }`}
    >
      <div
        className={`relative mx-auto w-full pt-1 ${compact ? "h-16" : "h-24"}`}
      >
        <Image
          src={product.image}
          alt={product.name}
          width={360}
          height={260}
          className="h-full w-full object-contain transition duration-300 group-hover:scale-105"
        />
      </div>

      <div className={compact ? "mt-1.5" : "mt-2"}>
        <h3 className="line-clamp-1 text-xs font-extrabold text-[#070e2b]">
          {product.name}
        </h3>
        <p className="mt-0.5 line-clamp-1 text-[10px] font-medium text-zinc-500">
          For {compatibleWith}
        </p>

        <div
          className={
            compact
              ? "mt-1.5 flex flex-col items-stretch gap-1 sm:flex-row sm:items-center sm:justify-between"
              : "mt-3 flex items-center justify-between gap-2"
          }
        >
          <span
            className={`shrink-0 font-black text-[#070e2b] ${
              compact ? "text-xs" : "text-base"
            }`}
          >
            &#8377;{product.price}
          </span>

          {quantity > 0 ? (
            <div
              className={`flex shrink-0 items-center justify-between rounded-full bg-[#025632] shadow-sm shadow-[#a7f3d0] ${
                compact ? "h-5 gap-0.5 px-0.5" : "h-7 gap-0.5 px-0.5"
              }`}
              onClick={(event) => event.stopPropagation()}
            >
              <button
                type="button"
                aria-label={`Decrease quantity of ${product.name}`}
                onClick={onDecrement}
                className={`grid shrink-0 place-items-center rounded-full text-white transition hover:bg-white/20 active:scale-95 ${
                  compact ? "size-3.5" : "size-5"
                }`}
              >
                <Minus className={compact ? "size-2" : "size-3"} />
              </button>
              <span
                className={`grid place-items-center font-black text-white ${
                  compact ? "min-w-2.5 text-[9px]" : "min-w-3 text-[11px]"
                }`}
              >
                {quantity}
              </span>
              <button
                type="button"
                aria-label={`Increase quantity of ${product.name}`}
                onClick={onIncrement}
                className={`grid shrink-0 place-items-center rounded-full text-white transition hover:bg-white/20 active:scale-95 ${
                  compact ? "size-3.5" : "size-5"
                }`}
              >
                <Plus className={compact ? "size-2" : "size-3"} />
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={(event) => {
                event.stopPropagation();
                onAddToCart();
              }}
              className={`inline-flex shrink-0 items-center justify-center rounded-full bg-[#025632] font-bold text-white shadow-sm shadow-[#a7f3d0] transition hover:bg-[#013720] active:scale-95 ${
                compact ? "h-5 px-1.5 text-[9px]" : "h-7 px-2.5 text-[11px]"
              }`}
            >
              Add
            </button>
          )}
        </div>
      </div>
    </article>
  );
}

/** Placeholder card matching ProductCard's non-compact layout, shown while the next page of parts loads. */

export function ProductCardSkeleton() {
  return (
    <div className="animate-pulse rounded-lg">
      <div className="aspect-[1.55] rounded-[18px] bg-zinc-200" />
      <div className="px-3 pt-3">
        <div className="h-5 w-3/4 rounded bg-zinc-200" />
        <div className="mt-2 h-4 w-2/5 rounded bg-zinc-200" />
        <div className="mt-2 h-3 w-3/5 rounded bg-zinc-100" />
        <div className="mt-1.5 h-3 w-2/5 rounded bg-zinc-100" />
        <div className="mt-2 h-4 w-1/4 rounded bg-zinc-200" />
      </div>
    </div>
  );
}


export function ProductDetailDrawer({
  product,
  selectedBrand,
  selectedModel,
  selectedYear,
  activeCategory,
  cartQuantity,
  onClose,
  onAddToCart,
  onIncrement,
  onDecrement,
}: {
  product: Product;
  selectedBrand: (typeof brands)[number] | undefined;
  selectedModel: string;
  selectedYear: string;
  activeCategory: string;
  cartQuantity: number;
  onClose: () => void;
  onAddToCart: (product: Product, quantity: number) => void;
  onIncrement: () => void;
  onDecrement: () => void;
}) {
  const [activeTab, setActiveTab] = useState<
    "details" | "specifications" | "compatible"
  >("details");
  const [activeImage, setActiveImage] = useState(product.image);
  // "More Photos" strip: this product's own main image plus its gallery
  // photos — never other products' images. `product.image` already falls
  // back to a placeholder when the listing has no main image (see
  // mapListingToProduct), so it's never empty here. Deduplicated (an admin
  // could accidentally list the main image again in the gallery) with the
  // main image always first.
  const galleryImages = buildGalleryImages(product);
  const [isZooming, setIsZooming] = useState(false);
  const [zoomPos, setZoomPos] = useState({ x: 50, y: 50 });
  const zoomFactor = 2.5;
  const lensSizePct = 100 / zoomFactor;
  const maxOffsetPct = 100 - lensSizePct;
  const lensLeft = Math.min(Math.max(zoomPos.x - lensSizePct / 2, 0), maxOffsetPct);
  const lensTop = Math.min(Math.max(zoomPos.y - lensSizePct / 2, 0), maxOffsetPct);
  const zoomBgPosX = maxOffsetPct > 0 ? (lensLeft / maxOffsetPct) * 100 : 50;
  const zoomBgPosY = maxOffsetPct > 0 ? (lensTop / maxOffsetPct) * 100 : 50;

  const handleImageMouseMove = (event: MouseEvent<HTMLDivElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    const x = ((event.clientX - rect.left) / rect.width) * 100;
    const y = ((event.clientY - rect.top) / rect.height) * 100;
    setZoomPos({
      x: Math.min(Math.max(x, 0), 100),
      y: Math.min(Math.max(y, 0), 100),
    });
  };

  // The product's own brand — shown for its logo/"Compatible Bikes" tab
  // whenever a bike isn't selected (e.g. opened straight from Best Sellers),
  // so those still show real data instead of disappearing entirely.
  const productBrandData = selectedBrand ?? brands.find((brand) => brand.name === product.brand);

  // Only this product's actual compatible models (from the admin form), not
  // every model of the brand — falls back to the full brand list when the
  // admin left compatibleModels empty, so older/incomplete listings still
  // show something useful here. Uses the currently selected bike's brand
  // when there is one, else the product's own brand.
  const compatibleModels = productBrandData
    ? (brandModels[productBrandData.name as keyof typeof brandModels] ?? []).filter(
        (model) => product.compatibleModels.length === 0 || product.compatibleModels.includes(model.name)
      )
    : [];

  return (
    <div className="min-h-[calc(100vh-64px)] w-full bg-white px-4 py-6 sm:px-6 lg:px-14 lg:py-8">
      <div className="mx-auto w-full max-w-[1200px]">
        <div className="flex items-center justify-between gap-4">
          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-7 items-center gap-2 text-xs font-medium text-[#53607e] transition hover:text-[#025632] sm:h-8 sm:text-sm"
          >
            <ArrowRight className="size-4 rotate-180" />
            Back to {activeCategory || "All Parts"}
          </button>
        </div>

        <div className="mt-2 grid gap-6 sm:mt-4 sm:gap-8 lg:grid-cols-2">
          <div className="min-w-0 lg:sticky lg:top-24 lg:self-start">
            <div
              className="relative grid min-h-[280px] cursor-crosshair place-items-center overflow-hidden rounded-lg bg-[#fbfbfa] p-5 ring-1 ring-zinc-100 sm:min-h-[420px] lg:h-[min(480px,calc(100dvh-120px))] lg:min-h-0"
              onMouseEnter={() => setIsZooming(true)}
              onMouseMove={handleImageMouseMove}
              onMouseLeave={() => setIsZooming(false)}
            >
              <Image
                key={activeImage}
                src={activeImage}
                alt={product.name}
                width={640}
                height={640}
                className="h-full min-h-0 max-h-[260px] w-full object-contain sm:max-h-[400px] lg:max-h-full"
                priority
              />

              {isZooming ? (
                <span
                  className="pointer-events-none absolute border-2 border-[#025632] bg-[#025632]/10"
                  style={{
                    left: `${lensLeft}%`,
                    top: `${lensTop}%`,
                    width: `${lensSizePct}%`,
                    height: `${lensSizePct}%`,
                  }}
                />
              ) : null}
            </div>
          </div>

          <div className="relative min-w-0">
            {/*
              This has to be its own sticky anchor, not just `absolute` inside
              `.relative min-w-0` above — that parent scrolls away with the
              rest of the product details, so an absolutely-positioned child
              scrolled with it too and the zoom preview drifted up off screen
              instead of staying pinned like the source image does (which is
              `lg:sticky` on its own ancestor). `h-0` keeps this sticky
              wrapper from taking up layout space (and shifting the content
              below it) whether or not the preview is currently shown.
            */}
            <div className="sticky top-24 z-20 h-0">
              {isZooming ? (
                <div className="pointer-events-none absolute inset-x-0 top-0 hidden h-[480px] overflow-hidden rounded-xl bg-[#fbfbfa] shadow-2xl ring-1 ring-zinc-200 lg:block">
                  <div
                    className="h-full w-full bg-no-repeat"
                    style={{
                      backgroundImage: `url(${activeImage})`,
                      backgroundSize: `${zoomFactor * 100}% ${zoomFactor * 100}%`,
                      backgroundPosition: `${zoomBgPosX}% ${zoomBgPosY}%`,
                    }}
                  />
                </div>
              ) : null}
            </div>

            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <h2 className="text-lg font-black leading-tight text-[#070e2b] sm:text-2xl">
                  {product.name}
                </h2>
                <p className="mt-1 text-xs font-medium text-[#53607e] sm:mt-2 sm:text-sm">
                  {selectedBrand ? (
                    <>
                      For {selectedBrand.name} {selectedModel} ({selectedYear})
                      <span className="ml-2 inline-grid size-4 place-items-center rounded-full bg-emerald-50 text-[11px] font-black text-emerald-600">
                        &#10003;
                      </span>
                    </>
                  ) : (
                    "For All Bike Models"
                  )}
                </p>
              </div>

              {productBrandData ? (
                <div className="flex shrink-0 flex-col items-center gap-1 sm:hidden">
                  <span className="flex size-10 items-center justify-center overflow-hidden rounded-lg bg-white shadow-sm ring-1 ring-zinc-100">
                    <BrandLogo
                      logo={productBrandData.modalLogo}
                      name={productBrandData.name}
                      color={productBrandData.color}
                    />
                  </span>
                  <span className="inline-flex h-5 items-center gap-1 whitespace-nowrap rounded-full bg-emerald-50 px-2 text-[9px] font-bold text-emerald-700">
                    <span className="size-1.5 rounded-full bg-emerald-500" />
                    In Stock
                  </span>
                </div>
              ) : null}
            </div>

            {productBrandData ? (
              <div className="mt-5 hidden items-center gap-3 sm:flex">
                <span className="flex h-14 w-24 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-white shadow-sm ring-1 ring-zinc-100">
                  <BrandLogo
                    logo={productBrandData.modalLogo}
                    name={productBrandData.name}
                    color={productBrandData.color}
                  />
                </span>
                <span className="inline-flex h-8 items-center gap-2 rounded-full bg-emerald-50 px-4 text-xs font-bold text-emerald-700">
                  <span className="size-2 rounded-full bg-emerald-500" />
                  In Stock
                </span>
              </div>
            ) : null}

            <div className="mt-3 flex items-center justify-between gap-4 sm:mt-7">
              <div>
                <div className="text-2xl font-black leading-none text-[#070e2b] sm:text-4xl">
                  &#8377;{product.price}
                </div>
                <p className="mt-1 text-[10px] font-medium text-[#7a849f] sm:mt-2 sm:text-xs">
                  Inclusive of all taxes
                </p>
              </div>

              {cartQuantity > 0 ? (
                <div className="flex h-10 min-w-[116px] items-center justify-between gap-1 rounded-full bg-[#025632] p-1.5 shadow-md shadow-[#a7f3d0] sm:h-12 sm:min-w-[136px]">
                  <button
                    type="button"
                    aria-label="Decrease quantity"
                    onClick={onDecrement}
                    className="grid size-7 shrink-0 place-items-center rounded-full text-white transition hover:bg-white/20 active:scale-95 sm:size-9"
                  >
                    <Minus className="size-4 sm:size-4.5" />
                  </button>
                  <span className="grid min-w-6 place-items-center text-sm font-black text-white sm:text-base">
                    {cartQuantity}
                  </span>
                  <button
                    type="button"
                    aria-label="Increase quantity"
                    onClick={onIncrement}
                    className="grid size-7 shrink-0 place-items-center rounded-full text-white transition hover:bg-white/20 active:scale-95 sm:size-9"
                  >
                    <Plus className="size-4 sm:size-4.5" />
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => onAddToCart(product, 1)}
                  className="inline-flex h-10 min-w-[116px] items-center justify-center gap-2 rounded-full bg-[#025632] px-5 text-xs font-black text-white shadow-md shadow-[#a7f3d0] transition hover:bg-[#013720] active:scale-95 sm:h-12 sm:min-w-[136px] sm:px-6 sm:text-sm"
                >
                  <ShoppingCart className="size-4 sm:size-4.5" />
                  Add
                </button>
              )}
            </div>

            {galleryImages.length > 1 ? (
              <div className="mt-6 sm:mt-8">
                <p className="text-xs font-bold text-zinc-500">More Photos</p>
                <div className="mt-2 flex gap-2">
                  {galleryImages.map((url, index) => (
                    <button
                      type="button"
                      key={url}
                      onClick={() => setActiveImage(url)}
                      aria-label={`Show photo ${index + 1} of ${product.name}`}
                      className={`grid size-16 shrink-0 place-items-center overflow-hidden rounded-lg bg-[#fbfbfa] ring-2 transition sm:size-20 ${
                        activeImage === url
                          ? "ring-[#025632]"
                          : "ring-zinc-100 hover:ring-zinc-300"
                      }`}
                    >
                      <Image
                        src={url}
                        alt={`${product.name} photo ${index + 1}`}
                        width={72}
                        height={72}
                        className="h-full w-full object-contain p-1.5"
                      />
                    </button>
                  ))}
                </div>
              </div>
            ) : null}

            <div className="mt-6 overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-sm">
              <div className="border-b border-zinc-200 bg-zinc-50 p-2.5 sm:p-3">
                <div className="grid grid-cols-3 gap-2 text-[11px] font-semibold sm:text-xs" role="group" aria-label="Product information">
                  {(
                    [
                      { id: "details", label: "Product Details", icon: FileText },
                      { id: "specifications", label: "Specifications", icon: ListChecks },
                      { id: "compatible", label: "Compatible Bikes", icon: Bike },
                    ] as const
                  ).map((tab) => (
                    <button
                      type="button"
                      key={tab.id}
                      aria-pressed={activeTab === tab.id}
                      onClick={() => setActiveTab(tab.id)}
                      className={`flex min-h-14 min-w-0 cursor-pointer flex-col items-center justify-center gap-1.5 rounded-xl border px-1.5 py-3 text-center leading-snug transition-colors sm:flex-row sm:gap-2 sm:px-3 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#c73510] ${
                        activeTab === tab.id
                          ? "border-[#c73510] bg-[#c73510] text-white shadow-sm"
                          : "border-zinc-300 bg-white text-[#394563] shadow-sm hover:border-[#c73510] hover:bg-[#ecfdf5] hover:text-[#a82d0d]"
                      }`}
                    >
                      <tab.icon className="size-4 shrink-0" aria-hidden="true" />
                      <span className="min-w-0 break-words">{tab.label}</span>
                    </button>
                  ))}
                </div>
              </div>
      
              {activeTab === "details" ? (
                <section className="p-4 sm:p-5">
                  <h3 className="text-sm font-black text-[#070e2b] sm:text-lg">About this product</h3>
                  <p className="mt-1.5 max-w-[620px] text-xs leading-5 text-[#394563] sm:mt-2 sm:text-sm">
                    {product.description ||
                      `High-quality ${product.name.toLowerCase()} designed for ${selectedBrand?.name ?? ""} ${selectedModel} ${selectedYear}. Ensures superior performance, durability and smooth engine operation. Manufactured to OEM standards with precision fitment.`}
                  </p>
      
                  <dl className="mt-4 divide-y divide-zinc-100 overflow-hidden rounded-xl border border-zinc-100 text-xs text-[#394563] sm:text-sm">
                    {[
                      ["Brand", product.brand || selectedBrand?.name || null],
                      ["OEM Part Number", product.oemPartNumber],
                      ["SKU", product.sku],
                      ["Product Type", product.productType],
                      ["Material", product.material],
                      ["Position", product.category],
                      ["Pack Includes", product.packIncludes],
                    ]
                      .filter(([, value]) => value)
                      .map(([label, value]) => (
                        <div key={label} className="grid grid-cols-[minmax(0,2fr)_minmax(0,3fr)] gap-3 px-3 py-2.5 odd:bg-zinc-50/80">
                          <dt className="font-medium text-zinc-500">{label}</dt>
                          <dd className="min-w-0 break-words font-medium text-[#070e2b]">{value}</dd>
                        </div>
                      ))}
                  </dl>
      
                  {product.features.length > 0 ? (
                    <div className="mt-4 sm:mt-6">
                      <h4 className="text-[11px] font-bold uppercase tracking-widest text-zinc-500">
                        Key Features
                      </h4>
                      <ul className="mt-3 grid gap-2 text-xs leading-5 text-[#394563] sm:grid-cols-2">
                        {product.features.map((feature, index) => (
                          <li key={index} className="flex items-start gap-2 rounded-lg bg-zinc-50 px-3 py-2"><CheckCircle2 className="mt-0.5 size-4 shrink-0 text-[#025632]" /><span>{feature}</span></li>
                        ))}
                      </ul>
                    </div>
                  ) : null}
                </section>
              ) : null}
      
              {activeTab === "specifications" ? (
                <section className="p-4 sm:p-5">
                  <h3 className="text-sm font-black text-[#070e2b] sm:text-lg">Specifications</h3>
                  <dl className="mt-4 divide-y divide-zinc-100 overflow-hidden rounded-xl border border-zinc-100 text-xs text-[#394563] sm:text-sm">
                    {[
                      ["Brand", product.brand || selectedBrand?.name || null],
                      ["OEM Part Number", product.oemPartNumber],
                      ["SKU", product.sku],
                      ["Product Type", product.productType],
                      ["Material", product.material],
                      ["Position", product.category],
                      ["Pack Includes", product.packIncludes],
                      ["Weight", product.weightKg != null ? `${product.weightKg} kg` : null],
                      ["Warranty", product.warrantyMonths != null ? `${product.warrantyMonths} Months Manufacturer Warranty` : null],
                      ["Country of Origin", product.countryOfOrigin],
                      ["Finish", product.finish],
                      ["Delivery Estimate", formatDeliveryEstimate(product.deliveryDaysMin, product.deliveryDaysMax)],
                      ...product.specifications.map((spec) => [spec.name, spec.value]),
                    ]
                      .filter(([, value]) => value)
                      .map(([label, value], index) => (
                        <div
                          key={`${index}-${label}`}
                          className="grid grid-cols-[minmax(0,2fr)_minmax(0,3fr)] gap-3 px-3 py-3 odd:bg-zinc-50/80"
                        >
                          <dt className="font-medium text-zinc-500">{label}</dt>
                          <dd className="min-w-0 break-words font-medium text-[#070e2b]">{value}</dd>
                        </div>
                      ))}
                  </dl>
                </section>
              ) : null}
      
              {activeTab === "compatible" ? (
                <section className="p-4 sm:p-5">
                  <h3 className="text-sm font-black text-[#070e2b] sm:text-lg">Compatible Bikes</h3>
                  <p className="mt-1 text-xs text-[#53607e] sm:text-sm">
                    {productBrandData
                      ? `This part fits the following ${productBrandData.name} models.`
                      : "Select a bike to see compatible models."}
                  </p>
      
                  {product.compatibleVehicles.length > 0 ? (
                    <div className="mt-3 grid grid-cols-2 gap-2 sm:mt-4 sm:grid-cols-3 sm:gap-3">
                      {product.compatibleVehicles.map((vehicle, index) => {
                        const isCurrent =
                          vehicle.model === selectedModel &&
                          (!selectedBrand || vehicle.brand === selectedBrand.name);
                        const details = [vehicle.variant, vehicle.yearRange].filter(Boolean).join(", ");
                        const vehicleImage =
                          brandModels[vehicle.brand as keyof typeof brandModels]?.find(
                            (known) => known.name === vehicle.model
                          )?.image ??
                          brands.find((known) => known.name === vehicle.brand)?.image ??
                          "/assets/home/bike-honda.png";
      
                        return (
                          <div
                            key={index}
                            className={`flex flex-col items-center gap-2 rounded-lg border p-3 text-center ${
                              isCurrent ? "border-[#025632] bg-[#e9fef5]" : "border-zinc-200"
                            }`}
                          >
                            <span className="relative h-14 w-full">
                              <Image
                                src={vehicleImage}
                                alt={`${vehicle.brand} ${vehicle.model}`}
                                width={140}
                                height={100}
                                className="h-full w-full object-contain"
                              />
                            </span>
                            <span className="min-w-0">
                              <span className="line-clamp-1 text-xs font-bold text-[#070e2b]">
                                {vehicle.brand} {vehicle.model}
                              </span>
                              {details ? (
                                <span className="line-clamp-1 text-[10px] text-zinc-500">{details}</span>
                              ) : null}
                            </span>
                            <span className="flex items-center gap-1 text-[10px] font-bold text-emerald-600">
                              <CheckCircle2 className="size-3" />
                              {isCurrent ? "Your bike" : "Compatible"}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  ) : compatibleModels.length === 0 ? (
                    <p className="mt-3 text-xs text-zinc-500 sm:mt-4 sm:text-sm">
                      No compatibility data available for this brand yet.
                    </p>
                  ) : (
                    <div className="mt-3 grid grid-cols-2 gap-2 sm:mt-4 sm:grid-cols-3 sm:gap-3">
                      {compatibleModels.map((model) => {
                        const isCurrent = model.name === selectedModel;
      
                        return (
                          <div
                            key={model.name}
                            className={`flex flex-col items-center gap-2 rounded-lg border p-3 text-center ${
                              isCurrent
                                ? "border-[#025632] bg-[#e9fef5]"
                                : "border-zinc-200"
                            }`}
                          >
                            <span className="relative h-14 w-full">
                              <Image
                                src={model.image}
                                alt={model.name}
                                width={140}
                                height={100}
                                className="h-full w-full object-contain"
                              />
                            </span>
                            <span className="line-clamp-1 text-xs font-bold text-[#070e2b]">
                              {model.name}
                            </span>
                            <span className="flex items-center gap-1 text-[10px] font-bold text-emerald-600">
                              <CheckCircle2 className="size-3" />
                              {isCurrent ? "Your bike" : "Compatible"}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </section>
              ) : null}
            </div>
          </div>
        </div>
        <ProductReviews key={product.id} listingId={product.id} />
      </div>
    </div>
  );
}
