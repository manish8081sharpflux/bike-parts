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

export function buildSecurityHeaders(
  production: boolean,
  env: Record<string, string | undefined> = process.env
): Header[] {
  const r2Origin = safeOrigin(env.CLOUDFLARE_R2_PUBLIC_URL);
  const posthogOrigin = safeOrigin(env.NEXT_PUBLIC_POSTHOG_HOST) ?? "https://us.i.posthog.com";
  const scriptSources = ["'self'", "'unsafe-inline'", "https://checkout.razorpay.com", posthogOrigin];
  const connectSources = [
    "'self'",
    posthogOrigin,
    "https://api.razorpay.com",
    "https://*.razorpay.com",
    "https://nominatim.openstreetmap.org",
  ];
  if (!production) {
    scriptSources.push("'unsafe-eval'");
    connectSources.push("ws:", "wss:");
  }

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

  const headers: Header[] = [
    { key: "Content-Security-Policy", value: directives.join("; ") },
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
