import { randomUUID } from "node:crypto";

/**
 * Generates a safe, server-side object key. The client-supplied filename is
 * never used as (or folded into) the path — only its validated extension is,
 * so nothing like `../../`, an absolute path, or embedded slashes from a
 * browser filename can ever reach storage.
 */
export function generateProductImageKey(ext: string): string {
  const now = new Date();
  const yyyy = now.getUTCFullYear();
  const mm = String(now.getUTCMonth() + 1).padStart(2, "0");
  return `products/${yyyy}/${mm}/${randomUUID()}${ext}`;
}

/**
 * Derives the object key from a URL only when it's guaranteed to sit under
 * the products/ prefix of our configured public base URL — this lets deletion work
 * without a schema change (Fix 7 option B), and it's also what stops an
 * arbitrary externally-supplied URL from ever being deleted: anything that
 * outside that exact base and product prefix comes back null and is left alone.
 */
export function deriveOwnedObjectKey(url: string, publicBaseUrl: string): string | null {
  const prefix = `${publicBaseUrl}/`;
  if (!url.startsWith(prefix)) {
    return null;
  }
  const key = url.slice(prefix.length);
  if (!key || !key.startsWith("products/") || key.includes("..") || key.startsWith("/")) {
    return null;
  }
  return key;
}
