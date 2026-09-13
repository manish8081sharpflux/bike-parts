import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { ADMIN_SESSION_COOKIE, verifyAdminSessionToken } from "@/lib/auth/admin-session";
import { generateNonce } from "@/lib/security/nonce";
import { buildContentSecurityPolicy } from "@/lib/security/headers";

const PUBLIC_ADMIN_PATHS = ["/admin/login"];
const PUBLIC_ADMIN_API_PATHS = ["/api/admin/login"];

/**
 * Two independent jobs share this file because Next.js only allows one:
 *
 * 1. Admin auth redirect (pre-existing) — bounces an unauthenticated
 *    /admin/* page to /admin/login?next=<path> (preserved so login lands
 *    back where the customer meant to go — see safeAdminRedirect), and
 *    401s an unauthenticated /api/admin/* call directly. This is a
 *    defense-in-depth layer in front of requireAdminPage()'s own redirect
 *    (see lib/auth/require-admin.ts) — not a replacement for it.
 *
 * 2. Nonce-based CSP (Fix 9) — generates a fresh nonce every request and
 *    sets Content-Security-Policy from it, on both the outgoing *request*
 *    headers (so Next's own renderer can parse the `nonce-...` value back
 *    out and apply it to the framework/page scripts it injects — see the
 *    "How nonces work in Next.js" section of Next's own CSP docs) and the
 *    response headers (so the browser actually enforces it). Applied to
 *    every response this file returns, including the admin
 *    redirect/401 above.
 */
export function proxy(request: NextRequest) {
  const nonce = generateNonce();
  const production = process.env.NODE_ENV === "production";
  const csp = buildContentSecurityPolicy({ production, nonce });

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-nonce", nonce);
  requestHeaders.set("Content-Security-Policy", csp);

  const next = () => NextResponse.next({ request: { headers: requestHeaders } });
  const withCsp = (response: NextResponse) => {
    response.headers.set("Content-Security-Policy", csp);
    return response;
  };

  const { pathname } = request.nextUrl;
  const isAdminPage = pathname.startsWith("/admin");
  const isAdminApi = pathname.startsWith("/api/admin");

  if (!isAdminPage && !isAdminApi) {
    return withCsp(next());
  }

  if (PUBLIC_ADMIN_PATHS.some((path) => pathname.startsWith(path))) {
    return withCsp(next());
  }
  if (PUBLIC_ADMIN_API_PATHS.some((path) => pathname.startsWith(path))) {
    return withCsp(next());
  }

  const token = request.cookies.get(ADMIN_SESSION_COOKIE)?.value;
  const email = verifyAdminSessionToken(token);

  if (!email) {
    if (isAdminApi) {
      return withCsp(NextResponse.json({ error: "Not authenticated" }, { status: 401 }));
    }

    const loginUrl = new URL("/admin/login", request.url);
    loginUrl.searchParams.set("next", pathname);
    return withCsp(NextResponse.redirect(loginUrl));
  }

  return withCsp(next());
}

export const config = {
  matcher: [
    {
      // Every real page/API response gets a CSP — only truly static,
      // never-rendered assets are skipped. Also skip prefetch requests
      // (next/link hover-prefetch, etc.) per Next's own recommendation,
      // since they never render and don't need a fresh nonce.
      source: "/((?!_next/static|_next/image|favicon.ico).*)",
      missing: [
        { type: "header", key: "next-router-prefetch" },
        { type: "header", key: "purpose", value: "prefetch" },
      ],
    },
  ],
};
