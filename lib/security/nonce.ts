import crypto from "node:crypto";

/**
 * Cryptographically unpredictable, one-time-use per request. Never a
 * timestamp/counter/Math.random() — the nonce is public (it goes straight
 * into the response's CSP header), so its only security property is that an
 * attacker can't guess it in advance.
 */
export function generateNonce(): string {
  return crypto.randomBytes(16).toString("base64");
}
