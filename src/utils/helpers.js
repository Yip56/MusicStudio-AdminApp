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
 * Count how many times a student attended (status=present|late) in a month.
 */
export function getAttendedCountForMonth(studentId, year, month, attendanceOverrides) {
  return attendanceOverrides.filter(a => {
    if (a.studentId !== studentId) return false;
    if (a.status !== "present" && a.status !== "late") return false;
    const dt = new Date(a.date);
    return dt.getFullYear() === year && dt.getMonth() === month;
  }).length;
}

/**
 * Calculate payroll for a single student for a given month.
 * If attendanceBased: gross = (attended / scheduled) * fee
 * Else:               gross = full fee
 * Then split into teacher cut, admin cut, admin flat fee.
 */
export function calcStudentPayroll(student, year, month, fees, commissionPct, adminFlatFee, attendanceOverrides) {
  const grade    = student.grade;
  const inst     = student.instrument;
  const fee      = fees[inst]?.[grade] ?? 0;
  const scheduled = getScheduledCountForMonth(student, year, month);
  const attended  = getAttendedCountForMonth(student.id, year, month, attendanceOverrides);

  let gross;
  if (student.attendanceBased) {
    gross = scheduled > 0 ? (attended / scheduled) * fee : 0;
  } else {
    gross = fee;
  }

  const afterFlat   = Math.max(0, gross - adminFlatFee);
  const teacherCut  = (afterFlat * commissionPct) / 100;
  const adminCut    = afterFlat - teacherCut;

  return { fee, scheduled, attended, gross, teacherCut, adminCut, adminFlatFee, afterFlat };
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
