// Pure date / time helpers shared by the domain modules. No React, no Firebase.

/** "HH:MM" → minutes since midnight. */
export function toMinutes(hhmm) {
  const [h, m] = String(hhmm).split(":").map(Number);
  return h * 60 + m;
}

/** "09:00" + 45 → "09:45" */
export function addMinutes(hhmm, mins) {
  const total = toMinutes(hhmm) + Number(mins);
  return `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
}

/** Exclusive-boundary overlap: 09:00–10:00 and 10:00–11:00 do NOT overlap. */
export function timesOverlap(startA, endA, startB, endB) {
  return startA < endB && endA > startB;
}

/** (2026, 7) → "2026-08"   (month is 0-based, like Date) */
export function ymKey(year, month0) {
  return `${year}-${String(month0 + 1).padStart(2, "0")}`;
}

/** "2026-08" → { year: 2026, month0: 7 } */
export function parseYM(ym) {
  const [y, m] = ym.split("-").map(Number);
  return { year: y, month0: m - 1 };
}

export function addMonths(ym, n) {
  const { year, month0 } = parseYM(ym);
  const d = new Date(year, month0 + n, 1);
  return ymKey(d.getFullYear(), d.getMonth());
}

/** Whole months from a to b (b − a). */
export function monthsBetween(a, b) {
  const pa = parseYM(a), pb = parseYM(b);
  return (pb.year - pa.year) * 12 + (pb.month0 - pa.month0);
}

/** "2026-08-15" → "2026-08" */
export function ymOfDate(dateStr) {
  return String(dateStr).slice(0, 7);
}

/** Last calendar day of a "YYYY-MM" as "YYYY-MM-DD". */
export function lastDayOfMonth(ym) {
  const { year, month0 } = parseYM(ym);
  const d = new Date(year, month0 + 1, 0);
  return `${year}-${String(month0 + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function formatYM(ym) {
  const { year, month0 } = parseYM(ym);
  return new Date(year, month0, 1).toLocaleDateString("en-MY", { month: "short", year: "numeric" });
}

export function formatYMLong(ym) {
  const { year, month0 } = parseYM(ym);
  return new Date(year, month0, 1).toLocaleDateString("en-MY", { month: "long", year: "numeric" });
}
