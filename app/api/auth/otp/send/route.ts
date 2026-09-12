import { NextResponse } from "next/server";
import {
  isValidCustomerPhone,
  issueCustomerOtp,
  normalizeCustomerPhone,
} from "@/lib/auth/customer-session";
import { assertOtpRateLimit, getClientIp, OtpRateLimitError } from "@/lib/auth/otp-rate-limit";

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const phone = normalizeCustomerPhone(body?.phone);
  if (!isValidCustomerPhone(phone)) {
    return NextResponse.json({ error: "A valid 10-digit phone number is required." }, { status: 400 });
  }

  try {
    assertOtpRateLimit(`send:phone:${phone}`, 3, 15 * 60 * 1000);
    assertOtpRateLimit(`send:ip:${getClientIp(request)}`, 10, 15 * 60 * 1000);
  } catch (error) {
    const message = error instanceof OtpRateLimitError || error instanceof Error
      ? error.message
      : "Too many OTP requests. Please try again later.";
    return NextResponse.json({ error: message }, { status: 429 });
  }

  let otp: string;
  try {
    otp = await issueCustomerOtp(phone);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Please wait before requesting another OTP." },
      { status: 429 }
    );
  }
  if (process.env.NODE_ENV !== "production" && process.env.CUSTOMER_OTP_DEV_MODE === "true") {
    console.info(`[customer-auth] Development OTP for ${phone}: ${otp}`);
    return NextResponse.json({ ok: true, developmentOtp: otp });
  }

  // Production SMS delivery belongs here once an SMS provider is configured.
  console.info(`[customer-auth] OTP queued for ${phone}`);
  return NextResponse.json({ ok: true });
}