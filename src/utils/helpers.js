// Small shared helpers. The schedule / payroll logic now lives in src/domain/ (pure + tested);
// the re-exports below keep older import paths working.
export { timesOverlap } from "../domain/time.js";
export {
  getSessionsForDate, getMergedSessionsForDate, getRecurringDates,
  getScheduledCountForMonth, getAttendedCountForMonth,
} from "../domain/enrolments.js";
export { calcLine } from "../domain/payroll.js";

export function uid() {
  return Math.random().toString(36).slice(2, 9);
}

/** Format a date string to display. */
export function fmtDate(dateStr, opts = {}) {
  return new Date(dateStr + "T00:00").toLocaleDateString("en-MY", {
    weekday: "long", month: "long", day: "numeric", ...opts
  });
}
