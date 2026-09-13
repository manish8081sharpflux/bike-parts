function getTwilioConfig() {
  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const apiKeySid = process.env.TWILIO_API_KEY_SID;
  const apiKeySecret = process.env.TWILIO_API_KEY_SECRET;
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  const from = process.env.TWILIO_FROM_NUMBER;
  if (!accountSid || !from || (!authToken && !(apiKeySid && apiKeySecret))) return null;
  return { accountSid, apiKeySid, apiKeySecret, authToken, from };
}

async function sendViaTwilio(phone: string, otp: string): Promise<void> {
  const config = getTwilioConfig();
  if (!config) throw new Error("Twilio SMS configuration is incomplete.");

  const response = await fetch(
    `https://api.twilio.com/2010-04-01/Accounts/${config.accountSid}/Messages.json`,
    {
      method: "POST",
      headers: {
        Authorization: `Basic ${Buffer.from(
          `${config.apiKeySid ?? config.accountSid}:${config.apiKeySecret ?? config.authToken}`
        ).toString("base64")}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        To: `+91${phone}`,
        From: config.from,
        Body: `Your Deep Automobiles OTP is ${otp}. It expires in 5 minutes.`,
      }),
    }
  );
  if (!response.ok) throw new Error(`SMS provider returned HTTP ${response.status}.`);
}

function getA2pConfig() {
  const baseUrl = process.env.SMS_A2P_BASE_URL;
  const user = process.env.SMS_A2P_USER;
  const password = process.env.SMS_A2P_PASSWORD;
  const senderId = process.env.SMS_A2P_SENDER_ID;
  const channel = process.env.SMS_A2P_CHANNEL;
  const dcs = process.env.SMS_A2P_DCS;
  const flashSms = process.env.SMS_A2P_FLASH_SMS;
  const route = process.env.SMS_A2P_ROUTE;
  const peId = process.env.SMS_A2P_PEID;
  if (!baseUrl || !user || !password || !senderId || !channel || !dcs || !flashSms || !route || !peId) {
    return null;
  }
  return { baseUrl, user, password, senderId, channel, dcs, flashSms, route, peId };
}

// a2pservices.in's SendSMS API. Confirmed by live probing (not guessed):
// - The real fix is the HTTP method: this endpoint needs GET, not POST.
//   Posting to it (with params as a body, as a query string, or as JSON —
//   all tried) always returns the same generic "login details cannot be
//   blank" regardless of input, even with an empty request. Path casing
//   (`/api/mt/SendSMS` vs `/api/mt/sendsms`) does not matter — this host
//   routes case-insensitively, confirmed by testing both with GET.
// - Field names are lowercase (user, password, senderid, channel, route),
//   aside from DCS/PEId, with `number`/`text` for recipient/message — this
//   part matches the common template also used by SMS India Hub, SmsXion,
//   Ultron SMS, etc.
// - Confirmed working credentials return `{"ErrorCode":"006","ErrorMessage":
//   "error:Invalid template text"}` for non-matching content: this is a DLT
//   Trans-route requirement that `text` match a pre-registered template
//   exactly (see SMS_REACT_INTEGRATION_GUIDE for the registered template for
//   this SenderId/PEId).
// Note this vendor only exposes an http:// (not https://) endpoint, so
// user/password travel in plaintext on the wire; that is a limitation of
// the vendor's API, not something introduced here.
async function sendViaA2p(phone: string, otp: string): Promise<void> {
  const config = getA2pConfig();
  if (!config) throw new Error("a2pservices SMS configuration is incomplete.");

  const params = new URLSearchParams({
    user: config.user,
    password: config.password,
    senderid: config.senderId,
    channel: config.channel,
    DCS: config.dcs,
    flashsms: config.flashSms,
    route: config.route,
    PEId: config.peId,
    number: `91${phone}`,
    // Must match the DLT-registered template for this PEId/SenderId exactly
    // (Trans route rejects/blocks content that doesn't match a pre-approved
    // template) — this is the template already registered for this account.
    text: `<#> Your verification code is ${otp} Use this OTP to proceed with your request. Do not share it with anyone. Sharpflux Technologies LLP.\n dqAB8ldvXQ=`,
  });

  const response = await fetch(`${config.baseUrl}?${params.toString()}`, { method: "GET" });
  if (!response.ok) throw new Error(`SMS provider returned HTTP ${response.status}.`);

  // Confirmed via live testing: this gateway always returns HTTP 200, even
  // on failure — the real result is `ErrorCode` in the JSON body. Confirmed
  // success response: {"ErrorCode":"000","ErrorMessage":"Done","JobId":
  // "...","MessageData":[...]}. Any other code (e.g. "1" login/blank, "7"
  // invalid credentials, "006" invalid template) is a rejection, with a
  // human-readable `ErrorMessage`. Treating HTTP 200 alone as success let a
  // rejected request silently report as delivered.
  const bodyText = await response.text().catch(() => "");
  let result: { ErrorCode?: string; ErrorMessage?: string } | null = null;
  try {
    result = JSON.parse(bodyText);
  } catch {
    throw new Error("SMS provider returned an unrecognized response.");
  }
  if (!result || result.ErrorCode !== "000") {
    throw new Error(`SMS provider rejected the request: ${result?.ErrorMessage ?? "unknown error"}.`);
  }
}

/** Sends an OTP through the configured provider. This module owns provider details. */
export async function sendCustomerOtpSms(phone: string, otp: string): Promise<void> {
  const provider = process.env.CUSTOMER_SMS_PROVIDER?.toLowerCase();
  if (provider === "a2p") return sendViaA2p(phone, otp);
  if (provider === "twilio") return sendViaTwilio(phone, otp);
  throw new Error("No customer SMS provider is configured.");
}
