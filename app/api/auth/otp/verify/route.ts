import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import {
  createCustomerSession,
  hashOtp,
  hashesMatch,
  isValidCustomerPhone,
  normalizeCustomerPhone,
} from "@/lib/auth/customer-session";
import {
  assertOtpRateLimit,
  getClientIp,
  OtpRateLimitError,
  OtpRateLimitUnavailableError,
} from "@/lib/auth/otp-rate-limit";
import { rejectInvalidJsonRequest } from "@/lib/security/api-protection";

export async function POST(request: Request) {
  const invalidJson = rejectInvalidJsonRequest(request, 8 * 1024);
  if (invalidJson) return invalidJson;
  const body = await request.json().catch(() => null);
  const phone = normalizeCustomerPhone(body?.phone);
  const otp = typeof body?.otp === "string" ? body.otp.trim() : "";
  if (!isValidCustomerPhone(phone) || !/^\d{4}$/.test(otp)) {
    return NextResponse.json({ error: "A valid phone number and 4-digit OTP are required." }, { status: 400 });
  }

  try {
    // Phone-based limiting always applies. IP-based is additional
    // defense-in-depth, applied only when getClientIp() returns a
    // trustworthy address — never a shared placeholder every caller would
    // collide under in direct-exposure mode.
    await assertOtpRateLimit(`verify:phone:${phone}`, 10, 15 * 60 * 1000);
    const ip = getClientIp(request);
    if (ip) {
      await assertOtpRateLimit(`verify:ip:${ip}`, 30, 15 * 60 * 1000);
    }
  } catch (error) {
    if (error instanceof OtpRateLimitUnavailableError) {
      return NextResponse.json({ error: "OTP service is temporarily unavailable." }, { status: 503 });
    }
    const message = error instanceof OtpRateLimitError || error instanceof Error
      ? error.message
      : "Too many OTP attempts. Please try again later.";
    return NextResponse.json({ error: message }, { status: 429 });
  }

  const challenge = await prisma.customerOtpChallenge.findUnique({ where: { phone } });
  if (!challenge || challenge.usedAt || challenge.expiresAt <= new Date() || challenge.attempts >= 5) {
    return NextResponse.json({ error: "That OTP is invalid or expired." }, { status: 400 });
  }
  if (!hashesMatch(challenge.codeHash, hashOtp(phone, otp))) {
    await prisma.customerOtpChallenge.update({
      where: { id: challenge.id },
      data: { attempts: { increment: 1 } },
    });
    return NextResponse.json({ error: "That OTP is invalid or expired." }, { status: 400 });
  }

  const consumed = await prisma.customerOtpChallenge.updateMany({
    where: {
      id: challenge.id,
      usedAt: null,
      expiresAt: { gt: new Date() },
      attempts: { lt: 5 },
    },
    data: { usedAt: new Date() },
  });
  if (consumed.count !== 1) {
    return NextResponse.json({ error: "That OTP is invalid or expired." }, { status: 400 });
  }
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
