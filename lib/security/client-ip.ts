/**
 * Forwarded headers are trusted in production only with TRUST_PROXY_HEADERS=true.
 * That setting assumes the origin is firewalled so clients cannot bypass the
 * trusted Cloudflare/nginx/IIS proxy and spoof these headers directly.
 */
export function getClientIp(request: Request | { headers: Headers }): string {
  const trustProxy = process.env.NODE_ENV !== "production" || process.env.TRUST_PROXY_HEADERS === "true";
  if (!trustProxy) return "untrusted-proxy";
  return request.headers.get("cf-connecting-ip")?.trim()
    || request.headers.get("x-forwarded-for")?.split(",")[0]?.trim()
    || request.headers.get("x-real-ip")?.trim()
    || "unknown";
}
