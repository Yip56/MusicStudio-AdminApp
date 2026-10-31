import { describe, it, expect } from "vitest";
import {
  BILLING_TERMS, termMonths, assertBillingTerm, assertCommissionPct, resolveCommissionPct,
  standardMonthlyFee, resolveMonthlyFee, getBillingPeriod, periodFee, getFinalPeriod, buildBillingPatch,
  validateDiscount, isDiscountActiveFor, calcDiscountAmount, DEFAULT_COMMISSION_PCT,
} from "./billing.js";
import { buildEnrolmentRow, buildCollectionSnapshot, calcLine } from "./payroll.js";

const fees = { Piano: { "Grade 2": { "30": 100, "45": 150, "60": 200 }, Beginner: { "30": 80, "45": 120, "60": 160 } } };
const cfees = { Piano: { Advanced: { "30": 125, "45": 190, "60": 250 } } };
const tables = { fees, contemporaryFees: cfees };

const mk = (over = {}) => ({
  id: "e1", studentId: "s1", instrument: "Piano", syllabus: "classical", grade: "Grade 2", teacherId: "t1",
  attendanceBased: false, status: "active", startDate: "2026-08-03", endDate: null,
  schedule: { dayOfWeek: 6, startTime: "09:00", endTime: "10:00", duration: "60", roomId: "r1" },
  feeOverride: null, commissionPct: null, billingTerm: "monthly", termChanges: [{ from: "2026-08", term: "monthly" }],
  ...over,
});
const quarterly = () => mk({ billingTerm: "quarterly", termChanges: [{ from: "2026-08", term: "quarterly" }] });
const teacher = { id: "t1", commissionPct: 60 };

describe("billing terms", () => {
  it("allows only monthly or quarterly", () => {
    expect(BILLING_TERMS).toEqual(["monthly", "quarterly"]);
    expect(termMonths("monthly")).toBe(1);
    expect(termMonths("quarterly")).toBe(3);
    for (const bad of ["weekly", "yearly", "", null, undefined, "biannual"]) expect(() => assertBillingTerm(bad)).toThrow(/Invalid billing term/);
  });

  it("monthly: every month is its own fee month", () => {
    const e = mk();
    for (const ym of ["2026-08", "2026-09", "2026-10"]) {
      const p = getBillingPeriod(e, ym);
      expect(p).toMatchObject({ active: true, isFeeMonth: true, months: 1, startYM: ym });
    }
  });

  it("quarterly: one fee covers 3 months starting from enrolment, then repeats", () => {
    const e = quarterly();
    expect(getBillingPeriod(e, "2026-08")).toMatchObject({ isFeeMonth: true, months: 3, startYM: "2026-08" });
    expect(getBillingPeriod(e, "2026-09")).toMatchObject({ isFeeMonth: false, coveredBy: "2026-08" });
    expect(getBillingPeriod(e, "2026-10")).toMatchObject({ isFeeMonth: false, coveredBy: "2026-08" });
    expect(getBillingPeriod(e, "2026-11")).toMatchObject({ isFeeMonth: true, months: 3, startYM: "2026-11" });
  });

  it("is inactive before the start month and after the end month", () => {
    const e = mk({ endDate: "2026-10-31" });
    expect(getBillingPeriod(e, "2026-07").active).toBe(false);
    expect(getBillingPeriod(e, "2026-11").active).toBe(false);
  });

  it("a quarter cut short by stopping covers only the months that remain", () => {
    const e = { ...quarterly(), status: "stopped", endDate: "2026-09-30" };
    expect(getBillingPeriod(e, "2026-08")).toMatchObject({ months: 2 });
    expect(getFinalPeriod(e)).toEqual({ startYM: "2026-08", months: 2, term: "quarterly" });
  });

  it("a term change applies from its effective month only", () => {
    const e = mk({ termChanges: [{ from: "2026-08", term: "monthly" }, { from: "2026-10", term: "quarterly" }] });
    expect(getBillingPeriod(e, "2026-09")).toMatchObject({ term: "monthly", months: 1 });
    expect(getBillingPeriod(e, "2026-10")).toMatchObject({ term: "quarterly", months: 3, isFeeMonth: true });
    expect(getBillingPeriod(e, "2026-11").isFeeMonth).toBe(false);
  });
});

describe("fee model", () => {
  it("defaults to the instrument/grade/duration standard fee", () => {
    expect(standardMonthlyFee(mk(), fees, cfees)).toBe(200);
    expect(standardMonthlyFee(mk({ schedule: { ...mk().schedule, duration: "30" } }), fees, cfees)).toBe(100);
    expect(standardMonthlyFee(mk({ syllabus: "contemporary", grade: "Advanced" }), fees, cfees)).toBe(250);
  });

  it("is zero for a null / removed instrument", () => {
    expect(standardMonthlyFee(mk({ instrument: null }), fees, cfees)).toBe(0);
    expect(standardMonthlyFee(mk({ instrument: "Flute" }), fees, cfees)).toBe(0);
  });

  it("an override applies from its effective month onward — never to earlier months", () => {
    const e = mk({ feeOverride: { amount: 180, effectiveFrom: "2026-10" } });
    expect(resolveMonthlyFee(e, "2026-09", fees, cfees)).toBe(200);
    expect(resolveMonthlyFee(e, "2026-10", fees, cfees)).toBe(180);
    expect(resolveMonthlyFee(e, "2026-12", fees, cfees)).toBe(180);
  });

  it("a quarterly period fee is the sum of its monthly fees", () => {
    expect(periodFee(quarterly(), "2026-08", 3, fees, cfees)).toBe(600);
    const e = { ...quarterly(), feeOverride: { amount: 150, effectiveFrom: "2026-09" } };
    expect(periodFee(e, "2026-08", 3, fees, cfees)).toBe(200 + 150 + 150);
  });

  it("month-by-month fee generation: monthly gives 3 fees, quarterly gives 1 fee covering 3 months", () => {
    const ctx = ym => ({ ym, ledger: {}, teachers: [teacher], tables, adminFlatFee: 0, attendance: [] });
    const months = ["2026-08", "2026-09", "2026-10"];

    const monthly = months.map(ym => buildEnrolmentRow(ctx(ym), mk()));
    expect(monthly.map(r => r.fee)).toEqual([200, 200, 200]);
    expect(monthly.every(r => !r.covered)).toBe(true);

    const q = months.map(ym => buildEnrolmentRow(ctx(ym), quarterly()));
    expect(q.map(r => r.fee)).toEqual([600, 0, 0]);
    expect(q.map(r => r.covered)).toEqual([false, true, true]);
    expect(q[1].coveredBy).toBe("2026-08");
  });
});

describe("historical amount immutability", () => {
  const ledgerCollected = (e, ym, extra = {}) => {
    const base = buildEnrolmentRow({ ym, ledger: {}, teachers: [teacher], tables, adminFlatFee: 5, attendance: [] }, e);
    return { collected: true, snap: buildCollectionSnapshot(base), ...extra };
  };

  it("a collected fee keeps its amount when the fee schedule is edited afterwards", () => {
    const e = mk();
    const ledger = { e1: ledgerCollected(e, "2026-08") };
    const newTables = { fees: { Piano: { "Grade 2": { "30": 999, "45": 999, "60": 999 } } }, contemporaryFees: {} };
    const row = buildEnrolmentRow({ ym: "2026-08", ledger, teachers: [teacher], tables: newTables, adminFlatFee: 5, attendance: [] }, e);
    expect(row.fee).toBe(200);
    expect(row.gross).toBe(200);
  });

  it("a collected fee keeps its amount when the enrolment fee override or grade changes", () => {
    const e = mk();
    const ledger = { e1: ledgerCollected(e, "2026-08") };
    const edited = { ...e, grade: "Beginner", feeOverride: { amount: 50, effectiveFrom: "2026-08" } };
    const row = buildEnrolmentRow({ ym: "2026-08", ledger, teachers: [teacher], tables, adminFlatFee: 5, attendance: [] }, edited);
    expect(row.fee).toBe(200);
  });

  it("an uncollected fee still follows the live fee until it is collected", () => {
    const e = mk({ feeOverride: { amount: 50, effectiveFrom: "2026-08" } });
    const row = buildEnrolmentRow({ ym: "2026-08", ledger: {}, teachers: [teacher], tables, adminFlatFee: 0, attendance: [] }, e);
    expect(row.fee).toBe(50);
  });

  it("the snapshot freezes the discount, admin flat fee, term and commission too", () => {
    const e = mk();
    const ledger = { e1: ledgerCollected(e, "2026-08", { discount: { id: "d1", name: "Promo", type: "percent", value: 10 } }) };
    const row = buildEnrolmentRow({ ym: "2026-08", ledger, teachers: [teacher], tables, adminFlatFee: 5, attendance: [] }, e);
    expect(row.flatFeePerMonth).toBe(5);
    expect(row.commissionPct).toBe(60);
  });
});

describe("commission", () => {
  it("falls back to the teacher default, then the studio default", () => {
    expect(resolveCommissionPct(mk(), { commissionPct: 55 })).toBe(55);
    expect(resolveCommissionPct(mk(), {})).toBe(DEFAULT_COMMISSION_PCT);
    expect(resolveCommissionPct(mk({ commissionPct: 70 }), { commissionPct: 55 })).toBe(70);
    expect(resolveCommissionPct(mk({ commissionPct: 0 }), { commissionPct: 55 })).toBe(0);
  });

  it("validates 0–100", () => {
    for (const ok of [0, 50, 100, "42.5"]) expect(() => assertCommissionPct(ok)).not.toThrow();
    for (const bad of [-1, 101, "abc", "", null, NaN]) expect(() => assertCommissionPct(bad)).toThrow();
  });

  it.each([[0, 0], [50, 97.5], [60, 117], [100, 195]])("splits gross at %i%% (admin flat fee RM5 taken first)", (pct, teacherCut) => {
    const r = calcLine({ collected: true, periodFeeAmount: 200, commissionPct: pct, flatFeeCap: 5 });
    expect(r.flatDeducted).toBe(5);
    expect(r.teacherCut).toBeCloseTo(teacherCut, 2);
    expect(r.adminCut).toBeCloseTo(200 - teacherCut, 2);
  });

  it("an enrolment-level rate overrides the teacher's, and is snapshotted when collected", () => {
    const e = mk({ commissionPct: 80 });
    const live = buildEnrolmentRow({ ym: "2026-08", ledger: {}, teachers: [teacher], tables, adminFlatFee: 0, attendance: [] }, e);
    expect(live.commissionPct).toBe(80);
    const ledger = { e1: { collected: true, snap: buildCollectionSnapshot(live) } };
    const later = { ...e, commissionPct: 30 };
    const row = buildEnrolmentRow({ ym: "2026-08", ledger, teachers: [{ ...teacher, commissionPct: 10 }], tables, adminFlatFee: 0, attendance: [] }, later);
    expect(row.commissionPct).toBe(80);
    expect(row.teacherCut).toBe(160);
  });

  it("attendance-based fees prorate; zero attendance pays nothing", () => {
    expect(calcLine({ collected: true, attendanceBased: true, scheduled: 4, attended: 3, periodFeeAmount: 200, commissionPct: 50 }).gross).toBe(150);
    expect(calcLine({ collected: true, attendanceBased: true, scheduled: 4, attended: 0, periodFeeAmount: 200, commissionPct: 50 }).gross).toBe(0);
    expect(calcLine({ collected: false, periodFeeAmount: 200, commissionPct: 50 }).gross).toBe(0);
  });
});

describe("editing fee / term / commission", () => {
  it("builds a minimal patch and validates", () => {
    const e = mk();
    expect(buildBillingPatch(e, { feeAmount: 180, feeEffectiveFrom: "2026-10" })).toEqual({ feeOverride: { amount: 180, effectiveFrom: "2026-10" } });
    expect(buildBillingPatch(e, { commissionPct: 70 })).toEqual({ commissionPct: 70 });
    expect(buildBillingPatch(e, { commissionPct: "" })).toEqual({});
    expect(buildBillingPatch({ ...e, commissionPct: 70 }, { commissionPct: "" })).toEqual({ commissionPct: null });
    expect(buildBillingPatch({ ...e, feeOverride: { amount: 1, effectiveFrom: "2026-08" } }, { feeAmount: "" })).toEqual({ feeOverride: null });
    expect(() => buildBillingPatch(e, { feeAmount: 180 })).toThrow(/month/);
    expect(() => buildBillingPatch(e, { commissionPct: 150 })).toThrow();
    expect(() => buildBillingPatch(e, { billingTerm: "weekly" })).toThrow(/Invalid billing term/);
  });

  it("changing the term appends a term change from the effective month", () => {
    const patch = buildBillingPatch(mk(), { billingTerm: "quarterly", termEffectiveFrom: "2026-10" });
    expect(patch.termChanges).toEqual([{ from: "2026-08", term: "monthly" }, { from: "2026-10", term: "quarterly" }]);
    expect(buildBillingPatch(mk(), { billingTerm: "monthly" })).toEqual({});
  });
});

describe("discounts", () => {
  const d = { name: "Back to school", type: "percent", value: 20, startMonth: "2026-09", durationMonths: 2 };
  it("validates", () => {
    expect(validateDiscount(d)).toEqual([]);
    expect(validateDiscount({ ...d, value: 120 }).join()).toMatch(/exceed 100/);
    expect(validateDiscount({ ...d, name: " " }).length).toBeGreaterThan(0);
    expect(validateDiscount({ ...d, durationMonths: 0 }).length).toBeGreaterThan(0);
  });
  it("is available from its start month until first applied", () => {
    expect(isDiscountActiveFor(d, "2026-08")).toBe(false);
    expect(isDiscountActiveFor(d, "2026-09")).toBe(true);
    expect(isDiscountActiveFor(d, "2027-03")).toBe(true);
  });
  it("lasts N months from the month it was first applied to a student", () => {
    expect(isDiscountActiveFor(d, "2026-10", "2026-11")).toBe(false);
    expect(isDiscountActiveFor(d, "2026-11", "2026-11")).toBe(true);
    expect(isDiscountActiveFor(d, "2026-12", "2026-11")).toBe(true);
    expect(isDiscountActiveFor(d, "2027-01", "2026-11")).toBe(false);
  });
  it("is capped at the fee", () => {
    expect(calcDiscountAmount(200, d)).toBe(40);
    expect(calcDiscountAmount(200, { type: "amount", value: 500 })).toBe(200);
    expect(calcDiscountAmount(0, d)).toBe(0);
  });
  it("reduces gross and commission", () => {
    const r = calcLine({ collected: true, periodFeeAmount: 200, discountAmount: 40, commissionPct: 50 });
    expect(r.net).toBe(160);
    expect(r.gross).toBe(160);
    expect(r.teacherCut).toBe(80);
  });
});
