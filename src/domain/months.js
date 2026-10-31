// Month finalization + revisions.
//
// "Finalize Month" freezes a month: a snapshot of every payroll row is written once and can
// never be edited. Corrections are stored as separate revisions (original is always kept).
import { calcLine, sumTeacher } from "./payroll.js";
import { assertCommissionPct } from "./billing.js";

const num = n => Math.round(Number(n || 0) * 100) / 100;

/** Plain-JSON version of a payroll row (no undefined, no Firestore types). */
export function toSnapshotRow(row, { studentName = "", teacherName = "" } = {}) {
  const e = row.enrolment;
  const collectedAt = row.collectedAt?.toDate ? row.collectedAt.toDate().toISOString() : (row.collectedAt ?? null);
  return {
    eid: row.eid, studentId: e.studentId, studentName, teacherId: e.teacherId, teacherName,
    instrument: e.instrument ?? null, syllabus: e.syllabus, grade: e.grade, duration: e.schedule?.duration ?? null,
    attendanceBased: !!e.attendanceBased,
    term: row.period.term, periodMonths: row.period.months, periodStart: row.period.startYM,
    covered: !!row.covered, coveredBy: row.coveredBy ?? null,
    collected: !!row.collected, collectedAt,
    fee: num(row.fee), discountAmount: num(row.discountAmount), discountName: row.discount?.name ?? null,
    commissionPct: row.commissionPct, flatFeeCap: num((row.flatFeePerMonth ?? 0) * (row.period.months ?? 1)),
    scheduled: row.scheduled, attended: row.attended,
    deferredToMonth: row.deferredToMonth ?? null,
    deferredFromMonths: row.deferredFromMonths ?? [],
    deferredGrossExtra: num(row.deferredGrossExtra),
    depositApplied: num(row.depositApplied),
    hypotheticalGross: num(row.hypotheticalGross),
    gross: num(row.gross), teacherCut: num(row.teacherCut), adminCut: num(row.adminCut),
    flatDeducted: num(row.flatDeducted), dueFromStudent: num(row.dueFromStudent),
  };
}

/** Recompute one snapshot row's outputs from its (possibly edited) inputs. */
export function recalcSnapshotRow(row) {
  if (row.covered) return row;
  const common = {
    attendanceBased: row.attendanceBased, scheduled: row.scheduled, attended: row.attended,
    periodFeeAmount: row.fee, discountAmount: row.discountAmount, commissionPct: row.commissionPct,
    flatFeeCap: row.flatFeeCap, deferredGrossExtra: row.deferredGrossExtra, depositApplied: row.depositApplied,
  };
  const line = calcLine({ ...common, collected: row.collected });
  return {
    ...row,
    hypotheticalGross: num(calcLine({ ...common, collected: true }).gross),
    gross: num(line.gross), teacherCut: num(line.teacherCut), adminCut: num(line.adminCut),
    flatDeducted: num(line.flatDeducted), dueFromStudent: num(line.dueFromStudent),
  };
}

/** Apply edits (collected / fee / discountAmount / commissionPct / deferredToMonth) and recompute. */
export function reviseRow(row, edits) {
  const next = { ...row };
  if ("collected" in edits) next.collected = !!edits.collected;
  if ("fee" in edits) {
    const f = Number(edits.fee);
    if (!Number.isFinite(f) || f < 0) throw new Error("Fee must be zero or more.");
    next.fee = f;
  }
  if ("discountAmount" in edits) {
    const d = Number(edits.discountAmount);
    if (!Number.isFinite(d) || d < 0) throw new Error("Discount must be zero or more.");
    next.discountAmount = d;
  }
  if (next.discountAmount > next.fee) throw new Error("A discount cannot exceed the fee.");
  if ("commissionPct" in edits) next.commissionPct = assertCommissionPct(edits.commissionPct);
  if ("deferredToMonth" in edits) next.deferredToMonth = edits.deferredToMonth || null;
  return recalcSnapshotRow(next);
}

export function totalsForRows(rows) {
  const byTeacher = {};
  for (const r of rows) (byTeacher[r.teacherId] ??= []).push(r);
  let teacher = 0, admin = 0, gross = 0;
  const teachers = {};
  for (const [id, rs] of Object.entries(byTeacher)) {
    const s = sumTeacher(rs);
    teachers[id] = { teacher: num(s.teacher), admin: num(s.admin), gross: num(s.gross) };
    teacher += s.teacher; admin += s.admin; gross += s.gross;
  }
  return { teacher: num(teacher), admin: num(admin), gross: num(gross), teachers };
}

/** What the "Finalize Month" confirmation modal shows. */
export function summariseMonth(rows) {
  const billable = rows.filter(r => !r.covered);
  return {
    total:          billable.length,
    collected:      billable.filter(r => r.collected).length,
    uncollectedRows: billable.filter(r => !r.collected && !r.deferredToMonth),
    uncollected:    billable.filter(r => !r.collected && !r.deferredToMonth).length,
    deferredOut:    billable.filter(r => r.deferredToMonth).length,
    deferredIn:     billable.filter(r => (r.deferredFromMonths ?? []).length > 0).length,
    ...totalsForRows(rows),
  };
}

const TRACKED = ["collected", "fee", "discountAmount", "commissionPct", "deferredToMonth", "gross", "teacherCut", "adminCut"];

/** Field-level differences between two row lists (matched by enrolment id). */
export function diffSnapshotRows(original, revised) {
  const byId = new Map(original.map(r => [r.eid, r]));
  const changes = [];
  for (const r of revised) {
    const o = byId.get(r.eid);
    if (!o) continue;
    for (const f of TRACKED) {
      if ((o[f] ?? null) !== (r[f] ?? null)) changes.push({ eid: r.eid, studentName: r.studentName, instrument: r.instrument, field: f, from: o[f] ?? null, to: r[f] ?? null });
    }
  }
  return changes;
}

/**
 * Other months touched by a revision of `ym`: any month a changed row defers to (old or new)
 * or receives deferred money from. These get highlighted in the Archive.
 */
export function affectedMonths(original, revised, ym) {
  const set = new Set();
  const byId = new Map(original.map(r => [r.eid, r]));
  for (const r of revised) {
    const o = byId.get(r.eid);
    if (!o) continue;
    const changed = TRACKED.some(f => (o[f] ?? null) !== (r[f] ?? null));
    if (!changed) continue;
    if (o.deferredToMonth) set.add(o.deferredToMonth);
    if (r.deferredToMonth) set.add(r.deferredToMonth);
    for (const m of r.deferredFromMonths ?? []) set.add(m);
  }
  set.delete(ym);
  return [...set].sort();
}

/**
 * Rows whose deferral target differs between `original` and `revised`. `amount` is the gross the
 * revised row carries to its new target month. Applied to other months' ledgers on save.
 */
export function deferralChanges(original, revised) {
  const byId = new Map(original.map(r => [r.eid, r]));
  const out = [];
  for (const r of revised) {
    const o = byId.get(r.eid);
    if (!o || (o.deferredToMonth ?? null) === (r.deferredToMonth ?? null)) continue;
    out.push({
      eid: r.eid, studentName: r.studentName, instrument: r.instrument,
      from: o.deferredToMonth ?? null, to: r.deferredToMonth ?? null, amount: num(r.hypotheticalGross ?? 0),
    });
  }
  return out;
}

/**
 * A stored snapshot row, reshaped like a live payroll row so the Payroll view can render a
 * finalized (or revised) month with the same components.
 */
export function snapshotRowToDisplay(r) {
  return {
    eid: r.eid, teacherId: r.teacherId, studentName: r.studentName,
    enrolment: {
      id: r.eid, studentId: r.studentId, instrument: r.instrument, syllabus: r.syllabus, grade: r.grade,
      attendanceBased: r.attendanceBased, schedule: { duration: r.duration },
    },
    period: { term: r.term, months: r.periodMonths, startYM: r.periodStart },
    covered: r.covered, coveredBy: r.coveredBy, collected: r.collected, collectedAt: r.collectedAt,
    fee: r.fee, discountAmount: r.discountAmount, net: Math.max(0, r.fee - r.discountAmount),
    discount: r.discountName ? { name: r.discountName } : null,
    commissionPct: r.commissionPct, flatFeePerMonth: r.periodMonths ? r.flatFeeCap / r.periodMonths : r.flatFeeCap,
    scheduled: r.scheduled, attended: r.attended,
    deferredToMonth: r.deferredToMonth, deferredFromMonths: r.deferredFromMonths,
    deferredFromDetails: (r.deferredFromMonths ?? []).map(ym => ({ ym, amount: 0 })),
    deferredGrossExtra: r.deferredGrossExtra, hypotheticalGross: r.hypotheticalGross,
    depositApplied: r.depositApplied, dueFromStudent: r.dueFromStudent,
    gross: r.gross, teacherCut: r.teacherCut, adminCut: r.adminCut, flatDeducted: r.flatDeducted,
    fromSnapshot: true,
  };
}
