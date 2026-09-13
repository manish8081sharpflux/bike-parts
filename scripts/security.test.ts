import assert from "node:assert/strict";
import test, { afterEach, beforeEach } from "node:test";
import nextConfig from "../next.config";
import {
  createAdminSessionToken,
  safeAdminRedirect,
  validateAdminSessionSecret,
  verifyAdminSessionToken,
} from "@/lib/auth/admin-session";
import { assertAdminLoginRateLimit } from "@/lib/security/admin-login";
import { buildContentSecurityPolicy, buildStaticSecurityHeaders } from "@/lib/security/headers";
import { generateNonce } from "@/lib/security/nonce";
import { assertProductionReady, checkProductionReadiness } from "@/lib/security/production-config";
import {
  assertRateLimit,
  rateLimitResponse,
  RateLimitExceededError,
  RateLimitUnavailableError,
  resetRateLimitsForTests,
} from "@/lib/security/rate-limit";

const originalEnv = { ...process.env };

beforeEach(() => {
  resetRateLimitsForTests();
  // @types/node marks NODE_ENV readonly; Object.assign bypasses that at the
  // type level while still mutating the real process.env object.
  Object.assign(process.env, { NODE_ENV: "test" });
  process.env.ADMIN_SESSION_SECRET = "test-session-secret";
  process.env.ADMIN_SESSION_VERSION = "1";
  delete process.env.REDIS_URL;
});

afterEach(() => {
  for (const key of Object.keys(process.env)) if (!(key in originalEnv)) delete process.env[key];
  Object.assign(process.env, originalEnv);
});

test("admin login blocks the sixth account attempt while IP and email buckets remain independent", async () => {
  for (let i = 0; i < 5; i++) await assertAdminLoginRateLimit("admin@example.com", "10.0.0.1");
  await assert.rejects(() => assertAdminLoginRateLimit("admin@example.com", "10.0.0.2"), RateLimitExceededError);
  await assert.doesNotReject(() => assertAdminLoginRateLimit("other@example.com", "10.0.0.1"));
  await assert.doesNotReject(() => assertAdminLoginRateLimit("other@example.com", "10.0.0.2"));
});

test("generic limiter returns 429 with Retry-After and keeps buckets independent", async () => {
  await assertRateLimit("one", { limit: 1, windowMs: 10_000 });
  let error: unknown;
  try { await assertRateLimit("one", { limit: 1, windowMs: 10_000 }); } catch (caught) { error = caught; }
  const response = rateLimitResponse(error);
  assert.equal(response?.status, 429);
  assert.equal(response?.headers.get("cache-control"), "no-store");
  assert.ok(Number(response?.headers.get("retry-after")) > 0);
  await assert.doesNotReject(() => assertRateLimit("two", { limit: 1, windowMs: 10_000 }));
});

test("production admin session secret validation rejects weak values and accepts a strong value", () => {
  for (const secret of [undefined, "secret", "changeme", "short"] as const) {
    assert.throws(() => validateAdminSessionSecret(secret, true));
  }
  assert.doesNotThrow(() => validateAdminSessionSecret("b5d987e80f714f01a6fb58dab58d88fb", true));
});

test("admin sessions are unique, expire, reject tampering, and are revoked by version changes", () => {
  const first = createAdminSessionToken("Admin@Example.com");
  const second = createAdminSessionToken("Admin@Example.com");
  assert.notEqual(first, second);
  assert.equal(verifyAdminSessionToken(first), "admin@example.com");
  assert.equal(verifyAdminSessionToken(`${first}x`), null);
  process.env.ADMIN_SESSION_VERSION = "2";
  assert.equal(verifyAdminSessionToken(first), null);

  process.env.ADMIN_SESSION_VERSION = "1";
  const now = Date.now;
  Date.now = () => now() + 13 * 60 * 60 * 1000;
  try { assert.equal(verifyAdminSessionToken(second), null); } finally { Date.now = now; }
});

test("admin redirect accepts only internal /admin paths", () => {
  assert.equal(safeAdminRedirect("/admin/orders?page=2"), "/admin/orders?page=2");
  for (const value of ["//evil.example", "/admin@example.com", "https://evil.example/admin", "/store", "/administrator"]) {
    assert.equal(safeAdminRedirect(value), "/admin");
  }
});

test("static security headers are present and HSTS is production-only", () => {
  const development = buildStaticSecurityHeaders(false);
  const production = buildStaticSecurityHeaders(true);
  const value = (headers: typeof production, key: string) => headers.find((header) => header.key === key)?.value;
  for (const key of ["X-Content-Type-Options", "Referrer-Policy", "X-Frame-Options", "Permissions-Policy"]) {
    assert.ok(value(production, key), key);
  }
  assert.equal(value(production, "Strict-Transport-Security"), "max-age=31536000; includeSubDomains");
  assert.equal(value(development, "Strict-Transport-Security"), undefined);
  assert.equal(nextConfig.poweredByHeader, false);
});

/** Pulls just one directive's value out of a full CSP string — never assert against the whole policy, since e.g. style-src legitimately keeps 'unsafe-inline'. */
function cspDirective(csp: string, name: string): string {
  const directive = csp.split(";").map((part) => part.trim()).find((part) => part.startsWith(`${name} `));
  return directive ?? "";
}

test("production CSP script-src drops unsafe-inline/unsafe-eval in favor of a nonce, while frame-ancestors/object-src stay locked down", () => {
  const nonce = "unit-test-nonce";
  const csp = buildContentSecurityPolicy({ production: true, nonce });
  const scriptSrc = cspDirective(csp, "script-src");

  assert.match(scriptSrc, new RegExp(`'nonce-${nonce}'`));
  assert.doesNotMatch(scriptSrc, /'unsafe-inline'/);
  assert.doesNotMatch(scriptSrc, /'unsafe-eval'/);
  assert.match(scriptSrc, /'strict-dynamic'/);
  // Fallback origins for browsers without strict-dynamic support.
  assert.match(scriptSrc, /https:\/\/checkout\.razorpay\.com/);

  assert.match(csp, /frame-ancestors 'none'/);
  assert.match(csp, /object-src 'none'/);

  // style-src is intentionally exempt from the no-unsafe-inline rule (see
  // Fix 9's blocker: it's specifically about script-src).
  assert.match(cspDirective(csp, "style-src"), /'unsafe-inline'/);
});

test("development CSP keeps the relaxed script policy Next.js dev tooling needs", () => {
  const csp = buildContentSecurityPolicy({ production: false });
  const scriptSrc = cspDirective(csp, "script-src");
  assert.match(scriptSrc, /'unsafe-inline'/);
  assert.match(scriptSrc, /'unsafe-eval'/);
  assert.doesNotMatch(scriptSrc, /'nonce-/);
});

test("production CSP allows the actual external integrations this app uses", () => {
  const csp = buildContentSecurityPolicy({
    production: true,
    nonce: "n",
    env: { CLOUDFLARE_R2_PUBLIC_URL: "https://pub-example.r2.dev", NEXT_PUBLIC_POSTHOG_HOST: "https://eu.i.posthog.com" },
  });
  assert.match(cspDirective(csp, "frame-src"), /razorpay\.com/);
  assert.match(cspDirective(csp, "connect-src"), /razorpay\.com/);
  assert.match(cspDirective(csp, "connect-src"), /eu\.i\.posthog\.com/);
  assert.match(cspDirective(csp, "connect-src"), /nominatim\.openstreetmap\.org/);
  assert.match(cspDirective(csp, "img-src"), /pub-example\.r2\.dev/);
  assert.match(cspDirective(csp, "img-src"), /tile\.openstreetmap\.org/);
});

test("nonce generation is cryptographically random and unique per call, never reused", () => {
  const seen = new Set<string>();
  for (let i = 0; i < 50; i++) {
    const nonce = generateNonce();
    assert.equal(seen.has(nonce), false, "nonce must not repeat across calls");
    seen.add(nonce);
    // 16 random bytes, base64-encoded.
    assert.equal(Buffer.from(nonce, "base64").length, 16);
  }
});

test("the nonce embedded in the CSP header is exactly the nonce a render context would receive", () => {
  // Mirrors proxy.ts: one generated nonce feeds both the request's x-nonce
  // header and the CSP's script-src — never two independently-generated
  // values that could drift apart.
  const nonce = generateNonce();
  const csp = buildContentSecurityPolicy({ production: true, nonce });
  const requestHeaders = new Headers();
  requestHeaders.set("x-nonce", nonce);

  const match = /'nonce-([^']+)'/.exec(cspDirective(csp, "script-src"));
  assert.ok(match, "CSP script-src must contain a nonce source");
  assert.equal(match?.[1], requestHeaders.get("x-nonce"));
});

test("fails closed in production when Redis is unavailable and the policy requires it", async () => {
  Object.assign(process.env, { NODE_ENV: "production" });
  await assert.rejects(
    () => assertRateLimit("prod-key", { limit: 1, windowMs: 10_000 }, { failClosed: true }),
    RateLimitUnavailableError
  );
});

test("fails open in production when Redis is unavailable and the policy explicitly allows it", async () => {
  Object.assign(process.env, { NODE_ENV: "production" });
  await assert.doesNotReject(() => assertRateLimit("prod-key-open", { limit: 1, windowMs: 10_000 }, { failClosed: false }));
});

test("production readiness rejects weak critical secrets without returning their values", () => {
  const env = {
    ADMIN_SESSION_SECRET: "secret",
    ADMIN_PASSWORD: "password",
    CUSTOMER_OTP_HASH_SECRET: "changeme",
  };
  const checks = checkProductionReadiness(env);
  assert.equal(checks.find((check) => check.name === "admin session secret")?.ok, false);
  assert.equal(checks.find((check) => check.name === "admin password")?.ok, false);
  assert.equal(checks.find((check) => check.name === "customer auth secret")?.ok, false);
  assert.equal(JSON.stringify(checks).includes("changeme"), false);
});

const validCriticalEnv: Record<string, string> = {
  DATABASE_URL: "postgresql://localhost/db",
  REDIS_URL: "redis://localhost:6379",
  TRUST_PROXY_HEADERS: "true",
  ADMIN_EMAIL: "admin@example.com",
  ADMIN_PASSWORD: "a-genuinely-long-admin-password",
  ADMIN_SESSION_SECRET: "b5d987e80f714f01a6fb58dab58d88fb00000000000000000000000000",
  ADMIN_SESSION_VERSION: "3",
  CUSTOMER_OTP_HASH_SECRET: "c5d987e80f714f01a6fb58dab58d88fb00000000000000000000000000",
  RAZORPAY_KEY_ID: "rzp_live_x",
  RAZORPAY_KEY_SECRET: "secretvalue",
  RAZORPAY_WEBHOOK_SECRET: "webhooksecretvalue",
  CLOUDFLARE_ACCOUNT_ID: "acct",
  CLOUDFLARE_R2_ACCESS_KEY_ID: "key",
  CLOUDFLARE_R2_SECRET_ACCESS_KEY: "secret",
  CLOUDFLARE_R2_BUCKET: "bucket",
  CLOUDFLARE_R2_PUBLIC_URL: "https://pub.example.com",
};

test("Meilisearch absent is optional and does not fail overall readiness (PostgreSQL fallback)", () => {
  const checks = checkProductionReadiness(validCriticalEnv);
  const meili = checks.find((check) => check.name === "Meilisearch");
  assert.equal(meili?.required, false);
  assert.equal(meili?.configured, false);
  assert.equal(meili?.ok, true);
  assert.equal(checks.every((check) => !check.required || check.ok), true, "no required check should fail");
  assert.doesNotThrow(() => assertProductionReady(validCriticalEnv));
});

test("Meilisearch fully present is reported configured and readiness still succeeds", () => {
  const env = {
    ...validCriticalEnv,
    MEILISEARCH_HOST: "127.0.0.1",
    MEILISEARCH_API_KEY: "key",
    MEILISEARCH_INDEX: "bike_parts",
  };
  const checks = checkProductionReadiness(env);
  const meili = checks.find((check) => check.name === "Meilisearch");
  assert.equal(meili?.required, false);
  assert.equal(meili?.configured, true);
  assert.equal(meili?.ok, true);
  assert.doesNotThrow(() => assertProductionReady(env));
});

test("Meilisearch partially configured is a warning, not a readiness failure", () => {
  const env = { ...validCriticalEnv, MEILISEARCH_HOST: "127.0.0.1" };
  const meili = checkProductionReadiness(env).find((check) => check.name === "Meilisearch");
  assert.equal(meili?.required, false);
  assert.equal(meili?.configured, false);
  assert.equal(meili?.ok, true);
  assert.doesNotThrow(() => assertProductionReady(env));
});

test("a missing required service (Redis) fails overall readiness even with everything else valid", () => {
  const env = { ...validCriticalEnv };
  delete env.REDIS_URL;
  assert.throws(() => assertProductionReady(env), /redis|Redis/i);
});

test("a weak required secret fails overall readiness even with Meilisearch fully configured", () => {
  const env = {
    ...validCriticalEnv,
    ADMIN_SESSION_SECRET: "secret",
    MEILISEARCH_HOST: "127.0.0.1",
    MEILISEARCH_API_KEY: "key",
    MEILISEARCH_INDEX: "bike_parts",
  };
  assert.throws(() => assertProductionReady(env));
});
