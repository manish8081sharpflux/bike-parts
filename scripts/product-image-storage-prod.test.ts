import assert from "node:assert/strict";
import test from "node:test";
import { existsSync, readdirSync } from "node:fs";
import path from "node:path";
import { uploadProductImage } from "@/lib/storage/product-images";
import { StorageConfigError } from "@/lib/storage/config";

/**
 * Fix 7's core safety property: in production, missing R2 config must fail
 * the upload closed — never silently fall back to writing under
 * public/uploads (the old, pre-Fix-7 behavior) or public/uploads-dev (the
 * dev-only fallback, which is explicitly gated off in production).
 *
 * Run as its own process (see package.json's
 * test:product-image-storage-prod) since it mutates process.env.NODE_ENV
 * for the whole file.
 */

const JPEG_BYTES = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 0, 0, 0, 0, 0, 0, 0]);

test("production + missing storage config fails uploads closed, without touching local disk", async () => {
  const originalNodeEnv = process.env.NODE_ENV;
  const cloudflareKeys = [
    "CLOUDFLARE_ACCOUNT_ID",
    "CLOUDFLARE_R2_ACCESS_KEY_ID",
    "CLOUDFLARE_R2_SECRET_ACCESS_KEY",
    "CLOUDFLARE_R2_BUCKET",
    "CLOUDFLARE_R2_PUBLIC_URL",
  ] as const;
  const originalValues = Object.fromEntries(cloudflareKeys.map((key) => [key, process.env[key]]));

  const uploadsDir = path.join(process.cwd(), "public", "uploads");
  const uploadsDevDir = path.join(process.cwd(), "public", "uploads-dev");
  // public/uploads may already hold files from real (pre-Fix-7 / legacy) admin
  // usage — that's fine and out of scope here. What must never happen is a
  // *new* file landing in it (or public/uploads-dev existing at all) as a
  // result of this rejected upload attempt.
  const uploadsBefore = existsSync(uploadsDir) ? readdirSync(uploadsDir) : [];

  try {
    for (const key of cloudflareKeys) delete process.env[key];
    // @ts-expect-error NODE_ENV is normally readonly-by-convention; this test needs to simulate production.
    process.env.NODE_ENV = "production";

    const file = new File([JPEG_BYTES], "photo.jpg", { type: "image/jpeg" });
    await assert.rejects(() => uploadProductImage(file), StorageConfigError);

    const uploadsAfter = existsSync(uploadsDir) ? readdirSync(uploadsDir) : [];
    assert.deepEqual(uploadsAfter, uploadsBefore, "must never write a new file into public/uploads in production");
    assert.equal(existsSync(uploadsDevDir), false, "must never fall back to public/uploads-dev in production");
  } finally {
    // @ts-expect-error see above
    process.env.NODE_ENV = originalNodeEnv;
    for (const key of cloudflareKeys) {
      if (originalValues[key] === undefined) delete process.env[key];
      else process.env[key] = originalValues[key];
    }
  }
});
