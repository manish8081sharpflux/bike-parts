/** Accepts a plain number/string or a Prisma Decimal (or anything decimal-like). */
export function formatInr(value: number | string | { toString(): string }) {
  return `₹${Number(value.toString()).toLocaleString("en-IN")}`;
}

/**
 * A human-readable order label — "DA-20260915-1042" — derived purely from
 * when the order was placed, never a stored counter. That means it needs
 * no migration/backfill and every historical order already has one, but
 * two orders placed in the exact same minute would show the same label;
 * the order's real `id` remains what every link/action actually addresses,
 * this is display-only.
 */
export function formatOrderNumber(placedAt: Date): string {
  const pad = (value: number) => String(value).padStart(2, "0");
  const date = `${placedAt.getFullYear()}${pad(placedAt.getMonth() + 1)}${pad(placedAt.getDate())}`;
  const time = `${pad(placedAt.getHours())}${pad(placedAt.getMinutes())}`;
  return `DA-${date}-${time}`;
}
