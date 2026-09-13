import crypto from "node:crypto";
import { cookies } from "next/headers";
import { prisma } from "@/lib/db";

export const CUSTOMER_SESSION_COOKIE = "bikeparts_customer_session";
const OTP_TTL_MS = 5 * 60 * 1000;
const SESSION_TTL_SECONDS = 30 * 24 * 60 * 60;
let lastAuthCleanupAt = 0;

export class CustomerAuthConfigurationError extends Error {}

export function normalizeCustomerPhone(phone: unknown) {
  return typeof phone === "string" ? phone.trim() : "";
}

export function isValidCustomerPhone(phone: string) {
  return /^\d{10}$/.test(phone);
}

// Same weak-value rejection as ADMIN_SESSION_SECRET (see
// lib/auth/admin-session.ts) — kept as a small local check rather than a
// shared import so customer auth doesn't depend on the admin auth module.
const WEAK_OTP_SECRETS = new Set(["secret", "changeme", "password", "admin", "12345678"]);

function getOtpHashSecret() {
  const secret = process.env.CUSTOMER_OTP_HASH_SECRET;
  if (process.env.NODE_ENV === "production") {
    if (!secret) throw new CustomerAuthConfigurationError("CUSTOMER_OTP_HASH_SECRET is not configured.");
    if (secret.length < 32 || WEAK_OTP_SECRETS.has(secret.trim().toLowerCase())) {
      throw new CustomerAuthConfigurationError("CUSTOMER_OTP_HASH_SECRET is too weak for production.");
    }
    return secret;
  }
  return secret || "development-only-customer-otp-secret";
}

export function hashOtp(phone: string, otp: string) {
  return crypto.createHmac("sha256", getOtpHashSecret()).update(`${phone}:${otp}`).digest();
}

function hashSessionToken(value: string) {
  return crypto.createHmac("sha256", getOtpHashSecret()).update(`session:${value}`).digest("hex");
}

export function generateOtp() {
  return crypto.randomInt(100000, 1000000).toString();
}

export async function issueCustomerOtp(phone: string) {
  if (Date.now() - lastAuthCleanupAt > 10 * 60 * 1000) {
    lastAuthCleanupAt = Date.now();
    void cleanupExpiredCustomerAuthData().catch(() => {});
  }
  const otp = generateOtp();
  const existing = await prisma.customerOtpChallenge.findUnique({ where: { phone } });
  if (existing && Date.now() - existing.createdAt.getTime() < 30_000) {
    throw new Error("Please wait before requesting another OTP.");
  }
  await prisma.customerOtpChallenge.upsert({
    where: { phone },
    update: {
      codeHash: hashOtp(phone, otp).toString("hex"),
      expiresAt: new Date(Date.now() + OTP_TTL_MS),
      attempts: 0,
      usedAt: null,
      createdAt: new Date(),
    },
    create: { phone, codeHash: hashOtp(phone, otp).toString("hex"), expiresAt: new Date(Date.now() + OTP_TTL_MS) },
  });
  return otp;
}

export async function createCustomerSession(userId: string) {
  const token = crypto.randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + SESSION_TTL_SECONDS * 1000);
  await prisma.customerSession.create({
    data: { userId, tokenHash: hashSessionToken(token), expiresAt },
  });
  const store = await cookies();
  store.set(CUSTOMER_SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_TTL_SECONDS,
  });
}

export async function getCustomerSession() {
  const store = await cookies();
  const token = store.get(CUSTOMER_SESSION_COOKIE)?.value;
  if (!token) return null;

  const session = await prisma.customerSession.findUnique({
    where: { tokenHash: hashSessionToken(token) },
    include: { user: true },
  });
  if (!session) return null;
  if (session.expiresAt <= new Date()) {
    await prisma.customerSession.delete({ where: { id: session.id } }).catch(() => {});
    return null;
  }
  return session;
}

export async function clearCustomerSession() {
  const store = await cookies();
  const token = store.get(CUSTOMER_SESSION_COOKIE)?.value;
  if (token) {
    await prisma.customerSession.deleteMany({ where: { tokenHash: hashSessionToken(token) } });
  }
  store.delete(CUSTOMER_SESSION_COOKIE);
}

export async function cleanupExpiredCustomerAuthData() {
  await prisma.customerSession.deleteMany({ where: { expiresAt: { lt: new Date() } } });
  await prisma.customerOtpChallenge.deleteMany({
    where: {
      OR: [
        { expiresAt: { lt: new Date(Date.now() - 60 * 60 * 1000) } },
        { usedAt: { not: null } },
      ],
    },
  });
}

export function hashesMatch(storedHex: string, candidate: Buffer) {
  const stored = Buffer.from(storedHex, "hex");
  return stored.length === candidate.length && crypto.timingSafeEqual(stored, candidate);
}