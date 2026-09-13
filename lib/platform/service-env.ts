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
  PORTER_API_KEY: z.string().optional(),
  PORTER_API_BASE_URL: z.string().optional(),
  PORTER_CLIENT_ID: z.string().optional(),
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
  installed: boolean;
  configured: boolean;
  note: string;
};

function hasAll(keys: Array<keyof PlatformEnv>) {
  return keys.every((key) => Boolean(platformEnv[key]));
}

export function getPlatformServices(): ServiceStatus[] {
  const services: Array<Omit<ServiceStatus, "configured">> = [
    {
      name: "Next.js app router",
      group: "frontend",
      requiredEnv: [],
      installed: true,
      note: "Frontend shell and API route handlers are present.",
    },
    {
      name: "Shadcn UI / Tailwind CSS v4",
      group: "frontend",
      requiredEnv: [],
      installed: true,
      note: "Component registry and global Tailwind tokens are wired.",
    },
    {
      name: "TanStack Query",
      group: "frontend",
      requiredEnv: [],
      installed: true,
      note: "Client query provider powers the search UI.",
    },
    {
      name: "React Hook Form + Zod",
      group: "frontend",
      requiredEnv: [],
      installed: true,
      note: "Search/filter form validation is implemented on the client.",
    },
    {
      name: "Motion",
      group: "frontend",
      requiredEnv: [],
      installed: true,
      note: "Available for interaction polish and page transitions.",
    },
    {
      name: "next-pwa",
      group: "frontend",
      requiredEnv: [],
      installed: true,
      note: "Dependency exists; production runtime config can be enabled later.",
    },
    {
      name: "NestJS backend",
      group: "backend",
      requiredEnv: [],
      installed: false,
      note: "Scaffold notes are in docs; package install was blocked by pnpm memory failures.",
    },
    {
      name: "Prisma ORM",
      group: "data",
      requiredEnv: ["DATABASE_URL"],
      installed: true,
      note: "Schema is present for users, listings, orders, jobs, and notifications.",
    },
    {
      name: "PostgreSQL",
      group: "data",
      requiredEnv: ["DATABASE_URL"],
      installed: true,
      note: "Configured through DATABASE_URL.",
    },
    {
      name: "Redis cache / BullMQ",
      group: "data",
      requiredEnv: ["REDIS_URL"],
      installed: true,
      note: "Redis URL drives cache and background queues.",
    },
    {
      name: "Meilisearch search",
      group: "search",
      requiredEnv: ["MEILISEARCH_HOST", "MEILISEARCH_API_KEY"],
      installed: true,
      note: "Implemented through the Meilisearch REST API — self-hosted windows-amd64.exe binary in infra/meilisearch/, no Docker/WSL required.",
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
      installed: true,
      note: "Product image storage — lib/storage/product-images.ts, via the S3-compatible client in lib/storage/r2-client.ts. Falls back to local disk (public/uploads-dev) only outside production when unconfigured.",
    },
    {
      name: "Cloudflare Images",
      group: "cloud",
      requiredEnv: ["CLOUDFLARE_IMAGES_ACCOUNT_HASH", "CLOUDFLARE_IMAGES_API_TOKEN"],
      installed: false,
      note: "Env contract is defined for direct API integration.",
    },
    {
      name: "Better Auth",
      group: "backend",
      requiredEnv: ["BETTER_AUTH_SECRET", "BETTER_AUTH_URL"],
      installed: true,
      note: "Dependency exists; route integration needs the chosen auth schema.",
    },
    {
      name: "WhatsApp Cloud API",
      group: "growth",
      requiredEnv: ["WHATSAPP_CLOUD_API_TOKEN", "WHATSAPP_PHONE_NUMBER_ID"],
      installed: false,
      note: "Env contract is ready for notification workers.",
    },
    {
      name: "Firebase Cloud Messaging",
      group: "growth",
      requiredEnv: ["FCM_PROJECT_ID", "FCM_CLIENT_EMAIL", "FCM_PRIVATE_KEY"],
      installed: false,
      note: "Firebase Admin install hit a Windows gRPC extraction failure.",
    },
    {
      name: "Resend",
      group: "growth",
      requiredEnv: ["RESEND_API_KEY", "RESEND_FROM_EMAIL"],
      installed: false,
      note: "Env contract is ready for email workers.",
    },
    {
      name: "Razorpay",
      group: "backend",
      requiredEnv: ["RAZORPAY_KEY_ID", "RAZORPAY_KEY_SECRET"],
      installed: true,
      note: "Order creation, checkout, and signature verification are implemented in lib/razorpay.ts.",
    },
    {
      name: "Porter delivery",
      group: "backend",
      requiredEnv: ["PORTER_API_KEY"],
      installed: true,
      note: "Quote/create/track wrapper is implemented in lib/porter.ts against Porter's Partner API v1 shape.",
    },
    {
      name: "Admin panel",
      group: "backend",
      requiredEnv: ["ADMIN_EMAIL", "ADMIN_PASSWORD", "ADMIN_SESSION_SECRET"],
      installed: true,
      note: "Cookie-session admin at /admin — dashboard, orders (status + Porter dispatch), and product CRUD.",
    },
    {
      name: "Sentry",
      group: "growth",
      requiredEnv: ["SENTRY_DSN"],
      installed: false,
      note: "Env contract is defined; SDK install was blocked by package-manager failures.",
    },
    {
      name: "PostHog",
      group: "growth",
      requiredEnv: ["NEXT_PUBLIC_POSTHOG_KEY"],
      installed: true,
      note: "Client provider initializes when public env keys are present.",
    },
  ];

  return services.map((service) => ({
    ...service,
    configured: service.installed && hasAll(service.requiredEnv),
  }));
}

export function getMeilisearchBaseUrl() {
  if (!platformEnv.MEILISEARCH_HOST) {
    return null;
  }

  return `${platformEnv.MEILISEARCH_PROTOCOL}://${platformEnv.MEILISEARCH_HOST}:${platformEnv.MEILISEARCH_PORT}`;
}
