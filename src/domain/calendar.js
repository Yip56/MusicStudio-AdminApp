// Which days have classes. The built-in Malaysian public holidays (data/holidays.js) close the studio by
// default; admins can override that in Firestore `calendar_overrides`:
//   { kind: "day",   date, status: "open" | "closed", name }   open = run classes on a public holiday,
//                                                              closed = a closure the studio added itself
//   { kind: "fifth", enrolmentId, date }                       run this enrolment's 5th-week lesson
import { MY_PUBLIC_HOLIDAYS } from "../data/holidays.js";

export const NO_CALENDAR = { days: {}, fifth: {} };

/** calendar_overrides docs → lookup maps used by the schedule functions. */
export function buildCalendar(items = []) {
  const days = {}, fifth = {};
  for (const o of items) {
    if (o.kind === "day" && o.date) days[o.date] = { status: o.status, name: o.name ?? "", by: o.by?.name ?? null };
    else if (o.kind === "fifth" && o.enrolmentId && o.date) fifth[fifthKey(o.enrolmentId, o.date)] = true;
  }
  return { days, fifth };
}

export const fifthKey = (enrolmentId, date) => `${enrolmentId}_${date}`;

/**
 * { closed, name, source: "public" | "custom" | null, builtin, overridden }
 * `builtin` is the public-holiday name for the date even when classes run (overridden = true).
 */
export function dayStatus(date, cal = NO_CALENDAR) {
  const builtin = MY_PUBLIC_HOLIDAYS[date] ?? null;
  const o = cal.days?.[date];
  if (o?.status === "closed") return { closed: true,  name: o.name || "Studio closed", source: "custom", builtin, overridden: false };
  if (o?.status === "open" && builtin) return { closed: false, name: null, source: null, builtin, overridden: true };
  if (builtin) return { closed: true, name: builtin, source: "public", builtin, overridden: false };
  return { closed: false, name: null, source: null, builtin: null, overridden: false };
}

/** Problems with a day override (empty = fine). `open` only makes sense on a public holiday. */
export function validateDayOverride({ date, status, name }) {
  const errors = [];
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date ?? "")) errors.push("Choose a date.");
  if (status !== "open" && status !== "closed") errors.push("Unknown override.");
  if (status === "closed" && !name?.trim()) errors.push("Give the closure a name, e.g. \"Studio closed – flood\".");
  if (status === "open" && !MY_PUBLIC_HOLIDAYS[date]) errors.push("Only public holidays can be switched to running; this day already has classes.");
  return errors;
}

/** Public holidays and admin closures/overrides of a year, sorted by date, for the Holidays panel. */
export function listCalendarDays(year, cal = NO_CALENDAR) {
  const dates = new Set([
    ...Object.keys(MY_PUBLIC_HOLIDAYS).filter(d => d.startsWith(`${year}-`)),
    ...Object.keys(cal.days ?? {}).filter(d => d.startsWith(`${year}-`)),
  ]);
  return [...dates].sort().map(date => ({ date, ...dayStatus(date, cal) }))
    .filter(d => d.closed || d.overridden);
}
