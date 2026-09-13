import { hashRateLimitIdentifier } from "./api-protection";
import { assertRateLimit, clearRateLimit } from "./rate-limit";

const LOGIN_WINDOW_MS = 15 * 60 * 1000;

export async function assertAdminLoginRateLimit(email: string, ip: string) {
  await assertRateLimit(`admin-login:ip:${ip}`, { limit: 10, windowMs: LOGIN_WINDOW_MS }, { failClosed: true });
  await assertRateLimit(`admin-login:email:${hashRateLimitIdentifier(email)}`, { limit: 5, windowMs: LOGIN_WINDOW_MS }, { failClosed: true });
}

export async function clearAdminEmailRateLimit(email: string) {
  await clearRateLimit(`admin-login:email:${hashRateLimitIdentifier(email)}`);
}
