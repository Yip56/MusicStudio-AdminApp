// Enrolment = one student learning one instrument. It owns teacher, room, weekly slot,
// grade, fee, billing term and commission. A student can have 1..n enrolments.
import { GRADE_LABELS, CONTEMPORARY_GRADE_LABELS } from "../data/seed.js";
import { addMinutes, timesOverlap, toMinutes, ymOfDate, lastDayOfMonth } from "./time.js";
import { assertBillingTerm, buildBillingPatch } from "./billing.js";

export const DURATIONS = ["30", "45", "60"];

export function gradesFor(syllabus) {
  return syllabus === "contemporary" ? CONTEMPORARY_GRADE_LABELS : GRADE_LABELS;
}

export function roomSupportsInstrument(room, instrument) {
  return !!room && !!instrument && (room.types ?? []).includes(instrument);
}

// ─── Schedule ─────────────────────────────────────────────────────────────────

/** Is the enrolment's weekly class running on this calendar date? */
export function isEnrolmentActiveOn(e, date) {
  if (!e?.schedule) return false;
  if (e.startDate && date < e.startDate) return false;
  if (e.endDate && date > e.endDate) return false;
  return true;
}

/** Still occupying its slot on/after `asOf` (active, or stopped but not yet past its last day). */
export function isLive(e, asOf) {
  return e.status !== "stopped" || !e.endDate || e.endDate >= asOf;
}

/**
 * One session per enrolment per matching weekday. A student with two instruments
 * therefore appears twice on the same day, each at that class's own time.
 */
export function getSessionsForDate(date, enrolments) {
  const dow = new Date(date + "T00:00").getDay();
  return enrolments
    .filter(e => e.schedule?.dayOfWeek === dow && isEnrolmentActiveOn(e, date))
    .map(e => ({
      id:           `recurring_${e.id}_${date}`,
      enrolmentId:  e.id,
      studentId:    e.studentId,
      teacherId:    e.teacherId,
      roomId:       e.schedule.roomId,
      instrument:   e.instrument,
      date,
      startTime:    e.schedule.startTime,
      endTime:      e.schedule.endTime,
      isRecurring:  true,
    }));
}

export function getMergedSessionsForDate(date, enrolments, attendance) {
  return getSessionsForDate(date, enrolments).map(sess => {
    const override = attendance.find(a => a.enrolmentId === sess.enrolmentId && a.date === date);
    return { ...sess, status: override?.status ?? "pending", notes: override?.notes ?? "" };
  });
}

export function getRecurringDates(e, year) {
  if (!e?.schedule) return [];
  const dates = [];
  const d = new Date(year, 0, 1);
  while (d.getDay() !== e.schedule.dayOfWeek) d.setDate(d.getDate() + 1);
  while (d.getFullYear() === year) {
    const s = `${year}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    if (isEnrolmentActiveOn(e, s)) dates.push(s);
    d.setDate(d.getDate() + 7);
  }
  return dates;
}

export function getScheduledCountForMonth(e, year, month0) {
  const prefix = `${year}-${String(month0 + 1).padStart(2, "0")}`;
  return getRecurringDates(e, year).filter(d => d.startsWith(prefix)).length;
}

export function getAttendedCountForMonth(enrolmentId, year, month0, attendance) {
  const prefix = `${year}-${String(month0 + 1).padStart(2, "0")}`;
  return attendance.filter(a => a.enrolmentId === enrolmentId && a.status === "present" && a.date.startsWith(prefix)).length;
}

// ─── Conflicts ────────────────────────────────────────────────────────────────

/**
 * Check a candidate weekly slot against existing enrolments.
 * Three rules, all on the same weekday with overlapping times:
 *   student – the same student cannot be in two classes at once
 *   room    – a room cannot host two classes at once
 *   teacher – a teacher cannot teach two classes at once
 * `ignoreId` skips the enrolment being edited. Stopped enrolments past their last day are ignored.
 */
export function findScheduleConflicts(candidate, existing, { ignoreId = null, asOf = "0000-00-00" } = {}) {
  const s = candidate.schedule;
  if (!s) return [];
  const out = [];
  for (const e of existing) {
    if (e.id === ignoreId || !e.schedule || !isLive(e, asOf)) continue;
    if (e.schedule.dayOfWeek !== s.dayOfWeek) continue;
    if (!timesOverlap(s.startTime, s.endTime, e.schedule.startTime, e.schedule.endTime)) continue;
    if (candidate.studentId && e.studentId === candidate.studentId) out.push({ kind: "student", with: e });
    if (s.roomId && e.schedule.roomId === s.roomId)               out.push({ kind: "room",    with: e });
    if (candidate.teacherId && e.teacherId === candidate.teacherId) out.push({ kind: "teacher", with: e });
  }
  return out;
}

export function describeConflict(c, { students = [], teachers = [], rooms = [] } = {}) {
  const who  = students.find(s => s.id === c.with.studentId)?.name ?? "another student";
  const slot = `${c.with.schedule.startTime}–${c.with.schedule.endTime}`;
  if (c.kind === "student") return `${who} already has a ${c.with.instrument ?? "class"} lesson at ${slot} on this day.`;
  if (c.kind === "room")    return `${rooms.find(r => r.id === c.with.schedule.roomId)?.name ?? "The room"} is already booked at ${slot} (${who}).`;
  return `${teachers.find(t => t.id === c.with.teacherId)?.name ?? "The teacher"} is already teaching at ${slot} (${who}).`;
}

// ─── Validation ───────────────────────────────────────────────────────────────

/** Returns a list of human-readable problems (empty = valid). */
export function validateEnrolment(e, { rooms = [], teachers = [], instruments = [] } = {}) {
  const errors = [];
  if (!e.studentId) errors.push("Choose a student.");
  if (!e.instrument) errors.push("Choose an instrument.");
  else if (!instruments.includes(e.instrument)) errors.push(`"${e.instrument}" is not on the Grades & Fees page.`);
  if (!gradesFor(e.syllabus).includes(e.grade)) errors.push("Choose a grade that exists for this syllabus.");
  const s = e.schedule ?? {};
  if (!DURATIONS.includes(String(s.duration))) errors.push("Choose a lesson duration (30 / 45 / 60 min).");
  if (!s.startTime || !s.endTime || toMinutes(s.endTime) <= toMinutes(s.startTime)) errors.push("End time must be after start time.");
  if (!e.teacherId) errors.push("Choose a teacher.");
  else {
    const t = teachers.find(x => x.id === e.teacherId);
    if (t && e.instrument && !(t.instruments ?? []).includes(e.instrument)) errors.push(`${t.name} does not teach ${e.instrument}.`);
  }
  if (!s.roomId) errors.push("Choose a room.");
  else {
    const r = rooms.find(x => x.id === s.roomId);
    if (r && e.instrument && !roomSupportsInstrument(r, e.instrument)) errors.push(`${r.name} is not set up for ${e.instrument}.`);
  }
  if (e.billingTerm) { try { assertBillingTerm(e.billingTerm); } catch (err) { errors.push(err.message); } }
  return errors;
}

/** Keep endTime in step with startTime + duration. */
export function withEndTime(schedule) {
  return { ...schedule, endTime: addMinutes(schedule.startTime, schedule.duration) };
}

// ─── Lifecycle ────────────────────────────────────────────────────────────────

export function newEnrolmentDoc(form, { today }) {
  const startDate = form.startDate || today;
  const term = assertBillingTerm(form.billingTerm ?? "monthly");
  const base = {
    studentId:       form.studentId,
    instrument:      form.instrument,
    syllabus:        form.syllabus ?? "classical",
    grade:           form.grade,
    teacherId:       form.teacherId,
    attendanceBased: !!form.attendanceBased,
    schedule:        withEndTime({ ...form.schedule, dayOfWeek: Number(form.schedule.dayOfWeek) }),
    status:          "active",
    startDate,
    endDate:         null,
    feeOverride:     null,
    billingTerm:     term,
    termChanges:     [{ from: ymOfDate(startDate), term }],
    commissionPct:   null,
  };
  // Optional per-enrolment fee / commission set at registration (blank = standard fee / teacher default)
  const billing = buildBillingPatch(base, {
    feeAmount: form.feeAmount ?? "", feeEffectiveFrom: ymOfDate(startDate), commissionPct: form.commissionPct ?? "",
  });
  return { ...base, ...billing };
}

/** Stop an enrolment after the lesson month `lastYM` (inclusive). */
export function stopEnrolmentPatch(enrolment, lastYM) {
  const start = enrolment.startDate ? ymOfDate(enrolment.startDate) : null;
  if (start && lastYM < start) throw new Error("The last lesson month cannot be before the enrolment started.");
  return { status: "stopped", endDate: lastDayOfMonth(lastYM) };
}

/** Grade / duration edits after the fee was collected need an explicit warning. */
export function needsCollectedFeeWarning(prev, next, collectedForCurrentPeriod) {
  if (!collectedForCurrentPeriod) return false;
  const gradeChanged    = prev.grade !== next.grade || prev.syllabus !== next.syllabus;
  const durationChanged = (prev.schedule?.duration ?? null) !== (next.schedule?.duration ?? null);
  return gradeChanged || durationChanged;
}
