import crypto from "node:crypto";

export const ADMIN_SESSION_COOKIE = "bikeparts_admin_session";
const SESSION_TTL_MS = 12 * 60 * 60 * 1000; // 12 hours

function getSessionSecret() {
  const secret = process.env.ADMIN_SESSION_SECRET;
  if (!secret) {
    throw new Error(
      "ADMIN_SESSION_SECRET is not set. Add it to .env.local (any long random string)."
    );
  }
  return secret;
}

function sign(payload: string) {
  return crypto.createHmac("sha256", getSessionSecret()).update(payload).digest("hex");
}

/** Checks the submitted email/password against ADMIN_EMAIL / ADMIN_PASSWORD in env. */
export function verifyAdminCredentials(email: string, password: string) {
  const adminEmail = process.env.ADMIN_EMAIL;
  const adminPassword = process.env.ADMIN_PASSWORD;

  if (!adminEmail || !adminPassword) {
    throw new Error(
      "Admin login is not configured. Set ADMIN_EMAIL and ADMIN_PASSWORD in .env.local."
    );
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
  const payload = `${email}|${expiresAt}`;
  const signature = sign(payload);
  return `${Buffer.from(payload).toString("base64url")}.${signature}`;
}

/** Verifies a session token from the cookie. Returns the admin email if valid. */
export function verifyAdminSessionToken(token: string | undefined | null) {
  if (!token) return null;

  const [encodedPayload, signature] = token.split(".");
  if (!encodedPayload || !signature) return null;

  let payload: string;
  try {
    payload = Buffer.from(encodedPayload, "base64url").toString("utf8");
  } catch {
    return null;
  }

  const expectedSignature = sign(payload);
  if (!safeEqual(signature, expectedSignature)) return null;

  const [email, expiresAtRaw] = payload.split("|");
  const expiresAt = Number(expiresAtRaw);
  if (!email || Number.isNaN(expiresAt) || Date.now() > expiresAt) return null;

  return email;
}

function safeEqual(a: string, b: string) {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}
