import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { ADMIN_SESSION_COOKIE, verifyAdminSessionToken } from "@/lib/auth/admin-session";

const PUBLIC_ADMIN_PATHS = ["/admin/login"];
const PUBLIC_ADMIN_API_PATHS = ["/api/admin/login"];

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  const isAdminPage = pathname.startsWith("/admin");
  const isAdminApi = pathname.startsWith("/api/admin");

  if (!isAdminPage && !isAdminApi) {
    return NextResponse.next();
  }

  if (PUBLIC_ADMIN_PATHS.some((path) => pathname.startsWith(path))) {
    return NextResponse.next();
  }
  if (PUBLIC_ADMIN_API_PATHS.some((path) => pathname.startsWith(path))) {
    return NextResponse.next();
  }

  const token = request.cookies.get(ADMIN_SESSION_COOKIE)?.value;
  const email = verifyAdminSessionToken(token);

  if (!email) {
    if (isAdminApi) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    const loginUrl = new URL("/admin/login", request.url);
    loginUrl.searchParams.set("next", pathname);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/admin/:path*", "/api/admin/:path*"],
};
