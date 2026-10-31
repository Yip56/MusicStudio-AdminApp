// Fees, billing terms and commission — all pure. The enrolment is the unit that owns
// grade, fee, term and commission rate.
import { addMonths, monthsBetween, ymOfDate } from "./time.js";

export const BILLING_TERMS = ["monthly", "quarterly"];
export const DEFAULT_COMMISSION_PCT = 60;

const TERM_MONTHS = { monthly: 1, quarterly: 3 };
export const TERM_LABEL = { monthly: "Monthly", quarterly: "Quarterly (3 months)" };

export function termMonths(term) {
  const n = TERM_MONTHS[term];
  if (!n) throw new Error(`Invalid billing term "${term}". Allowed: ${BILLING_TERMS.join(", ")}.`);
  return n;
}

export function assertBillingTerm(term) {
  termMonths(term);
  return term;
}

/** Throws unless 0 ≤ pct ≤ 100. Returns the number. */
export function assertCommissionPct(pct) {
  const n = Number(pct);
  if (pct === "" || pct === null || pct === undefined || !Number.isFinite(n) || n < 0 || n > 100) {
    throw new Error("Commission must be a number between 0 and 100.");
  }
  return n;
}

/** Enrolment override → teacher default → studio default. */
export function resolveCommissionPct(enrolment, teacher) {
  if (enrolment?.commissionPct !== null && enrolment?.commissionPct !== undefined) return Number(enrolment.commissionPct);
  if (teacher?.commissionPct !== null && teacher?.commissionPct !== undefined) return Number(teacher.commissionPct);
  return DEFAULT_COMMISSION_PCT;
}

// ─── Fees ─────────────────────────────────────────────────────────────────────

/** Standard monthly fee from the Grades & Fees tables. 0 when the instrument is null / unlisted. */
export function standardMonthlyFee(enrolment, fees = {}, contemporaryFees = {}) {
  if (!enrolment?.instrument) return 0;
  const table = enrolment.syllabus === "contemporary" ? contemporaryFees : fees;
  const raw = table?.[enrolment.instrument]?.[enrolment.grade];
  const duration = enrolment.schedule?.duration ?? "60";
  const n = typeof raw === "object" && raw !== null ? raw[duration] : raw;
  return Number(n) || 0;
}

/**
 * Monthly fee that applies to `ym`: the enrolment's own override from its effective month
 * onwards, otherwise the standard table fee. Past months never see a later override.
 */
export function resolveMonthlyFee(enrolment, ym, fees, contemporaryFees) {
  const o = enrolment?.feeOverride;
  if (o && o.amount !== null && o.amount !== undefined && ym >= o.effectiveFrom) return Number(o.amount);
  return standardMonthlyFee(enrolment, fees, contemporaryFees);
}

// ─── Billing periods ──────────────────────────────────────────────────────────

/** Enrolment's first billing month. */
export function enrolmentStartYM(enrolment) {
  return enrolment?.startDate ? ymOfDate(enrolment.startDate) : null;
}

/** Term in force for `ym`, from the enrolment's termChanges history. */
export function getTermForMonth(enrolment, ym) {
  const changes = [...(enrolment?.termChanges ?? [])].sort((a, b) => a.from.localeCompare(b.from));
  let current = null;
  for (const c of changes) if (c.from <= ym) current = c;
  return current;
}

/**
 * Which billing period does `ym` belong to?
 *   active      – the enrolment is billable in this month at all
 *   term        – "monthly" | "quarterly"
 *   startYM     – first month of the period
 *   months      – length of the period (truncated if the enrolment ends inside it)
 *   isFeeMonth  – true only for the first month of the period (that's where the one fee lives)
 *   coveredBy   – for months 2–3 of a quarter, the fee month that covers them
 */
export function getBillingPeriod(enrolment, ym) {
  const none = { active: false, term: null, startYM: null, months: 0, isFeeMonth: false, coveredBy: null };
  const startYM = enrolmentStartYM(enrolment);
  if (!startYM || ym < startYM) return none;
  const endYM = enrolment.endDate ? ymOfDate(enrolment.endDate) : null;
  if (endYM && ym > endYM) return none;

  const change = getTermForMonth(enrolment, ym);
  if (!change) return none;
  const n = termMonths(change.term);
  const offset = monthsBetween(change.from, ym);
  const periodStart = addMonths(change.from, Math.floor(offset / n) * n);
  let months = n;
  if (endYM) months = Math.min(n, monthsBetween(periodStart, endYM) + 1);
  const isFeeMonth = periodStart === ym;
  return { active: true, term: change.term, startYM: periodStart, months, isFeeMonth, coveredBy: isFeeMonth ? null : periodStart };
}

/** Total fee for a period: the monthly fee of each covered month, summed. */
export function periodFee(enrolment, startYM, months, fees, contemporaryFees) {
  let total = 0;
  for (let i = 0; i < months; i++) total += resolveMonthlyFee(enrolment, addMonths(startYM, i), fees, contemporaryFees);
  return total;
}

/** The last fee-bearing period of a stopped enrolment (the one a deposit offsets). */
export function getFinalPeriod(enrolment) {
  const endYM = enrolment?.endDate ? ymOfDate(enrolment.endDate) : null;
  if (!endYM) return null;
  const p = getBillingPeriod(enrolment, endYM);
  return p.active ? { startYM: p.startYM, months: p.months, term: p.term } : null;
}

// ─── Edits: fee / term / commission ───────────────────────────────────────────

/**
 * Turn an edit form into an enrolment patch.
 *   form.feeAmount        – "" / null = use the standard fee, number = override
 *   form.feeEffectiveFrom – "YYYY-MM" (required when setting an override)
 *   form.billingTerm      – "monthly" | "quarterly"
 *   form.termEffectiveFrom– "YYYY-MM" (required when the term changes)
 *   form.commissionPct    – "" / null = teacher default, 0–100 = override
 * Throws on invalid input. Returns only the fields that changed.
 */
export function buildBillingPatch(prev, form) {
  const patch = {};

  if ("feeAmount" in form) {
    const blank = form.feeAmount === "" || form.feeAmount === null || form.feeAmount === undefined;
    if (blank) {
      if (prev.feeOverride) patch.feeOverride = null;
    } else {
      const amount = Number(form.feeAmount);
      if (!Number.isFinite(amount) || amount < 0) throw new Error("Fee must be zero or more.");
      const from = form.feeEffectiveFrom;
      if (!from) throw new Error("Choose the month the new fee takes effect.");
      if (!prev.feeOverride || prev.feeOverride.amount !== amount || prev.feeOverride.effectiveFrom !== from) {
        patch.feeOverride = { amount, effectiveFrom: from };
      }
    }
  }

  if ("billingTerm" in form) {
    assertBillingTerm(form.billingTerm);
    const changes = [...(prev.termChanges ?? [])];
    const last = [...changes].sort((a, b) => a.from.localeCompare(b.from)).at(-1);
    if (!last || last.term !== form.billingTerm) {
      const from = form.termEffectiveFrom;
      if (!from) throw new Error("Choose the month the new billing term takes effect.");
      patch.termChanges = [...changes.filter(c => c.from < from), { from, term: form.billingTerm }];
      patch.billingTerm = form.billingTerm;
    }
  }

  if ("commissionPct" in form) {
    const blank = form.commissionPct === "" || form.commissionPct === null || form.commissionPct === undefined;
    const next = blank ? null : assertCommissionPct(form.commissionPct);
    if ((prev.commissionPct ?? null) !== next) patch.commissionPct = next;
  }

  return patch;
}

// ─── Discounts ────────────────────────────────────────────────────────────────

export function validateDiscount(d) {
  const errors = [];
  if (!d.name?.trim()) errors.push("Discount name is required.");
  if (!["percent", "amount"].includes(d.type)) errors.push("Choose percentage or fixed amount.");
  const v = Number(d.value);
  if (!Number.isFinite(v) || v <= 0) errors.push("Discount value must be greater than zero.");
  if (d.type === "percent" && v > 100) errors.push("A percentage discount cannot exceed 100%.");
  if (!/^\d{4}-\d{2}$/.test(d.startMonth ?? "")) errors.push("Choose a start month.");
  const dur = Number(d.durationMonths);
  if (!Number.isInteger(dur) || dur < 1) errors.push("Duration must be at least 1 month.");
  return errors;
}

/**
 * Is the discount selectable for fee month `ym`?
 * `startMonth` is when it first becomes available. It lasts `durationMonths` for each student from
 * the fee month it was first applied to them (`appliedFrom`, stored on the enrolment as
 * `discountGrants[discountId]`); until then it is available from `startMonth` onwards.
 */
export function isDiscountActiveFor(discount, ym, appliedFrom = null) {
  if (!discount?.startMonth) return false;
  const months = Math.max(1, Number(discount.durationMonths) || 1);
  if (appliedFrom) return ym >= appliedFrom && ym <= addMonths(appliedFrom, months - 1);
  return ym >= discount.startMonth;
}

/** RM taken off `fee`. Capped so a discount can never push the fee below zero. */
export function calcDiscountAmount(fee, discount) {
  if (!discount || !(fee > 0)) return 0;
  const raw = discount.type === "percent" ? (fee * Number(discount.value)) / 100 : Number(discount.value);
  const off = Math.min(Math.max(raw, 0), fee);
  return Math.round(off * 100) / 100;
}
