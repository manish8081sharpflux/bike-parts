import type { NextConfig } from "next";
import { PRODUCT_FORM_BODY_LIMIT_BYTES } from "./lib/storage/image-validation";
import { buildSecurityHeaders } from "./lib/security/headers";

// Product images served by <Image> can come from our configured R2 public
// URL (see lib/storage/config.ts) in addition to same-origin /uploads-dev
// and /assets paths. Restrict remotePatterns to that exact host — never a
// wildcard — so <Image> can't be pointed at an arbitrary external host.
const r2PublicUrl = process.env.CLOUDFLARE_R2_PUBLIC_URL;
const r2RemotePattern = (() => {
  if (!r2PublicUrl) return null;
  try {
    const url = new URL(r2PublicUrl);
    return {
      protocol: url.protocol.replace(":", "") as "http" | "https",
      hostname: url.hostname,
      pathname: "/**",
    };
  } catch {
    return null;
  }
})();

const nextConfig: NextConfig = {
  poweredByHeader: false,
  devIndicators: false,
  async headers() {
    return [
      { source: "/:path*", headers: buildSecurityHeaders(process.env.NODE_ENV === "production") },
      { source: "/admin/:path*", headers: [{ key: "Cache-Control", value: "no-store" }] },
      { source: "/api/auth/:path*", headers: [{ key: "Cache-Control", value: "no-store" }] },
    ];
  },
  images: {
    remotePatterns: r2RemotePattern ? [r2RemotePattern] : [],
  },
  // Lets you open the dev server from a phone on the same Wi-Fi (e.g.
  // http://192.168.0.101:3000) — without this, Next.js blocks cross-origin
  // dev requests, so the page loads but never hydrates (clicks do nothing).
  allowedDevOrigins: ["192.168.0.101"],
  experimental: {
    serverActions: {
      // One main image plus five gallery uploads total at most 24 MB,
      // leaving 8 MB for multipart overhead and other product fields.
      bodySizeLimit: PRODUCT_FORM_BODY_LIMIT_BYTES,
    },
  },
  // Explicit (empty) config tells Next "yes, the webpack config below is
  // intentionally webpack-only" — without this, Turbopack (the dev/build
  // scripts' bundler now) refuses to start at all when it sees a `webpack`
  // key with no matching `turbopack` key. No Turbopack-specific settings are
  // needed: the watchOptions workaround below (ignore e2e/, poll instead of
  // native fs events) was a webpack-only fix — Turbopack only ever watches
  // files actually in the app's real dependency graph (see its docs' "Lazy
  // Bundling"), so standalone scripts under e2e/ were never going to trigger
  // a rebuild there in the first place.
  turbopack: {},
  // Only applies when running with `next dev --webpack` / `next build
  // --webpack` — left harmless here in case webpack mode is ever needed
  // again (e.g. a platform without Turbopack's native bindings — see
  // next.js's own turbopack docs).
  webpack: (config, { dev }) => {
    if (dev) {
      config.watchOptions = {
        ...config.watchOptions,
        // e2e/ holds standalone Playwright scripts run with plain `node`,
        // never imported by the app — without this, editing or running them
        // (screenshots land in e2e/_shots/) triggers a Fast Refresh rebuild
        // mid-test, which can hydrate-error the very page the script is
        // driving.
        ignored: /node_modules|[\\/]e2e[\\/]/,
        aggregateTimeout: 200,
        poll: 1000,
      };
    }

    return config;
  },
};

export default nextConfig;
