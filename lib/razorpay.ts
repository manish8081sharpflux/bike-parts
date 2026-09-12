import crypto from "node:crypto";
import Razorpay from "razorpay";

let client: Razorpay | null = null;

/**
 * Lazily creates the Razorpay SDK client. Throws a clear error at call time
 * (not at import time) if RAZORPAY_KEY_ID / RAZORPAY_KEY_SECRET are missing,
 * so the rest of the app can still boot without payment keys configured.
 */
export function getRazorpayClient() {
  if (client) return client;

  const keyId = process.env.RAZORPAY_KEY_ID;
  const keySecret = process.env.RAZORPAY_KEY_SECRET;

  if (!keyId || !keySecret) {
    throw new Error(
      "Razorpay is not configured. Set RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET in .env.local."
    );
  }

  client = new Razorpay({ key_id: keyId, key_secret: keySecret });
  return client;
}

export async function createRazorpayOrder(params: {
  amountInPaise: number;
  receipt: string;
  notes?: Record<string, string>;
}) {
  const razorpay = getRazorpayClient();

  return razorpay.orders.create({
    amount: params.amountInPaise,
    currency: "INR",
    receipt: params.receipt,
    notes: params.notes,
  });
}

/** Verifies the signature returned by Razorpay Checkout after a successful payment. */
export function verifyRazorpayPaymentSignature(params: {
  orderId: string;
  paymentId: string;
  signature: string;
}) {
  const keySecret = process.env.RAZORPAY_KEY_SECRET;
  if (!keySecret) {
    throw new Error("RAZORPAY_KEY_SECRET is not configured.");
  }

  const expected = crypto
    .createHmac("sha256", keySecret)
    .update(`${params.orderId}|${params.paymentId}`)
    .digest("hex");

  return timingSafeEqualHex(expected, params.signature);
}

/** Verifies the `x-razorpay-signature` header on incoming webhook requests. */
export function verifyRazorpayWebhookSignature(params: {
  rawBody: string;
  signature: string;
}) {
  const webhookSecret = process.env.RAZORPAY_WEBHOOK_SECRET;
  if (!webhookSecret) {
    throw new Error("RAZORPAY_WEBHOOK_SECRET is not configured.");
  }

  const expected = crypto
    .createHmac("sha256", webhookSecret)
    .update(params.rawBody)
    .digest("hex");

  return timingSafeEqualHex(expected, params.signature);
}

function timingSafeEqualHex(a: string, b: string) {
  const bufA = Buffer.from(a, "hex");
  const bufB = Buffer.from(b, "hex");
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

export function isRazorpayConfigured() {
  return Boolean(process.env.RAZORPAY_KEY_ID && process.env.RAZORPAY_KEY_SECRET);
}

/**
 * Issues a refund against an already-captured payment. Always a full,
 * immediate ("normal" speed) refund in this app today — no partial-refund
 * UI yet. Throws on failure (Razorpay not configured, payment id unknown to
 * Razorpay, already fully refunded, etc.) — callers should catch and surface
 * the message rather than assume this always succeeds.
 */
export async function createRazorpayRefund(params: {
  paymentId: string;
  amountInPaise: number;
  notes?: Record<string, string>;
}) {
  const razorpay = getRazorpayClient();

  return razorpay.payments.refund(params.paymentId, {
    amount: params.amountInPaise,
    speed: "normal",
    notes: params.notes,
  });
}
