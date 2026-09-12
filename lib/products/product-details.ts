import { z } from "zod";

const text = z.string().trim().max(500);
export const specificationsSchema = z.array(z.object({ name: text, value: text }))
  .max(100)
  .transform((rows) => rows.filter((row) => row.name || row.value))
  .refine((rows) => rows.every((row) => row.name && row.value), "Each specification needs a field name and value.")
  .refine((rows) => new Set(rows.map((row) => row.name.toLowerCase())).size === rows.length, "Specification names must be unique.");
export const vehiclesSchema = z.array(z.object({
  brand: text, model: text, variant: text, yearRange: text,
})).max(100)
  .transform((rows) => rows.filter((row) => Object.values(row).some(Boolean)))
  .refine((rows) => rows.every((row) => row.brand && row.model), "Each vehicle needs a brand and model.")
  .refine((rows) => rows.every((row) => {
    if (!row.yearRange) return true;
    const match = /^(\d{4})(?:\s*-\s*(\d{4}))?$/.exec(row.yearRange);
    return !!match && Number(match[1]) >= 1900 && (!match[2] || Number(match[2]) >= Number(match[1]));
  }), "Use a year or year range such as 2020-2024, with the end after the start.");
export const itemsSchema = z.array(z.object({ value: text })).max(100)
  .transform((rows) => rows.map((row) => row.value).filter(Boolean));
const packageContentSchema = z.union([
  z.object({
    quantity: z.coerce.number().int().min(1).max(100000),
    product: text,
  }).refine((row) => row.product.length > 0, "Each package item needs a product."),
  text,
]);
export function parsePackageContent(value: string) {
  const match = /^(\d+)\s*x\s*(.+)$/i.exec(value.trim());
  return match ? { quantity: Number(match[1]), product: match[2].trim() } : { quantity: 1, product: value.trim() };
}
export const packageContentsSchema = z.array(packageContentSchema).max(100)
  .transform((rows) => rows.map((row) => typeof row === "string"
    ? row.trim()
    : `${row.quantity} X ${row.product.trim()}`).filter(Boolean));
export type Specification = z.infer<typeof specificationsSchema>[number];
export type CompatibleVehicle = z.infer<typeof vehiclesSchema>[number];

export function readProductDetails(formData: FormData) {
  function parse<T>(key: string, schema: z.ZodType<T>): T {
    let input: unknown;
    try { input = JSON.parse(String(formData.get(key) ?? "[]")); }
    catch { throw new Error(`Invalid ${key}.`); }
    const result = schema.safeParse(input);
    if (!result.success) throw new Error(result.error.issues[0]?.message ?? `Invalid ${key}.`);
    return result.data;
  }
  return {
    specifications: parse("specifications", specificationsSchema),
    compatibleVehicles: parse("compatibleVehicles", vehiclesSchema),
    features: parse("features", itemsSchema),
    packageContents: parse("packageContents", packageContentsSchema),
  };
}
