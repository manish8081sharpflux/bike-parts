/**
 * Local-disk fallback for product image uploads — development only.
 *
 * Gated behind `NODE_ENV !== "production"` (see config.ts#allowLocalDevFallback)
 * so that a missing R2 config can never silently fall back to local disk in
 * production; there, uploads must fail closed instead. Files land under
 * public/uploads-dev (gitignored, separate from the old public/uploads path)
 * and are served at /uploads-dev/<name> like any other file under public/.
 */
import { randomUUID } from "node:crypto";
import { mkdir, unlink, writeFile } from "node:fs/promises";
import path from "node:path";

const LOCAL_DEV_PREFIX = "local-dev:";
const UPLOAD_DIR = path.join(process.cwd(), "public", "uploads-dev");

export async function saveLocalDevImage(bytes: Uint8Array, ext: string): Promise<{ key: string; url: string }> {
  await mkdir(UPLOAD_DIR, { recursive: true });
  const filename = `${randomUUID()}${ext}`;
  await writeFile(path.join(UPLOAD_DIR, filename), bytes);
  return { key: `${LOCAL_DEV_PREFIX}${filename}`, url: `/uploads-dev/${filename}` };
}

export async function deleteLocalDevImage(key: string): Promise<void> {
  const filename = key.slice(LOCAL_DEV_PREFIX.length);
  if (!filename || filename.includes("..") || filename.includes("/") || filename.includes("\\")) {
    return;
  }
  await unlink(path.join(UPLOAD_DIR, filename)).catch(() => {});
}
