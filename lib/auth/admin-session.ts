import crypto from "node:crypto";

export const ADMIN_SESSION_COOKIE = "bikeparts_admin_session";
const SESSION_TTL_MS = 12 * 60 * 60 * 1000; // 12 hours
export const ADMIN_SESSION_MAX_AGE_SECONDS = SESSION_TTL_MS / 1000;
export class AdminConfigurationError extends Error {}

const WEAK_SECRETS = new Set(["secret", "changeme", "password", "admin"]);

export function validateAdminSessionSecret(secret: string | undefined, production = process.env.NODE_ENV === "production") {
  if (!secret) throw new AdminConfigurationError("ADMIN_SESSION_SECRET is not set.");
  if (production && (secret.length < 32 || WEAK_SECRETS.has(secret.trim().toLowerCase()))) {
    throw new AdminConfigurationError("ADMIN_SESSION_SECRET is too weak for production.");
  }
  return secret;
}

function getSessionVersion() {
  const version = process.env.ADMIN_SESSION_VERSION ?? (process.env.NODE_ENV === "production" ? "" : "1");
  if (!/^[A-Za-z0-9._-]{1,64}$/.test(version)) {
    throw new AdminConfigurationError("ADMIN_SESSION_VERSION is not configured correctly.");
  }
  return version;
}

function getSessionSecret() {
  return validateAdminSessionSecret(process.env.ADMIN_SESSION_SECRET);
}

function sign(payload: string) {
  return crypto.createHmac("sha256", getSessionSecret()).update(payload).digest("hex");
}

/** Checks the submitted email/password against ADMIN_EMAIL / ADMIN_PASSWORD in env. */
export function verifyAdminCredentials(email: string, password: string) {
  const adminEmail = process.env.ADMIN_EMAIL;
  const adminPassword = process.env.ADMIN_PASSWORD;

  if (!adminEmail || !adminPassword) {
    throw new AdminConfigurationError("Admin login is not configured.");
  }

  const emailMatches = safeEqual(email.trim().toLowerCase(), adminEmail.trim().toLowerCase());
  const passwordMatches = safeEqual(password, adminPassword);

  return emailMatches && passwordMatches;
}

/** Builds a signed, tamper-proof session token to store in a cookie. */
export function createAdminSessionToken(email: string) {
  const expiresAt = Date.now() + SESSION_TTL_MS;
  // "|" (not ".") separates the fields — an email address can legally contain
  // dots (e.g. "admin@bikeparts.com"), which would otherwise break the split.
  const payload = JSON.stringify({
    email: email.trim().toLowerCase(),
    expiresAt,
    version: getSessionVersion(),
    sessionId: crypto.randomUUID(),
  });
  const signature = sign(payload);
  return `${Buffer.from(payload).toString("base64url")}.${signature}`;
}

/** Verifies a session token from the cookie. Returns the admin email if valid. */
export function verifyAdminSessionToken(token: string | undefined | null) {
  if (!token) return null;

  const parts = token.split(".");
  if (parts.length !== 2) return null;
  const [encodedPayload, signature] = parts;
  if (!encodedPayload || !signature) return null;

  let payload: string;
  try {
    payload = Buffer.from(encodedPayload, "base64url").toString("utf8");
  } catch {
    return null;
  }

  const expectedSignature = sign(payload);
  if (!safeEqual(signature, expectedSignature)) return null;

  try {
    const parsed = JSON.parse(payload) as Record<string, unknown>;
    if (
      typeof parsed.email !== "string" ||
      typeof parsed.expiresAt !== "number" ||
      typeof parsed.version !== "string" ||
      typeof parsed.sessionId !== "string" ||
      Date.now() > parsed.expiresAt ||
      parsed.version !== getSessionVersion()
    ) return null;
    return parsed.email;
  } catch {
    return null;
  }
}

export function safeAdminRedirect(raw: string) {
  if (!raw.startsWith("/admin") || raw.startsWith("//") || raw.includes("\\") || raw.includes("@")) return "/admin";
  try {
    const url = new URL(raw, "https://internal.invalid");
    return url.origin === "https://internal.invalid" && (url.pathname === "/admin" || url.pathname.startsWith("/admin/"))
      ? `${url.pathname}${url.search}${url.hash}`
      : "/admin";
  } catch {
    return "/admin";
  }
}

function safeEqual(a: string, b: string) {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}
