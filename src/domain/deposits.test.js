import { describe, it, expect } from "vitest";
import {
  newDeposit, collectDeposit, applyDeposit, forfeitDeposit, editDepositAmount, planDepositApplication,
  defaultDepositAmount, depositWarning, isRegistrationComplete, summariseDeposits, DEPOSIT_STATUS,
} from "./deposits.js";
import { buildEnrolmentRow, buildCollectionSnapshot } from "./payroll.js";

const fees = {
  Piano: { Beginner: { "60": 160 }, "Grade 3": { "60": 205 }, "Grade 8": { "60": 280 } },
  Drum:  { Beginner: { "60": 160 } },
};
const enrol = (over = {}) => ({
  id: "e1", studentId: "s1", instrument: "Piano", syllabus: "classical", grade: "Beginner", teacherId: "t1", status: "active",
  startDate: "2026-08-03", endDate: null, feeOverride: null, commissionPct: null,
  schedule: { dayOfWeek: 6, startTime: "09:00", endTime: "10:00", duration: "60", roomId: "r1" },
  termChanges: [{ from: "2026-08", term: "monthly" }], ...over,
});
const held = (amount = 160, id = "e1") => collectDeposit(newDeposit({ enrolmentId: id, studentId: "s1", amount }), { by: "u1", at: "2026-08-03T10:00:00Z" });

describe("deposit creation", () => {
  it("defaults to the first month's fee for the STARTING grade, not grade 1", () => {
    expect(defaultDepositAmount(enrol(), "2026-08", fees, {})).toBe(160);
    expect(defaultDepositAmount(enrol({ grade: "Grade 3" }), "2026-08", fees, {})).toBe(205);
    expect(defaultDepositAmount(enrol({ grade: "Grade 8" }), "2026-08", fees, {})).toBe(280);
  });

  it("is a monthly fee even when billing is quarterly", () => {
    const q = enrol({ termChanges: [{ from: "2026-08", term: "quarterly" }] });
    expect(defaultDepositAmount(q, "2026-08", fees, {})).toBe(160);
  });

  it("starts pending — registration is incomplete until it is collected", () => {
    const d = newDeposit({ enrolmentId: "e1", studentId: "s1", amount: 160 });
    expect(d.status).toBe("pending");
    expect(isRegistrationComplete(d)).toBe(false);
    const c = collectDeposit(d, { by: "u1", at: "t" });
    expect(c.status).toBe("held");
    expect(c.payment).toMatchObject({ amount: 160, receivedBy: "u1" });
    expect(isRegistrationComplete(c)).toBe(true);
  });

  it("requires a positive amount and can only be collected once", () => {
    expect(() => newDeposit({ enrolmentId: "e1", studentId: "s1", amount: 0 })).toThrow();
    expect(() => newDeposit({ enrolmentId: "e1", studentId: "s1", amount: "abc" })).toThrow();
    expect(() => collectDeposit(held(), { by: "u", at: "t" })).toThrow(/once/);
  });

  it("the amount is a snapshot: later fee changes cannot alter the stored deposit", () => {
    const d = held(160);
    const before = JSON.stringify(d);
    // fee schedule goes up; the stored record is untouched and nothing recomputes it
    fees.Piano.Beginner["60"] = 999;
    expect(defaultDepositAmount(enrol(), "2026-08", fees, {})).toBe(999);
    expect(JSON.stringify(d)).toBe(before);
    expect(d.amount).toBe(160);
    fees.Piano.Beginner["60"] = 160;
  });

  it("an admin can edit the amount while pending/held, but never after it is applied", () => {
    expect(editDepositAmount(held(160), 200).amount).toBe(200);
    expect(editDepositAmount(held(160), 200).payment.amount).toBe(200);
    const { deposit } = applyDeposit(held(160), { finalFeeDue: 160, yearMonth: "2026-12", by: "u", at: "t" });
    expect(() => editDepositAmount(deposit, 50)).toThrow();
  });

  it("warns (without blocking) when the deposit exceeds the first month's fee", () => {
    expect(depositWarning(200, 160)).toMatch(/higher than the first month/);
    expect(depositWarning(160, 160)).toBeNull();
    expect(depositWarning(100, 160)).toBeNull();
  });
});

describe("applying the deposit to the final fee", () => {
  const apply = (deposit, finalFeeDue) => applyDeposit(deposit, { finalFeeDue, yearMonth: "2026-12", by: "admin", at: "2026-12-31T00:00:00Z" });

  it("deposit = final fee → student pays nothing", () => {
    const { deposit, plan } = apply(held(160), 160);
    expect(plan).toEqual({ applied: 160, balanceDue: 0, forfeited: 0 });
    expect(deposit).toMatchObject({ status: "applied", appliedAmount: 160, forfeitedAmount: 0, appliedToMonth: "2026-12", appliedBy: "admin" });
  });

  it("deposit < final fee → student pays the difference (160 deposit, 200 fee → pays 40)", () => {
    const { deposit, plan } = apply(held(160), 200);
    expect(plan).toEqual({ applied: 160, balanceDue: 40, forfeited: 0 });
    expect(deposit.status).toBe("applied");
  });

  it("deposit > final fee → fee fully covered, the excess is forfeited (not refunded)", () => {
    const { deposit, plan } = apply(held(200), 160);
    expect(plan).toEqual({ applied: 160, balanceDue: 0, forfeited: 40 });
    expect(deposit).toMatchObject({ status: "applied", appliedAmount: 160, forfeitedAmount: 40 });
    expect(deposit.amount).toBe(200); // snapshot untouched
  });

  it("3-month billing: the deposit offsets the final billing period up to the deposit amount", () => {
    const q = enrol({ termChanges: [{ from: "2026-08", term: "quarterly" }], status: "stopped", endDate: "2026-10-31" });
    const ctx = { ym: "2026-08", ledger: {}, teachers: [{ id: "t1", commissionPct: 60 }], tables: { fees, contemporaryFees: {} }, adminFlatFee: 0, attendance: [] };
    const row = buildEnrolmentRow(ctx, q);
    expect(row.fee).toBe(480); // 3 × 160
    const { plan } = apply(held(160), row.net);
    expect(plan).toEqual({ applied: 160, balanceDue: 320, forfeited: 0 });
  });

  it("is single-use: a second apply, a refund-style re-apply, or a forfeit after applying all throw", () => {
    const { deposit } = apply(held(160), 160);
    expect(() => apply(deposit, 160)).toThrow(/once/);
    expect(() => forfeitDeposit(deposit, { by: "a", at: "t" })).toThrow();
    const f = forfeitDeposit(held(160), { by: "a", at: "t", reason: "no-show" });
    expect(f.status).toBe("forfeited");
    expect(() => apply(f, 160)).toThrow();
    expect(() => apply(newDeposit({ enrolmentId: "e1", studentId: "s1", amount: 160 }), 160)).toThrow(); // pending can't be applied
  });

  it("does not mutate the input record", () => {
    const d = held(160);
    const before = JSON.stringify(d);
    apply(d, 160);
    expect(JSON.stringify(d)).toBe(before);
    expect(d.status).toBe("held");
  });

  it("plan maths handles zero and negative fees", () => {
    expect(planDepositApplication(160, 0)).toEqual({ applied: 0, balanceDue: 0, forfeited: 160 });
    expect(planDepositApplication(160, -5)).toEqual({ applied: 0, balanceDue: 0, forfeited: 160 });
  });
});

describe("payroll with an applied deposit", () => {
  const teachers = [{ id: "t1", commissionPct: 60 }];
  const stopped = enrol({ status: "stopped", endDate: "2026-08-31" });

  it("commission on the applied deposit uses the commission snapshot on the final fee", () => {
    const ctx = { ym: "2026-08", teachers, tables: { fees, contemporaryFees: {} }, adminFlatFee: 0, attendance: [] };
    const live = buildEnrolmentRow({ ...ctx, ledger: {} }, { ...stopped, commissionPct: 70 });
    const ledger = { e1: { collected: true, snap: buildCollectionSnapshot(live), depositApplied: { depositId: "d1", amount: 160 } } };
    // commission later edited — must not affect this month
    const row = buildEnrolmentRow({ ...ctx, ledger }, { ...stopped, commissionPct: 10 });
    expect(row.gross).toBe(160);           // the deposit is recognised as revenue here, once
    expect(row.dueFromStudent).toBe(0);    // student pays nothing
    expect(row.teacherCut).toBe(112);      // 70% snapshot
  });

  it("shows the balance the student still owes when the fee exceeds the deposit", () => {
    const high = enrol({ grade: "Grade 3", status: "stopped", endDate: "2026-08-31" });
    const ctx = { ym: "2026-08", teachers, tables: { fees, contemporaryFees: {} }, adminFlatFee: 0, attendance: [] };
    const ledger = { e1: { collected: true, depositApplied: { depositId: "d1", amount: 160 } } };
    const row = buildEnrolmentRow({ ...ctx, ledger }, high);
    expect(row.gross).toBe(205);
    expect(row.dueFromStudent).toBe(45);
  });
});

describe("multi-instrument students have separate deposits", () => {
  it("each enrolment has its own deposit, amount and lifecycle", () => {
    const piano = enrol({ id: "e1", instrument: "Piano", grade: "Grade 3" });
    const drum  = enrol({ id: "e2", instrument: "Drum",  grade: "Beginner" });
    const d1 = collectDeposit(newDeposit({ enrolmentId: piano.id, studentId: "s1", amount: defaultDepositAmount(piano, "2026-08", fees, {}) }), { by: "u", at: "t" });
    const d2 = newDeposit({ enrolmentId: drum.id, studentId: "s1", amount: defaultDepositAmount(drum, "2026-08", fees, {}) });
    expect([d1.amount, d2.amount]).toEqual([205, 160]);
    expect(d1.enrolmentId).not.toBe(d2.enrolmentId);
    expect(isRegistrationComplete(d1)).toBe(true);
    expect(isRegistrationComplete(d2)).toBe(false);

    // applying one leaves the other untouched
    const { deposit: applied } = applyDeposit(d1, { finalFeeDue: 205, yearMonth: "2026-12", by: "a", at: "t" });
    expect(applied.status).toBe("applied");
    expect(d2.status).toBe("pending");
    expect(collectDeposit(d2, { by: "u", at: "t" }).status).toBe("held");
  });
});

describe("reporting", () => {
  it("held deposits are a liability; applied deposits are never added on top of fee revenue", () => {
    const a = applyDeposit(held(160, "e1"), { finalFeeDue: 160, yearMonth: "2026-12", by: "a", at: "t" }).deposit;
    const b = held(200, "e2");
    const c = newDeposit({ enrolmentId: "e3", studentId: "s3", amount: 160 });
    const s = summariseDeposits([a, b, c]);
    expect(s.liability).toBe(200);   // only b is still held
    expect(s.held).toBe(200);
    expect(s.pending).toBe(160);
    expect(s.applied).toBe(160);     // reference only; revenue is counted via the final fee's gross
    expect(DEPOSIT_STATUS.REFUNDED).toBeUndefined(); // deposits are non-refundable
  });
});
