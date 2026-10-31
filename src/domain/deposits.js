// Registration deposit — one record per enrolment (two instruments = two deposits).
//
// Lifecycle:   pending ──collect──▶ held ──apply──▶ applied
//                                     └───forfeit──▶ forfeited
//   • The amount is a snapshot taken at registration (default: one month's fee for the
//     starting grade/duration) and is editable by an admin while pending/held. Later fee
//     changes never touch it.
//   • Deposits are NOT refundable. Applying one offsets the final fee; any excess over the
//     final fee is recorded as forfeited on the same record.
//   • A deposit can be applied (or forfeited) only once: every transition below throws
//     unless the record is in the right state, and firestore.rules refuses writes to
//     applied/forfeited records.
//   • While held, a deposit is a liability, not revenue.
import { resolveMonthlyFee } from "./billing.js";

export const DEPOSIT_STATUS = { PENDING: "pending", HELD: "held", APPLIED: "applied", FORFEITED: "forfeited" };
const { PENDING, HELD, APPLIED, FORFEITED } = DEPOSIT_STATUS;

const money = n => Math.round(Number(n) * 100) / 100;

/** First month's fee for the enrolment as it stands at registration. */
export function defaultDepositAmount(enrolment, startYM, fees, contemporaryFees) {
  return resolveMonthlyFee(enrolment, startYM, fees, contemporaryFees);
}

/** Non-blocking warning shown when the admin sets a deposit above the first month's fee. */
export function depositWarning(amount, defaultAmount) {
  if (Number(amount) > Number(defaultAmount) && Number(defaultAmount) > 0) {
    return `This deposit (RM ${money(amount)}) is higher than the first month's fee (RM ${money(defaultAmount)}). ` +
           `Any amount above the final month's fee is forfeited and cannot be refunded.`;
  }
  return null;
}

export function validateDepositAmount(amount) {
  const n = Number(amount);
  if (!Number.isFinite(n) || n <= 0) throw new Error("Enter a deposit amount greater than zero.");
  return money(n);
}

export function newDeposit({ enrolmentId, studentId, amount }) {
  return {
    enrolmentId, studentId,
    amount: validateDepositAmount(amount),
    status: PENDING,
    collectedAt: null, collectedBy: null, payment: null,
    appliedAt: null, appliedBy: null, appliedToMonth: null, appliedAmount: 0, forfeitedAmount: 0, finalFeeDue: null,
    forfeitedAt: null, forfeitedBy: null, forfeitReason: null,
  };
}

function assertState(dep, allowed, verb) {
  if (!allowed.includes(dep.status)) {
    throw new Error(`Cannot ${verb} a deposit that is "${dep.status}". A deposit can only be ${verb === "apply" ? "applied" : verb + "ed"} once.`);
  }
}

/** Record that the money was received. Registration is complete from here. */
export function collectDeposit(dep, { by, at, method = "cash" }) {
  assertState(dep, [PENDING], "collect");
  return { ...dep, status: HELD, collectedAt: at, collectedBy: by, payment: { amount: dep.amount, method, receivedAt: at, receivedBy: by } };
}

export function editDepositAmount(dep, amount) {
  assertState(dep, [PENDING, HELD], "edit");
  const next = validateDepositAmount(amount);
  return { ...dep, amount: next, ...(dep.payment ? { payment: { ...dep.payment, amount: next } } : {}) };
}

/**
 * How much of the final fee the deposit covers.
 *   deposit = fee   → pays nothing
 *   deposit < fee   → student pays the difference
 *   deposit > fee   → fee fully covered, the rest is forfeited (non-refundable)
 */
export function planDepositApplication(depositAmount, finalFeeDue) {
  const d = money(depositAmount), f = money(Math.max(0, finalFeeDue));
  const applied = Math.min(d, f);
  return { applied, balanceDue: money(f - applied), forfeited: money(d - applied) };
}

/** Apply a held deposit to the final fee. Single-use: throws if already applied/forfeited. */
export function applyDeposit(dep, { finalFeeDue, yearMonth, by, at }) {
  assertState(dep, [HELD], "apply");
  const plan = planDepositApplication(dep.amount, finalFeeDue);
  return {
    deposit: {
      ...dep, status: APPLIED, appliedAt: at, appliedBy: by, appliedToMonth: yearMonth,
      appliedAmount: plan.applied, forfeitedAmount: plan.forfeited, finalFeeDue: money(finalFeeDue),
    },
    plan,
  };
}

/** Admin writes the deposit off without applying it (e.g. student never returned). */
export function forfeitDeposit(dep, { by, at, reason = "" }) {
  assertState(dep, [HELD], "forfeit");
  return { ...dep, status: FORFEITED, forfeitedAt: at, forfeitedBy: by, forfeitReason: reason, forfeitedAmount: dep.amount };
}

/** Registration is complete only once the deposit is recorded as collected (or has moved on). */
export function isRegistrationComplete(dep) {
  return !!dep && dep.status !== PENDING;
}

/**
 * Reporting. Held (and pending-not-yet-received is excluded) deposits are a liability.
 * Applied deposits are recognised as revenue exactly once — through the final fee they offset —
 * so they appear here as "applied" for reference and are never added on top of fee revenue.
 */
export function summariseDeposits(deposits) {
  const sum = status => money(deposits.filter(d => d.status === status).reduce((a, d) => a + (status === APPLIED ? d.appliedAmount : d.amount), 0));
  return {
    held:        sum(HELD),
    pending:     sum(PENDING),
    applied:     sum(APPLIED),
    forfeited:   money(deposits.reduce((a, d) => a + (d.status === FORFEITED || d.status === APPLIED ? d.forfeitedAmount ?? 0 : 0), 0)),
    liability:   sum(HELD),
  };
}
