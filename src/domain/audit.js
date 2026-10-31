// Activity-log entries. Stored in `activity_log` (append-only: firestore.rules forbid
// update/delete). Everything that matters for money or enrolment gets an entry.

export const AUDIT_TYPES = {
  student:      "Student",
  enrolment:    "Enrolment",
  fee:          "Fee",
  term:         "Billing term",
  commission:   "Commission",
  payroll:      "Payroll",
  payout:       "Payout",
  deferral:     "Deferral",
  discount:     "Discount",
  deposit:      "Deposit",
  month:        "Month",
  notification: "Notification",
  room:         "Room",
  teacher:      "Teacher",
  instrument:   "Instrument",
  settings:     "Settings",
};

/** [{ field, from, to }] for each key whose value differs. */
export function diffFields(before = {}, after = {}, keys) {
  const ks = keys ?? [...new Set([...Object.keys(before), ...Object.keys(after)])];
  return ks
    .filter(k => JSON.stringify(before[k] ?? null) !== JSON.stringify(after[k] ?? null))
    .map(k => ({ field: k, from: before[k] ?? null, to: after[k] ?? null }));
}

/** Build a plain object ready to write (no undefined values). */
export function buildAuditEntry({ type, action, summary, entity = null, changes = [], meta = null, actor }) {
  if (!AUDIT_TYPES[type]) throw new Error(`Unknown audit type "${type}"`);
  return {
    type, action, summary,
    entity:  entity ?? null,
    changes: changes ?? [],
    meta:    meta ?? null,
    actorUid:  actor?.uid ?? null,
    actorName: actor?.displayName || actor?.email || "system",
    actorRole: actor?.role ?? null,
  };
}
