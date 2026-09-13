/**
 * Storage configuration for product images.
 *
 * Provider is Cloudflare R2, reached through its S3-compatible API (see
 * r2-client.ts) — the env var names below match the ones already reserved
 * in .env.example / lib/platform/service-env.ts. Swapping to AWS S3 or
 * another S3-compatible provider only means changing what this file reads;
 * nothing else in lib/storage or the admin actions is Cloudflare-specific.
 */

export type StorageConfig = {
  accountId: string;
  accessKeyId: string;
  secretAccessKey: string;
  bucket: string;
  publicBaseUrl: string;
  endpoint: string;
};

export class StorageConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "StorageConfigError";
  }
}

function readConfig(): StorageConfig | null {
  const accountId = process.env.CLOUDFLARE_ACCOUNT_ID?.trim();
  const accessKeyId = process.env.CLOUDFLARE_R2_ACCESS_KEY_ID?.trim();
  const secretAccessKey = process.env.CLOUDFLARE_R2_SECRET_ACCESS_KEY?.trim();
  const bucket = process.env.CLOUDFLARE_R2_BUCKET?.trim();
  const publicBaseUrl = process.env.CLOUDFLARE_R2_PUBLIC_URL?.trim();

  if (!accountId || !accessKeyId || !secretAccessKey || !bucket || !publicBaseUrl) {
    return null;
  }

  return {
    accountId,
    accessKeyId,
    secretAccessKey,
    bucket,
    publicBaseUrl: publicBaseUrl.replace(/\/$/, ""),
    endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
  };
}

/** Throws with a clear message if required storage env vars are missing. Never falls back silently. */
export function getStorageConfig(): StorageConfig {
  const config = readConfig();
  if (!config) {
    throw new StorageConfigError("missing required storage config");
  }
  return config;
}

export function isStorageConfigured(): boolean {
  return readConfig() !== null;
}

/** Dev-only local-disk fallback is allowed only when explicitly not production. */
export function allowLocalDevFallback(): boolean {
  return process.env.NODE_ENV !== "production";
}
