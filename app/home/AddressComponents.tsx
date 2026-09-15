"use client";

import { useState } from "react";
import { ArrowRight, CheckCircle2, Loader2, MapPin, Navigation, Pencil, Plus, X } from "lucide-react";
import type { Address } from "./types";
import { addressTypeOptions } from "./constants";
import { buildMapEmbedUrl, getAddressIcon, formatAddressLines } from "./utils";
import { DEFAULT_MAP_CENTER } from "./constants";

export function AddressMapPicker({
  center,
  areaLabel,
  isLocating,
  locationError,
  onUseCurrentLocation,
}: {
  center: { lat: number; lon: number };
  areaLabel: string;
  isLocating: boolean;
  locationError: string | null;
  onUseCurrentLocation: () => void;
}) {
  return (
    <div className="relative flex h-full min-h-[280px] flex-col overflow-hidden bg-[#eef1f2] lg:min-h-full">
      <div className="relative flex-1 overflow-hidden">
        <iframe
          key={`${center.lat},${center.lon}`}
          title="Delivery location map"
          src={buildMapEmbedUrl(center)}
          className="h-full w-full border-0"
          loading="lazy"
        />

        <div className="absolute bottom-3 left-3 right-3 flex flex-col items-start gap-2">
          {locationError ? (
            <span className="rounded-lg bg-red-600 px-3 py-1.5 text-xs font-bold text-white shadow-md">
              {locationError}
            </span>
          ) : null}
          <button
            type="button"
            onClick={onUseCurrentLocation}
            disabled={isLocating}
            className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-white px-3 text-xs font-bold text-[#070e2b] shadow-md transition hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-70"
          >
            {isLocating ? (
              <Loader2 className="size-4 animate-spin text-[#025632]" />
            ) : (
              <Navigation className="size-4 text-[#025632]" />
            )}
            {isLocating ? "Detecting your location..." : "Go to current location"}
          </button>
        </div>
      </div>

      <div className="flex items-center gap-2 border-t border-zinc-200 bg-white px-4 py-3">
        <MapPin className="size-4 shrink-0 text-[#025632]" />
        <span className="min-w-0">
          <span className="block text-[10px] font-medium text-zinc-500">
            Delivering your order to
          </span>
          <span className="block truncate text-sm font-bold text-[#070e2b]">
            {areaLabel || "Enter your area to set a location"}
          </span>
        </span>
      </div>
    </div>
  );
}


export function AddressFormModal({
  initialAddress,
  onClose,
  onSave,
  onDelete,
  isSaving,
  error,
}: {
  initialAddress: Address | null;
  onClose: () => void;
  onSave: (values: {
    label: string;
    flatNo: string;
    floor: string;
    area: string;
    landmark: string;
    city: string;
    pincode: string;
    contactName: string;
    phone: string;
  }) => void;
  onDelete?: (id: string) => void;
  isSaving?: boolean;
  error?: string | null;
}) {
  const [label, setLabel] = useState(initialAddress?.label ?? "Home");
  const [flatNo, setFlatNo] = useState(initialAddress?.flatNo ?? "");
  const [floor, setFloor] = useState(initialAddress?.floor ?? "");
  const [area, setArea] = useState(initialAddress?.area ?? "");
  const [landmark, setLandmark] = useState(initialAddress?.landmark ?? "");
  const [city, setCity] = useState(initialAddress?.city ?? "");
  const [pincode, setPincode] = useState(initialAddress?.pincode ?? "");
  const [contactName, setContactName] = useState(initialAddress?.contactName ?? "");
  const [phone, setPhone] = useState(initialAddress?.phone ?? "");
  const [isLocating, setIsLocating] = useState(false);
  const [locationError, setLocationError] = useState<string | null>(null);
  const [mapCenter, setMapCenter] = useState(DEFAULT_MAP_CENTER);

  const isValid =
    label.trim() !== "" &&
    flatNo.trim() !== "" &&
    area.trim() !== "" &&
    city.trim() !== "" &&
    pincode.trim().length === 6 &&
    contactName.trim() !== "" &&
    /^\d{10}$/.test(phone.trim());

  const handleUseCurrentLocation = () => {
    if (!navigator.geolocation) {
      setLocationError("Location isn't supported on this browser");
      return;
    }

    setLocationError(null);
    setIsLocating(true);

    navigator.geolocation.getCurrentPosition(
      (position) => {
        const { latitude, longitude } = position.coords;
        setMapCenter({ lat: latitude, lon: longitude });

        fetch(
          `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${latitude}&lon=${longitude}`
        )
          .then((response) => (response.ok ? response.json() : null))
          .then((data) => {
            const addr = data?.address ?? {};
            const areaParts = [
              addr.road,
              addr.suburb ?? addr.neighbourhood ?? addr.locality,
            ].filter(Boolean);

            setArea(areaParts.join(", ") || data?.display_name || "");
            setCity(
              addr.city ?? addr.town ?? addr.village ?? addr.state_district ?? ""
            );
            setPincode((addr.postcode ?? "").replace(/\D/g, "").slice(0, 6));
            setLandmark((current) => current || addr.suburb || addr.neighbourhood || "");
          })
          .catch(() => {
            setLocationError("Found your location, but couldn't fetch the address");
          })
          .finally(() => setIsLocating(false));
      },
      (error) => {
        setIsLocating(false);
        setLocationError(
          error.code === error.PERMISSION_DENIED
            ? "Location access denied — allow it in your browser settings"
            : "Couldn't detect your location"
        );
      },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  };

  const handleSave = () => {
    if (!isValid) {
      return;
    }

    onSave({
      label: label.trim(),
      flatNo: flatNo.trim(),
      floor: floor.trim(),
      area: area.trim(),
      landmark: landmark.trim(),
      city: city.trim(),
      pincode: pincode.trim(),
      contactName: contactName.trim(),
      phone: phone.trim(),
    });
  };

  return (
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center bg-zinc-950/55 px-4 py-6 backdrop-blur-[1px]"
      onClick={onClose}
    >
      <div
        className="relative flex w-full max-w-[960px] max-h-[90vh] flex-col overflow-hidden rounded-xl bg-white shadow-2xl shadow-zinc-950/25 ring-1 ring-zinc-200"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex shrink-0 items-center justify-between gap-4 border-b border-zinc-100 px-5 py-4">
          <h2 className="text-lg font-black text-zinc-950">
            {initialAddress ? "Edit Address" : "Enter complete address"}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="grid size-9 shrink-0 place-items-center rounded-full text-zinc-950 transition hover:bg-zinc-100"
          >
            <X className="size-5" />
          </button>
        </div>

        <div className="grid min-h-0 flex-1 grid-cols-1 lg:grid-cols-2">
          <AddressMapPicker
            center={mapCenter}
            areaLabel={area}
            isLocating={isLocating}
            locationError={locationError}
            onUseCurrentLocation={handleUseCurrentLocation}
          />

          <div className="min-h-0 space-y-4 overflow-y-auto p-5">
            <div>
              <span className="mb-2 block text-xs font-bold text-zinc-600">
                Save address as *
              </span>
              <div className="flex flex-wrap gap-2">
                {addressTypeOptions.map((option) => {
                  const Icon = option.icon;
                  const isActive = label === option.label;

                  return (
                    <button
                      type="button"
                      key={option.label}
                      onClick={() => setLabel(option.label)}
                      className={`inline-flex h-9 items-center gap-1.5 rounded-lg border px-3 text-sm font-bold transition ${
                        isActive
                          ? "border-[#025632] bg-[#e9fef5] text-[#025632]"
                          : "border-zinc-200 text-zinc-600 hover:border-zinc-300"
                      }`}
                    >
                      <Icon className="size-4" />
                      {option.label}
                    </button>
                  );
                })}
              </div>
            </div>

            <label className="block">
              <span className="mb-1 block text-xs font-bold text-zinc-600">
                House / Shop No. *
              </span>
              <input
                value={flatNo}
                onChange={(event) => setFlatNo(event.target.value)}
                placeholder="e.g. H.No. 102 or Shop No. 5"
                className="h-11 w-full rounded-lg border border-zinc-200 px-3 text-sm outline-none transition focus:border-[#025632] focus:ring-2 focus:ring-[#025632]/15"
              />
            </label>

            <label className="block">
              <span className="mb-1 block text-xs font-bold text-zinc-600">
                Floor (optional)
              </span>
              <input
                value={floor}
                onChange={(event) => setFloor(event.target.value)}
                placeholder="e.g. 3rd Floor"
                className="h-11 w-full rounded-lg border border-zinc-200 px-3 text-sm outline-none transition focus:border-[#025632] focus:ring-2 focus:ring-[#025632]/15"
              />
            </label>

            <label className="block">
              <span className="mb-1 block text-xs font-bold text-zinc-600">
                Area / Sector / Locality *
              </span>
              <input
                value={area}
                onChange={(event) => setArea(event.target.value)}
                placeholder="e.g. Boring Road, Patna"
                className="h-11 w-full rounded-lg border border-zinc-200 px-3 text-sm outline-none transition focus:border-[#025632] focus:ring-2 focus:ring-[#025632]/15"
              />
            </label>

            <div className="grid grid-cols-2 gap-3">
              <label className="block">
                <span className="mb-1 block text-xs font-bold text-zinc-600">
                  City *
                </span>
                <input
                  value={city}
                  onChange={(event) => setCity(event.target.value)}
                  placeholder="City"
                  className="h-11 w-full rounded-lg border border-zinc-200 px-3 text-sm outline-none transition focus:border-[#025632] focus:ring-2 focus:ring-[#025632]/15"
                />
              </label>
              <label className="block">
                <span className="mb-1 block text-xs font-bold text-zinc-600">
                  Pincode *
                </span>
                <input
                  value={pincode}
                  onChange={(event) =>
                    setPincode(event.target.value.replace(/\D/g, "").slice(0, 6))
                  }
                  inputMode="numeric"
                  placeholder="800001"
                  className="h-11 w-full rounded-lg border border-zinc-200 px-3 text-sm outline-none transition focus:border-[#025632] focus:ring-2 focus:ring-[#025632]/15"
                />
              </label>
            </div>

            <label className="block">
              <span className="mb-1 block text-xs font-bold text-zinc-600">
                Nearby landmark (optional)
              </span>
              <input
                value={landmark}
                onChange={(event) => setLandmark(event.target.value)}
                placeholder="e.g. Near Patna Junction"
                className="h-11 w-full rounded-lg border border-zinc-200 px-3 text-sm outline-none transition focus:border-[#025632] focus:ring-2 focus:ring-[#025632]/15"
              />
            </label>

            <p className="pt-2 text-xs font-bold text-zinc-600">
              Enter your details for seamless delivery experience
            </p>

            <label className="block">
              <span className="mb-1 block text-xs font-bold text-zinc-600">
                Your name *
              </span>
              <input
                value={contactName}
                onChange={(event) => setContactName(event.target.value)}
                placeholder="Full name"
                className="h-11 w-full rounded-lg border border-zinc-200 px-3 text-sm outline-none transition focus:border-[#025632] focus:ring-2 focus:ring-[#025632]/15"
              />
            </label>

            <label className="block">
              <span className="mb-1 block text-xs font-bold text-zinc-600">
                Delivery contact number *
              </span>
              <input
                value={phone}
                onChange={(event) => setPhone(event.target.value.replace(/\D/g, "").slice(0, 10))}
                inputMode="numeric"
                placeholder="10-digit mobile number"
                className="h-11 w-full rounded-lg border border-zinc-200 px-3 text-sm outline-none transition focus:border-[#025632] focus:ring-2 focus:ring-[#025632]/15"
              />
            </label>

            {error ? (
              <p className="rounded-lg bg-red-50 px-3 py-2 text-xs font-bold text-red-600">
                {error}
              </p>
            ) : null}

            <button
              type="button"
              onClick={handleSave}
              disabled={!isValid || isSaving}
              className="flex h-12 w-full items-center justify-center gap-2 rounded-lg bg-[#025632] text-base font-bold text-white shadow-sm shadow-[#a7f3d0] transition hover:bg-[#013720] disabled:cursor-not-allowed disabled:opacity-40"
            >
              {isSaving ? <Loader2 className="size-4 animate-spin" /> : null}
              Save Address
            </button>

            {initialAddress && onDelete ? (
              <button
                type="button"
                onClick={() => onDelete(initialAddress.id)}
                disabled={isSaving}
                className="flex h-10 w-full items-center justify-center gap-2 rounded-lg text-sm font-bold text-red-600 transition hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-40"
              >
                Delete Address
              </button>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}


export function AddressPanel({
  isOpen,
  mode,
  addresses,
  selectedAddressId,
  onSelectAddress,
  onClose,
  onBack,
  onAddNew,
  onEdit,
  onSetDefault,
}: {
  isOpen: boolean;
  mode: "checkout" | "manage";
  addresses: Address[];
  selectedAddressId: string | null;
  onSelectAddress: (address: Address) => void;
  onClose: () => void;
  onBack: () => void;
  onAddNew: () => void;
  onEdit: (id: string) => void;
  onSetDefault?: (address: Address) => void;
}) {
  if (!isOpen) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-[60]">
      <button
        type="button"
        aria-label="Close"
        onClick={onClose}
        className="absolute inset-0 bg-[#07112a]/58 backdrop-blur-[1px]"
      />

      <aside className="absolute right-0 top-0 flex h-full w-full max-w-[420px] flex-col bg-[#fbfbfa] shadow-[-18px_0_45px_rgba(7,17,42,0.2)]">
        <div className="flex items-center gap-3 bg-white px-5 py-4 shadow-[0_4px_16px_rgba(15,23,42,0.05)]">
          {mode === "checkout" ? (
            <button
              type="button"
              onClick={onBack}
              aria-label="Back to cart"
              className="grid size-9 shrink-0 place-items-center rounded-full text-[#070e2b] transition hover:bg-zinc-100"
            >
              <ArrowRight className="size-5 rotate-180" />
            </button>
          ) : null}
          <h2 className="flex-1 text-lg font-black text-[#070e2b]">
            Select Delivery Address
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="grid size-9 shrink-0 place-items-center rounded-full text-[#070e2b] transition hover:bg-zinc-100"
          >
            <X className="size-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-5">
          <button
            type="button"
            onClick={onAddNew}
            className="flex w-full items-center justify-center gap-2 rounded-lg border border-zinc-200 bg-white py-3 text-sm font-bold text-[#025632] transition hover:bg-[#e9fef5]"
          >
            <Plus className="size-4" />
            Add a new address
          </button>

          <h3 className="mb-3 mt-6 text-xs font-black uppercase tracking-wide text-zinc-400">
            Your Saved Addresses
          </h3>

          <div className="space-y-2">
            {addresses.map((address) => {
              const isSelected = selectedAddressId === address.id;
              const { icon: AddressIcon, className: addressIconClassName } =
                getAddressIcon(address.label);
              const { primary, secondary } = formatAddressLines(address);

              return (
                <div
                  role="button"
                  tabIndex={0}
                  key={address.id}
                  onClick={() => onSelectAddress(address)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      onSelectAddress(address);
                    }
                  }}
                  className={`relative block w-full cursor-pointer rounded-xl bg-white p-3 text-left outline-none transition ${
                    isSelected
                      ? "shadow-[0_8px_24px_rgba(2, 86, 50,0.18)] ring-2 ring-[#025632]"
                      : "shadow-[0_6px_18px_rgba(15,23,42,0.06)] ring-1 ring-transparent hover:shadow-[0_10px_24px_rgba(15,23,42,0.09)]"
                  }`}
                >
                  {isSelected ? (
                    <span className="absolute right-3 top-3 grid size-5 place-items-center rounded-full bg-[#025632] text-white">
                      <CheckCircle2 className="size-3.5" />
                    </span>
                  ) : null}

                  <div className="flex items-start gap-2.5">
                    <span
                      className={`grid size-9 shrink-0 place-items-center rounded-lg ${addressIconClassName}`}
                    >
                      <AddressIcon className="size-4.5" />
                    </span>

                    <div className="min-w-0 flex-1 pr-6">
                      <span className="flex items-center gap-2 text-sm font-black text-[#070e2b]">
                        {address.label}
                        {address.isDefault ? (
                          <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-bold text-emerald-600">
                            Default
                          </span>
                        ) : null}
                      </span>

                      <p className="mt-0.5 text-xs leading-4 text-zinc-500">
                        {primary}
                        <br />
                        {secondary}
                      </p>

                      <div className="mt-1.5 flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={(event) => {
                            event.stopPropagation();
                            onEdit(address.id);
                          }}
                          className="inline-flex items-center gap-1 rounded-full bg-zinc-50 px-2 py-0.5 text-[11px] font-bold text-zinc-500 transition hover:bg-[#e9fef5] hover:text-[#025632]"
                        >
                          <Pencil className="size-3" />
                          Edit
                        </button>

                        {!address.isDefault && onSetDefault ? (
                          <button
                            type="button"
                            onClick={(event) => {
                              event.stopPropagation();
                              onSetDefault(address);
                            }}
                            className="inline-flex items-center gap-1 rounded-full bg-zinc-50 px-2 py-0.5 text-[11px] font-bold text-zinc-500 transition hover:bg-emerald-50 hover:text-emerald-600"
                          >
                            Set as default
                          </button>
                        ) : null}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </aside>
    </div>
  );
}

/** Compact inline version of the order-detail page's step tracker, used on each My Orders row. */
