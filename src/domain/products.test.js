import { describe, it, expect } from "vitest";
import {
  parsePrice, validateProduct, normalizeProduct, validateImageFile, safeFileName, categoriesOf, MAX_IMAGES,
} from "./products.js";

const ok = { name: " Ukulele ", description: " Soprano ", category: " Instruments ", price: "89.5", status: "in_stock", published: true };

describe("parsePrice", () => {
  it("accepts numbers and numeric strings, rounding to cents", () => {
    expect(parsePrice("120")).toBe(120);
    expect(parsePrice(89.999)).toBe(90);
  });
  it("treats blank as no price", () => {
    expect(parsePrice("")).toBeNull();
    expect(parsePrice(null)).toBeNull();
  });
  it("flags junk", () => {
    expect(parsePrice("abc")).toBeNaN();
  });
});

describe("validateProduct", () => {
  it("passes a complete product, and one with no price", () => {
    expect(validateProduct(ok)).toEqual([]);
    expect(validateProduct({ ...ok, price: "" })).toEqual([]);
  });
  it("requires a name, a sane price and a status", () => {
    expect(validateProduct({ ...ok, name: "  " })).toHaveLength(1);
    expect(validateProduct({ ...ok, price: "-5" })).toHaveLength(1);
    expect(validateProduct({ ...ok, price: "x" })).toHaveLength(1);
    expect(validateProduct({ ...ok, status: "gone" })).toHaveLength(1);
  });
  it("caps the number of photos", () => {
    expect(validateProduct(ok, { imageCount: MAX_IMAGES })).toEqual([]);
    expect(validateProduct(ok, { imageCount: MAX_IMAGES + 1 })).toHaveLength(1);
  });
});

describe("normalizeProduct", () => {
  it("trims text, parses the price and coerces published to a boolean", () => {
    expect(normalizeProduct(ok)).toEqual({
      name: "Ukulele", description: "Soprano", category: "Instruments", price: 89.5, status: "in_stock", published: true,
    });
    expect(normalizeProduct({ name: "A", status: "sold_out" })).toMatchObject({ price: null, published: false, category: "", description: "" });
  });
});

describe("images", () => {
  it("accepts small images only", () => {
    expect(validateImageFile({ name: "a.png", type: "image/png", size: 1000 })).toBeNull();
    expect(validateImageFile({ name: "a.pdf", type: "application/pdf", size: 1000 })).toMatch(/not an image/);
    expect(validateImageFile({ name: "big.jpg", type: "image/jpeg", size: 6 * 1024 * 1024 })).toMatch(/5 MB/);
  });
  it("makes storage-safe names", () => {
    expect(safeFileName("My Photo (1).JPG")).toBe("my-photo-1-.jpg");
    expect(safeFileName("///")).toBe("photo");
  });
});

describe("categoriesOf", () => {
  it("returns distinct sorted categories, ignoring blanks", () => {
    expect(categoriesOf([{ category: "Picks" }, { category: "Books" }, { category: "Picks" }, { category: "" }, {}])).toEqual(["Books", "Picks"]);
  });
});
