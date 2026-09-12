import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { ADMIN_SESSION_COOKIE, verifyAdminSessionToken } from "./admin-session";

/** Reads and verifies the admin session cookie. Returns the admin email, or null. */
export async function getAdminEmail() {
  const store = await cookies();
  const token = store.get(ADMIN_SESSION_COOKIE)?.value;
  return verifyAdminSessionToken(token);
}

/**
 * For Server Components (pages/layouts) under /admin. Proxy already redirects
 * unauthenticated requests, but Next.js recommends checking again inside each
 * server entry point rather than relying on proxy alone.
 */
export async function requireAdminPage() {
  const email = await getAdminEmail();
  if (!email) {
    redirect("/admin/login");
  }
  return email;
}

/** For Server Actions invoked from admin forms. Throws if not authenticated. */
export async function requireAdminAction() {
  const email = await getAdminEmail();
  if (!email) {
    throw new Error("Not authenticated. Please log in again.");
  }
  return email;
}
