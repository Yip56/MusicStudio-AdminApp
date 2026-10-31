// The instruments the studio teaches are defined ONLY by the Grades & Fees page
// (the keys of the classical + contemporary fee documents). Every instrument picker
// in the app — teachers, enrolments, rooms — derives its options from here.

/** Ordered, de-duplicated instrument names from the two fee tables. */
export function getInstruments(fees = {}, contemporaryFees = {}) {
  return [...new Set([...Object.keys(fees ?? {}), ...Object.keys(contemporaryFees ?? {})])];
}

/**
 * Who is still linked to an instrument? Used to block deleting it.
 * `enrolments` in "stopped" status past their end date no longer count as learning.
 */
export function instrumentUsage(instrument, { teachers = [], enrolments = [] }, asOf = null) {
  const live = e => e.status !== "stopped" || (asOf && e.endDate && e.endDate >= asOf);
  return {
    teachers:   teachers.filter(t => (t.instruments ?? []).includes(instrument)),
    enrolments: enrolments.filter(e => e.instrument === instrument && live(e)),
  };
}

export function canDeleteInstrument(instrument, data, asOf = null) {
  const u = instrumentUsage(instrument, data, asOf);
  return { ok: u.teachers.length === 0 && u.enrolments.length === 0, ...u };
}

export const INSTRUMENT_IN_USE_MESSAGE =
  "Un-attach all students and teachers that are linked to this instrument before deleting it.";

/**
 * Find references to instruments that are no longer offered.
 * Returns the patches needed to replace them with null (no fee, no instrument).
 */
export function findUnavailableInstrumentRefs(instruments, { teachers = [], enrolments = [], rooms = [] }) {
  const ok = new Set(instruments);
  const teacherPatches = [];
  for (const t of teachers) {
    const kept = (t.instruments ?? []).filter(i => ok.has(i));
    if (kept.length !== (t.instruments ?? []).length) teacherPatches.push({ id: t.id, instruments: kept });
  }
  const enrolmentPatches = enrolments
    .filter(e => e.instrument != null && !ok.has(e.instrument))
    .map(e => ({ id: e.id, instrument: null }));
  const roomPatches = [];
  for (const r of rooms) {
    const kept = (r.types ?? []).filter(i => ok.has(i));
    if (kept.length !== (r.types ?? []).length) roomPatches.push({ id: r.id, types: kept });
  }
  return { teacherPatches, enrolmentPatches, roomPatches };
}
