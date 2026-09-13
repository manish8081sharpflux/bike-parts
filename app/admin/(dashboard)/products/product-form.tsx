"use client";

import { useEffect, useRef, useState } from "react";
import type { InputHTMLAttributes, ReactNode } from "react";
import { useFormStatus } from "react-dom";
import Link from "next/link";
import { Check, ChevronDown, Loader2, Package, Save } from "lucide-react";
import { BRAND_MODELS } from "@/lib/bike-brand-models";
import { MAX_GALLERY_IMAGES, MAX_IMAGE_MB } from "@/lib/storage/image-validation";
import { SUBCATEGORIES_BY_CATEGORY } from "@/lib/product-subcategories";
import { parsePackageContent, type Specification, type CompatibleVehicle } from "@/lib/products/product-details";

const BRANDS = ["Honda", "Hero", "TVS", "Bajaj", "Yamaha", "Royal Enfield", "Suzuki", "KTM", "Jawa", "Aprilia", "Kawasaki", "BMW"];
const CATEGORIES = ["Engine", "Brake System", "Electrical", "Suspension", "Body Parts", "Tyres & Wheels", "Fuel System", "Lighting", "Seat & Comfort", "Handlebar & Controls", "Chain & Sprocket", "Exhaust System"];
type Values = {
  name?: string; brand?: string; category?: string; productType?: string | null; description?: string;
  price?: string | number; gstRate?: string | number; stock?: number; status?: string;
  sku?: string | null; oemPartNumber?: string | null; imageUrl?: string | null; images?: string[];
  specifications?: Specification[]; compatibleVehicles?: CompatibleVehicle[]; compatibleModels?: string[];
  features?: string[]; packageContents?: string[]; packIncludes?: string | null; searchTags?: string[];
  material?: string | null; finish?: string | null; weightKg?: string | number | null;
  warrantyMonths?: number | null; countryOfOrigin?: string | null; offerLabel?: string | null;
};
const inputClass = "w-full min-w-0 rounded-xl border border-zinc-200 bg-white px-3 py-2.5 text-sm font-normal text-zinc-900 shadow-sm outline-none transition placeholder:text-zinc-400 focus:border-[#ff4b1f] focus:ring-2 focus:ring-orange-100 disabled:bg-zinc-50 file:mr-3 file:rounded-lg file:border-0 file:bg-orange-50 file:px-3 file:py-1 file:text-xs file:font-semibold file:text-orange-700";
const buttonClass = "rounded-lg border border-zinc-200 bg-white px-3 py-2 text-xs font-semibold text-zinc-700 transition hover:border-orange-200 hover:bg-orange-50 hover:text-orange-700 focus-visible:outline-2 focus-visible:outline-[#ff4b1f]";
function Field({ label, ...props }: InputHTMLAttributes<HTMLInputElement> & { label: string }) {
  return <label className="flex min-w-0 flex-col gap-1 text-sm font-semibold text-zinc-700"><span>{label}{props.required ? <span className="ml-1 text-[#e63e16]">*</span> : null}</span><input {...props} className={inputClass} /></label>;
}
function Section({ title, description, children }: { title: string; description?: string; children: ReactNode }) {
  return <fieldset className="min-w-0 rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm sm:p-6">
    <legend className="sr-only">{title}</legend>
    <div className="mb-5 border-b border-zinc-100 pb-4">
      <h2 className="text-sm font-bold tracking-tight text-zinc-900">{title}</h2>
      {description ? <p className="mt-1 text-xs leading-5 text-zinc-500">{description}</p> : null}
    </div>
    <div className="space-y-4">{children}</div>
  </fieldset>;
}
function SaveBar({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return <div className="sticky bottom-0 z-30 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-zinc-200 bg-white/95 p-4 shadow-lg backdrop-blur sm:px-6">
    <p className="text-xs text-zinc-500">Review your product information before saving.</p>
    <div className="flex items-center gap-3">
      <Link href="/admin/products" className={buttonClass}>Cancel</Link>
      <button type="submit" disabled={pending} className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-[#ff4b1f] px-5 text-sm font-bold text-white shadow-sm transition hover:bg-[#e63e16] disabled:cursor-wait disabled:opacity-60">
        {pending ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}
        {pending ? "Saving product..." : label}
      </button>
    </div>
  </div>;
}
/**
 * Custom-styled dropdown (a real native <select> looks plain/OS-default and
 * can't be restyled — its open panel is rendered outside the page entirely
 * in most browsers). Submits the same way a select would: a hidden input
 * named `name` carries the current value, kept in sync with what's clicked.
 */
function Select({
  label,
  name,
  options,
  value,
  onChange,
  disabled,
  placeholder,
}: {
  label: string;
  name: string;
  options: string[];
  value: string;
  /** Notified whenever a new option is picked — lets a parent (e.g. Category) drive a dependent field (e.g. Subcategory). */
  onChange?: (value: string) => void;
  /** Greys the control out and blocks opening — used for Subcategory until a Category is chosen. */
  disabled?: boolean;
  placeholder?: string;
}) {
  const [localSelected, setSelected] = useState(value);
  const selected = onChange ? value : localSelected;
  const [open, setOpen] = useState(false);
  const [highlighted, setHighlighted] = useState(0);
  const rootRef = useRef<HTMLDivElement>(null);
  const allOptions = selected && !options.includes(selected) ? [selected, ...options] : options;

  useEffect(() => {
    if (!open) return;
    const handlePointerDown = (event: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handlePointerDown);
    return () => document.removeEventListener("mousedown", handlePointerDown);
  }, [open]);

  const choose = (option: string) => {
    setSelected(option);
    setOpen(false);
    onChange?.(option);
  };

  return (
    <div ref={rootRef} className="relative flex flex-col gap-1 text-sm font-semibold text-zinc-700">
      {label}
      <input type="hidden" name={name} value={selected} />
      <button
        type="button"
        aria-label={label}
        disabled={disabled}
        onClick={() => {
          setHighlighted(Math.max(0, allOptions.indexOf(selected)));
          setOpen((current) => !current);
        }}
        onKeyDown={(event) => {
          if (event.key === "Escape") setOpen(false);
          if (event.key === "ArrowDown" || event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            if (!open) {
              setHighlighted(Math.max(0, allOptions.indexOf(selected)));
              setOpen(true);
            } else if (event.key === "Enter" && allOptions[highlighted]) {
              choose(allOptions[highlighted]);
            } else {
              setHighlighted((current) => Math.min(current + 1, allOptions.length - 1));
            }
          }
          if (event.key === "ArrowUp") {
            event.preventDefault();
            setHighlighted((current) => Math.max(current - 1, 0));
          }
        }}
        aria-haspopup="listbox"
        aria-expanded={open}
        className={`${inputClass} flex items-center justify-between gap-2 text-left font-normal ${
          disabled ? "cursor-not-allowed bg-zinc-50 text-zinc-400" : selected ? "text-zinc-900" : "text-zinc-400"
        }`}
      >
        <span className="truncate">{selected || placeholder || "Select…"}</span>
        <ChevronDown className={`size-4 shrink-0 text-zinc-400 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>

      {open ? (
        <div
          role="listbox"
          className="absolute top-full z-20 mt-1 max-h-64 w-full overflow-auto rounded-lg border border-zinc-200 bg-white py-1 shadow-lg"
        >
          {allOptions.map((option, index) => (
            <button
              type="button"
              key={option}
              role="option"
              aria-selected={option === selected}
              onMouseEnter={() => setHighlighted(index)}
              onClick={() => choose(option)}
              className={`flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm font-normal transition ${
                index === highlighted ? "bg-zinc-50" : ""
              } ${option === selected ? "font-semibold text-zinc-950" : "text-zinc-700"}`}
            >
              <span className="truncate">{option}</span>
              {option === selected ? <Check className="size-4 shrink-0 text-[#ff4b1f]" /> : null}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
type Column = { key: string; label: string; placeholder?: string };
function Rows({ name, columns, initial, addLabel, vehicle = false }: {
  name: string; columns: Column[]; initial: Record<string, string>[]; addLabel: string; vehicle?: boolean;
}) {
  const [rows, setRows] = useState(() => initial.map((value, id) => ({ id, value })));
  const nextId = useRef(initial.length);
  return <div className="space-y-3">
    <input type="hidden" name={name} value={JSON.stringify(rows.map((row) => row.value))} />
    {rows.map((row, index) => <div key={row.id} className="flex flex-wrap items-end gap-2 rounded-lg bg-zinc-50 p-3">
      {columns.map((column) => {
        const options = vehicle && column.key === "brand" ? BRANDS : vehicle && column.key === "model" ? BRAND_MODELS[row.value.brand] ?? [] : [];
        const listId = name + "-" + row.id + "-" + column.key;
        return <div key={column.key} className="min-w-32 flex-1">
          <Field label={column.label} aria-label={column.label + " " + (index + 1)} value={row.value[column.key] ?? ""}
            placeholder={column.placeholder} list={options.length ? listId : undefined}
            onChange={(event) => setRows((current) => current.map((item) => item.id === row.id ? {
              ...item, value: { ...item.value, [column.key]: event.target.value,
                ...(vehicle && column.key === "brand" ? { model: "", variant: "" } : {}) },
            } : item))} />
          {options.length ? <datalist id={listId}>{options.map((option) => <option key={option} value={option} />)}</datalist> : null}
        </div>;
      })}
      <button type="button" className={buttonClass} aria-label={"Remove " + name + " row " + (index + 1)}
        onClick={() => setRows((current) => current.filter((item) => item.id !== row.id))}>Remove</button>
    </div>)}
    <button type="button" className={buttonClass} onClick={() => {
      const id = nextId.current++;
      setRows((current) => [...current, { id, value: Object.fromEntries(columns.map((column) => [column.key, ""])) }]);
    }}>+ {addLabel}</button>
  </div>;
}
export function ProductForm({ action, defaultValues: v = {}, submitLabel }: {
  action: (formData: FormData) => void; defaultValues?: Values; submitLabel: string;
}) {
  const vehicles = v.compatibleVehicles?.length ? v.compatibleVehicles : (v.compatibleModels ?? []).map((model) => ({ brand: v.brand ?? "", model, variant: "", yearRange: "" }));
  const contents = v.packageContents?.length ? v.packageContents : v.packIncludes ? [v.packIncludes] : [];
  // Category drives Subcategory's option list (stored in the existing
  // productType column — see SUBCATEGORIES_BY_CATEGORY). Lifted up here
  // rather than kept local to the Category Select, since Subcategory needs
  // to react to it changing.
  const [category, setCategory] = useState(v.category ?? "");
  const [subcategory, setSubcategory] = useState(v.productType ?? "");
  const subcategoryOptions = SUBCATEGORIES_BY_CATEGORY[category] ?? [];
  return <form action={action} className="flex w-full flex-col gap-5">
    <div className="flex items-center gap-3 rounded-2xl border border-orange-100 bg-orange-50/60 px-5 py-4">
      <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-white text-[#ff4b1f]"><Package className="size-5" /></span>
      <div><p className="text-sm font-semibold text-zinc-900">Build a complete product listing</p><p className="mt-1 text-xs leading-5 text-zinc-500">Add clear photos, accurate specifications and bike compatibility to help customers find the right part.</p></div>
    </div>
    <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
    <div className="min-w-0 space-y-5">
    <Section title="Basic Information" description="Start with the product name and where it belongs in your catalog.">
      <Field label="Product name" name="name" placeholder="e.g. Chain & Sprocket Kit" required defaultValue={v.name} />
      <div className="grid gap-3 sm:grid-cols-2">
        <Select label="Bike" name="brand" options={BRANDS} value={v.brand ?? ""} />
        <Select
          label="Category"
          name="category"
          options={CATEGORIES}
          value={category}
          onChange={(next) => {
            setCategory(next);
            // A subcategory value left over from the previous category
            // (e.g. "Brake Pads" while switching Brake System → Engine)
            // wouldn't make sense anymore — clear it rather than silently
            // keep an invalid combination.
            const validOptions = SUBCATEGORIES_BY_CATEGORY[next] ?? [];
            if (!validOptions.includes(subcategory)) setSubcategory("");
          }}
        />
      </div>
      <Select
        label="Subcategory"
        name="productType"
        options={subcategoryOptions}
        value={subcategory}
        onChange={setSubcategory}
        disabled={!category}
        placeholder={category ? "Select…" : "Pick a category first"}
      />
      <label className="flex flex-col gap-1 text-sm font-semibold text-zinc-700">Description<textarea name="description" defaultValue={v.description} rows={4} placeholder="Describe the part, its purpose and what makes it a good fit." className={inputClass} /></label>
    </Section>
    <Section title="Pricing & Inventory" description="Set the selling price, available stock and listing status."><div className="grid gap-4 sm:grid-cols-2">
      <Field label="Price (₹)" name="price" type="number" min={0} step="0.01" required defaultValue={v.price} />
      <Field label="Stock" name="stock" type="number" min={0} step={1} required defaultValue={v.stock ?? 0} />
      <Field label="GST (%)" name="gstRate" type="number" min={0} max={100} step="0.01" required defaultValue={v.gstRate ?? 18} />
      <Select label="Status" name="status" options={["DRAFT", "ACTIVE", "RESERVED", "SOLD", "ARCHIVED"]} value={v.status ?? "ACTIVE"} />
    </div></Section>
    <Section title="Identification"><div className="grid gap-3 sm:grid-cols-2">
      <Field label="OEM Part Number" name="oemPartNumber" placeholder="06455-KVS-901" defaultValue={v.oemPartNumber ?? ""} />
      <Field label="SKU" name="sku" placeholder="BRK-HON-SHINE-001" defaultValue={v.sku ?? ""} />
    </div></Section>
    </div>
    <div className="min-w-0 space-y-5">
    <Section title="Product Images" description="Use a clear main image and additional angles of the same product.">
      <Field label="Main Image URL" name="imageUrl" placeholder="/assets/... or https://..." defaultValue={v.imageUrl ?? ""} />
      <Field label="Or Upload Main Image" name="imageFile" type="file" accept="image/jpeg,image/png,image/webp" />
      <p className="text-xs text-zinc-500">A main image upload replaces the URL. JPG, PNG, or WEBP, maximum {MAX_IMAGE_MB} MB per image.</p>
      <label className="flex flex-col gap-1 text-sm font-semibold">Gallery Images / Additional Photos
        <textarea name="images" defaultValue={v.images?.join("\n") ?? ""} rows={2} placeholder="One image URL per line" className={inputClass} />
      </label>
      <Field label="Upload Additional Photos" name="imageFiles" type="file" multiple accept="image/jpeg,image/png,image/webp" />
      <p className="text-xs text-zinc-500">Gallery uploads are added to the URLs above. Up to {MAX_GALLERY_IMAGES} gallery images total, including URLs and uploads, plus one separate main image. Maximum {MAX_IMAGE_MB} MB per upload.</p>
    </Section>
    <Section title="Search Tags">
      <label className="flex flex-col gap-1 text-sm font-semibold text-zinc-700">Keywords
        <textarea name="searchTags" defaultValue={v.searchTags?.join("\n") ?? ""} rows={2} placeholder="brake pad, disc pad, front brake pad" className={inputClass} />
      </label><p className="text-xs text-zinc-500">Separate tags with commas or new lines.</p>
    </Section>
    </div>
    </div>
    <Section title="Compatibility" description="Help customers confirm that this part fits their bike.">
      <p className="text-xs text-zinc-500">Each vehicle needs a bike and model. Variant and year range are optional.</p>
      <Rows name="compatibleVehicles" vehicle initial={vehicles} addLabel="Add Vehicle" columns={[
        { key: "brand", label: "Bike", placeholder: "Honda" }, { key: "model", label: "Model", placeholder: "Shine 125" },
        { key: "variant", label: "Variant", placeholder: "Drum Brake" }, { key: "yearRange", label: "Year Range", placeholder: "2020-2024" },
      ]} />
    </Section>
    <div className="grid items-start gap-5 xl:grid-cols-2">
    <Section title="Specifications" description="Add technical details such as voltage, dimensions or chain size.">
      <Rows name="specifications" initial={v.specifications ?? []} addLabel="Add Specification" columns={[
        { key: "name", label: "Field Name", placeholder: "Voltage" }, { key: "value", label: "Value", placeholder: "12V" },
      ]} />
    </Section>
    <Section title="Features" description="Highlight the benefits customers should know about."><Rows name="features" initial={(v.features ?? []).map((value) => ({ value }))} addLabel="Add Feature" columns={[{ key: "value", label: "Feature", placeholder: "Rust Resistant" }]} /></Section>
    </div>
    <Section title="Package Contents" description="Enter how many of each product the package includes.">
      <Rows name="packageContents" initial={contents.map((value) => {
        const item = parsePackageContent(value);
        return { quantity: String(item.quantity), product: item.product };
      })} addLabel="Add Item" columns={[
        { key: "quantity", label: "Quantity", placeholder: "1" },
        { key: "product", label: "Product", placeholder: "Brake Pad" },
      ]} />
    </Section>
    <details className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm"><summary className="cursor-pointer text-sm font-bold text-zinc-800">Additional details <span className="ml-2 text-xs font-normal text-zinc-500">Material, warranty, origin & more</span></summary>
      <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        <Field label="Material" name="material" defaultValue={v.material ?? ""} />
        <Field label="Color / Finish" name="finish" defaultValue={v.finish ?? ""} />
        <Field label="Weight (kg)" name="weightKg" type="number" min={0} step="0.001" defaultValue={v.weightKg ?? ""} />
        <Field label="Warranty (months)" name="warrantyMonths" type="number" min={0} step={1} defaultValue={v.warrantyMonths ?? ""} />
        <Field label="Country of Origin" name="countryOfOrigin" defaultValue={v.countryOfOrigin ?? ""} />
        <Field label="Offer Badge" name="offerLabel" defaultValue={v.offerLabel ?? ""} />
      </div>
    </details>
    <SaveBar label={submitLabel} />
  </form>;
}
