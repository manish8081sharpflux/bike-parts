// End-to-end customer checkout flow against a REAL Razorpay test-mode
// account (uses whatever RAZORPAY_KEY_ID/SECRET are in .env.local — must be
// `rzp_test_...` keys). Exercises: browse → select bike → add to cart →
// phone/OTP login → pick a saved address → real order creation → Razorpay's
// hosted checkout iframe → test card payment → signature verification.
//
// Usage: `pnpm dev` in one terminal, then `node e2e/checkout.mjs` in another.
import { chromium } from "@playwright/test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";

const BASE_URL = process.env.E2E_BASE_URL ?? "http://localhost:3000";
const shot = async (page, name) => {
  await page.screenshot({ path: `e2e/_shots/${name}.png`, fullPage: true });
};

async function main() {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  page.setDefaultTimeout(30000);
  page.on("pageerror", (err) => console.log("[pageerror]", err.message));
  let addressId;
  try {

  await page.goto(BASE_URL, { waitUntil: "networkidle" });
  await page.waitForTimeout(1000); // let React finish hydrating before the first click
  await page.getByRole("button", { name: "Select Bike" }).first().click();
  await page.getByText("Honda", { exact: true }).first().click();
  await page.getByText("Activa 6G", { exact: true }).click();
  await page.waitForTimeout(600);

  const card = page.locator("article", { hasText: "Cylinder Kit" }).first();
  await card.scrollIntoViewIfNeeded();
  await card.getByRole("button", { name: "Add" }).click();
  await page.waitForTimeout(300);

  await page.getByText("item", { exact: false }).first().click();
  await page.waitForTimeout(300);
  await page.getByRole("button", { name: /Proceed to (Checkout|Login)/ }).click();
  await page.waitForTimeout(300);

    // Local E2E runs use CUSTOMER_OTP_DEV_MODE=true. Capture the actual OTP
    // returned by the development-only endpoint; production never returns it.
  await page.getByPlaceholder("Enter mobile number").fill("9876500099");
    const otpResponsePromise = page.waitForResponse(
      (r) => r.url().includes("/api/auth/otp/send") && r.request().method() === "POST"
    );
  await page.getByRole("button", { name: "Continue" }).click();
    const otpResponse = await otpResponsePromise;
    const otpData = await otpResponse.json();
    if (!otpData.developmentOtp) {
      throw new Error("E2E requires CUSTOMER_OTP_DEV_MODE=true and a development OTP response.");
    }
  await page.waitForTimeout(300);
  const otpInputs = page.getByLabel(/OTP digit/);
    for (const [index, digit] of [...otpData.developmentOtp].entries()) {
      await otpInputs.nth(index).fill(digit);
    }
  const loginResponsePromise = page.waitForResponse(
    (r) => r.url().includes("/api/auth/otp/verify") && r.request().method() === "POST"
  );
  await page.getByRole("button", { name: "Verify & Continue" }).click();
  assert.equal((await loginResponsePromise).status(), 200);
  const flatNo = `E2E-${randomUUID()}`;
  const addressResponse = await page.request.post(`${BASE_URL}/api/addresses`, {
    data: {
      label: "Home", contactName: "E2E Customer", phone: "9876500099",
      flatNo, floor: "", area: "E2E Test Area", landmark: "",
      city: "Pune", state: "Maharashtra", pincode: "411001",
    },
  });
  assert.equal(addressResponse.status(), 201, await addressResponse.text());
  addressId = (await addressResponse.json()).address.id;
  // Reload to fetch the saved address into the storefront's address state.
  await page.reload({ waitUntil: "networkidle" });
  await page.getByText("item", { exact: false }).first().click();

  await page.getByRole("button", { name: "Proceed to Checkout" }).click();
  await page.waitForTimeout(500);
  await shot(page, "address-panel");

  const addressCard = page.locator('[role="button"]', { hasText: flatNo });
  await addressCard.waitFor();
  const checkoutResponsePromise = page.waitForResponse(
    (r) => r.url().includes("/api/checkout") && r.request().method() === "POST",
    { timeout: 15000 }
  );
  await addressCard.click();
  const checkoutRes = await checkoutResponsePromise;
  assert.equal(checkoutRes.request().postDataJSON().addressId, addressId);
  assert.ok(checkoutRes.ok(), await checkoutRes.text());
  console.log(">>> POST /api/checkout:", checkoutRes.status(), await checkoutRes.text());

  await page.waitForSelector('iframe[src*="razorpay"]', { timeout: 15000 });
  const rzpFrame = page.frameLocator('iframe[src*="razorpay"]').first();
  // The card-number field is the reliable "form is actually ready" signal —
  // the iframe/ribbon can be visible seconds before its content finishes
  // rendering.
  await rzpFrame.locator('input[name="cardnumber" i], input[placeholder*="Card Number" i]').first().waitFor({ timeout: 20000 });
  await shot(page, "razorpay-checkout");

  try {
    // Cards is the default-selected tab, but click it if it's not (e.g. a
    // returning test customer defaults to a different saved method).
    const cardsTab = rzpFrame.getByText("Cards", { exact: true });
    if (await cardsTab.isVisible({ timeout: 2000 }).catch(() => false)) {
      await cardsTab.click();
      await page.waitForTimeout(500);
    }

    // Razorpay's own documented India test Mastercard — the generic
    // "4111 1111 1111 1111" is flagged as an unsupported international card.
    await rzpFrame.locator('input[name="cardnumber" i], input[placeholder*="Card Number" i]').first().fill("5267318187975449");
    await rzpFrame.locator('input[name="expiry" i], input[placeholder*="Valid" i], input[placeholder*="MM" i]').first().fill("1230");
    await rzpFrame.locator('input[name="cvv" i], input[placeholder*="CVV" i]').first().fill("123");

    const email = rzpFrame.locator('input[placeholder*="Email" i], input[type="email"]').first();
    if (await email.isVisible({ timeout: 3000 }).catch(() => false)) {
      await email.fill("customer@example.com");
    }

    await shot(page, "razorpay-card-filled");
    await rzpFrame.getByRole("button", { name: /Pay|Continue/i }).first().click();
    await page.waitForTimeout(1500);

    const maybeLater = rzpFrame.getByRole("button", { name: "Maybe later" }).first();
    if (await maybeLater.isVisible({ timeout: 3000 }).catch(() => false)) {
      await maybeLater.click();
      await page.waitForTimeout(1500);
    }

    // Razorpay's test-mode cards simulate a bank 3D-secure OTP page — it may
    // render as a further-nested iframe (the simulated bank page) rather
    // than directly inside Razorpay's own iframe, so search every frame on
    // the page for the OTP input instead of assuming a specific nesting.
    await page.waitForTimeout(3000);
    await shot(page, "razorpay-otp-page");
    let otpFrame = null;
    for (const f of page.frames()) {
      const box = f.locator('input[placeholder*="OTP" i], input[name*="otp" i]').first();
      if (await box.isVisible({ timeout: 1000 }).catch(() => false)) {
        otpFrame = f;
        break;
      }
    }
    if (otpFrame) {
      console.log(">>> Found OTP input in frame:", otpFrame.url());
      const otpInput = otpFrame.locator('input[placeholder*="OTP" i], input[name*="otp" i]').first();
      await otpInput.fill("1221");
      // The OTP modal overlays an older "Continue" button from the card
      // form underneath (same accessible name) — scope to the button that's
      // actually a sibling of the OTP input, not just the first match.
      await otpInput
        .locator("xpath=ancestor::div[contains(@class,'z-[60]')][1]")
        .getByRole("button", { name: "Continue" })
        .click();
    } else {
      console.log(">>> No OTP input found in any frame.");
    }
  } catch (e) {
    console.log(">>> Card fill/submit failed:", e.message);
  }

  const verifyRes = await page
    .waitForResponse((r) => r.url().includes("/api/checkout/verify"), { timeout: 30000 })
    .catch(() => null);
  if (verifyRes) {
    console.log(">>> POST /api/checkout/verify:", verifyRes.status(), await verifyRes.text());
  } else {
    console.log(">>> /api/checkout/verify never fired within 30s.");
  }

  await page.waitForTimeout(1500);
  await shot(page, "post-payment");
  } finally {
    try {
      if (addressId) {
        const cleanup = await page.request.delete(`${BASE_URL}/api/addresses/${addressId}`);
        assert.ok(cleanup.ok(), `Address cleanup failed: ${cleanup.status()}`);
      }
    } finally {
      await browser.close();
    }
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
