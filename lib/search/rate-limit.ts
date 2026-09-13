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

// Search has no other identity to fall back on — it's genuinely anonymous,
// unauthenticated traffic, unlike checkout/addresses/refunds (which always
// have a session) or OTP/admin-login (which have a phone/email). In
// direct-exposure mode (no trustworthy IP — see lib/security/client-ip.ts),
// every such caller shares this one bucket instead of getting no limit at
// all — but it's sized as a coarse flood backstop for *all* anonymous
// direct traffic combined (50x the per-IP limit), not a per-caller budget,
// so one anonymous caller using their share doesn't meaningfully crowd out
// everyone else the way a tight shared bucket would.
const SEARCH_SHARED_LIMIT = SEARCH_LIMIT * 50;
const SEARCH_SHARED_KEY = "search:shared-anonymous";

/**
 * Unlike OTP (which fails closed when Redis is unavailable, since letting
 * SMS spam through is expensive), search fails *open* on a Redis outage —
 * temporarily unlimited search is a much smaller risk than making the whole
 * storefront's search unavailable because of an unrelated Redis blip.
 */
export async function assertSearchRateLimit(ip: string | null): Promise<void> {
  const key = ip ? `search:ip:${ip}` : SEARCH_SHARED_KEY;
  const limit = ip ? SEARCH_LIMIT : SEARCH_SHARED_LIMIT;
  try {
    await assertRateLimit(key, { limit, windowMs: SEARCH_WINDOW_MS }, { failClosed: false });
  } catch (error) {
    if (error instanceof RateLimitExceededError) throw new SearchRateLimitError(error.message);
    throw error;
  }
}
