import { describe, it, expect } from "vitest";
import { buildCalendar, dayStatus, validateDayOverride, listCalendarDays, fifthKey } from "./calendar.js";
import { getSessionsForDate, getScheduledCountForMonth, getFifthWeekEnrolments } from "./enrolments.js";

const sched = (dayOfWeek, startTime, endTime, roomId) => ({ dayOfWeek, startTime, endTime, roomId, duration: "60" });
const sat = { id: "e1", studentId: "s1", instrument: "Piano", teacherId: "t1", status: "active", startDate: "2026-01-01", schedule: sched(6, "09:00", "10:00", "r1") };
const fri = { ...sat, id: "e2", schedule: sched(5, "09:00", "10:00", "r1") };

describe("calendar overrides", () => {
  it("a public holiday closes the day unless an admin switches it to running", () => {
    expect(dayStatus("2026-05-01")).toMatchObject({ closed: true, source: "public", name: "Labour Day" });
    const cal = buildCalendar([{ kind: "day", date: "2026-05-01", status: "open" }]);
    expect(dayStatus("2026-05-01", cal)).toMatchObject({ closed: false, overridden: true, builtin: "Labour Day" });
    expect(getSessionsForDate("2026-05-01", [fri])).toHaveLength(0);
    expect(getSessionsForDate("2026-05-01", [fri], cal)).toHaveLength(1);
  });

  it("an admin closure removes classes on an ordinary day", () => {
    const cal = buildCalendar([{ kind: "day", date: "2026-08-08", status: "closed", name: "Flood" }]);
    expect(dayStatus("2026-08-08", cal)).toMatchObject({ closed: true, source: "custom", name: "Flood" });
    expect(getSessionsForDate("2026-08-08", [sat], cal)).toHaveLength(0);
    expect(getSessionsForDate("2026-08-15", [sat], cal)).toHaveLength(1);
  });

  it("a closed day is not a lesson, so a later Saturday can become the 5th", () => {
    // Aug 2026 Saturdays: 1, 8, 15, 22, 29. Closing Aug 8 leaves 4 lessons → Aug 29 runs.
    const cal = buildCalendar([{ kind: "day", date: "2026-08-08", status: "closed", name: "Flood" }]);
    expect(getSessionsForDate("2026-08-29", [sat], cal)).toHaveLength(1);
    expect(getScheduledCountForMonth(sat, 2026, 7, cal)).toBe(4);
  });

  it("running a public holiday makes it count as a lesson", () => {
    // Fridays in May 2026: 1 (Labour Day), 8, 15, 22, 29. Running May 1 makes May 29 the 5th.
    const cal = buildCalendar([{ kind: "day", date: "2026-05-01", status: "open" }]);
    expect(getSessionsForDate("2026-05-29", [fri], cal)).toHaveLength(0);
    expect(getSessionsForDate("2026-05-29", [fri])).toHaveLength(1);
  });

  it("an admin can run one student's 5th-week lesson without affecting others", () => {
    const other = { ...sat, id: "e3", studentId: "s9" };
    expect(getSessionsForDate("2026-08-29", [sat, other])).toHaveLength(0);
    const cal = buildCalendar([{ kind: "fifth", enrolmentId: "e1", date: "2026-08-29" }]);
    expect(cal.fifth[fifthKey("e1", "2026-08-29")]).toBe(true);
    expect(getSessionsForDate("2026-08-29", [sat, other], cal).map(s => s.enrolmentId)).toEqual(["e1"]);
    expect(getFifthWeekEnrolments("2026-08-29", [sat, other], cal)).toHaveLength(2); // still listed so it can be undone
    expect(getScheduledCountForMonth(sat, 2026, 7, cal)).toBe(5);
  });

  it("validates overrides", () => {
    expect(validateDayOverride({ date: "2026-08-08", status: "closed", name: "" })).not.toHaveLength(0);
    expect(validateDayOverride({ date: "2026-08-08", status: "closed", name: "Flood" })).toHaveLength(0);
    expect(validateDayOverride({ date: "2026-08-08", status: "open" })).not.toHaveLength(0); // not a holiday
    expect(validateDayOverride({ date: "2026-05-01", status: "open" })).toHaveLength(0);
  });

  it("lists holidays and closures of a year, including overridden ones", () => {
    const cal = buildCalendar([
      { kind: "day", date: "2026-05-01", status: "open" },
      { kind: "day", date: "2026-08-08", status: "closed", name: "Flood" },
    ]);
    const list = listCalendarDays(2026, cal);
    expect(list.find(d => d.date === "2026-05-01")).toMatchObject({ closed: false, overridden: true });
    expect(list.find(d => d.date === "2026-08-08")).toMatchObject({ closed: true, source: "custom" });
    expect(list.map(d => d.date)).toEqual([...list.map(d => d.date)].sort());
  });
});
