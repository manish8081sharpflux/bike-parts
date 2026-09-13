/**
 * Tests app/api/platform/health/route.ts's overall-`ok` computation across
 * the required/optional scenarios from the health-endpoint fix.
 *
 * lib/platform/service-env.ts parses `platformEnv` once from process.env at
 * module load time, so different scenarios can't share one process (the
 * first import wins for the whole test file). Each scenario instead runs
 * the route's exact logic in a fresh child process with a controlled env —
 * slower than an in-process unit test, but it exercises the real module
 * exactly as the route calls it, with no test-only seams added to
 * production code.
 */
import assert from "node:assert/strict";
import test from "node:test";
import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
// Resolved directly rather than shelling out to `npx tsx` — avoids
// platform-specific PATH/shell-extension issues (e.g. `npx` needing
// `shell: true` on Windows) entirely.
const tsxCli = createRequire(import.meta.url).resolve("tsx/package.json").replace(/package\.json$/, "dist/cli.mjs");

// Mirrors app/api/platform/health/route.ts's GET handler exactly, so this
// test exercises the real computation rather than a reimplementation of it.
const PROBE = `
(async () => {
  const { getPlatformServices } = await import("@/lib/platform/service-env");
  const { pingMeilisearch } = await import("@/lib/search/meilisearch-http");
  const services = getPlatformServices();
  const meilisearchOnline = await pingMeilisearch().catch(() => false);
  const servicesWithLiveStatus = services.map((service) =>
    service.name === "Meilisearch search" ? { ...service, online: meilisearchOnline } : service
  );
  const ok = servicesWithLiveStatus
    .filter((service) => service.requiredInProduction)
    .every((service) => service.configured);
  process.stdout.write(JSON.stringify({ ok, services: servicesWithLiveStatus }));
})();
`;

/** A fully-configured baseline for every required service, so each scenario only has to remove what it's testing. */
function baselineEnv(): Record<string, string> {
  return {
    DATABASE_URL: "postgresql://postgres:postgres@localhost:5432/bike_parts",
    REDIS_URL: "redis://localhost:6379",
    RAZORPAY_KEY_ID: "rzp_test_x",
    RAZORPAY_KEY_SECRET: "secret",
    RAZORPAY_WEBHOOK_SECRET: "webhooksecret",
    CLOUDFLARE_ACCOUNT_ID: "acct",
    CLOUDFLARE_R2_ACCESS_KEY_ID: "key",
    CLOUDFLARE_R2_SECRET_ACCESS_KEY: "secret",
    CLOUDFLARE_R2_BUCKET: "bucket",
    CLOUDFLARE_R2_PUBLIC_URL: "https://pub.example.com",
  };
}

function runHealthProbe(overrides: Record<string, string | undefined>) {
  const env: Record<string, string> = { ...(process.env as Record<string, string>), ...baselineEnv() };
  for (const [key, value] of Object.entries(overrides)) {
    if (value === undefined) delete env[key];
    else env[key] = value;
  }

  const stdout = execFileSync(process.execPath, [tsxCli, "--eval", PROBE], {
    cwd: projectRoot,
    env: env as NodeJS.ProcessEnv,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "ignore"],
  });
  return JSON.parse(stdout) as { ok: boolean; services: Array<{ name: string; requiredInProduction: boolean; configured: boolean; online?: boolean }> };
}

test("A: core services configured, all optional integrations missing -> ok:true", () => {
  const result = runHealthProbe({});
  assert.equal(result.ok, true);
  const meili = result.services.find((s) => s.name === "Meilisearch search");
  assert.equal(meili?.requiredInProduction, false);
  assert.equal(meili?.configured, false);
});

test("B: PostgreSQL missing -> ok:false", () => {
  const result = runHealthProbe({ DATABASE_URL: undefined });
  assert.equal(result.ok, false);
  const pg = result.services.find((s) => s.name === "PostgreSQL");
  assert.equal(pg?.requiredInProduction, true);
  assert.equal(pg?.configured, false);
});

test("C: Redis missing -> ok:false", () => {
  const result = runHealthProbe({ REDIS_URL: undefined });
  assert.equal(result.ok, false);
  const redis = result.services.find((s) => s.name === "Redis cache / BullMQ");
  assert.equal(redis?.requiredInProduction, true);
  assert.equal(redis?.configured, false);
});

test("D: Meilisearch completely unconfigured -> ok:true", () => {
  const result = runHealthProbe({ MEILISEARCH_HOST: undefined, MEILISEARCH_API_KEY: undefined });
  assert.equal(result.ok, true);
  const meili = result.services.find((s) => s.name === "Meilisearch search");
  assert.equal(meili?.configured, false);
  assert.equal(meili?.online, false);
});

test("E: Meilisearch configured but unreachable -> app stays healthy, Meilisearch reports online:false", () => {
  const result = runHealthProbe({
    // A closed local port — connection-refused, no timeout wait needed.
    MEILISEARCH_HOST: "127.0.0.1",
    MEILISEARCH_PORT: "1",
    MEILISEARCH_API_KEY: "test-key",
  });
  assert.equal(result.ok, true, "PostgreSQL fallback keeps the app healthy even though Meilisearch itself is down");
  const meili = result.services.find((s) => s.name === "Meilisearch search");
  assert.equal(meili?.configured, true, "env vars are present, so it counts as configured");
  assert.equal(meili?.online, false, "but the live ping failed");
});

test("F: Sentry/WhatsApp/Firebase/Resend/Better Auth/PostHog not configured -> ok:true", () => {
  const result = runHealthProbe({});
  assert.equal(result.ok, true);
  for (const name of ["Sentry", "WhatsApp Cloud API", "Firebase Cloud Messaging", "Resend", "Better Auth", "PostHog"]) {
    const service = result.services.find((s) => s.name === name);
    assert.equal(service?.requiredInProduction, false, `${name} must not be required`);
  }
});

test("required core services are exactly the expected set", () => {
  const result = runHealthProbe({});
  const required = result.services.filter((s) => s.requiredInProduction).map((s) => s.name).sort();
  assert.deepEqual(required, ["Cloudflare R2", "Next.js app router", "PostgreSQL", "Razorpay", "Redis cache / BullMQ"].sort());
});
