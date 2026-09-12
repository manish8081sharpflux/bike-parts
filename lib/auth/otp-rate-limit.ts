import Redis from "ioredis";

const developmentAttempts = new Map<string, { count: number; resetAt: number }>();

export class OtpRateLimitError extends Error {}
export class OtpRateLimitUnavailableError extends Error {}

function getRedis() {
  const url = process.env.REDIS_URL;
  if (!url) return null;
  const globalState = globalThis as typeof globalThis & { customerOtpRedis?: Redis };
  if (!globalState.customerOtpRedis) {
    globalState.customerOtpRedis = new Redis(url, {
      lazyConnect: true,
      enableOfflineQueue: false,
      maxRetriesPerRequest: 1,
    });
  }
  return globalState.customerOtpRedis;
}

export async function assertOtpRateLimit(key: string, limit: number, windowMs: number) {
  const redis = getRedis();
  if (redis) {
    try {
      if (redis.status === "wait") await redis.connect();
      const results = await redis
        .multi()
        .incr(key)
        .expire(key, Math.ceil(windowMs / 1000))
        .exec();
      const count = Number(results?.[0]?.[1]);
      if (count > limit) throw new OtpRateLimitError("Too many OTP requests. Please try again later.");
      return;
    } catch (error) {
      if (error instanceof OtpRateLimitError) throw error;
      if (process.env.NODE_ENV === "production") {
        throw new OtpRateLimitUnavailableError("OTP protection is temporarily unavailable.");
      }
    }
  } else if (process.env.NODE_ENV === "production") {
    throw new OtpRateLimitUnavailableError("OTP protection is temporarily unavailable.");
  }

  const now = Date.now();
  const current = developmentAttempts.get(key);
  if (!current || current.resetAt <= now) {
    developmentAttempts.set(key, { count: 1, resetAt: now + windowMs });
    return;
  }
  if (current.count >= limit) throw new OtpRateLimitError("Too many OTP requests. Please try again later.");
  current.count += 1;
}

export function getClientIp(request: Request) {
  return request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
}