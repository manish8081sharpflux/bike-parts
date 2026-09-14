/**
 * Centralized product image storage. This is the only module that talks to
 * S3-compatible object storage (Cloudflare R2) or, in development only, the
 * local-disk fallback — admin actions call these functions instead of
 * touching the storage SDK or the filesystem directly.
 *
 * Lifecycle rules this module exists to enforce:
 *  - object keys are always generated server-side (lib/storage/keys.ts),
 *    never taken from a client-supplied filename
 *  - files are validated (size, MIME allowlist, magic-byte signature)
 *    before anything is uploaded
 *  - deletion only ever targets a key we generated ourselves, or a URL
 *    proven to live under products/ at our own configured base URL —
 *    an arbitrary client-supplied URL can never be deleted
 *  - deletes are always best-effort: a storage failure here must never be
 *    allowed to block a product create/update/delete from completing
 */
import { PutObjectCommand, DeleteObjectCommand } from "@aws-sdk/client-s3";
import { getStorageClient, storageAbortSignal } from "@/lib/storage/r2-client";
import { allowLocalDevFallback, isStorageConfigured, StorageConfigError } from "@/lib/storage/config";
import { validateImageUpload } from "@/lib/storage/image-validation";
import { generateProductImageKey, deriveOwnedObjectKey } from "@/lib/storage/keys";
import {
  deleteLocalDevImage,
  saveLocalDevImage,
} from "@/lib/storage/local-dev-fallback";

export type UploadedImage = { key: string; url: string };

/**
 * The seam between this module's validation/orchestration logic and
 * wherever bytes actually end up. Production always resolves to r2Backend
 * (or localDevBackend outside production when R2 isn't configured);
 * tests substitute a fake in-memory backend via setStorageBackendForTests
 * so lifecycle behavior (orphan cleanup, replace-preserves-old, etc.) can
 * be exercised without real S3 credentials or the filesystem.
 */
export type StorageBackend = {
  put(ext: string, bytes: Uint8Array, contentType: string): Promise<UploadedImage>;
  remove(key: string): Promise<void>;
  /** Returns the object key if `url` is proven to belong to this backend, else null. */
  ownedKeyForUrl(url: string): string | null;
};

const r2Backend: StorageBackend = {
  async put(ext, bytes, contentType) {
    const { client, config } = getStorageClient();
    const key = generateProductImageKey(ext);
    try {
      await client.send(
        new PutObjectCommand({
          Bucket: config.bucket,
          Key: key,
          Body: bytes,
          ContentType: contentType,
          // Keys are unique per upload (uuid-based) and never overwritten,
          // so it's safe — and desirable for CDN/browser caching — to mark
          // them immutable forever.
          CacheControl: "public, max-age=31536000, immutable",
        }),
        { abortSignal: storageAbortSignal() }
      );
    } catch (error) {
      // Log full provider detail server-side only; callers surface a generic message.
      console.error("[product-images] R2 upload failed", error);
      throw new Error("Could not upload product image. Please try again.");
    }
    return { key, url: `${config.publicBaseUrl}/${key}` };
  },
  async remove(key) {
    const { client, config } = getStorageClient();
    try {
      await client.send(new DeleteObjectCommand({ Bucket: config.bucket, Key: key }), {
        abortSignal: storageAbortSignal(),
      });
    } catch (error) {
      console.error("[product-images] R2 delete failed", key, error);
    }
  },
  ownedKeyForUrl(url) {
    const { config } = getStorageClient();
    return deriveOwnedObjectKey(url, config.publicBaseUrl);
  },
};

const localDevBackend: StorageBackend = {
  async put(ext, bytes) {
    return saveLocalDevImage(bytes, ext);
  },
  async remove(key) {
    await deleteLocalDevImage(key);
  },
  ownedKeyForUrl(url) {
    if (!url.startsWith("/uploads-dev/")) return null;
    return `local-dev:${url.slice("/uploads-dev/".length)}`;
  },
};

let backendOverride: StorageBackend | null = null;

/** Test-only hook — substitutes a fake storage backend. Pass null to restore the real R2/local-dev backends. */
export function setStorageBackendForTests(backend: StorageBackend | null) {
  backendOverride = backend;
}

function resolveBackend(): StorageBackend {
  if (backendOverride) return backendOverride;
  if (isStorageConfigured()) return r2Backend;
  if (allowLocalDevFallback()) return localDevBackend;
  throw new StorageConfigError("missing required storage config");
}

/** Reads and validates one uploaded file, then stores it. Returns null if the field was left empty. */
export async function uploadProductImage(file: FormDataEntryValue | null): Promise<UploadedImage | null> {
  // An untouched <input type="file"> submits as an empty File — but this
  // Next.js version's Server Action form encoding (see AGENTS.md's warning
  // that this isn't stock Next.js behavior) normalizes it to a zero-byte
  // File named "blob" instead of the classic empty-string name, so a
  // name-only check no longer distinguishes "nothing selected" from a real
  // upload. Only that exact placeholder shape is treated as empty — a
  // genuinely selected 0-byte file under any other name still falls through
  // to validateImageUpload below and surfaces as a real error, since an
  // admin who deliberately picked a broken file should be told, not
  // silently ignored.
  if (!(file instanceof File) || !file.name || (file.name === "blob" && file.size === 0)) {
    return null;
  }

  const bytes = new Uint8Array(await file.arrayBuffer());
  const validated = validateImageUpload({ name: file.name, type: file.type, size: file.size }, bytes);
  if (!validated.ok) {
    throw new Error(validated.error);
  }

  // Resolved (and, in production with missing config, thrown) before any
  // I/O — a misconfigured production deployment must fail closed without
  // ever attempting a write, local-disk or otherwise.
  const backend = resolveBackend();
  return backend.put(validated.ext, bytes, file.type);
}

/** Validates and uploads every selected file under a multi-value form field, in order. */
export async function uploadProductImages(files: FormDataEntryValue[]): Promise<UploadedImage[]> {
  const uploaded: UploadedImage[] = [];
  try {
    for (const file of files) {
      const result = await uploadProductImage(file);
      if (result) uploaded.push(result);
    }
    return uploaded;
  } catch (error) {
    // One bad file in a multi-file batch shouldn't leave the earlier
    // successful uploads in this same batch orphaned in the bucket.
    await deleteProductImagesByKey(uploaded.map((image) => image.key));
    throw error;
  }
}

/** Best-effort delete of an object we uploaded ourselves, by its known key. Never throws. */
export async function deleteProductImageByKey(key: string): Promise<void> {
  try {
    await resolveBackend().remove(key);
  } catch (error) {
    console.error("[product-images] delete by key failed", key, error);
  }
}

export async function deleteProductImagesByKey(keys: string[]): Promise<void> {
  await Promise.all(keys.map((key) => deleteProductImageByKey(key)));
}

/**
 * Best-effort delete of a *stored* image URL, but only if that URL is
 * proven to belong to us — either products/ at our R2 public base URL, or
 * our own local-dev upload path. Anything else (an externally supplied
 * URL, or a legacy /uploads/... path from before Fix 7) is left untouched.
 */
export async function deleteOwnedProductImageByUrl(url: string): Promise<void> {
  try {
    const backend = resolveBackend();
    const key = backend.ownedKeyForUrl(url);
    if (key) {
      await backend.remove(key);
    }
  } catch (error) {
    console.error("[product-images] delete by url failed", url, error);
  }
}

export async function deleteOwnedProductImagesByUrl(urls: string[]): Promise<void> {
  await Promise.all(urls.map((url) => deleteOwnedProductImageByUrl(url)));
}
