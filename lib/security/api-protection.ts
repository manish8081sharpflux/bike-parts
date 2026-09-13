import crypto from "node:crypto";
import { getClientIp } from "./client-ip";
import { assertRateLimit, rateLimitResponse, type RateLimitPolicy } from "./rate-limit";

export function hashRateLimitIdentifier(value: string) {
  return crypto.createHash("sha256").update(value.trim().toLowerCase()).digest("hex").slice(0, 24);
}

export async function enforceApiRateLimit(
  request: Request,
  scope: string,
  policy: RateLimitPolicy,
  identifier?: string
): Promise<Response | null> {
  try {
    await assertRateLimit(`${scope}:ip:${getClientIp(request)}`, policy, { failClosed: true });
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
