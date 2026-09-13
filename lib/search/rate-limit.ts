// Per-IP rate limiting for the public /api/search endpoint. Reuses the same
// Redis-backed limiter lib/auth/otp-rate-limit.ts already implements
// (connection management, dev in-memory fallback, windowed counting)
// instead of standing up a second, inconsistent one-off limiter — a general
// API-wide rate limiter is planned for Fix 9, so this deliberately stays
// small and search-specific until then.
import { assertOtpRateLimit, getClientIp, OtpRateLimitError, OtpRateLimitUnavailableError } from "@/lib/auth/otp-rate-limit";

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
    await assertOtpRateLimit(`search:ip:${ip}`, SEARCH_LIMIT, SEARCH_WINDOW_MS);
  } catch (error) {
    if (error instanceof OtpRateLimitError) throw new SearchRateLimitError(error.message);
    if (error instanceof OtpRateLimitUnavailableError) return;
    throw error;
  }
}
