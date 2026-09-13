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
import { buildSecurityHeaders } from "@/lib/security/headers";
import { checkProductionReadiness } from "@/lib/security/production-config";
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

test("global security headers include CSP controls and production-only HSTS", () => {
  const development = buildSecurityHeaders(false);
  const production = buildSecurityHeaders(true);
  const value = (headers: typeof production, key: string) => headers.find((header) => header.key === key)?.value;
  for (const key of ["Content-Security-Policy", "X-Content-Type-Options", "Referrer-Policy", "X-Frame-Options", "Permissions-Policy"]) {
    assert.ok(value(production, key), key);
  }
  assert.match(value(production, "Content-Security-Policy") ?? "", /frame-ancestors 'none'/);
  assert.match(value(production, "Content-Security-Policy") ?? "", /object-src 'none'/);
  assert.equal(value(production, "Strict-Transport-Security"), "max-age=31536000; includeSubDomains");
  assert.equal(value(development, "Strict-Transport-Security"), undefined);
  assert.equal(nextConfig.poweredByHeader, false);
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
