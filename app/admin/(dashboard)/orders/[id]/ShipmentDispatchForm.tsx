"use client";
import { AdminActionForm } from "../../admin-feedback";


import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";

type CourierOption = {
  courierCompanyId: string;
  courierName: string;
  rate: number;
  estimatedDeliveryDays: number | null;
};

/**
 * Shared "create shipment" control used for the forward dispatch, the
 * legacy whole-order return, and each partial return's reverse shipment —
 * fetches courier options from `serviceabilityUrl` (see
 * lib/shipping/admin-serviceability.ts) and lets the admin pick one (Part
 * 13, option B) before submitting `action` (a bound server action) with the
 * chosen courierCompanyId. When the package used the configured default
 * parcel size (multiple different products on the shipment — see
 * lib/shipping/package.ts), an explicit confirmation checkbox is required
 * before the button is enabled.
 */
export function ShipmentDispatchForm({
  action,
  serviceabilityUrl,
  submitLabel,
  description,
}: {
  action: (formData: FormData) => void;
  serviceabilityUrl: string;
  submitLabel: string;
  description: string;
}) {
  const [couriers, setCouriers] = useState<CourierOption[] | null>(null);
  const [usesRealDimensions, setUsesRealDimensions] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<string>("");
  const [dimensionsConfirmed, setDimensionsConfirmed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch(serviceabilityUrl)
      .then(async (response) => {
        const data = await response.json().catch(() => ({}));
        if (cancelled) return;
        if (!response.ok) {
          setError(data.error ?? "Could not check courier serviceability.");
          return;
        }
        setCouriers(data.couriers ?? []);
        setUsesRealDimensions(data.usesRealDimensions !== false);
        if (data.couriers?.length) setSelected(data.couriers[0].courierCompanyId);
      })
      .catch(() => {
        if (!cancelled) setError("Could not check courier serviceability. Check your connection and try again.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [serviceabilityUrl]);

  const blockedByDimensions = !usesRealDimensions && !dimensionsConfirmed;

  return (
    <AdminActionForm action={action} className="flex flex-col gap-2">
      <p className="text-xs text-zinc-500">{description}</p>

      {loading ? (
        <p className="flex items-center gap-2 text-xs text-zinc-500">
          <Loader2 className="size-3.5 animate-spin" /> Checking available couriers…
        </p>
      ) : error ? (
        <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs font-medium text-amber-800">
          {error} You can still create the shipment — the provider will pick a courier automatically.
        </p>
      ) : couriers && couriers.length > 0 ? (
        <div className="flex flex-col gap-1.5 rounded-lg border border-zinc-200 p-2">
          <p className="px-1 text-[10px] font-black uppercase tracking-wide text-zinc-400">Available Couriers</p>
          {couriers.map((courier) => (
            <label
              key={courier.courierCompanyId}
              className={`flex cursor-pointer items-center justify-between gap-2 rounded-md px-2 py-1.5 text-xs transition ${
                selected === courier.courierCompanyId ? "bg-[#e9fef5]" : "hover:bg-zinc-50"
              }`}
            >
              <span className="flex items-center gap-2">
                <input
                  type="radio"
                  name="courierCompanyId"
                  value={courier.courierCompanyId}
                  checked={selected === courier.courierCompanyId}
                  onChange={() => setSelected(courier.courierCompanyId)}
                />
                <span className="font-bold text-zinc-800">{courier.courierName}</span>
              </span>
              <span className="text-right text-zinc-500">
                <span className="block font-bold text-zinc-700">₹{courier.rate}</span>
                {courier.estimatedDeliveryDays ? <span className="block text-[10px]">{courier.estimatedDeliveryDays} day(s)</span> : null}
              </span>
            </label>
          ))}
        </div>
      ) : (
        <p className="text-xs text-zinc-500">No courier list available — the provider will pick one automatically.</p>
      )}

      {!usesRealDimensions ? (
        <label className="flex items-start gap-2 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">
          <input
            type="checkbox"
            name="confirmDefaultDimensions"
            checked={dimensionsConfirmed}
            onChange={(event) => setDimensionsConfirmed(event.target.checked)}
            className="mt-0.5"
          />
          <span>
            This shipment has multiple different products — the default parcel size will be used since an accurate
            combined package size isn&apos;t known. Confirm this is acceptable before creating the shipment.
          </span>
        </label>
      ) : null}

      <button
        type="submit"
        disabled={loading || blockedByDimensions}
        className="mt-1 flex h-10 w-full items-center justify-center gap-1.5 rounded-lg bg-[#025632] text-sm font-bold text-white transition hover:bg-[#013720] disabled:cursor-not-allowed disabled:opacity-40"
      >
        {submitLabel}
      </button>
    </AdminActionForm>
  );
}
