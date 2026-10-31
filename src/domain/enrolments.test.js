import { describe, it, expect } from "vitest";
import {
  getSessionsForDate, getMergedSessionsForDate, findScheduleConflicts, validateEnrolment,
  newEnrolmentDoc, stopEnrolmentPatch, needsCollectedFeeWarning, getScheduledCountForMonth,
} from "./enrolments.js";

const sched = (dayOfWeek, startTime, endTime, roomId, duration = "60") => ({ dayOfWeek, startTime, endTime, roomId, duration });

// 2026-08-08 is a Saturday (dayOfWeek 6)
const SAT = "2026-08-08";

const piano = { id: "e1", studentId: "s1", instrument: "Piano", teacherId: "t1", status: "active", startDate: "2026-01-01", schedule: sched(6, "09:00", "10:00", "r1") };
const drum  = { id: "e2", studentId: "s1", instrument: "Drum",  teacherId: "t2", status: "active", startDate: "2026-01-01", schedule: sched(6, "11:00", "12:00", "r4") };

describe("multi-instrument schedule rendering", () => {
  it("renders one entry per enrolment, so a two-instrument student appears twice at each class's own time", () => {
    const sessions = getSessionsForDate(SAT, [piano, drum]);
    expect(sessions).toHaveLength(2);
    const mine = sessions.filter(s => s.studentId === "s1");
    expect(mine.map(s => s.startTime).sort()).toEqual(["09:00", "11:00"]);
    expect(mine.map(s => s.roomId).sort()).toEqual(["r1", "r4"]);
    expect(new Set(mine.map(s => s.id)).size).toBe(2);
  });

  it("groups by teacher, room and day from the same enrolments", () => {
    const sessions = getSessionsForDate(SAT, [piano, drum]);
    expect(sessions.filter(s => s.teacherId === "t1")).toHaveLength(1);
    expect(sessions.filter(s => s.roomId === "r4")).toHaveLength(1);
    expect(getSessionsForDate("2026-08-09", [piano, drum])).toHaveLength(0); // Sunday
  });

  it("attendance is tracked per enrolment, not per student", () => {
    const att = [{ enrolmentId: "e1", date: SAT, status: "present" }];
    const merged = getMergedSessionsForDate(SAT, [piano, drum], att);
    expect(merged.find(s => s.enrolmentId === "e1").status).toBe("present");
    expect(merged.find(s => s.enrolmentId === "e2").status).toBe("pending");
  });

  it("does not render before startDate or after endDate", () => {
    const e = { ...piano, startDate: "2026-08-15", endDate: "2026-08-31" };
    expect(getSessionsForDate(SAT, [e])).toHaveLength(0);
    expect(getSessionsForDate("2026-08-22", [e])).toHaveLength(1);
    expect(getSessionsForDate("2026-09-05", [e])).toHaveLength(0);
  });

  it("scheduled class count respects the enrolment's date range", () => {
    expect(getScheduledCountForMonth(piano, 2026, 7)).toBe(5); // Saturdays in Aug 2026
    expect(getScheduledCountForMonth({ ...piano, endDate: "2026-08-15" }, 2026, 7)).toBe(3); // Aug 1, 8, 15
  });
});

describe("conflict detection", () => {
  const existing = [piano, drum];

  it("blocks the same student in two overlapping classes (even in different rooms/teachers)", () => {
    const c = { studentId: "s1", teacherId: "t9", schedule: sched(6, "09:30", "10:30", "r9") };
    const kinds = findScheduleConflicts(c, existing).map(x => x.kind);
    expect(kinds).toEqual(["student"]);
  });

  it("blocks a double-booked room", () => {
    const c = { studentId: "s2", teacherId: "t9", schedule: sched(6, "09:30", "10:30", "r1") };
    expect(findScheduleConflicts(c, existing).map(x => x.kind)).toEqual(["room"]);
  });

  it("blocks a double-booked teacher", () => {
    const c = { studentId: "s2", teacherId: "t1", schedule: sched(6, "09:00", "09:30", "r9", "30") };
    expect(findScheduleConflicts(c, existing).map(x => x.kind)).toEqual(["teacher"]);
  });

  it("reports every rule that is broken", () => {
    const c = { studentId: "s1", teacherId: "t1", schedule: sched(6, "09:00", "10:00", "r1") };
    expect(findScheduleConflicts(c, existing).map(x => x.kind).sort()).toEqual(["room", "student", "teacher"]);
  });

  it("allows back-to-back classes and other weekdays", () => {
    const back = { studentId: "s1", teacherId: "t1", schedule: sched(6, "10:00", "11:00", "r1") };
    expect(findScheduleConflicts(back, existing)).toEqual([]);
    const otherDay = { studentId: "s1", teacherId: "t1", schedule: sched(3, "09:00", "10:00", "r1") };
    expect(findScheduleConflicts(otherDay, existing)).toEqual([]);
  });

  it("ignores the enrolment being edited", () => {
    const c = { studentId: "s1", teacherId: "t1", schedule: sched(6, "09:00", "10:00", "r1") };
    expect(findScheduleConflicts(c, existing, { ignoreId: "e1" }).map(x => x.with.id)).toEqual([]);
  });

  it("ignores stopped enrolments whose last day has passed", () => {
    const stopped = { ...piano, status: "stopped", endDate: "2026-06-30" };
    const c = { studentId: "s2", teacherId: "t1", schedule: sched(6, "09:00", "10:00", "r1") };
    expect(findScheduleConflicts(c, [stopped], { asOf: "2026-08-01" })).toEqual([]);
    expect(findScheduleConflicts(c, [stopped], { asOf: "2026-06-15" })).not.toEqual([]);
  });
});

describe("validation", () => {
  const rooms = [{ id: "r1", name: "Piano Room", types: ["Piano"] }, { id: "r4", name: "Drum Room", types: ["Drum", "Guitar"] }];
  const teachers = [{ id: "t1", name: "Ms Lin", instruments: ["Piano"] }];
  const ctx = { rooms, teachers, instruments: ["Piano", "Drum", "Guitar"] };
  const good = { studentId: "s1", instrument: "Piano", syllabus: "classical", grade: "Grade 2", teacherId: "t1", schedule: sched(6, "09:00", "10:00", "r1") };

  it("accepts a valid enrolment", () => expect(validateEnrolment(good, ctx)).toEqual([]));

  it("a class can only use a room whose types include its instrument", () => {
    const errs = validateEnrolment({ ...good, schedule: sched(6, "09:00", "10:00", "r4") }, ctx);
    expect(errs.join(" ")).toMatch(/not set up for Piano/);
    expect(validateEnrolment({ ...good, instrument: "Guitar", teacherId: "", schedule: sched(6, "09:00", "10:00", "r4") }, ctx).join(" ")).not.toMatch(/not set up/);
  });

  it("rejects instruments that are not on the Grades & Fees page", () => {
    expect(validateEnrolment({ ...good, instrument: "Flute" }, ctx).join(" ")).toMatch(/not on the Grades & Fees page/);
  });

  it("checks the grade belongs to the syllabus", () => {
    expect(validateEnrolment({ ...good, syllabus: "contemporary", grade: "Grade 2" }, ctx).join(" ")).toMatch(/grade/i);
    expect(validateEnrolment({ ...good, syllabus: "contemporary", grade: "Advanced" }, ctx)).toEqual([]);
  });

  it("rejects a teacher who does not teach the instrument", () => {
    expect(validateEnrolment({ ...good, instrument: "Drum", schedule: sched(6, "09:00", "10:00", "r4") }, ctx).join(" ")).toMatch(/does not teach Drum/);
  });
});

describe("lifecycle", () => {
  it("creates an active enrolment with a monthly term from its start month", () => {
    const e = newEnrolmentDoc({ studentId: "s1", instrument: "Piano", grade: "Beginner", teacherId: "t1", schedule: sched(6, "09:00", "10:00", "r1") }, { today: "2026-08-08" });
    expect(e.status).toBe("active");
    expect(e.billingTerm).toBe("monthly");
    expect(e.termChanges).toEqual([{ from: "2026-08", term: "monthly" }]);
    expect(e.commissionPct).toBeNull();
    expect(e.feeOverride).toBeNull();
    expect(e.schedule.endTime).toBe("10:00");
  });

  it("stopping sets the last lesson day to the end of the chosen month", () => {
    expect(stopEnrolmentPatch(piano, "2026-09")).toEqual({ status: "stopped", endDate: "2026-09-30" });
    expect(() => stopEnrolmentPatch(piano, "2025-12")).toThrow();
  });

  it("warns only when grade/duration changes after the fee was collected", () => {
    const next = { ...piano, grade: "Grade 3" };
    expect(needsCollectedFeeWarning(piano, next, true)).toBe(true);
    expect(needsCollectedFeeWarning(piano, next, false)).toBe(false);
    expect(needsCollectedFeeWarning(piano, { ...piano, teacherId: "t2" }, true)).toBe(false);
    expect(needsCollectedFeeWarning(piano, { ...piano, schedule: { ...piano.schedule, duration: "45" } }, true)).toBe(true);
  });
});
