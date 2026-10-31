import { describe, it, expect } from "vitest";
import { toSnapshotRow, reviseRow, summariseMonth, diffSnapshotRows, affectedMonths, deferralChanges, totalsForRows } from "./months.js";
import { buildEnrolmentRow } from "./payroll.js";
import { getInstruments, canDeleteInstrument, findUnavailableInstrumentRefs, INSTRUMENT_IN_USE_MESSAGE } from "./instruments.js";
import { buildAuditEntry, diffFields } from "./audit.js";

const fees = { Piano: { "Grade 2": { "60": 200 } } };
const enrol = (id, over = {}) => ({
  id, studentId: "s" + id, instrument: "Piano", syllabus: "classical", grade: "Grade 2", teacherId: "t1", attendanceBased: false,
  status: "active", startDate: "2026-08-03", endDate: null, commissionPct: null, feeOverride: null,
  schedule: { dayOfWeek: 6, startTime: "09:00", endTime: "10:00", duration: "60", roomId: "r1" },
  termChanges: [{ from: "2026-08", term: "monthly" }], ...over,
});
const ctx = ledger => ({ ym: "2026-08", ledger, teachers: [{ id: "t1", commissionPct: 50 }], tables: { fees, contemporaryFees: {} }, adminFlatFee: 0, attendance: [] });
const rowsFor = ledger => [enrol("1"), enrol("2")].map(e => toSnapshotRow(buildEnrolmentRow(ctx(ledger), e), { studentName: "S" + e.id, teacherName: "T" }));

describe("finalize + revisions", () => {
  const ledger = { 1: { collected: true }, 2: { collected: false } };

  it("summarises collected / uncollected for the confirmation modal", () => {
    const s = summariseMonth(rowsFor(ledger));
    expect(s).toMatchObject({ total: 2, collected: 1, uncollected: 1, gross: 200, teacher: 100, admin: 100 });
    expect(s.uncollectedRows[0].eid).toBe("2");
  });

  it("lists deferral target changes with the gross carried over", () => {
    const original = rowsFor({ 1: { collected: true, deferredToMonth: "2026-09" }, 2: { collected: true } });
    const revised = original.map(r => (r.eid === "1" ? reviseRow(r, { deferredToMonth: "2026-10" }) : reviseRow(r, { deferredToMonth: "2026-09" })));
    expect(deferralChanges(original, revised)).toEqual([
      { eid: "1", studentName: "S1", instrument: "Piano", from: "2026-09", to: "2026-10", amount: 200 },
      { eid: "2", studentName: "S2", instrument: "Piano", from: null, to: "2026-09", amount: 200 },
    ]);
    expect(deferralChanges(original, original)).toEqual([]);
  });

  it("snapshot rows are plain JSON (no undefined)", () => {
    const rows = rowsFor(ledger);
    expect(JSON.parse(JSON.stringify(rows))).toEqual(rows);
  });

  it("a revision recomputes payroll but never mutates the original", () => {
    const original = rowsFor(ledger);
    const frozen = JSON.stringify(original);
    const revised = original.map(r => (r.eid === "2" ? reviseRow(r, { collected: true }) : r));
    expect(JSON.stringify(original)).toBe(frozen);
    expect(totalsForRows(original).gross).toBe(200);
    expect(totalsForRows(revised).gross).toBe(400);
    expect(diffSnapshotRows(original, revised).map(c => c.field)).toEqual(expect.arrayContaining(["collected", "gross", "teacherCut", "adminCut"]));
  });

  it("validates revision edits", () => {
    const [r] = rowsFor(ledger);
    expect(() => reviseRow(r, { commissionPct: 120 })).toThrow();
    expect(() => reviseRow(r, { discountAmount: 500 })).toThrow(/exceed/);
    expect(reviseRow(r, { discountAmount: 50 }).gross).toBe(150);
  });

  it("flags other months touched by a revision, especially deferrals", () => {
    const original = rowsFor({ 1: { collected: true, deferredToMonth: "2026-09" } });
    const revised = original.map(r => (r.eid === "1" ? reviseRow(r, { deferredToMonth: "2026-10" }) : r));
    expect(affectedMonths(original, revised, "2026-08")).toEqual(["2026-09", "2026-10"]);
    expect(affectedMonths(original, original, "2026-08")).toEqual([]);
  });
});

describe("instruments are defined by the Grades & Fees page", () => {
  it("lists the union of both fee tables", () => {
    expect(getInstruments({ Piano: {}, Drum: {} }, { Drum: {}, Guitar: {} })).toEqual(["Piano", "Drum", "Guitar"]);
    expect(getInstruments({}, {})).toEqual([]);
  });

  it("blocks deleting an instrument that teachers or students still use", () => {
    const data = { teachers: [{ id: "t1", instruments: ["Piano"] }], enrolments: [{ id: "e1", instrument: "Drum", status: "active" }] };
    expect(canDeleteInstrument("Piano", data).ok).toBe(false);
    expect(canDeleteInstrument("Drum", data).ok).toBe(false);
    expect(canDeleteInstrument("Violin", data).ok).toBe(true);
    expect(INSTRUMENT_IN_USE_MESSAGE).toMatch(/Un-attach all students and teachers/);
  });

  it("stopped enrolments past their last day no longer block deletion", () => {
    const data = { teachers: [], enrolments: [{ id: "e1", instrument: "Drum", status: "stopped", endDate: "2026-06-30" }] };
    expect(canDeleteInstrument("Drum", data, "2026-08-01").ok).toBe(true);
    expect(canDeleteInstrument("Drum", data, "2026-06-01").ok).toBe(false);
  });

  it("replaces no-longer-offered instruments with null", () => {
    const out = findUnavailableInstrumentRefs(["Piano"], {
      teachers: [{ id: "t1", instruments: ["Piano", "Flute"] }, { id: "t2", instruments: ["Piano"] }],
      enrolments: [{ id: "e1", instrument: "Flute" }, { id: "e2", instrument: "Piano" }, { id: "e3", instrument: null }],
      rooms: [{ id: "r1", types: ["Piano", "Flute"] }],
    });
    expect(out.teacherPatches).toEqual([{ id: "t1", instruments: ["Piano"] }]);
    expect(out.enrolmentPatches).toEqual([{ id: "e1", instrument: null }]);
    expect(out.roomPatches).toEqual([{ id: "r1", types: ["Piano"] }]);
  });
});

describe("activity log entries", () => {
  it("diffs only changed fields", () => {
    expect(diffFields({ a: 1, b: 2 }, { a: 1, b: 3 })).toEqual([{ field: "b", from: 2, to: 3 }]);
    expect(diffFields({ feeOverride: null }, { feeOverride: { amount: 5 } }, ["feeOverride"])).toHaveLength(1);
  });
  it("builds a writable entry and rejects unknown types", () => {
    const e = buildAuditEntry({ type: "fee", action: "update", summary: "x", actor: { uid: "u", displayName: "Ann", role: "admin" } });
    expect(e).toMatchObject({ actorUid: "u", actorName: "Ann", actorRole: "admin", changes: [], entity: null });
    expect(Object.values(e)).not.toContain(undefined);
    expect(() => buildAuditEntry({ type: "nope", action: "x", summary: "y" })).toThrow();
  });
});
