/**
 * Returns the client's IP address ONLY when it can be trusted, or `null`
 * when it can't — never a placeholder string. Callers must treat `null` as
 * "no trustworthy per-client identity is available here," not as a value
 * to rate-limit on (see lib/security/api-protection.ts, lib/security/
 * admin-login.ts, lib/auth/otp-rate-limit.ts's callers, and
 * lib/search/rate-limit.ts for how each handles that).
 *
 * Why this can't just read a "real" IP directly: Next.js's `NextRequest.ip`
 * (and `.geo`) was removed in v15.0.0 (this app runs 16.3.4) with no
 * replacement, and the standard Fetch `Request` object App Router Route
 * Handlers/Proxy receive never carried a raw socket address in any Next.js
 * version — that's an intentional platform-portability boundary, not an
 * oversight. There is no framework API in this runtime that hands back a
 * trustworthy direct-connection IP. The only IP-shaped values available at
 * all come from client-settable headers, which is exactly why trusting them
 * is conditional on `TRUST_PROXY_HEADERS`.
 *
 * Forwarded headers (`CF-Connecting-IP`, `X-Forwarded-For`, `X-Real-IP`) are
 * trusted in production only when `TRUST_PROXY_HEADERS=true` — a setting
 * that's only safe when a trusted reverse proxy (Cloudflare/nginx/a load
 * balancer) sits in front of this app, itself setting/sanitizing those
 * headers so a client can never inject its own value directly. Outside
 * production, headers are trusted unconditionally for local development
 * convenience (e.g. simulating different source IPs) — there's no
 * deployment topology to protect in dev.
 */
export function getClientIp(request: Request | { headers: Headers }): string | null {
  const trustProxy = process.env.NODE_ENV !== "production" || process.env.TRUST_PROXY_HEADERS === "true";
  if (!trustProxy) return null;

  const value =
    request.headers.get("cf-connecting-ip")?.trim() ||
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    request.headers.get("x-real-ip")?.trim();

  return value ? value : null;
}
