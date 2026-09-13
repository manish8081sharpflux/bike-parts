import { validateAdminSessionSecret } from "@/lib/auth/admin-session";

export type ReadinessCheck = { name: string; ok: boolean; message: string };

const WEAK = new Set(["admin", "password", "changeme", "secret", "123456", "12345678"]);

type EnvLike = Record<string, string | undefined>;

function present(env: EnvLike, key: string) {
  return Boolean(env[key]?.trim());
}

function secretIsStrong(value: string | undefined, minimum = 32) {
  return Boolean(value && value.length >= minimum && !WEAK.has(value.trim().toLowerCase()));
}

export function checkProductionReadiness(env: EnvLike): ReadinessCheck[] {
  const checks: ReadinessCheck[] = [
    { name: "database", ok: present(env, "DATABASE_URL"), message: "DATABASE_URL configured" },
    { name: "redis", ok: present(env, "REDIS_URL"), message: "REDIS_URL configured" },
    { name: "trusted proxy", ok: env.TRUST_PROXY_HEADERS === "true", message: "TRUST_PROXY_HEADERS=true" },
    { name: "admin email", ok: present(env, "ADMIN_EMAIL"), message: "ADMIN_EMAIL configured" },
    {
      name: "admin password",
      ok: Boolean(env.ADMIN_PASSWORD && env.ADMIN_PASSWORD.length >= 12 && !WEAK.has(env.ADMIN_PASSWORD.toLowerCase())),
      message: "ADMIN_PASSWORD is strong",
    },
    { name: "admin session version", ok: /^[A-Za-z0-9._-]{1,64}$/.test(env.ADMIN_SESSION_VERSION ?? ""), message: "ADMIN_SESSION_VERSION configured" },
    { name: "customer auth secret", ok: secretIsStrong(env.CUSTOMER_OTP_HASH_SECRET), message: "CUSTOMER_OTP_HASH_SECRET is strong" },
    {
      name: "Razorpay",
      ok: ["RAZORPAY_KEY_ID", "RAZORPAY_KEY_SECRET", "RAZORPAY_WEBHOOK_SECRET"].every((key) => present(env, key)),
      message: "Razorpay production configuration present",
    },
    {
      name: "R2",
      ok: ["CLOUDFLARE_ACCOUNT_ID", "CLOUDFLARE_R2_ACCESS_KEY_ID", "CLOUDFLARE_R2_SECRET_ACCESS_KEY", "CLOUDFLARE_R2_BUCKET", "CLOUDFLARE_R2_PUBLIC_URL"].every((key) => present(env, key)),
      message: "R2 configuration present",
    },
    {
      name: "Meilisearch",
      ok: ["MEILISEARCH_HOST", "MEILISEARCH_API_KEY", "MEILISEARCH_INDEX"].every((key) => present(env, key)),
      message: "Meilisearch configuration present",
    },
  ];
  try {
    validateAdminSessionSecret(env.ADMIN_SESSION_SECRET, true);
    checks.splice(5, 0, { name: "admin session secret", ok: true, message: "ADMIN_SESSION_SECRET is strong" });
  } catch (error) {
    checks.splice(5, 0, {
      name: "admin session secret",
      ok: false,
      message: error instanceof Error ? error.message : "ADMIN_SESSION_SECRET is invalid",
    });
  }
  return checks;
}

export function assertProductionReady(env: EnvLike = process.env) {
  const failed = checkProductionReadiness(env).filter((check) => !check.ok);
  if (failed.length) throw new Error(`Production configuration failed: ${failed.map((check) => check.name).join(", ")}.`);
}
