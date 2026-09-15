"use client";

import Image from "next/image";
import { ArrowRight, Bike, ChevronDown, CircleDot, Truck, X } from "lucide-react";
import type { BikeHotspot } from "./types";
import { bikeHotspots, brandModels, brands, carouselBrands, initialCarouselBrandIndex } from "./constants";

export function BrandLogo({
  logo,
  name,
  color,
}: {
  logo: string;
  name: string;
  color: string;
}) {
  const baseClass = "block h-12 w-full max-w-[120px]";

  if (name === "Honda") {
    return (
      <svg viewBox="0 0 150 70" role="img" aria-label="Honda" className={baseClass}>
        <path d="M24 39 112 7 94 26 47 41 87 39 74 52H28Z" fill="#e60012" />
        <text x="75" y="64" textAnchor="middle" fontSize="22" fontWeight="900" fill="#e60012" fontFamily="Arial Black, Arial">
          HONDA
        </text>
      </svg>
    );
  }

  if (name === "Hero") {
    return (
      <svg viewBox="0 0 150 70" role="img" aria-label="Hero" className={baseClass}>
        <path d="M55 8v30l19-13V55H60L40 42V12Z" fill="#e30613" />
        <path d="M84 8v47h20V36L88 26l18-12V8Z" fill="#111827" />
        <text x="75" y="66" textAnchor="middle" fontSize="24" fontWeight="900" fill="#e30613" fontFamily="Arial Black, Arial">
          Hero
        </text>
      </svg>
    );
  }

  if (name === "TVS") {
    return (
      <svg viewBox="0 0 150 70" role="img" aria-label="TVS" className={baseClass}>
        <path d="M96 15c15-1 24 4 34 12-13-3-24-1-34 6l18 6-30 3 13-10-18-9c7-4 12-7 17-8Z" fill="#e60012" />
        <text x="56" y="53" fontSize="35" fontStyle="italic" fontWeight="900" fill="#174ea6" fontFamily="Arial Black, Arial">
          TVS
        </text>
      </svg>
    );
  }

  if (name === "Bajaj") {
    return (
      <svg viewBox="0 0 150 70" role="img" aria-label="Bajaj" className={baseClass}>
        <path d="M75 5 113 24 75 43 37 24Z" fill="#0057b8" />
        <path d="M75 16 96 26 75 36 54 26Z" fill="#fff" />
        <path d="M75 29 113 48 75 67 37 48Z" fill="#0057b8" />
        <path d="M75 40 96 50 75 60 54 50Z" fill="#fff" />
      </svg>
    );
  }

  if (name === "Yamaha") {
    return (
      <svg viewBox="0 0 150 70" role="img" aria-label="Yamaha" className={baseClass}>
        <circle cx="75" cy="25" r="22" fill="none" stroke="#e60012" strokeWidth="5" />
        <path d="M75 10v30M60 18l30 17M90 18 60 35" stroke="#e60012" strokeWidth="4" strokeLinecap="round" />
        <text x="75" y="64" textAnchor="middle" fontSize="22" fontWeight="900" fill="#e60012" fontFamily="Arial Black, Arial">
          YAMAHA
        </text>
      </svg>
    );
  }

  if (name === "Royal Enfield") {
    return (
      <svg viewBox="0 0 150 70" role="img" aria-label="Royal Enfield" className={baseClass}>
        <text x="75" y="30" textAnchor="middle" fontSize="28" fontWeight="900" fill="#b92608" fontFamily="Georgia, serif">
          Royal
        </text>
        <text x="75" y="57" textAnchor="middle" fontSize="28" fontWeight="900" fill="#b92608" fontFamily="Georgia, serif">
          Enfield
        </text>
      </svg>
    );
  }

  if (name === "Suzuki") {
    return (
      <svg viewBox="0 0 150 70" role="img" aria-label="Suzuki" className={baseClass}>
        <path d="M68 5 102 22 80 34 103 48 70 65 41 49 63 36 40 22Z" fill="#e60012" />
        <text x="96" y="55" textAnchor="middle" fontSize="23" fontWeight="900" fill="#0646ad" fontFamily="Arial Black, Arial">
          SUZUKI
        </text>
      </svg>
    );
  }

  if (name === "KTM") {
    return (
      <svg viewBox="0 0 150 70" role="img" aria-label="KTM" className={baseClass}>
        <text x="75" y="48" textAnchor="middle" fontSize="43" fontStyle="italic" fontWeight="900" fill="#f05a1a" fontFamily="Arial Black, Arial">
          KTM
        </text>
      </svg>
    );
  }

  if (name === "Jawa") {
    return (
      <svg viewBox="0 0 150 70" role="img" aria-label="Jawa" className={baseClass}>
        <ellipse cx="75" cy="34" rx="50" ry="24" fill="none" stroke="#b40010" strokeWidth="5" />
        <text x="75" y="44" textAnchor="middle" fontSize="26" fontWeight="900" fill="#b40010" fontFamily="Arial Black, Arial">
          JAWA
        </text>
      </svg>
    );
  }

  if (name === "Aprilia") {
    return (
      <svg viewBox="0 0 150 70" role="img" aria-label="Aprilia" className={baseClass}>
        <text x="75" y="45" textAnchor="middle" fontSize="32" fontWeight="900" fill="#e30613" fontFamily="Arial Black, Arial">
          aprilia
        </text>
      </svg>
    );
  }

  if (name === "Kawasaki") {
    return (
      <svg viewBox="0 0 150 70" role="img" aria-label="Kawasaki" className={baseClass}>
        <text x="75" y="45" textAnchor="middle" fontSize="30" fontWeight="900" fill="#111" fontFamily="Arial Black, Arial">
          Kawasaki
        </text>
      </svg>
    );
  }

  if (name === "BMW") {
    return (
      <svg viewBox="0 0 150 70" role="img" aria-label="BMW" className={baseClass}>
        <circle cx="75" cy="35" r="30" fill="#111" />
        <circle cx="75" cy="35" r="22" fill="#fff" />
        <path d="M75 13a22 22 0 0 1 22 22H75Z" fill="#1d66d1" />
        <path d="M75 35v22a22 22 0 0 1-22-22Z" fill="#1d66d1" />
        <text x="75" y="39" textAnchor="middle" fontSize="12" fontWeight="900" fill="#111" fontFamily="Arial Black, Arial">
          BMW
        </text>
      </svg>
    );
  }

  return (
    <span className={`flex h-12 items-center justify-center text-center text-2xl font-black leading-none ${color}`}>
      {logo}
    </span>
  );
}


export function BrandSelectionModal({
  isOpen,
  selectedBrand,
  filteredBrands,
  onClose,
  onSelect,
}: {
  isOpen: boolean;
  selectedBrand: string | null;
  filteredBrands: typeof brands;
  onClose: () => void;
  onSelect: (brand: string) => void;
}) {
  if (!isOpen) {
    return null;
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-zinc-950/55 px-4 py-6 backdrop-blur-[1px]"
      onClick={onClose}
    >
      <div
        className="modal-scrollbar relative max-h-[92vh] w-full max-w-[980px] overflow-y-auto rounded-xl bg-white p-5 shadow-2xl shadow-zinc-950/25 ring-1 ring-zinc-200 sm:p-6"
        onClick={(event) => event.stopPropagation()}
      >
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="absolute right-3 top-3 z-10 grid size-9 place-items-center rounded-full text-zinc-500 transition hover:bg-zinc-100 hover:text-zinc-950 sm:right-4 sm:top-4"
        >
          <X className="size-5" />
        </button>

        <div className="pr-10">
          <h2 className="text-2xl font-black tracking-tight text-zinc-950">
            Bike Brand
          </h2>
          <p className="mt-1 text-sm text-zinc-600">
            Choose your bike brand to find compatible parts
          </p>
        </div>

        {/* <div className="mt-6 flex items-center justify-between gap-3">
          <h3 className="text-base font-black text-zinc-950">
            Popular Brands
          </h3>
          <button
            type="button"
            className="inline-flex items-center gap-1.5 text-sm font-bold text-[#ff3f16] transition hover:text-[#d92f0c]"
          >
            View all brands
            <ArrowRight className="size-4" />
          </button>
        </div> */}

        <div className="mt-4 grid grid-cols-3 gap-3 lg:grid-cols-6">
          {filteredBrands.map((brand) => (
            <button
              type="button"
              key={brand.name}
              onClick={() => onSelect(brand.name)}
              className={`group flex h-28 flex-col items-center justify-center gap-2 rounded-lg border bg-white p-2 text-center shadow-sm transition hover:-translate-y-0.5 hover:border-[#025632] hover:shadow-md sm:p-3 ${
                selectedBrand === brand.name
                  ? "border-[#025632] ring-2 ring-[#025632]/15"
                  : "border-zinc-200"
              }`}
            >
              <BrandLogo
                logo={brand.modalLogo}
                name={brand.name}
                color={brand.color}
              />
              <span className="text-sm font-semibold text-zinc-950">
                {brand.name}
              </span>
            </button>
          ))}
        </div>

        {filteredBrands.length === 0 ? (
          <div className="mt-4 rounded-lg border border-dashed border-zinc-300 px-4 py-8 text-center text-sm text-zinc-500">
            No brands found
          </div>
        ) : null}

        {/* <div className="mt-8 grid gap-3 sm:grid-cols-3">
          {[
            {
              title: "100% Genuine Parts",
              caption: "OEM & Trusted Brands",
              icon: ShieldCheck,
            },
            {
              title: "Fast Delivery",
              caption: "Across India",
              icon: Truck,
            },
            {
              title: "Expert Support",
              caption: "Always Here to Help",
              icon: Headphones,
            },
          ].map((item) => {
            const Icon = item.icon;

            return (
              <div
                key={item.title}
                className="flex min-h-16 items-center gap-3 rounded-lg bg-zinc-50 px-4 ring-1 ring-zinc-100"
              >
                <Icon className="size-6 shrink-0 text-zinc-950" />
                <span>
                  <span className="block text-sm font-extrabold text-zinc-950">
                    {item.title}
                  </span>
                  <span className="block text-xs text-zinc-500">
                    {item.caption}
                  </span>
                </span>
              </div>
            );
          })}
        </div> */}
      </div>
    </div>
  );
}


export function ModelSelectionModal({
  isOpen,
  selectedBrand,
  selectedModel,
  filteredModels,
  onClose,
  onBack,
  onSelect,
}: {
  isOpen: boolean;
  selectedBrand: (typeof brands)[number] | undefined;
  selectedModel: string | null;
  filteredModels: Array<{ name: string; image: string }>;
  onClose: () => void;
  onBack: () => void;
  onSelect: (model: string) => void;
}) {
  if (!isOpen || !selectedBrand) {
    return null;
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-zinc-950/55 px-4 py-6 backdrop-blur-[1px]"
      onClick={onClose}
    >
      <div
        className="modal-scrollbar relative max-h-[92vh] w-full max-w-[640px] overflow-y-auto rounded-xl bg-white p-5 shadow-2xl shadow-zinc-950/25 ring-1 ring-zinc-200 sm:p-6"
        onClick={(event) => event.stopPropagation()}
      >
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="absolute right-3 top-3 z-10 grid size-9 place-items-center rounded-full text-zinc-500 transition hover:bg-zinc-100 hover:text-zinc-950 sm:right-4 sm:top-4"
        >
          <X className="size-5" />
        </button>

        <div className="flex items-center justify-between gap-3 pr-10">
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={onBack}
              className="inline-flex h-9 items-center gap-2 rounded-lg px-2 text-sm font-bold text-zinc-900 transition hover:bg-zinc-100"
            >
              <ArrowRight className="size-4 rotate-180" />
              Change Brand
            </button>
          </div>

          <h2 className="text-xl font-black tracking-tight text-zinc-950 sm:text-2xl">
            Bike Model
          </h2>
        </div>

        <div className="mt-5 flex items-center justify-between gap-4 rounded-lg bg-zinc-50 px-4 py-4 ring-1 ring-zinc-100">
          <div className="flex min-w-0 items-center gap-4">
            <span className="flex h-14 w-24 shrink-0 items-center justify-center overflow-hidden">
              <BrandLogo
                logo={selectedBrand.modalLogo}
                name={selectedBrand.name}
                color={selectedBrand.color}
              />
            </span>
            <span className="min-w-0">
              <span className="block truncate text-lg font-black text-zinc-950">
                {selectedBrand.name}
              </span>
              <span className="block text-sm text-zinc-600">
                Choose your bike model
              </span>
            </span>
          </div>
        </div>

        {/* <h3 className="mt-5 text-base font-black text-zinc-950">
          Popular Models
        </h3> */}

        <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {filteredModels.map((model) => (
            <button
              type="button"
              key={model.name}
              onClick={() => onSelect(model.name)}
              className={`group flex h-24 flex-col items-center justify-between rounded-lg border bg-white p-2 text-center shadow-sm transition hover:-translate-y-0.5 hover:border-[#025632] hover:shadow-md sm:h-28 ${
                selectedModel === model.name
                  ? "border-[#025632] ring-2 ring-[#025632]/15"
                  : "border-zinc-200"
              }`}
            >
              <span className="relative h-14 w-full sm:h-16">
                <Image
                  src={model.image}
                  alt={`${model.name} model`}
                  width={260}
                  height={180}
                  className="h-full w-full object-contain transition group-hover:scale-105"
                />
              </span>
              <span className="line-clamp-1 text-xs font-bold text-zinc-950">
                {model.name}
              </span>
            </button>
          ))}
        </div>

        {filteredModels.length === 0 ? (
          <div className="mt-4 rounded-lg border border-dashed border-zinc-300 px-4 py-8 text-center text-sm text-zinc-500">
            No models found
          </div>
        ) : null}

        {/* <div className="mt-4 flex items-center gap-3 rounded-lg bg-zinc-50 px-4 py-3 ring-1 ring-zinc-100">
          <CircleDot className="size-5 shrink-0 text-zinc-900" />
          <span>
            <span className="block text-sm font-extrabold text-zinc-950">
              Can&apos;t find your model?
            </span>
            <span className="block text-xs text-zinc-500">
              Try searching or select a different brand.
            </span>
          </span>
        </div> */}
      </div>
    </div>
  );
}


export function BikePartsModal({
  isOpen,
  selectedBrand,
  selectedModel,
  selectedYear,
  modelImage,
  onClose,
  onChangeBike,
  onSelectPart,
}: {
  isOpen: boolean;
  selectedBrand: (typeof brands)[number] | undefined;
  selectedModel: string;
  selectedYear: string;
  modelImage: string;
  onClose: () => void;
  onChangeBike: () => void;
  onSelectPart: (part: string) => void;
}) {
  if (!isOpen) {
    return null;
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-zinc-950/55 px-4 py-6 backdrop-blur-[1px]"
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-[920px] rounded-xl bg-white p-5 shadow-2xl shadow-zinc-950/25 ring-1 ring-zinc-200 sm:p-6"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <h2 className="text-xl font-black tracking-tight text-zinc-950 sm:text-2xl">
              Select a Part for Your Bike
            </h2>
            <p className="mt-1 text-sm text-zinc-600">
              Click on any part of the bike to explore related genuine parts
            </p>
          </div>

          <div className="flex shrink-0 items-center gap-2">
            <button
              type="button"
              onClick={onChangeBike}
              className="hidden h-9 items-center gap-1.5 whitespace-nowrap rounded-lg border border-zinc-200 px-3 text-sm font-bold text-zinc-950 transition hover:border-[#025632] hover:text-[#025632] sm:inline-flex"
            >
              {selectedBrand?.name} {selectedModel} {selectedYear}
              <ChevronDown className="size-4" />
            </button>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close"
              className="grid size-9 shrink-0 place-items-center rounded-full text-zinc-950 transition hover:bg-zinc-100"
            >
              <X className="size-5" />
            </button>
          </div>
        </div>

        <div className="relative mx-auto mt-5 aspect-square w-full max-w-[620px] sm:aspect-[4/3]">
          <svg
            className="pointer-events-none absolute inset-0 h-full w-full"
            viewBox="0 0 100 100"
            preserveAspectRatio="none"
          >
            {bikeHotspots.map((hotspot) => (
              <line
                key={hotspot.name}
                x1={hotspot.dot.x}
                y1={hotspot.dot.y}
                x2={hotspot.label.x}
                y2={hotspot.label.y}
                stroke="#93c5fd"
                strokeWidth={0.35}
              />
            ))}
          </svg>

          <div className="absolute inset-0 grid place-items-center">
            <Image
              key={modelImage}
              src={modelImage}
              alt={`${selectedBrand?.name ?? "Bike"} ${selectedModel}`}
              width={480}
              height={360}
              className="h-full w-full object-contain"
              priority
            />
          </div>

          {bikeHotspots.map((hotspot) => (
            <span
              key={`dot-${hotspot.name}`}
              className="absolute size-2 -translate-x-1/2 -translate-y-1/2 rounded-full border border-white bg-blue-600 shadow sm:size-3 sm:border-2"
              style={{ left: `${hotspot.dot.x}%`, top: `${hotspot.dot.y}%` }}
            />
          ))}

          {bikeHotspots.map((hotspot) => (
            <button
              type="button"
              key={hotspot.name}
              onClick={() => onSelectPart(hotspot.name)}
              className="absolute -translate-x-1/2 -translate-y-1/2 whitespace-nowrap rounded-full border border-zinc-200 bg-white px-1.5 py-0.5 text-[8px] font-bold leading-tight text-zinc-950 shadow-md transition hover:border-[#025632] hover:text-[#025632] hover:shadow-lg sm:px-3 sm:py-1.5 sm:text-xs"
              style={{ left: `${hotspot.label.x}%`, top: `${hotspot.label.y}%` }}
            >
              {hotspot.name}
            </button>
          ))}
        </div>

        <button
          type="button"
          onClick={onChangeBike}
          className="mt-4 inline-flex h-9 w-full items-center justify-center gap-1.5 rounded-lg border border-zinc-200 px-3 text-sm font-bold text-zinc-950 transition hover:border-[#025632] hover:text-[#025632] sm:hidden"
        >
          {selectedBrand?.name} {selectedModel} {selectedYear}
          <ChevronDown className="size-4" />
        </button>
      </div>
    </div>
  );
}

