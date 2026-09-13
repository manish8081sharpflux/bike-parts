import { hashRateLimitIdentifier } from "./api-protection";
import { assertRateLimit, clearRateLimit } from "./rate-limit";

const LOGIN_WINDOW_MS = 15 * 60 * 1000;

/**
 * Email-based limiting always applies — it's the primary brute-force
 * protection and doesn't depend on knowing the caller's IP at all. The
 * IP-based bucket is additional defense-in-depth applied only when
 * `getClientIp()` returns a trustworthy address; in direct-exposure mode
 * (no trusted proxy) it's skipped rather than keyed under one shared
 * placeholder, which would let one attacker's login attempts lock out
 * every other admin's login IP bucket at once.
 */
export async function assertAdminLoginRateLimit(email: string, ip: string | null) {
  if (ip) {
    await assertRateLimit(`admin-login:ip:${ip}`, { limit: 10, windowMs: LOGIN_WINDOW_MS }, { failClosed: true });
  }
  await assertRateLimit(`admin-login:email:${hashRateLimitIdentifier(email)}`, { limit: 5, windowMs: LOGIN_WINDOW_MS }, { failClosed: true });
}

export async function clearAdminEmailRateLimit(email: string) {
  await clearRateLimit(`admin-login:email:${hashRateLimitIdentifier(email)}`);
}
