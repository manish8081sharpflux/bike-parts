import { S3Client } from "@aws-sdk/client-s3";
import { getStorageConfig, type StorageConfig } from "@/lib/storage/config";

const STORAGE_TIMEOUT_MS = 10_000;

let cachedClient: S3Client | null = null;
let cachedConfig: StorageConfig | null = null;

/** Lazily builds (and memoizes) the S3-compatible client for the currently configured bucket. */
export function getStorageClient(): { client: S3Client; config: StorageConfig } {
  const config = getStorageConfig();

  if (!cachedClient || cachedConfig?.endpoint !== config.endpoint || cachedConfig?.accessKeyId !== config.accessKeyId) {
    cachedClient = new S3Client({
      region: "auto",
      endpoint: config.endpoint,
      // R2's S3 API is virtual-hosted-style incompatible for arbitrary
      // bucket names without extra DNS setup — path-style (bucket in the
      // URL path) is what Cloudflare's own docs recommend for the S3 API.
      forcePathStyle: true,
      credentials: {
        accessKeyId: config.accessKeyId,
        secretAccessKey: config.secretAccessKey,
      },
    });
    cachedConfig = config;
  }

  return { client: cachedClient, config };
}

export function storageAbortSignal(): AbortSignal {
  return AbortSignal.timeout(STORAGE_TIMEOUT_MS);
}
