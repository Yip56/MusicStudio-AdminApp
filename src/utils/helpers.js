import { GRADE_LABELS } from "../data/seed.js";

export function uid() {
  return Math.random().toString(36).slice(2, 9);
}

/**
 * Given a student's recurring schedule, generate all occurrence dates in a given year.
 * Returns array of "YYYY-MM-DD" strings.
 */
export function getRecurringDates(schedule, year = new Date().getFullYear()) {
  if (!schedule) return [];
  const dates = [];
  const d = new Date(year, 0, 1);
  // Advance to first matching weekday
  while (d.getDay() !== schedule.dayOfWeek) d.setDate(d.getDate() + 1);
  while (d.getFullYear() === year) {
    dates.push(d.toISOString().split("T")[0]);
    d.setDate(d.getDate() + 7);
  }
  return dates;
}

/**
 * Get all "virtual" sessions for a date from recurring student schedules.
 * Returns array of session-like objects (no id — ephemeral).
 */
export function getSessionsForDate(date, students) {
  const dow = new Date(date + "T00:00").getDay();
  return students
    .filter(s => s.schedule && s.schedule.dayOfWeek === dow)
    .map(s => ({
      id: `recurring_${s.id}_${date}`,
      studentId: s.id,
      teacherId: s.teacherId,
      roomId: s.schedule.roomId,
      date,
      startTime: s.schedule.startTime,
      endTime:   s.schedule.endTime,
      isRecurring: true,
    }));
}

/**
 * For a given date, merge recurring sessions with attendance overrides.
 * Returns enriched sessions with status.
 */
export function getMergedSessionsForDate(date, students, attendanceOverrides) {
  const recurring = getSessionsForDate(date, students);
  return recurring.map(sess => {
    const override = attendanceOverrides.find(
      a => a.studentId === sess.studentId && a.date === date
    );
    return {
      ...sess,
      status: override?.status ?? "pending",
      notes:  override?.notes  ?? "",
    };
  });
}

/**
 * Count how many recurring classes a student has in a given month/year.
 */
export function getScheduledCountForMonth(student, year, month) {
  if (!student.schedule) return 0;
  const dates = getRecurringDates(student.schedule, year);
  return dates.filter(d => {
    const dt = new Date(d);
    return dt.getFullYear() === year && dt.getMonth() === month;
  }).length;
}

/**
 * Count how many times a student attended (status=present) in a month.
 */
export function getAttendedCountForMonth(studentId, year, month, attendanceOverrides) {
  return attendanceOverrides.filter(a => {
    if (a.studentId !== studentId) return false;
    if (a.status !== "present") return false;
    const dt = new Date(a.date);
    return dt.getFullYear() === year && dt.getMonth() === month;
  }).length;
}

/**
 * Calculate payroll for a single student for a given month.
 *
 * Rules:
 * - collected=false → everything is 0 (fee not yet received)
 * - attendanceBased + attended=0 → everything is 0 (no classes to pay out on)
 * - adminFlatFee is capped at gross (admin never takes more than what was collected)
 * - adminCut = gross − teacherCut (total admin take, includes flat fee)
 * - flatDeducted = the actual flat fee deducted (≤ gross)
 * - deferredGrossExtra = pre-computed gross from deferred months to combine into this month
 */
export function calcStudentPayroll(student, year, month, fees, commissionPct, adminFlatFee, attendanceOverrides, collected = false, deferredGrossExtra = 0) {
  const fee       = fees[student.instrument]?.[student.grade] ?? 0;
  const scheduled = getScheduledCountForMonth(student, year, month);
  const attended  = getAttendedCountForMonth(student.id, year, month, attendanceOverrides);

  const zero = { fee, scheduled, attended, gross: 0, teacherCut: 0, adminCut: 0, flatDeducted: 0, afterFlat: 0 };

  // ownGross: this month's fee, subject to collection + attendance rules
  let ownGross = 0;
  if (collected && !(student.attendanceBased && attended === 0)) {
    ownGross = student.attendanceBased
      ? (scheduled > 0 ? (attended / scheduled) * fee : 0)
      : fee;
  }

  // deferredGrossExtra bypasses collection/attendance rules — it was earned in a prior month
  const gross = ownGross + deferredGrossExtra;

  if (gross <= 0) return zero;

  const flatDeducted = Math.min(adminFlatFee, gross);
  const afterFlat    = gross - flatDeducted;
  const teacherCut   = (afterFlat * commissionPct) / 100;
  const adminCut     = gross - teacherCut;

  return { fee, scheduled, attended, gross, teacherCut, adminCut, flatDeducted, afterFlat };
}

/**
 * Check if two time ranges overlap (exclusive boundaries).
 */
export function timesOverlap(startA, endA, startB, endB) {
  return startA < endB && endA > startB;
}

/**
 * Format a date string to display.
 */
export function fmtDate(dateStr, opts = {}) {
  return new Date(dateStr + "T00:00").toLocaleDateString("en-MY", {
    weekday: "long", month: "long", day: "numeric", ...opts
  });
}
