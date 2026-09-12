const attempts = new Map<string, { count: number; resetAt: number }>();

export class OtpRateLimitError extends Error {}

export function assertOtpRateLimit(key: string, limit: number, windowMs: number) {
  const now = Date.now();
  const current = attempts.get(key);
  if (!current || current.resetAt <= now) {
    attempts.set(key, { count: 1, resetAt: now + windowMs });
    return;
  }
  if (current.count >= limit) throw new OtpRateLimitError("Too many OTP requests. Please try again later.");
  current.count += 1;
}

export function getClientIp(request: Request) {
  return request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
}