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

/** "12" / 12 → 12, "" / null → null (stock not tracked), junk / negatives / decimals → NaN. */
export function parseStock(v) {
  if (v === "" || v === null || v === undefined) return null;
  const n = typeof v === "number" ? v : Number(String(v).trim());
  return Number.isInteger(n) && n >= 0 ? n : NaN;
}

/** [] when valid, else readable messages. `imageCount` is the final number of photos. */
export function validateProduct(d, { imageCount = 0 } = {}) {
  const errors = [];
  if (!d.name?.trim()) errors.push("Product name is required.");
  const price = parsePrice(d.price);
  if (Number.isNaN(price) || (price !== null && price < 0)) errors.push("Price must be a number, or left blank.");
  if (Number.isNaN(parseStock(d.stock))) errors.push("Stock must be a whole number (0 or more), or left blank.");
  if (!(d.status in PRODUCT_STATUSES)) errors.push("Pick a stock status.");
  if (imageCount > MAX_IMAGES) errors.push(`A product can have at most ${MAX_IMAGES} photos.`);
  return errors;
}

/** The fields written to Firestore (images, timestamps are added by the caller). */
export function normalizeProduct(d) {
  const stock = parseStock(d.stock);
  return {
    name:        d.name.trim(),
    description: (d.description ?? "").trim(),
    category:    (d.category ?? "").trim(),
    price:       parsePrice(d.price),
    stock,
    // A stock quantity decides availability; with no quantity the manual status is kept
    status:      stock === null ? d.status : stock > 0 ? "in_stock" : "sold_out",
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

// ── Excel import ─────────────────────────────────────────────────────────────
export const PRODUCT_SHEET_HEADERS = ["Name", "Category", "Price (RM)", "Stock", "Description", "On website"];

const HEADER_ALIASES = {
  name: ["name", "product", "product name"],
  category: ["category", "type"],
  price: ["price", "price (rm)", "price rm", "rm"],
  stock: ["stock", "quantity", "qty", "stock amount"],
  description: ["description", "details"],
  published: ["on website", "published", "show on website", "visible"],
};

function parseYesNo(v) {
  const t = String(v).trim().toLowerCase();
  if (["yes", "y", "true", "1", "on", "show"].includes(t)) return true;
  if (["no", "n", "false", "0", "off", "hide", "hidden"].includes(t)) return false;
  return null;
}

const isBlank = v => v === "" || v === undefined || v === null;

/**
 * Turn sheet rows (array of arrays, first row = headers) into an import plan against the current
 * products. A row whose name matches an existing product (ignoring case) updates it - blank cells
 * leave that field as it is - otherwise it creates a new one. New category names are collected
 * so the UI can tell the admin they will be created.
 * -> { items: [{ line, id|null, action: "create"|"update", data, errors }], newCategories, error? }
 */
export function planProductImport(rows, existing = []) {
  const headerRow = (rows[0] ?? []).map(h => String(h ?? "").trim().toLowerCase());
  const col = {};
  for (const [field, names] of Object.entries(HEADER_ALIASES)) col[field] = headerRow.findIndex(h => names.includes(h));
  if (col.name < 0) return { items: [], newCategories: [], error: "No “Name” column found. Download the template to see the expected layout." };

  const byName = new Map();
  existing.forEach(p => { const k = p.name?.trim().toLowerCase(); if (k && !byName.has(k)) byName.set(k, p); });
  const knownCats = new Set(categoriesOf(existing).map(c => c.toLowerCase()));
  const seen = new Set();
  const newCats = new Map();
  const items = [];

  rows.slice(1).forEach((row, i) => {
    const cell = f => (col[f] >= 0 ? row[col[f]] : undefined);
    const name = String(cell("name") ?? "").trim();
    if (!name && row.every(isBlank)) return; // blank line
    const line = i + 2;
    const prev = byName.get(name.toLowerCase());
    const errors = [];

    const rawPub = cell("published");
    const pub = isBlank(rawPub) ? undefined : parseYesNo(rawPub);
    if (pub === null) errors.push(`Line ${line}: “On website” must be Yes or No.`);

    const data = {
      name,
      description: isBlank(cell("description")) ? (prev?.description ?? "") : String(cell("description")),
      category:    isBlank(cell("category"))    ? (prev?.category ?? "")    : String(cell("category")).trim(),
      price:       isBlank(cell("price"))       ? (prev?.price ?? "")       : cell("price"),
      stock:       isBlank(cell("stock"))       ? (prev?.stock ?? "")       : cell("stock"),
      status:      prev?.status ?? "in_stock",
      published:   typeof pub === "boolean" ? pub : (prev ? !!prev.published : true),
    };
    validateProduct(data).forEach(m => errors.push(`Line ${line}: ${m}`));
    if (name && seen.has(name.toLowerCase())) errors.push(`Line ${line}: “${name}” appears more than once in the file.`);
    seen.add(name.toLowerCase());

    const cat = data.category;
    if (cat && !knownCats.has(cat.toLowerCase()) && !newCats.has(cat.toLowerCase())) newCats.set(cat.toLowerCase(), cat);

    items.push({ line, id: prev?.id ?? null, action: prev ? "update" : "create", data, errors });
  });

  return { items, newCategories: [...newCats.values()] };
}
