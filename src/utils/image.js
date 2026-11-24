// Browser-side photo shrinking, so product photos upload in a second or two instead of minutes.
// Phone photos are 3–6 MB; the website never shows them larger than ~1000px, so 1600px JPEG is plenty.

export const MAX_SIDE = 1600;
export const JPEG_QUALITY = 0.85;
const SKIP_BELOW_BYTES = 300 * 1024; // already small — upload as is

/** New size that fits inside maxSide on the longer edge, never upscaling. */
export function fitWithin(width, height, maxSide = MAX_SIDE) {
  const scale = Math.min(1, maxSide / Math.max(width, height));
  return { width: Math.round(width * scale), height: Math.round(height * scale) };
}

/** Returns a smaller JPEG Blob, or the original file when shrinking is not possible or not worthwhile. */
export async function shrinkImage(file) {
  if (!file.type?.startsWith("image/") || file.type === "image/gif" || file.type === "image/svg+xml") return file;
  if (file.size <= SKIP_BELOW_BYTES) return file;
  try {
    const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
    const { width, height } = fitWithin(bitmap.width, bitmap.height);
    const canvas = document.createElement("canvas");
    canvas.width = width; canvas.height = height;
    canvas.getContext("2d").drawImage(bitmap, 0, 0, width, height);
    bitmap.close?.();
    const blob = await new Promise(res => canvas.toBlob(res, "image/jpeg", JPEG_QUALITY));
    return blob && blob.size < file.size ? blob : file;
  } catch {
    return file;
  }
}
