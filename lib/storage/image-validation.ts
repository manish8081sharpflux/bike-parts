/**
 * Server-side validation for uploaded product images. Never trust the
 * browser's `accept` attribute or the client-supplied filename/MIME type
 * alone — file size, declared type, and actual file signature (magic
 * bytes) are all checked here before anything is uploaded to storage.
 */

export const MAX_IMAGE_BYTES = 4 * 1024 * 1024;
export const MAX_IMAGE_MB = MAX_IMAGE_BYTES / (1024 * 1024);
// Gallery URLs and uploads combined; the one main image is separate.
export const MAX_GALLERY_IMAGES = 5;
// At most 24 MB of image bytes, leaving 8 MB for multipart and other fields.
export const PRODUCT_FORM_BODY_LIMIT_BYTES = 32 * 1024 * 1024;

export const ALLOWED_IMAGE_TYPES: Record<string, string> = {
  "image/jpeg": ".jpg",
  "image/png": ".png",
  "image/webp": ".webp",
};

export type ImageValidationResult =
  | { ok: true; ext: string }
  | { ok: false; error: string };

/** Sniffs the first bytes of a file to confirm it actually is the image type it claims to be. */
function matchesSignature(bytes: Uint8Array, mimeType: string): boolean {
  if (bytes.length < 12) return false;

  switch (mimeType) {
    case "image/jpeg":
      return bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
    case "image/png":
      return (
        bytes[0] === 0x89 &&
        bytes[1] === 0x50 &&
        bytes[2] === 0x4e &&
        bytes[3] === 0x47 &&
        bytes[4] === 0x0d &&
        bytes[5] === 0x0a &&
        bytes[6] === 0x1a &&
        bytes[7] === 0x0a
      );
    case "image/webp": {
      const riff = String.fromCharCode(bytes[0], bytes[1], bytes[2], bytes[3]);
      const webp = String.fromCharCode(bytes[8], bytes[9], bytes[10], bytes[11]);
      return riff === "RIFF" && webp === "WEBP";
    }
    default:
      return false;
  }
}

/**
 * Validates one uploaded file: non-empty, under the size limit, an allowed
 * MIME type, and — checked against the actual bytes, not just the
 * declared type — a real image of that type. Returns the safe file
 * extension to use for the stored object key, or a user-facing error.
 */
export function validateImageUpload(
  file: { name: string; type: string; size: number },
  bytes: Uint8Array
): ImageValidationResult {
  if (file.size === 0 || bytes.length === 0) {
    return { ok: false, error: `"${file.name}" is empty.` };
  }
  if (file.size > MAX_IMAGE_BYTES) {
    return { ok: false, error: `"${file.name}" is larger than ${MAX_IMAGE_MB}MB — please upload a smaller image.` };
  }

  const ext = ALLOWED_IMAGE_TYPES[file.type];
  if (!ext) {
    return { ok: false, error: `"${file.name}" isn't a supported image type — use JPG, PNG, or WEBP.` };
  }

  if (!matchesSignature(bytes, file.type)) {
    return { ok: false, error: `"${file.name}" doesn't look like a valid ${file.type} file.` };
  }

  return { ok: true, ext };
}

export function assertGalleryCountWithinLimit(count: number) {
  if (count > MAX_GALLERY_IMAGES) {
    throw new Error(`A product can have at most ${MAX_GALLERY_IMAGES} gallery images.`);
  }
}
