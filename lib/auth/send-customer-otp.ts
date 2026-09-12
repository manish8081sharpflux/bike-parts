function getTwilioConfig() {
  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const apiKeySid = process.env.TWILIO_API_KEY_SID;
  const apiKeySecret = process.env.TWILIO_API_KEY_SECRET;
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  const from = process.env.TWILIO_FROM_NUMBER;
  if (!accountSid || !from || (!authToken && !(apiKeySid && apiKeySecret))) return null;
  return { accountSid, apiKeySid, apiKeySecret, authToken, from };
}

/** Sends an OTP through the configured provider. This module owns provider details. */
export async function sendCustomerOtpSms(phone: string, otp: string): Promise<void> {
  const provider = process.env.CUSTOMER_SMS_PROVIDER?.toLowerCase();
  if (provider !== "twilio") {
    throw new Error("No customer SMS provider is configured.");
  }

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
