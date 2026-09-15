import Redis from "ioredis";

export type RateLimitPolicy = { limit: number; windowMs: number };
export class RateLimitExceededError extends Error {
  constructor(public readonly retryAfterSeconds: number) { super("Too many requests."); }
}
export class RateLimitUnavailableError extends Error {}

type LimiterState = {
  url?: string; client?: Redis; connecting?: Promise<void>; retryAt: number; warned: boolean;
  counters: Map<string, { count: number; resetAt: number }>;
};
const globalState = globalThis as typeof globalThis & {
  applicationRateLimitRedis?: Redis;
  applicationRateLimiterV2?: LimiterState;
};
// Stop the old hot-reloaded client's unlimited reconnect loop as well.
if (globalState.applicationRateLimitRedis) {
  globalState.applicationRateLimitRedis.disconnect();
  delete globalState.applicationRateLimitRedis;
}
const state: LimiterState = globalState.applicationRateLimiterV2 ??= { retryAt: 0, warned: false, counters: new Map() };

function unavailable() {
  if (!state.warned) {
    console.warn(process.env.NODE_ENV === "production"
      ? "[security] Redis rate limiter unavailable; protected requests remain blocked. Retrying on demand after 30 seconds."
      : "[security] Redis rate limiter unavailable; using local in-memory limits. Retrying on demand after 30 seconds.");
    state.warned = true;
  }
}

async function readyRedis(): Promise<Redis | null> {
  const url = process.env.REDIS_URL?.trim();
  if (state.url !== url) {
    state.client?.disconnect();
    state.client = undefined; state.connecting = undefined;
    state.url = url; state.retryAt = 0; state.warned = false;
  }
  if (!url || Date.now() < state.retryAt) return null;
  if (!state.client || state.client.status === "end") {
    const client = new Redis(url, {
      lazyConnect: true, enableOfflineQueue: false, maxRetriesPerRequest: 0,
      connectTimeout: 1500, commandTimeout: 1500,
      retryStrategy: () => null,
    });
    // Handle errors without logging credentials or empty AggregateError messages.
    client.on("error", unavailable);
    state.client = client;
    state.connecting = client.connect().then(() => {}).finally(() => { state.connecting = undefined; });
  }
  if (state.connecting) await state.connecting;
  if (state.client.status !== "ready") throw new RateLimitUnavailableError();
  return state.client;
}

function failedRedis() {
  state.client?.disconnect();
  state.client = undefined;
  state.retryAt = Date.now() + 30_000;
  unavailable();
}

function assertMemoryLimit(key: string, policy: RateLimitPolicy) {
  const now = Date.now();
  for (const [id, value] of state.counters) if (value.resetAt <= now) state.counters.delete(id);
  const current = state.counters.get(key);
  if (!current) { state.counters.set(key, { count: 1, resetAt: now + policy.windowMs }); return; }
  if (current.count >= policy.limit) throw new RateLimitExceededError(Math.max(1, Math.ceil((current.resetAt - now) / 1000)));
  current.count++;
}

export async function assertRateLimit(key: string, policy: RateLimitPolicy, options: { failClosed?: boolean } = {}) {
  const production = process.env.NODE_ENV === "production";
  // Keep the local counter warm so a Redis outage cannot reset dev limits.
  if (!production) assertMemoryLimit(key, policy);
  try {
    const redis = await readyRedis();
    if (redis) {
      const results = await redis.multi().incr(key).pexpire(key, policy.windowMs).exec();
      if (!results || results.some(([error]) => error) || !Number.isFinite(Number(results[0]?.[1]))) throw new RateLimitUnavailableError();
      state.warned = false;
      if (Number(results[0][1]) > policy.limit) throw new RateLimitExceededError(Math.max(1, Math.ceil(policy.windowMs / 1000)));
      return;
    }
  } catch (error) {
    if (error instanceof RateLimitExceededError) throw error;
    failedRedis();
  }
  if (production) {
    unavailable();
    if (options.failClosed ?? true) throw new RateLimitUnavailableError("Request protection is temporarily unavailable.");
  }
}

export async function clearRateLimit(key: string) {
  state.counters.delete(key);
  try { const redis = await readyRedis(); if (redis) await redis.del(key); }
  catch { failedRedis(); }
}

export function resetRateLimitsForTests() {
  state.client?.disconnect(); state.client = undefined; state.connecting = undefined;
  state.counters.clear(); state.retryAt = 0; state.warned = false; state.url = undefined;
}

export function rateLimitResponse(error: unknown, message = "Too many requests. Please try again later.") {
  if (error instanceof RateLimitExceededError) {
    return Response.json({ error: message }, {
      status: 429,
      headers: { "Retry-After": String(error.retryAfterSeconds), "Cache-Control": "no-store" },
    });
  }
  if (error instanceof RateLimitUnavailableError) {
    return Response.json({ error: "Service temporarily unavailable." }, {
      status: 503,
      headers: { "Cache-Control": "no-store" },
    });
  }
  return null;
}
