import { describe, it, expect } from "vitest";
import {
  parsePrice, parseStock, planProductImport, validateProduct, normalizeProduct, validateImageFile, safeFileName, categoriesOf, MAX_IMAGES,
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
      name: "Ukulele", description: "Soprano", category: "Instruments", price: 89.5, stock: null, status: "in_stock", published: true,
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

describe("stock", () => {
  it("parses whole numbers, blank as untracked, junk as NaN", () => {
    expect(parseStock("12")).toBe(12);
    expect(parseStock(0)).toBe(0);
    expect(parseStock("")).toBeNull();
    expect(parseStock("-1")).toBeNaN();
    expect(parseStock("2.5")).toBeNaN();
    expect(parseStock("abc")).toBeNaN();
  });
  it("rejects a bad quantity", () => {
    expect(validateProduct({ ...ok, stock: "-3" })).toHaveLength(1);
    expect(validateProduct({ ...ok, stock: "5" })).toEqual([]);
  });
  it("derives availability from the quantity, and keeps the manual status without one", () => {
    expect(normalizeProduct({ ...ok, stock: "0", status: "in_stock" })).toMatchObject({ stock: 0, status: "sold_out" });
    expect(normalizeProduct({ ...ok, stock: "4", status: "sold_out" })).toMatchObject({ stock: 4, status: "in_stock" });
    expect(normalizeProduct({ ...ok, stock: "", status: "sold_out" })).toMatchObject({ stock: null, status: "sold_out" });
  });
});

describe("planProductImport", () => {
  const existing = [{ id: "p1", name: "Soprano Ukulele", category: "Ukuleles", price: 89.5, stock: 3, status: "in_stock", published: true, description: "Old" }];
  const header = ["Name", "Category", "Price (RM)", "Stock", "Description", "On website"];

  it("creates new products and updates matches by name, ignoring case", () => {
    const plan = planProductImport([header, ["soprano ukulele", "", 95, 7, "", ""], ["Capo", "Accessories", 12, 20, "Clip-on", "No"]], existing);
    expect(plan.error).toBeUndefined();
    expect(plan.items[0]).toMatchObject({ action: "update", id: "p1", errors: [] });
    expect(plan.items[0].data).toMatchObject({ price: 95, stock: 7, category: "Ukuleles", description: "Old", published: true });
    expect(plan.items[1]).toMatchObject({ action: "create", id: null, errors: [] });
    expect(plan.items[1].data).toMatchObject({ category: "Accessories", published: false });
  });
  it("lists categories that do not exist yet, once each", () => {
    const plan = planProductImport([header, ["A", "Books", "", 1], ["B", "books", "", 1], ["C", "ukuleles", "", 1]], existing);
    expect(plan.newCategories).toEqual(["Books"]);
  });
  it("reports bad cells and duplicate names per line", () => {
    const plan = planProductImport([header, ["A", "", "x", -2], ["A", "", "", "", "", "maybe"]], existing);
    expect(plan.items[0].errors.length).toBe(2);
    expect(plan.items[1].errors.some(e => /more than once/.test(e))).toBe(true);
    expect(plan.items[1].errors.some(e => /Yes or No/.test(e))).toBe(true);
  });
  it("skips blank lines and accepts alias headers", () => {
    const plan = planProductImport([["Product", "Qty"], ["Pick", 50], [], ["", ""]], []);
    expect(plan.items).toHaveLength(1);
    expect(plan.items[0].data).toMatchObject({ name: "Pick", stock: 50, status: "in_stock" });
  });
  it("errors when there is no Name column", () => {
    expect(planProductImport([["Foo"], ["x"]], []).error).toMatch(/Name/);
  });
});
