/** Accepts a plain number/string or a Prisma Decimal (or anything decimal-like). */
export function formatInr(value: number | string | { toString(): string }) {
  return `₹${Number(value.toString()).toLocaleString("en-IN")}`;
}
