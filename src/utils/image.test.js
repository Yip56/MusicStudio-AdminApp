import { describe, it, expect } from "vitest";
import { fitWithin, shrinkImage } from "./image.js";

describe("fitWithin", () => {
  it("scales the longer edge down to the limit, keeping the ratio", () => {
    expect(fitWithin(4000, 3000)).toEqual({ width: 1600, height: 1200 });
    expect(fitWithin(3000, 4000)).toEqual({ width: 1200, height: 1600 });
  });
  it("never upscales", () => {
    expect(fitWithin(800, 600)).toEqual({ width: 800, height: 600 });
  });
});

describe("shrinkImage", () => {
  it("returns small files and non-photos untouched", async () => {
    const small = { type: "image/jpeg", size: 1000 };
    const gif   = { type: "image/gif",  size: 5_000_000 };
    expect(await shrinkImage(small)).toBe(small);
    expect(await shrinkImage(gif)).toBe(gif);
  });
  it("falls back to the original when the browser cannot decode it", async () => {
    const big = { type: "image/jpeg", size: 5_000_000 }; // no createImageBitmap in the test runtime
    expect(await shrinkImage(big)).toBe(big);
  });
});
