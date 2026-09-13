import crypto from "node:crypto";
import { getClientIp } from "./client-ip";
import { assertRateLimit, rateLimitResponse, type RateLimitPolicy } from "./rate-limit";

export function hashRateLimitIdentifier(value: string) {
  return crypto.createHash("sha256").update(value.trim().toLowerCase()).digest("hex").slice(0, 24);
}

/**
 * IP-keyed limiting only applies when `getClientIp()` returns a trustworthy
 * address — never a shared placeholder (see that function's doc comment).
 * In direct-exposure mode (no trusted proxy) that bucket is skipped
 * entirely rather than keying every caller under one constant string, which
 * would let a single caller exhaust the bucket for everyone else.
 *
 * Every current call site passes `identifier` (the authenticated
 * session/user id) — that subject-keyed bucket is what actually protects
 * these routes when no trustworthy IP is available, so callers that need
 * protection to hold even in direct-exposure mode MUST pass one. An
 * unauthenticated route with no identifier and no trustworthy IP would get
 * no rate limiting from this function at all.
 */
export async function enforceApiRateLimit(
  request: Request,
  scope: string,
  policy: RateLimitPolicy,
  identifier?: string
): Promise<Response | null> {
  try {
    const ip = getClientIp(request);
    if (ip) {
      await assertRateLimit(`${scope}:ip:${ip}`, policy, { failClosed: true });
    }
    if (identifier) {
      await assertRateLimit(`${scope}:subject:${hashRateLimitIdentifier(identifier)}`, policy, { failClosed: true });
    }
    return null;
  } catch (error) {
    return rateLimitResponse(error);
  }
}

export function rejectInvalidJsonRequest(request: Request, maxBytes = 64 * 1024): Response | null {
  if (!request.headers.get("content-type")?.toLowerCase().startsWith("application/json")) {
    return Response.json({ error: "Content-Type must be application/json." }, { status: 415 });
  }
  const length = Number(request.headers.get("content-length"));
  if (Number.isFinite(length) && length > maxBytes) {
    return Response.json({ error: "Request body is too large." }, { status: 413 });
  }
  return null;
}
