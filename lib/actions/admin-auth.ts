"use server";

import { cookies } from "next/headers";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import {
  ADMIN_SESSION_COOKIE,
  ADMIN_SESSION_MAX_AGE_SECONDS,
  AdminConfigurationError,
  createAdminSessionToken,
  safeAdminRedirect,
  verifyAdminCredentials,
} from "@/lib/auth/admin-session";
import { getClientIp } from "@/lib/security/client-ip";
import { assertAdminLoginRateLimit, clearAdminEmailRateLimit } from "@/lib/security/admin-login";
import {
  RateLimitExceededError,
  RateLimitUnavailableError,
} from "@/lib/security/rate-limit";

export async function loginAdminAction(formData: FormData) {
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  const next = String(formData.get("next") ?? "/admin");

  const requestHeaders = await headers();
  let ok = false;
  let failure: string | null = null;
  try {
    await assertAdminLoginRateLimit(email, getClientIp({ headers: requestHeaders }));
    ok = verifyAdminCredentials(email, password);
  } catch (error) {
    if (error instanceof RateLimitExceededError) {
      console.warn("[security] Admin login throttled.");
      failure = "Too many login attempts. Please try again later.";
    } else if (error instanceof RateLimitUnavailableError) {
      console.error("[security] Admin login rate limiter unavailable.");
      failure = "Admin login is temporarily unavailable.";
    } else {
      console.error("[security] Admin login configuration error.", error instanceof AdminConfigurationError ? error.message : error);
      failure = process.env.NODE_ENV === "production"
        ? "Admin login is temporarily unavailable."
        : error instanceof Error ? error.message : "Admin login is not configured.";
    }
  }

  if (failure) redirect(`/admin/login?error=${encodeURIComponent(failure)}`);

  if (!ok) {
    redirect(`/admin/login?error=${encodeURIComponent("Invalid email or password.")}`);
  }

  await clearAdminEmailRateLimit(email);
  const token = createAdminSessionToken(email);
  const store = await cookies();
  store.set(ADMIN_SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    // Not narrowed to /admin: getAdminEmail() (this same cookie) also gates
    // app/api/search/index, which lives outside /admin — a real browser
    // would never attach a /admin-scoped cookie there. Every other
    // protection (httpOnly, secure, sameSite=lax, short TTL, versioning)
    // still applies at path "/".
    path: "/",
    maxAge: ADMIN_SESSION_MAX_AGE_SECONDS,
  });

  redirect(safeAdminRedirect(next));
}

export async function logoutAdminAction() {
  const store = await cookies();
  store.set(ADMIN_SESSION_COOKIE, "", { path: "/", maxAge: 0 });
  redirect("/admin/login");
}
