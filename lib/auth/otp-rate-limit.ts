import { getClientIp } from "@/lib/security/client-ip";
import { assertRateLimit, RateLimitExceededError, RateLimitUnavailableError } from "@/lib/security/rate-limit";

export { getClientIp };

export class OtpRateLimitError extends Error {}
export class OtpRateLimitUnavailableError extends Error {}

export async function assertOtpRateLimit(key: string, limit: number, windowMs: number) {
  try {
    await assertRateLimit(`otp:${key}`, { limit, windowMs }, { failClosed: true });
  } catch (error) {
    if (error instanceof RateLimitExceededError) {
      throw new OtpRateLimitError("Too many OTP requests. Please try again later.");
    }
    if (error instanceof RateLimitUnavailableError) {
      throw new OtpRateLimitUnavailableError("OTP protection is temporarily unavailable.");
    }
    throw error;
  }
}
