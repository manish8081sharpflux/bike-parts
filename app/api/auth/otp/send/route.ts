import { NextResponse } from "next/server";
import {
  isValidCustomerPhone,
  issueCustomerOtp,
  normalizeCustomerPhone,
  CustomerAuthConfigurationError,
} from "@/lib/auth/customer-session";
import { assertOtpRateLimit, getClientIp, OtpRateLimitError } from "@/lib/auth/otp-rate-limit";
import { OtpRateLimitUnavailableError } from "@/lib/auth/otp-rate-limit";
import { sendCustomerOtpSms } from "@/lib/auth/send-customer-otp";
import { rejectInvalidJsonRequest } from "@/lib/security/api-protection";

export async function POST(request: Request) {
  const invalidJson = rejectInvalidJsonRequest(request, 8 * 1024);
  if (invalidJson) return invalidJson;
  const body = await request.json().catch(() => null);
  const phone = normalizeCustomerPhone(body?.phone);
  if (!isValidCustomerPhone(phone)) {
    return NextResponse.json({ error: "A valid 10-digit phone number is required." }, { status: 400 });
  }

  try {
    // Phone-based limiting always applies. IP-based is additional
    // defense-in-depth, applied only when getClientIp() returns a
    // trustworthy address — never a shared placeholder every caller would
    // collide under in direct-exposure mode.
    await assertOtpRateLimit(`send:phone:${phone}`, 20, 10 * 60 * 1000);
    const ip = getClientIp(request);
    if (ip) {
      await assertOtpRateLimit(`send:ip:${ip}`, 30, 15 * 60 * 1000);
    }
  } catch (error) {
    if (error instanceof OtpRateLimitUnavailableError) {
      return NextResponse.json({ error: "OTP service is temporarily unavailable." }, { status: 503 });
    }
    const message = error instanceof OtpRateLimitError || error instanceof Error
      ? error.message
      : "Too many OTP requests. Please try again later.";
    return NextResponse.json({ error: message }, { status: 429 });
  }

  let otp: string;
  try {
    otp = await issueCustomerOtp(phone);
  } catch (error) {
    if (error instanceof CustomerAuthConfigurationError) {
      return NextResponse.json({ error: "OTP service is temporarily unavailable." }, { status: 503 });
    }
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Please wait before requesting another OTP." },
      { status: 429 }
    );
  }
  if (process.env.NODE_ENV === "production" || process.env.CUSTOMER_OTP_DEV_MODE !== "true") {
    try {
      await sendCustomerOtpSms(phone, otp);
    } catch (error) {
      console.error("Customer OTP delivery failed:", error instanceof Error ? error.message : "unknown error");
      return NextResponse.json({ error: "OTP service is temporarily unavailable." }, { status: 503 });
    }
  }
  if (process.env.NODE_ENV !== "production" && process.env.CUSTOMER_OTP_DEV_MODE === "true") {
    console.info(`[customer-auth] Development OTP for ${phone}: ${otp}`);
    return NextResponse.json({ ok: true, developmentOtp: otp });
  }

  return NextResponse.json({ ok: true });
}
