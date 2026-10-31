// Payroll maths. Everything here is pure: the same inputs always give the same row, which is
// what lets a finalized month be stored as a snapshot and re-checked later.
//
// Ledger (payroll_months/{ym}.feeStatus[enrolmentId]) fields used here:
//   collected, collectedAt
//   discount        { id, name, type, value, note }          chosen for this fee month
//   snap            { periodFee, discountAmount, commissionPct, adminFlatFee, term, periodMonths, periodStart }
//                   frozen when the fee is marked collected — later edits never rewrite it
//   depositApplied  { depositId, amount }                    deposit offsetting the final fee
//   deferredToMonth, deferredFromMonths[], deferredFromAmounts{}
import { addMonths, parseYM } from "./time.js";
import { getBillingPeriod, periodFee, calcDiscountAmount, resolveCommissionPct } from "./billing.js";
import { getScheduledCountForMonth, getAttendedCountForMonth } from "./enrolments.js";

/**
 * One fee line.
 *  - nothing is paid out until the fee is collected
 *  - attendance-based with 0 attended → all zeros
 *  - admin flat fee is capped at gross
 *  - deferredGrossExtra bypasses the collection/attendance rules (earned in an earlier month)
 *  - dueFromStudent = what the student still pays after any deposit offset
 */
export function calcLine({
  collected = false, attendanceBased = false, scheduled = 0, attended = 0,
  periodFeeAmount = 0, discountAmount = 0, commissionPct = 0,
  flatFeeCap = 0, deferredGrossExtra = 0, depositApplied = 0,
}) {
  const fee = periodFeeAmount;
  const net = Math.max(0, fee - discountAmount);
  const zero = { fee, discountAmount, net, scheduled, attended, gross: 0, teacherCut: 0, adminCut: 0, flatDeducted: 0, afterFlat: 0, dueFromStudent: 0 };

  let ownGross = 0;
  if (collected && !(attendanceBased && attended === 0)) {
    ownGross = attendanceBased ? (scheduled > 0 ? (attended / scheduled) * net : 0) : net;
  }
  const gross = ownGross + deferredGrossExtra;
  const dueFromStudent = Math.max(0, ownGross - depositApplied);
  if (gross <= 0) return { ...zero, dueFromStudent };

  const flatDeducted = Math.min(flatFeeCap, gross);
  const afterFlat    = gross - flatDeducted;
  const teacherCut   = (afterFlat * commissionPct) / 100;
  return { fee, discountAmount, net, scheduled, attended, gross, teacherCut, adminCut: gross - teacherCut, flatDeducted, afterFlat, dueFromStudent };
}

function countsForPeriod(enrolment, startYM, months, attendance) {
  let scheduled = 0, attended = 0;
  for (let i = 0; i < months; i++) {
    const { year, month0 } = parseYM(addMonths(startYM, i));
    scheduled += getScheduledCountForMonth(enrolment, year, month0);
    attended  += getAttendedCountForMonth(enrolment.id, year, month0, attendance);
  }
  return { scheduled, attended };
}

/** The values frozen onto the ledger when a fee is marked collected. */
export function buildCollectionSnapshot(row) {
  return {
    periodFee:      row.fee,
    discountAmount: row.discountAmount,
    commissionPct:  row.commissionPct,
    adminFlatFee:   row.flatFeePerMonth,
    term:           row.period.term,
    periodMonths:   row.period.months,
    periodStart:    row.period.startYM,
  };
}

/**
 * One payroll row for an enrolment in `ym`, or null if it isn't billable that month.
 * ctx: { ym, ledger, teachers, tables:{fees,contemporaryFees}, adminFlatFee, attendance }
 */
export function buildEnrolmentRow(ctx, enrolment) {
  const { ym, ledger = {}, teachers = [], tables = {}, adminFlatFee = 0, attendance = [] } = ctx;
  const period = getBillingPeriod(enrolment, ym);
  if (!period.active) return null;

  const entry   = ledger[enrolment.id] ?? {};
  const teacher = teachers.find(t => t.id === enrolment.teacherId);

  if (!period.isFeeMonth) {
    return {
      enrolment, eid: enrolment.id, teacherId: enrolment.teacherId, period, entry,
      covered: true, coveredBy: period.startYM, collected: false,
      fee: 0, discountAmount: 0, net: 0, gross: 0, teacherCut: 0, adminCut: 0, flatDeducted: 0,
      scheduled: 0, attended: 0, commissionPct: resolveCommissionPct(enrolment, teacher),
      deferredToMonth: null, deferredFromMonths: [], deferredFromDetails: [], deferredGrossExtra: 0,
      hypotheticalGross: 0, depositApplied: 0, dueFromStudent: 0, discount: null, flatFeePerMonth: adminFlatFee,
    };
  }

  const collected = !!entry.collected;
  const snap      = collected ? entry.snap ?? null : null;
  const fee       = snap?.periodFee ?? periodFee(enrolment, ym, period.months, tables.fees, tables.contemporaryFees);
  const discount  = entry.discount ?? null;
  const discountAmount = snap ? snap.discountAmount : calcDiscountAmount(fee, discount);
  const commissionPct  = snap?.commissionPct ?? resolveCommissionPct(enrolment, teacher);
  const flatFeePerMonth = snap?.adminFlatFee ?? adminFlatFee;
  const { scheduled, attended } = countsForPeriod(enrolment, ym, period.months, attendance);

  const deferredToMonth     = entry.deferredToMonth ?? null;
  const deferredFromMonths  = entry.deferredFromMonths ?? [];
  const deferredFromAmounts = entry.deferredFromAmounts ?? {};
  const deferredFromDetails = deferredFromMonths.map(m => ({ ym: m, amount: deferredFromAmounts[m] ?? 0 }));
  const deferredGrossExtra  = deferredFromDetails.reduce((s, d) => s + d.amount, 0);
  const depositApplied      = entry.depositApplied?.amount ?? 0;

  const common = {
    attendanceBased: enrolment.attendanceBased, scheduled, attended,
    periodFeeAmount: fee, discountAmount, commissionPct,
    flatFeeCap: flatFeePerMonth * period.months, deferredGrossExtra, depositApplied,
  };
  const line = calcLine({ ...common, collected });
  const hypotheticalGross = calcLine({ ...common, collected: true }).gross;

  return {
    enrolment, eid: enrolment.id, teacherId: enrolment.teacherId, period, entry, covered: false,
    collected, collectedAt: entry.collectedAt ?? null,
    deferredToMonth, deferredFromMonths, deferredFromDetails, deferredGrossExtra, hypotheticalGross,
    discount, commissionPct, flatFeePerMonth, depositApplied: depositApplied || 0,
    ...line,
  };
}

/** All rows for a month, grouped by teacher. */
export function buildMonthRows(ctx, enrolments) {
  const rows = [];
  for (const e of enrolments) {
    const r = buildEnrolmentRow(ctx, e);
    if (r) rows.push(r);
  }
  return rows;
}

export function sumTeacher(rows) {
  const live = rows.filter(r => !r.deferredToMonth);
  return {
    teacher: live.reduce((a, r) => a + r.teacherCut, 0),
    admin:   live.reduce((a, r) => a + r.adminCut, 0),
    gross:   rows.reduce((a, r) => a + r.gross, 0),
  };
}
