import { z } from "zod";

const platformEnvSchema = z.object({
  DATABASE_URL: z.string().optional(),
  REDIS_URL: z.string().optional(),
  // Search: self-hosted Meilisearch (typesense.org has no native Windows
  // binary and this dev machine has neither Docker nor WSL available for
  // it — Meilisearch ships an actual windows-amd64.exe, run directly, no
  // container). See infra/meilisearch/.
  MEILISEARCH_HOST: z.string().optional(),
  MEILISEARCH_PORT: z.coerce.number().default(7700),
  MEILISEARCH_PROTOCOL: z.enum(["http", "https"]).default("http"),
  MEILISEARCH_API_KEY: z.string().optional(),
  MEILISEARCH_INDEX: z.string().default("bike_parts"),
  // Every Meilisearch HTTP call (search, sync, settings, reindex) is bounded
  // by this — storefront requests must never hang on a slow/wedged search
  // engine. See lib/search/meilisearch-client.ts.
  MEILISEARCH_HTTP_TIMEOUT_MS: z.coerce.number().default(5000),
  CLOUDFLARE_ACCOUNT_ID: z.string().optional(),
  CLOUDFLARE_R2_ACCESS_KEY_ID: z.string().optional(),
  CLOUDFLARE_R2_SECRET_ACCESS_KEY: z.string().optional(),
  CLOUDFLARE_R2_BUCKET: z.string().optional(),
  CLOUDFLARE_R2_PUBLIC_URL: z.string().optional(),
  CLOUDFLARE_IMAGES_ACCOUNT_HASH: z.string().optional(),
  CLOUDFLARE_IMAGES_API_TOKEN: z.string().optional(),
  BETTER_AUTH_SECRET: z.string().optional(),
  BETTER_AUTH_URL: z.string().optional(),
  WHATSAPP_CLOUD_API_TOKEN: z.string().optional(),
  WHATSAPP_PHONE_NUMBER_ID: z.string().optional(),
  FCM_PROJECT_ID: z.string().optional(),
  FCM_CLIENT_EMAIL: z.string().optional(),
  FCM_PRIVATE_KEY: z.string().optional(),
  RESEND_API_KEY: z.string().optional(),
  RESEND_FROM_EMAIL: z.string().optional(),
  RAZORPAY_KEY_ID: z.string().optional(),
  RAZORPAY_KEY_SECRET: z.string().optional(),
  RAZORPAY_WEBHOOK_SECRET: z.string().optional(),
  // Legacy provider — no longer the active shipping provider (see
  // SHIPPING_PROVIDER/SHIPROCKET_* below), kept only so lib/porter.ts can
  // still track/cancel shipments dispatched before the Shiprocket
  // migration (see the migration note on Order.shippingProvider).
  PORTER_API_KEY: z.string().optional(),
  PORTER_API_BASE_URL: z.string().optional(),
  PORTER_CLIENT_ID: z.string().optional(),
  SHIPPING_PROVIDER: z.string().optional(),
  SHIPROCKET_EMAIL: z.string().optional(),
  SHIPROCKET_PASSWORD: z.string().optional(),
  SHIPROCKET_API_BASE_URL: z.string().optional(),
  SHIPROCKET_PICKUP_LOCATION: z.string().optional(),
  ADMIN_EMAIL: z.string().optional(),
  ADMIN_PASSWORD: z.string().optional(),
  ADMIN_SESSION_SECRET: z.string().optional(),
  SENTRY_DSN: z.string().optional(),
  NEXT_PUBLIC_POSTHOG_KEY: z.string().optional(),
  NEXT_PUBLIC_POSTHOG_HOST: z.string().optional(),
});

export type PlatformEnv = z.infer<typeof platformEnvSchema>;

export const platformEnv = platformEnvSchema.parse(process.env);

type ServiceStatus = {
  name: string;
  group: "frontend" | "backend" | "data" | "search" | "cloud" | "growth";
  requiredEnv: Array<keyof PlatformEnv>;
  /**
   * Whether this specific service being unconfigured should make the whole
   * app report unhealthy. Deliberately independent of `requiredEnv.length`
   * — plenty of services below declare required env vars (Sentry, Resend,
   * PostHog, Cloudflare Images, Better Auth, WhatsApp, Firebase, Porter,
   * Meilisearch) without being load-bearing for the marketplace to actually
   * serve customers. Only the handful of services this app cannot safely
   * run production traffic without are `true` — see the health route at
   * app/api/platform/health/route.ts, which sums *only* these into `ok`.
   */
  requiredInProduction: boolean;
  installed: boolean;
  configured: boolean;
  /**
   * Finer-grained than `configured` — distinguishes "nothing set up yet"
   * from "partially set up, likely a mistake" (e.g. SHIPROCKET_EMAIL set
   * without SHIPROCKET_PASSWORD). `configured` above is just
   * `configState === "configured"`, kept for existing callers.
   */
  configState: "configured" | "not_configured" | "misconfigured";
  note: string;
};

function hasAll(keys: Array<keyof PlatformEnv>) {
  return keys.every((key) => Boolean(platformEnv[key]));
}

function computeConfigState(requiredEnv: Array<keyof PlatformEnv>, installed: boolean): ServiceStatus["configState"] {
  if (!installed) return "not_configured";
  if (requiredEnv.length === 0) return "configured";
  const presentCount = requiredEnv.filter((key) => Boolean(platformEnv[key])).length;
  if (presentCount === requiredEnv.length) return "configured";
  if (presentCount === 0) return "not_configured";
  return "misconfigured";
}

export function getPlatformServices(): ServiceStatus[] {
  const services: Array<Omit<ServiceStatus, "configured" | "configState">> = [
    {
      name: "Next.js app router",
      group: "frontend",
      requiredEnv: [],
      requiredInProduction: true,
      installed: true,
      note: "Frontend shell and API route handlers are present.",
    },
    {
      name: "Shadcn UI / Tailwind CSS v4",
      group: "frontend",
      requiredEnv: [],
      requiredInProduction: false,
      installed: true,
      note: "Component registry and global Tailwind tokens are wired.",
    },
    {
      name: "TanStack Query",
      group: "frontend",
      requiredEnv: [],
      requiredInProduction: false,
      installed: true,
      note: "Client query provider powers the search UI.",
    },
    {
      name: "React Hook Form + Zod",
      group: "frontend",
      requiredEnv: [],
      requiredInProduction: false,
      installed: true,
      note: "Search/filter form validation is implemented on the client.",
    },
    {
      name: "Motion",
      group: "frontend",
      requiredEnv: [],
      requiredInProduction: false,
      installed: true,
      note: "Available for interaction polish and page transitions.",
    },
    {
      name: "next-pwa",
      group: "frontend",
      requiredEnv: [],
      requiredInProduction: false,
      installed: true,
      note: "Dependency exists; production runtime config can be enabled later.",
    },
    {
      name: "NestJS backend",
      group: "backend",
      requiredEnv: [],
      requiredInProduction: false,
      installed: false,
      note: "Scaffold notes are in docs; package install was blocked by pnpm memory failures. Not part of the running app — every backend route today is a Next.js API route handler under app/api/.",
    },
    {
      name: "Prisma ORM",
      group: "data",
      requiredEnv: ["DATABASE_URL"],
      // Not independently gated — it's the same DATABASE_URL as the
      // "PostgreSQL" entry below, which is the one that actually drives
      // overall health. Keeping both `false`/`true` avoids double-counting
      // one requirement as two separate failures.
      requiredInProduction: false,
      installed: true,
      note: "Schema is present for users, listings, orders, jobs, and notifications.",
    },
    {
      name: "PostgreSQL",
      group: "data",
      requiredEnv: ["DATABASE_URL"],
      requiredInProduction: true,
      installed: true,
      note: "Configured through DATABASE_URL.",
    },
    {
      name: "Redis cache / BullMQ",
      group: "data",
      requiredEnv: ["REDIS_URL"],
      requiredInProduction: true,
      installed: true,
      note: "Redis URL drives cache and background queues, and backs the shared rate limiter (lib/security/rate-limit.ts) that OTP/admin-login/checkout fail closed without.",
    },
    {
      name: "Meilisearch search",
      group: "search",
      requiredEnv: ["MEILISEARCH_HOST", "MEILISEARCH_API_KEY"],
      // Explicitly optional — a derived search index, not a source of
      // truth. Unconfigured (or configured-but-unreachable, see `online`
      // below) both fall back to querying PostgreSQL directly
      // (lib/search/db-fallback.ts), so this must never gate overall health.
      requiredInProduction: false,
      installed: true,
      note: "Implemented through the Meilisearch REST API — self-hosted windows-amd64.exe binary in infra/meilisearch/, no Docker/WSL required. Optional: unconfigured or unreachable both fall back to PostgreSQL search.",
    },
    {
      name: "Cloudflare R2",
      group: "cloud",
      requiredEnv: [
        "CLOUDFLARE_ACCOUNT_ID",
        "CLOUDFLARE_R2_ACCESS_KEY_ID",
        "CLOUDFLARE_R2_SECRET_ACCESS_KEY",
        "CLOUDFLARE_R2_BUCKET",
        "CLOUDFLARE_R2_PUBLIC_URL",
      ],
      requiredInProduction: true,
      installed: true,
      note: "Product image storage — lib/storage/product-images.ts, via the S3-compatible client in lib/storage/r2-client.ts. Falls back to local disk (public/uploads-dev) only outside production when unconfigured.",
    },
    {
      name: "Cloudflare Images",
      group: "cloud",
      requiredEnv: ["CLOUDFLARE_IMAGES_ACCOUNT_HASH", "CLOUDFLARE_IMAGES_API_TOKEN"],
      requiredInProduction: false,
      installed: false,
      note: "Env contract is defined for direct API integration.",
    },
    {
      name: "Better Auth",
      group: "backend",
      requiredEnv: ["BETTER_AUTH_SECRET", "BETTER_AUTH_URL"],
      requiredInProduction: false,
      installed: true,
      note: "Dependency is declared but not wired into any auth flow — customer auth is OTP-based (lib/auth/customer-session.ts) and admin auth is a separate signed-cookie session (lib/auth/admin-session.ts); neither uses this package.",
    },
    {
      name: "WhatsApp Cloud API",
      group: "growth",
      requiredEnv: ["WHATSAPP_CLOUD_API_TOKEN", "WHATSAPP_PHONE_NUMBER_ID"],
      requiredInProduction: false,
      installed: false,
      note: "Env contract is ready for notification workers.",
    },
    {
      name: "Firebase Cloud Messaging",
      group: "growth",
      requiredEnv: ["FCM_PROJECT_ID", "FCM_CLIENT_EMAIL", "FCM_PRIVATE_KEY"],
      requiredInProduction: false,
      installed: false,
      note: "Firebase Admin install hit a Windows gRPC extraction failure.",
    },
    {
      name: "Resend",
      group: "growth",
      requiredEnv: ["RESEND_API_KEY", "RESEND_FROM_EMAIL"],
      requiredInProduction: false,
      installed: false,
      note: "Env contract is ready for email workers.",
    },
    {
      name: "Razorpay",
      group: "backend",
      // RAZORPAY_WEBHOOK_SECRET was missing here even though checkout can't
      // safely rely on the webhook safety net without it (see
      // app/api/webhooks/razorpay/route.ts and lib/security/production-config.ts,
      // which already treats it as required) — a deployment with keys but
      // no webhook secret would previously have shown as "configured".
      requiredEnv: ["RAZORPAY_KEY_ID", "RAZORPAY_KEY_SECRET", "RAZORPAY_WEBHOOK_SECRET"],
      requiredInProduction: true,
      installed: true,
      note: "Order creation, checkout, and signature verification are implemented in lib/razorpay.ts.",
    },
    {
      name: "Shiprocket shipping",
      group: "backend",
      requiredEnv: ["SHIPROCKET_EMAIL", "SHIPROCKET_PASSWORD", "SHIPROCKET_PICKUP_LOCATION"],
      // Whether shipping is load-bearing depends on the deployment (some
      // operators dispatch deliveries manually/through another courier) —
      // not universally required the way payments/DB/cache are.
      requiredInProduction: false,
      installed: true,
      note: "Generic shipping service (lib/shipping/service.ts) with Shiprocket as the active provider (lib/shipping/providers/shiprocket.ts) — auth/token caching, order creation, AWB, pickup, tracking, cancellation, reverse shipments. Historical Porter-provider shipments (dispatched before this migration) remain readable/cancellable via the frozen lib/porter.ts, but no new shipment is ever created through Porter.",
    },
    {
      name: "Admin panel",
      group: "backend",
      requiredEnv: ["ADMIN_EMAIL", "ADMIN_PASSWORD", "ADMIN_SESSION_SECRET"],
      requiredInProduction: false,
      installed: true,
      note: "Cookie-session admin at /admin — dashboard, orders (status + Porter dispatch), and product CRUD.",
    },
    {
      name: "Sentry",
      group: "growth",
      requiredEnv: ["SENTRY_DSN"],
      requiredInProduction: false,
      installed: false,
      note: "Env contract is defined; SDK install was blocked by package-manager failures.",
    },
    {
      name: "PostHog",
      group: "growth",
      requiredEnv: ["NEXT_PUBLIC_POSTHOG_KEY"],
      requiredInProduction: false,
      installed: true,
      note: "Client provider initializes when public env keys are present.",
    },
  ];

  return services.map((service) => {
    const configState = computeConfigState(service.requiredEnv, service.installed);
    return {
      ...service,
      configured: service.installed && hasAll(service.requiredEnv),
      configState,
    };
  });
}

export function getMeilisearchBaseUrl() {
  if (!platformEnv.MEILISEARCH_HOST) {
    return null;
  }

  return `${platformEnv.MEILISEARCH_PROTOCOL}://${platformEnv.MEILISEARCH_HOST}:${platformEnv.MEILISEARCH_PORT}`;
}
