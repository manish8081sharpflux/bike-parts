import { validateAdminSessionSecret } from "@/lib/auth/admin-session";

export type ReadinessCheck = {
  name: string;
  /** True if the deployed app genuinely cannot function safely without this. */
  required: boolean;
  /** Whether this integration's env vars are actually present/complete. */
  configured: boolean;
  /** Whether this check passes — for an optional, unconfigured integration this is still true (a documented fallback exists). */
  ok: boolean;
  message: string;
};

const WEAK = new Set(["admin", "password", "changeme", "secret", "123456", "12345678"]);

type EnvLike = Record<string, string | undefined>;

function present(env: EnvLike, key: string) {
  return Boolean(env[key]?.trim());
}

function secretIsStrong(value: string | undefined, minimum = 32) {
  return Boolean(value && value.length >= minimum && !WEAK.has(value.trim().toLowerCase()));
}

function requiredCheck(name: string, ok: boolean, message: string): ReadinessCheck {
  return { name, required: true, configured: ok, ok, message };
}

/**
 * TRUST_PROXY_HEADERS is a deployment-topology choice, not a universal
 * requirement (see lib/security/client-ip.ts) — both are valid production
 * configurations:
 *
 *   - unset/"false": the app is directly internet-facing. Client-supplied
 *     X-Forwarded-For/X-Real-IP/CF-Connecting-IP headers are never trusted
 *     for rate-limit identity (they're trivially spoofable without a proxy
 *     in front to overwrite them) — this is the safe default.
 *   - "true": the app sits behind a trusted reverse proxy (Cloudflare,
 *     nginx, a load balancer) that itself sets/sanitizes those headers, so
 *     trusting them is safe *only as long as the app is unreachable except
 *     through that proxy*.
 *
 * Only a value that's neither is a real misconfiguration (a typo the
 * operator should fix) — everything else passes, with "true" surfacing a
 * reminder rather than a failure.
 */
function trustProxyCheck(env: EnvLike): ReadinessCheck {
  const raw = env.TRUST_PROXY_HEADERS?.trim();

  if (!raw) {
    return {
      name: "trusted proxy",
      required: false,
      configured: false,
      ok: true,
      message:
        "TRUST_PROXY_HEADERS not set — direct-exposure mode: forwarded IP headers (X-Forwarded-For, X-Real-IP, CF-Connecting-IP) are ignored for rate limiting",
    };
  }

  if (raw !== "true" && raw !== "false") {
    return {
      name: "trusted proxy",
      required: true,
      configured: false,
      ok: false,
      message: `TRUST_PROXY_HEADERS must be exactly "true" or "false" (got "${raw}")`,
    };
  }

  if (raw === "true") {
    return {
      name: "trusted proxy",
      required: false,
      configured: true,
      ok: true,
      message:
        "Proxy headers are trusted (TRUST_PROXY_HEADERS=true). Ensure the application is reachable only through your trusted proxy/load balancer.",
    };
  }

  return {
    name: "trusted proxy",
    required: false,
    configured: true,
    ok: true,
    message: "TRUST_PROXY_HEADERS=false — direct-exposure mode: forwarded IP headers are ignored for rate limiting",
  };
}

/**
 * Meilisearch is a derived search index, not the source of truth (see Fix
 * 8) — PostgreSQL is always a valid fallback, so a production deployment
 * that intentionally runs without Meilisearch is not misconfigured. Only
 * fully-present or fully-absent config is unambiguous; a partial set (e.g.
 * host set but no API key) is flagged as a warning without blocking
 * readiness, since the app still falls back to Postgres either way.
 */
function meilisearchCheck(env: EnvLike): ReadinessCheck {
  const keys = ["MEILISEARCH_HOST", "MEILISEARCH_API_KEY", "MEILISEARCH_INDEX"];
  const presentCount = keys.filter((key) => present(env, key)).length;

  if (presentCount === keys.length) {
    return { name: "Meilisearch", required: false, configured: true, ok: true, message: "Meilisearch configured" };
  }
  if (presentCount === 0) {
    return {
      name: "Meilisearch",
      required: false,
      configured: false,
      ok: true,
      message: "Meilisearch not configured — PostgreSQL search fallback will be used",
    };
  }
  return {
    name: "Meilisearch",
    required: false,
    configured: false,
    ok: true,
    message: "Meilisearch partially configured (check MEILISEARCH_HOST/MEILISEARCH_API_KEY/MEILISEARCH_INDEX) — PostgreSQL search fallback will be used",
  };
}

export function checkProductionReadiness(env: EnvLike): ReadinessCheck[] {
  const checks: ReadinessCheck[] = [
    requiredCheck("database", present(env, "DATABASE_URL"), "Database configured"),
    requiredCheck("redis", present(env, "REDIS_URL"), "Redis configured"),
    trustProxyCheck(env),
    requiredCheck("admin email", present(env, "ADMIN_EMAIL"), "Admin email configured"),
    requiredCheck(
      "admin password",
      Boolean(env.ADMIN_PASSWORD && env.ADMIN_PASSWORD.length >= 12 && !WEAK.has(env.ADMIN_PASSWORD.toLowerCase())),
      "Admin password is strong"
    ),
    requiredCheck(
      "admin session version",
      /^[A-Za-z0-9._-]{1,64}$/.test(env.ADMIN_SESSION_VERSION ?? ""),
      "Admin session version configured"
    ),
    requiredCheck("customer auth secret", secretIsStrong(env.CUSTOMER_OTP_HASH_SECRET), "Customer auth secret is strong"),
    requiredCheck(
      "Razorpay",
      ["RAZORPAY_KEY_ID", "RAZORPAY_KEY_SECRET", "RAZORPAY_WEBHOOK_SECRET"].every((key) => present(env, key)),
      "Razorpay production configuration present"
    ),
    requiredCheck(
      "R2",
      ["CLOUDFLARE_ACCOUNT_ID", "CLOUDFLARE_R2_ACCESS_KEY_ID", "CLOUDFLARE_R2_SECRET_ACCESS_KEY", "CLOUDFLARE_R2_BUCKET", "CLOUDFLARE_R2_PUBLIC_URL"].every((key) =>
        present(env, key)
      ),
      "R2 configuration present"
    ),
    meilisearchCheck(env),
  ];
  try {
    validateAdminSessionSecret(env.ADMIN_SESSION_SECRET, true);
    checks.splice(5, 0, requiredCheck("admin session secret", true, "Admin session secret is strong"));
  } catch (error) {
    checks.splice(5, 0, requiredCheck("admin session secret", false, error instanceof Error ? error.message : "ADMIN_SESSION_SECRET is invalid"));
  }
  return checks;
}

/** Only a failed *required* check blocks readiness — an unconfigured optional integration never does. */
export function assertProductionReady(env: EnvLike = process.env) {
  const failed = checkProductionReadiness(env).filter((check) => check.required && !check.ok);
  if (failed.length) throw new Error(`Production configuration failed: ${failed.map((check) => check.name).join(", ")}.`);
}
