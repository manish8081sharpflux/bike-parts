// Security headers, split in two because they have different lifetimes:
//
//  - buildStaticSecurityHeaders(): everything that's the same for every
//    request. Set once via next.config.ts's headers().
//  - buildContentSecurityPolicy(): needs a fresh per-request nonce in
//    production (see proxy.ts), so it's built at request time instead and
//    is NOT also emitted from next.config.ts — there must be exactly one
//    effective CSP header per response.
type Header = { key: string; value: string };

function safeOrigin(raw: string | undefined) {
  if (!raw) return null;
  try {
    const url = new URL(raw);
    return url.protocol === "https:" ? url.origin : null;
  } catch {
    return null;
  }
}

export function buildStaticSecurityHeaders(production: boolean): Header[] {
  const headers: Header[] = [
    { key: "X-Content-Type-Options", value: "nosniff" },
    { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
    { key: "X-Frame-Options", value: "DENY" },
    { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(self), payment=(self)" },
  ];
  if (production) {
    headers.push({ key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains" });
  }
  return headers;
}

/**
 * Production script-src uses a per-request nonce plus 'strict-dynamic'
 * instead of 'unsafe-inline'/'unsafe-eval'. 'strict-dynamic' matters here
 * specifically because of how this app loads third-party script: Razorpay's
 * checkout.js is injected via `document.createElement('script')` +
 * `appendChild` from our own bundle (see app/home/utils.ts's
 * loadRazorpayCheckout) — under 'strict-dynamic', a <script> dynamically
 * inserted by an already-nonce-trusted script stays trusted, in browsers
 * that support it, without needing its origin in the allowlist at all. The
 * explicit `https://checkout.razorpay.com` / PostHog origin entries below
 * are the fallback for browsers that don't support 'strict-dynamic' yet —
 * 'strict-dynamic' makes browsers that DO support it ignore the plain host
 * allowlist, so both are kept together deliberately, matching Next.js's own
 * documented nonce-CSP pattern (see node_modules/next/dist/docs/01-app/
 * 02-guides/content-security-policy.md).
 *
 * Development keeps a simpler 'unsafe-inline'/'unsafe-eval' policy — Next's
 * dev tooling (Fast Refresh, eval-based stack traces) needs it, and dev
 * doesn't need CSP to actually stop anything.
 */
export function buildContentSecurityPolicy(options: {
  production: boolean;
  nonce?: string;
  env?: Record<string, string | undefined>;
}): string {
  const { production, nonce } = options;
  const env = options.env ?? process.env;
  const r2Origin = safeOrigin(env.CLOUDFLARE_R2_PUBLIC_URL);
  const posthogOrigin = safeOrigin(env.NEXT_PUBLIC_POSTHOG_HOST) ?? "https://us.i.posthog.com";

  const scriptSources = production
    ? ["'self'", `'nonce-${nonce}'`, "'strict-dynamic'", "https://checkout.razorpay.com", posthogOrigin]
    : ["'self'", "'unsafe-inline'", "'unsafe-eval'", "https://checkout.razorpay.com", posthogOrigin];

  const connectSources = [
    "'self'",
    posthogOrigin,
    "https://api.razorpay.com",
    "https://*.razorpay.com",
    "https://nominatim.openstreetmap.org",
    ...(production ? [] : ["ws:", "wss:"]),
  ];

  const directives = [
    "default-src 'self'",
    "base-uri 'self'",
    "object-src 'none'",
    "frame-ancestors 'none'",
    "form-action 'self'",
    `script-src ${scriptSources.join(" ")}`,
    "style-src 'self' 'unsafe-inline'",
    "font-src 'self' data:",
    `img-src ${["'self'", "data:", "blob:", r2Origin, "https://*.razorpay.com", "https://*.tile.openstreetmap.org"].filter(Boolean).join(" ")}`,
    `connect-src ${connectSources.join(" ")}`,
    "frame-src https://api.razorpay.com https://*.razorpay.com https://www.openstreetmap.org",
    "worker-src 'self' blob:",
    "manifest-src 'self'",
    ...(production ? ["upgrade-insecure-requests"] : []),
  ];

  return directives.join("; ");
}
