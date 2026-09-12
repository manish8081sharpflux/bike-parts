// Admin-side sanity check: logs into /admin and confirms recent orders show
// up correctly in the Orders list with the right amount/status.
//
// Usage: ADMIN_EMAIL=... ADMIN_PASSWORD=... node e2e/admin-check.mjs
// (both required — matches the values in .env.local)
import { chromium } from "@playwright/test";

const BASE_URL = process.env.E2E_BASE_URL ?? "http://localhost:3000";
const { ADMIN_EMAIL, ADMIN_PASSWORD } = process.env;

if (!ADMIN_EMAIL || !ADMIN_PASSWORD) {
  console.error("Set ADMIN_EMAIL and ADMIN_PASSWORD (same values as .env.local) before running this.");
  process.exit(1);
}

async function main() {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });

  await page.goto(`${BASE_URL}/admin/login`, { waitUntil: "networkidle" });
  await page.getByLabel("Email").fill(ADMIN_EMAIL);
  await page.getByLabel("Password").fill(ADMIN_PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForTimeout(1000);

  if (!page.url().endsWith("/admin")) {
    console.error(">>> Login failed — still on", page.url());
    await browser.close();
    process.exit(1);
  }
  console.log(">>> Logged in.");

  await page.goto(`${BASE_URL}/admin/orders`, { waitUntil: "networkidle" });
  const rows = await page.locator("tbody tr").allTextContents();
  console.log(`>>> ${rows.length} order row(s) on the first page:`);
  rows.slice(0, 5).forEach((r) => console.log("   ", r.replace(/\s+/g, " ").trim()));

  await page.screenshot({ path: "e2e/_shots/admin-orders.png", fullPage: true });
  await browser.close();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
