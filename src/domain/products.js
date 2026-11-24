// Products sold at the studio. Stored in `products/{id}`; photos live in Firebase Storage under
// products/{id}/… and are referenced from the doc as { url, path }. Only published products are
// exposed to the public website, via the getPublicProducts Cloud Function.

export const PRODUCT_STATUSES = { in_stock: "In stock", sold_out: "Sold out" };
export const MAX_IMAGES = 6;
export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

/** "120" / 120 → 120, "" / null → null (website shows "Contact us for price"), junk → NaN. */
export function parsePrice(v) {
  if (v === "" || v === null || v === undefined) return null;
  const n = typeof v === "number" ? v : Number(String(v).trim());
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : NaN;
}

/** [] when valid, else readable messages. `imageCount` is the final number of photos. */
export function validateProduct(d, { imageCount = 0 } = {}) {
  const errors = [];
  if (!d.name?.trim()) errors.push("Product name is required.");
  const price = parsePrice(d.price);
  if (Number.isNaN(price) || (price !== null && price < 0)) errors.push("Price must be a number, or left blank.");
  if (!(d.status in PRODUCT_STATUSES)) errors.push("Pick a stock status.");
  if (imageCount > MAX_IMAGES) errors.push(`A product can have at most ${MAX_IMAGES} photos.`);
  return errors;
}

/** The fields written to Firestore (images, timestamps are added by the caller). */
export function normalizeProduct(d) {
  return {
    name:        d.name.trim(),
    description: (d.description ?? "").trim(),
    category:    (d.category ?? "").trim(),
    price:       parsePrice(d.price),
    status:      d.status,
    published:   !!d.published,
  };
}

/** Error message for an unacceptable photo, or null. */
export function validateImageFile(file) {
  if (!file.type?.startsWith("image/")) return `${file.name ?? "File"} is not an image.`;
  if (file.size > MAX_IMAGE_BYTES) return `${file.name ?? "Image"} is over 5 MB.`;
  return null;
}

/** Storage-safe file name: keeps letters/digits/dot/dash, so paths never contain spaces or slashes. */
export function safeFileName(name = "photo") {
  return name.toLowerCase().replace(/[^a-z0-9.\-]+/g, "-").replace(/^-+|-+$/g, "") || "photo";
}

/** Distinct, sorted categories already in use — feeds the category suggestions. */
export function categoriesOf(products) {
  return [...new Set(products.map(p => p.category?.trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b));
}
