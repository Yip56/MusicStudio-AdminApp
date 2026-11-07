import { describe, it, expect } from "vitest";
import { searchEntries, scoreEntry, normalize } from "./search.js";
import { SEARCH_ENTRIES } from "../data/searchIndex.js";

const E = [
  { id: "a", label: "Finalize Month", page: "payroll", keywords: ["close month", "lock", "month end"], roles: ["admin"] },
  { id: "b", label: "Download full backup", page: "archive", keywords: ["export", "save data"] },
  { id: "c", label: "Pay Out", page: "payroll", keywords: ["salary", "teacher payment"] },
];

describe("search", () => {
  it("matches labels, keywords and synonyms", () => {
    expect(searchEntries(E, "finalize")[0].id).toBe("a");
    expect(searchEntries(E, "lock")[0].id).toBe("a");
    expect(searchEntries(E, "salary")[0].id).toBe("c");
  });
  it("requires every word and tolerates one typo", () => {
    expect(searchEntries(E, "backup export")[0].id).toBe("b");
    expect(searchEntries(E, "backup banana")).toHaveLength(0);
    expect(searchEntries(E, "finalise")[0]?.id).toBe("a");
    expect(searchEntries(E, "bakcup")[0]?.id).toBe("b");
  });
  it("ranks exact label first and respects roles", () => {
    expect(searchEntries(E, "pay out")[0].id).toBe("c");
    expect(searchEntries(E, "finalize", { role: "teacher" })).toHaveLength(0);
    expect(searchEntries(E, "finalize", { role: "admin" })).toHaveLength(1);
  });
  it("ignores case and punctuation", () => {
    expect(normalize("Grades & Fees!")).toBe("grades fees");
    expect(scoreEntry(E[0], "")).toBe(0);
  });
});

describe("search index", () => {
  it("has unique ids, a page and keywords on every entry", () => {
    const ids = SEARCH_ENTRIES.map(e => e.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const e of SEARCH_ENTRIES) { expect(e.page).toBeTruthy(); expect(e.label).toBeTruthy(); expect(e.keywords?.length).toBeGreaterThan(0); }
  });
});

describe("search index ↔ UI tags", () => {
  it("every entry points at an element that carries its data-search / spot id", async () => {
    const fs = await import("node:fs"), path = await import("node:path");
    const dir = d => fs.readdirSync(d).filter(f => f.endsWith(".jsx")).map(f => fs.readFileSync(path.join(d, f), "utf8"));
    const src = [...dir("src/views"), ...dir("src/components")].join("\n");
    const missing = SEARCH_ENTRIES.filter(e => !src.includes(`data-search="${e.id}"`) && !src.includes(`spot="${e.id}"`)).map(e => e.id);
    expect(missing).toEqual([]);
  });
});
