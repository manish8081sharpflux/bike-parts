import crypto from "node:crypto";
import { cookies } from "next/headers";
import { prisma } from "@/lib/db";

export const CUSTOMER_SESSION_COOKIE = "bikeparts_customer_session";
const OTP_TTL_MS = 5 * 60 * 1000;
const SESSION_TTL_SECONDS = 30 * 24 * 60 * 60;

export function normalizeCustomerPhone(phone: unknown) {
  return typeof phone === "string" ? phone.trim() : "";
}

export function isValidCustomerPhone(phone: string) {
  return /^\d{10}$/.test(phone);
}

function hash(value: string) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

export function generateOtp() {
  return crypto.randomInt(100000, 1000000).toString();
}

export async function issueCustomerOtp(phone: string) {
  const otp = generateOtp();
  const existing = await prisma.customerOtpChallenge.findUnique({ where: { phone } });
  if (existing && Date.now() - existing.createdAt.getTime() < 30_000) {
    throw new Error("Please wait before requesting another OTP.");
  }
  await prisma.customerOtpChallenge.upsert({
    where: { phone },
    update: {
      codeHash: hash(otp),
      expiresAt: new Date(Date.now() + OTP_TTL_MS),
      attempts: 0,
      usedAt: null,
      createdAt: new Date(),
    },
    create: { phone, codeHash: hash(otp), expiresAt: new Date(Date.now() + OTP_TTL_MS) },
  });
  return otp;
}

export async function createCustomerSession(userId: string) {
  const token = crypto.randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + SESSION_TTL_SECONDS * 1000);
  await prisma.customerSession.create({
    data: { userId, tokenHash: hash(token), expiresAt },
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
    where: { tokenHash: hash(token) },
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
    await prisma.customerSession.deleteMany({ where: { tokenHash: hash(token) } });
  }
  store.delete(CUSTOMER_SESSION_COOKIE);
}