// Per-IP rate limiting for the public /api/search endpoint. Thin,
// search-specific wrapper over the shared application-wide limiter in
// lib/security/rate-limit.ts (see Fix 9) — search just needs its own
// threshold and fail-open policy, not a separate connection-management
// implementation.
import { getClientIp } from "@/lib/security/client-ip";
import { assertRateLimit, RateLimitExceededError } from "@/lib/security/rate-limit";

export { getClientIp };

export class SearchRateLimitError extends Error {}

// Generous — search is read-only and far lower-risk than OTP/SMS abuse.
const SEARCH_LIMIT = 120;
const SEARCH_WINDOW_MS = 60_000;

/**
 * Unlike OTP (which fails closed when Redis is unavailable, since letting
 * SMS spam through is expensive), search fails *open* on a Redis outage —
 * temporarily unlimited search is a much smaller risk than making the whole
 * storefront's search unavailable because of an unrelated Redis blip.
 */
export async function assertSearchRateLimit(ip: string): Promise<void> {
  try {
    await assertRateLimit(`search:ip:${ip}`, { limit: SEARCH_LIMIT, windowMs: SEARCH_WINDOW_MS }, { failClosed: false });
  } catch (error) {
    if (error instanceof RateLimitExceededError) throw new SearchRateLimitError(error.message);
    throw error;
  }
}
