"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import {
  ADMIN_SESSION_COOKIE,
  createAdminSessionToken,
  verifyAdminCredentials,
} from "@/lib/auth/admin-session";

export async function loginAdminAction(formData: FormData) {
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  const next = String(formData.get("next") ?? "/admin");

  let ok = false;
  try {
    ok = verifyAdminCredentials(email, password);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Admin login is not configured.";
    redirect(`/admin/login?error=${encodeURIComponent(message)}`);
  }

  if (!ok) {
    redirect(`/admin/login?error=${encodeURIComponent("Invalid email or password.")}`);
  }

  const token = createAdminSessionToken(email);
  const store = await cookies();
  store.set(ADMIN_SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 12,
  });

  redirect(next.startsWith("/admin") ? next : "/admin");
}

export async function logoutAdminAction() {
  const store = await cookies();
  store.delete(ADMIN_SESSION_COOKIE);
  redirect("/admin/login");
}
