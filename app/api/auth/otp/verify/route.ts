import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import {
  createCustomerSession,
  isValidCustomerPhone,
  normalizeCustomerPhone,
} from "@/lib/auth/customer-session";
import crypto from "node:crypto";
import { assertOtpRateLimit, getClientIp, OtpRateLimitError } from "@/lib/auth/otp-rate-limit";

function hash(value: string) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const phone = normalizeCustomerPhone(body?.phone);
  const otp = typeof body?.otp === "string" ? body.otp.trim() : "";
  if (!isValidCustomerPhone(phone) || !/^\d{6}$/.test(otp)) {
    return NextResponse.json({ error: "A valid phone number and 6-digit OTP are required." }, { status: 400 });
  }

  try {
    assertOtpRateLimit(`verify:phone:${phone}`, 10, 15 * 60 * 1000);
    assertOtpRateLimit(`verify:ip:${getClientIp(request)}`, 30, 15 * 60 * 1000);
  } catch (error) {
    const message = error instanceof OtpRateLimitError || error instanceof Error
      ? error.message
      : "Too many OTP attempts. Please try again later.";
    return NextResponse.json({ error: message }, { status: 429 });
  }

  const challenge = await prisma.customerOtpChallenge.findUnique({ where: { phone } });
  if (!challenge || challenge.usedAt || challenge.expiresAt <= new Date() || challenge.attempts >= 5) {
    return NextResponse.json({ error: "That OTP is invalid or expired." }, { status: 400 });
  }
  if (hash(otp) !== challenge.codeHash) {
    await prisma.customerOtpChallenge.update({
      where: { id: challenge.id },
      data: { attempts: { increment: 1 } },
    });
    return NextResponse.json({ error: "That OTP is invalid or expired." }, { status: 400 });
  }

  await prisma.customerOtpChallenge.update({
    where: { id: challenge.id },
    data: { usedAt: new Date() },
  });
  const user = await prisma.user.upsert({
    where: { phone },
    update: {},
    create: { phone },
  });
  await createCustomerSession(user.id);

  return NextResponse.json({
    authenticated: true,
    user: { id: user.id, phone: user.phone, name: user.name },
  });
}