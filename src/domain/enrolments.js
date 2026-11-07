// Enrolment = one student learning one instrument. It owns teacher, room, weekly slot,
// grade, fee, billing term and commission. A student can have 1..n enrolments.
import { GRADE_LABELS, CONTEMPORARY_GRADE_LABELS } from "../data/seed.js";
import { addMinutes, timesOverlap, toMinutes, ymOfDate, lastDayOfMonth } from "./time.js";
import { assertBillingTerm, buildBillingPatch } from "./billing.js";
import { NO_CALENDAR, dayStatus, fifthKey } from "./calendar.js";

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

/** Name of the closure on this date (public holiday or admin closure), or null when classes run. */
export function getHolidayName(date, cal = NO_CALENDAR) {
  const st = dayStatus(date, cal);
  return st.closed ? st.name : null;
}

/**
 * Is this enrolment's class off on `date`? (Assumes `date` is one of its weekly slots.)
 *   holiday – public holiday / studio closure: no class (admins can override a holiday to run)
 *   fifth   – the 5th real lesson in a month: no class. Counted per enrolment from its own first
 *             lesson in that month (so a mid-month start or a holiday-shortened month is handled),
 *             and closed days don't count as lessons. Some students therefore get 5 lessons, some 4.
 *             An admin can run a single 5th-week lesson (cal.fifth).
 * Returns { kind, name? } or null.
 */
export function getCancellation(e, date, cal = NO_CALENDAR) {
  const holiday = getHolidayName(date, cal);
  if (holiday) return { kind: "holiday", name: holiday };
  if (isFifthLesson(e, date, cal) && !cal.fifth?.[fifthKey(e.id, date)]) return { kind: "fifth" };
  return null;
}

/** Would `date` be this enrolment's 5th lesson of the month (ignoring any "run" override)? */
export function isFifthLesson(e, date, cal = NO_CALENDAR) {
  let n = 0;
  for (const d of weekdayDatesInMonth(date.slice(0, 7), e.schedule.dayOfWeek)) {
    if (!isEnrolmentActiveOn(e, d) || getHolidayName(d, cal)) continue;
    n++;
    if (d === date) return n >= 5;
  }
  return false;
}

function weekdayDatesInMonth(ym, dow) {
  const [y, m] = ym.split("-").map(Number);
  const out = [];
  for (let d = new Date(y, m - 1, 1); d.getMonth() === m - 1; d.setDate(d.getDate() + 1)) {
    if (d.getDay() === dow) out.push(`${ym}-${String(d.getDate()).padStart(2, "0")}`);
  }
  return out;
}

/** Enrolments whose class on `date` is their 5th lesson of the month (check cal.fifth for ones an admin chose to run). */
export function getFifthWeekEnrolments(date, enrolments, cal = NO_CALENDAR) {
  const dow = new Date(date + "T00:00").getDay();
  return enrolments.filter(e =>
    e.schedule?.dayOfWeek === dow && isEnrolmentActiveOn(e, date) && !getHolidayName(date, cal) && isFifthLesson(e, date, cal));
}

/**
 * One session per enrolment per matching weekday. A student with two instruments
 * therefore appears twice on the same day, each at that class's own time.
 * Closed days and the 5th lesson of a month (see getCancellation) have no session.
 */
export function getSessionsForDate(date, enrolments, cal = NO_CALENDAR) {
  const dow = new Date(date + "T00:00").getDay();
  return enrolments
    .filter(e => e.schedule?.dayOfWeek === dow && isEnrolmentActiveOn(e, date) && !getCancellation(e, date, cal))
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

export function getMergedSessionsForDate(date, enrolments, attendance, cal = NO_CALENDAR) {
  return getSessionsForDate(date, enrolments, cal).map(sess => {
    const override = attendance.find(a => a.enrolmentId === sess.enrolmentId && a.date === date);
    return { ...sess, status: override?.status ?? "pending", notes: override?.notes ?? "" };
  });
}

export function getRecurringDates(e, year, cal = NO_CALENDAR) {
  if (!e?.schedule) return [];
  const dates = [];
  const d = new Date(year, 0, 1);
  while (d.getDay() !== e.schedule.dayOfWeek) d.setDate(d.getDate() + 1);
  while (d.getFullYear() === year) {
    const s = `${year}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    if (isEnrolmentActiveOn(e, s) && !getCancellation(e, s, cal)) dates.push(s);
    d.setDate(d.getDate() + 7);
  }
  return dates;
}

export function getScheduledCountForMonth(e, year, month0, cal = NO_CALENDAR) {
  const prefix = `${year}-${String(month0 + 1).padStart(2, "0")}`;
  return getRecurringDates(e, year, cal).filter(d => d.startsWith(prefix)).length;
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

/**
 * Default slot for a make-up class: starts when the original class ends and keeps its length
 * (12:30–13:00 → 13:00–13:30, 09:00–09:45 → 09:45–10:30).
 */
export function defaultMakeupSlot(startTime, endTime) {
  return { startTime: endTime, endTime: addMinutes(endTime, toMinutes(endTime) - toMinutes(startTime)) };
}

/**
 * Check a make-up slot against everything already on that date (`sessionsOnDate`: recurring, one-off and
 * make-up sessions). Same student, teacher or room at an overlapping time is a hard block.
 * Returns [{ kind: "student"|"teacher"|"room", with: session }].
 */
export function findMakeupConflicts({ studentId, teacherId, roomId, startTime, endTime }, sessionsOnDate) {
  const out = [];
  for (const s of sessionsOnDate) {
    if (!timesOverlap(startTime, endTime, s.startTime, s.endTime)) continue;
    if (studentId && s.studentId === studentId) out.push({ kind: "student", with: s });
    if (teacherId && s.teacherId === teacherId) out.push({ kind: "teacher", with: s });
    if (roomId && s.roomId === roomId)           out.push({ kind: "room",    with: s });
  }
  return out;
}

/**
 * Human-readable conflict. `anonymous` (used for teachers) never names other students or teachers:
 * it only says the room/time is occupied.
 */
export function describeConflict(c, { students = [], teachers = [], rooms = [], anonymous = false } = {}) {
  const slot = `${c.with.schedule.startTime}–${c.with.schedule.endTime}`;
  const roomName = rooms.find(r => r.id === c.with.schedule.roomId)?.name ?? "The room";
  if (anonymous) {
    if (c.kind === "room")    return `${roomName} is occupied at ${slot}.`;
    if (c.kind === "teacher") return `You already have a class at ${slot}.`;
    return `This student already has a class at ${slot} on this day.`;
  }
  const who  = students.find(s => s.id === c.with.studentId)?.name ?? "another student";
  if (c.kind === "student") return `${who} already has a ${c.with.instrument ?? "class"} lesson at ${slot} on this day.`;
  if (c.kind === "room")    return `${roomName} is already booked at ${slot} (${who}).`;
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
