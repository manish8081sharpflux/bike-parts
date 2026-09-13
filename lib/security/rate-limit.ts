import Redis from "ioredis";

export type RateLimitPolicy = { limit: number; windowMs: number };

export class RateLimitExceededError extends Error {
  constructor(public readonly retryAfterSeconds: number) {
    super("Too many requests.");
  }
}

export class RateLimitUnavailableError extends Error {}

const memoryCounters = new Map<string, { count: number; resetAt: number }>();

function getRedis() {
  const url = process.env.REDIS_URL;
  if (!url) return null;
  const state = globalThis as typeof globalThis & { applicationRateLimitRedis?: Redis };
  if (!state.applicationRateLimitRedis) {
    const client = new Redis(url, {
      lazyConnect: true,
      enableOfflineQueue: false,
      maxRetriesPerRequest: 1,
    });
    // ioredis is an EventEmitter — a background connection error (dropped
    // connection, DNS blip, auth failure on reconnect) with no 'error'
    // listener is an unhandled EventEmitter error, which crashes the whole
    // Node process, not just this request. This listener is the difference
    // between "rate limiting degrades" and "the entire app goes down"
    // whenever Redis has a transient outage.
    client.on("error", (error) => {
      console.error("[security] Redis client error (rate limiting only — app continues):", error.message);
    });
    state.applicationRateLimitRedis = client;
  }
  return state.applicationRateLimitRedis;
}

export async function assertRateLimit(
  key: string,
  policy: RateLimitPolicy,
  options: { failClosed?: boolean } = {}
) {
  const failClosed = options.failClosed ?? true;
  const redis = getRedis();
  if (redis) {
    try {
      if (redis.status === "wait") await redis.connect();
      const results = await redis.multi().incr(key).pexpire(key, policy.windowMs).exec();
      const count = Number(results?.[0]?.[1]);
      if (count > policy.limit) {
        throw new RateLimitExceededError(Math.max(1, Math.ceil(policy.windowMs / 1000)));
      }
      return;
    } catch (error) {
      if (error instanceof RateLimitExceededError) throw error;
      console.error("[security] Rate limiter unavailable.");
      if (failClosed) throw new RateLimitUnavailableError("Request protection is temporarily unavailable.");
      return;
    }
  }

  if (process.env.NODE_ENV === "production") {
    console.error("[security] REDIS_URL is missing for rate limiting.");
    if (failClosed) throw new RateLimitUnavailableError("Request protection is temporarily unavailable.");
    return;
  }

  const now = Date.now();
  const current = memoryCounters.get(key);
  if (!current || current.resetAt <= now) {
    memoryCounters.set(key, { count: 1, resetAt: now + policy.windowMs });
    return;
  }
  if (current.count >= policy.limit) {
    throw new RateLimitExceededError(Math.max(1, Math.ceil((current.resetAt - now) / 1000)));
  }
  current.count += 1;
}

export async function clearRateLimit(key: string) {
  memoryCounters.delete(key);
  const redis = getRedis();
  if (redis) await redis.del(key).catch(() => console.error("[security] Could not clear rate-limit bucket."));
}

export function resetRateLimitsForTests() {
  memoryCounters.clear();
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
