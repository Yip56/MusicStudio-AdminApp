// Server-render smoke tests: mount every view with realistic data so reference errors and
// bad prop wiring show up here instead of in the browser. Firebase is mocked; no network.
import { describe, it, expect, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

vi.mock("../firebase.js", () => ({ db: {}, auth: {}, googleProvider: {}, app: {} }));

import { getTokens } from "../utils/tokens.js";
import { TODAY } from "../data/seed.js";
import Dashboard from "./Dashboard.jsx";
import Students from "./Students.jsx";
import CalendarView from "./CalendarView.jsx";
import Payroll from "./Payroll.jsx";
import GradesAndFees from "./GradesAndFees.jsx";
import RoomsView from "./RoomsView.jsx";
import DiscountsView from "./DiscountsView.jsx";
import ArchiveView from "./ArchiveView.jsx";
import ActivityLogView from "./ActivityLogView.jsx";
import UserManagement from "./UserManagement.jsx";
import EnrolmentForm from "../components/EnrolmentForm.jsx";
import CommandPalette from "../components/CommandPalette.jsx";
import { Sheet } from "../components/UI.jsx";

const T = getTokens("dark");
const dow = new Date(TODAY + "T00:00").getDay();
const monthStart = TODAY.slice(0, 8) + "01";

const fees = {
  Piano: { Beginner: { "30": 80, "45": 120, "60": 160 }, "Grade 3": { "30": 100, "45": 150, "60": 205 } },
  Drum:  { Beginner: { "30": 80, "45": 120, "60": 160 } },
};
const cfees = { Piano: { Beginner: { "30": 80, "45": 120, "60": 160 } } };
const tables = { fees, contemporaryFees: cfees };

const students = [{ id: "s1", name: "Mia Tan" }, { id: "s2", name: "Noah Lee" }];
const teachers = [
  { id: "t1", name: "Ms Lin",  instruments: ["Piano"], commissionPct: 60 },
  { id: "t2", name: "Mr Osei", instruments: ["Drum"],  commissionPct: 55 },
];
const rooms = [
  { id: "r1", name: "Piano Room", types: ["Piano"], color: "#60a5fa" },
  { id: "r4", name: "Drum Room",  types: ["Drum", "Guitar"], color: "#fb923c" },
];
const mk = (id, studentId, instrument, teacherId, roomId, start, grade = "Beginner", over = {}) => ({
  id, studentId, instrument, syllabus: "classical", grade, teacherId, attendanceBased: false, status: "active",
  startDate: monthStart, endDate: null, feeOverride: null, commissionPct: null, billingTerm: "monthly",
  termChanges: [{ from: monthStart.slice(0, 7), term: "monthly" }],
  schedule: { dayOfWeek: dow, startTime: start, endTime: start.replace(/^(\d\d)/, h => String(Number(h) + 1).padStart(2, "0")), duration: "60", roomId },
  ...over,
});
// Mia learns TWO instruments → two enrolments
const enrolments = [
  mk("e1", "s1", "Piano", "t1", "r1", "09:00"),
  mk("e2", "s1", "Drum",  "t2", "r4", "11:00"),
  mk("e3", "s2", "Piano", "t1", "r1", "14:00", "Grade 3"),
];
const deposits = [
  { id: "e1", enrolmentId: "e1", studentId: "s1", amount: 160, status: "held" },
  { id: "e2", enrolmentId: "e2", studentId: "s1", amount: 160, status: "pending" },
];
const actions = new Proxy({}, { get: () => async () => {} });
const admin   = { uid: "u1", role: "admin", displayName: "Ann Admin", email: "a@x.com", teacherId: null };
const teacher = { uid: "u2", role: "teacher", displayName: "Ms Lin", email: "l@x.com", teacherId: "t1" };

const base = {
  T, isMobile: false, setDirty: () => {}, goTo: () => {}, log: () => {}, actions,
  students, enrolments, deposits, teachers, rooms, attendance: [], oneOffSessions: [], discounts: [],
  monthSnapshots: [], monthRevisions: [], adminFlatFee: 5, instruments: ["Piano", "Drum"], tables,
  fees, contemporaryFees: cfees, setFees: () => {}, setContemporaryFees: () => {}, saveFees: async () => {},
  deferrals: [], addDeferral: () => {}, removeDeferral: () => {}, updateDeferralStatus: () => {},
  currentUser: admin, sendGradeRequest: async () => {}, sendClashRequest: async () => {}, openPayoutPreview: () => {},
};
const html = (C, props = {}) => renderToStaticMarkup(<C {...base} {...props} />);
const count = (str, needle) => str.split(needle).length - 1;

describe("views render with realistic data", () => {
  it("Students: a two-instrument student gets one row per instrument", () => {
    const out = html(Students);
    expect(count(out, "Mia Tan")).toBeGreaterThanOrEqual(2);
    expect(out).toContain("Piano");
    expect(out).toContain("Drum");
    expect(out).toContain("2 instruments");
    expect(out).toContain("Registration incomplete"); // e2's deposit is still pending
  });

  it("Students (teacher): sees only their own enrolments and no deposit/admin columns", () => {
    const out = html(Students, { currentUser: teacher });
    expect(out).toContain("Mia Tan");
    expect(out).toContain("Noah Lee");
    expect(out).not.toContain("Deposit held");
    expect(out).not.toContain("Registration incomplete");
    expect(out).toContain("Click to edit");
    expect(out).not.toContain("Update Grade"); // moved into the details panel
  });

  it("Calendar: the two-instrument student appears twice on the same day, each at its own time and room", () => {
    const out = html(CalendarView);
    expect(count(out, "Mia Tan")).toBe(2);
    expect(out).toContain("09:00 – 10:00");
    expect(out).toContain("11:00 – 12:00");
    expect(out).toContain("Piano Room");
    expect(out).toContain("Drum Room");
  });

  it("Calendar: a class whose room was deleted still shows, under 'No room'", () => {
    const orphan = [mk("e9", "s2", "Drum", "t2", "gone", "16:00")];
    const out = html(CalendarView, { enrolments: orphan });
    expect(out).toContain("No room");
    expect(out).toContain("Noah Lee");
    expect(html(CalendarView)).not.toContain("No room");
  });

  it("Calendar: a make-up whose enrolment no longer exists is ignored", () => {
    const stale = [{ id: "d1", enrolmentId: "gone", studentId: "x", teacherId: "t1", originalDate: "2026-09-26", makeupDate: TODAY }];
    const out = html(CalendarView, { deferrals: stale });
    expect(out).not.toContain("Makeup");
    expect(out).not.toContain("No room");
  });

  it("Calendar (teacher): other teachers' classes show as Occupied", () => {
    const out = html(CalendarView, { currentUser: teacher });
    expect(out).toContain("Occupied");
  });

  it("Payroll: one two-row entry per enrolment, with Collection column and Finalize button", () => {
    const out = html(Payroll);
    expect(count(out, "Mia Tan")).toBe(2);
    expect(out).toContain("Collection");
    expect(out).toContain("Duration");
    expect(out).toContain("Finalize Month");
    expect(out).toContain("Deposits Held");
    expect(out).toContain("Discount");
    expect(out).toContain("Defer payout");
  });

  it("Payroll: teacher instrument picker only offers instruments from Grades & Fees", () => {
    const out = html(Payroll);
    expect(out).not.toContain("Flute");
  });

  it("Rooms: shows multiple types per room", () => {
    const out = html(RoomsView);
    expect(out).toContain("Drum, Guitar");
  });

  it("Dashboard, Discounts, Grades & Fees, Archive, Activity Log and User Mgmt all render", () => {
    expect(html(Dashboard)).toContain("Deposits Held");
    expect(html(DiscountsView)).toContain("No discounts yet");
    expect(html(GradesAndFees)).toContain("Piano");
    expect(html(ArchiveView)).toContain("No months have been finalized");
    expect(html(ArchiveView, { currentUser: teacher })).toContain("Notification Archive");
    expect(html(ActivityLogView)).toContain("Activity Log");
    expect(html(UserManagement)).toContain("User Management");
  });

  it("empty studio (no data, no instruments) renders without crashing", () => {
    const empty = { students: [], enrolments: [], deposits: [], teachers: [], rooms: [], instruments: [], fees: {}, contemporaryFees: {}, tables: { fees: {}, contemporaryFees: {} } };
    for (const C of [Dashboard, Students, CalendarView, Payroll, GradesAndFees, RoomsView, DiscountsView, ArchiveView]) {
      expect(() => html(C, empty)).not.toThrow();
    }
    expect(html(GradesAndFees, empty)).toContain("No instruments yet");
    expect(html(Students, empty)).toContain("Add instruments on Grades");
  });

  it("mobile layouts render", () => {
    for (const C of [Dashboard, Students, CalendarView, Payroll, RoomsView, UserManagement]) {
      expect(() => html(C, { isMobile: true })).not.toThrow();
    }
    // User Management is usable on a phone now, not a "Desktop Required" notice
    const um = html(UserManagement, { isMobile: true });
    expect(um).toContain("Create Account");
    expect(um).not.toContain("Desktop Required");
  });

  it("finalized month is shown as locked and read from the snapshot", () => {
    const ym = TODAY.slice(0, 7);
    const row = {
      eid: "e1", studentId: "s1", studentName: "Mia Tan", teacherId: "t1", teacherName: "Ms Lin", instrument: "Piano", syllabus: "classical",
      grade: "Beginner", duration: "60", attendanceBased: false, term: "monthly", periodMonths: 1, periodStart: ym, covered: false, coveredBy: null,
      collected: true, collectedAt: null, fee: 160, discountAmount: 0, discountName: null, commissionPct: 60, flatFeeCap: 5, scheduled: 4, attended: 0,
      deferredToMonth: null, deferredFromMonths: [], deferredGrossExtra: 0, depositApplied: 0, hypotheticalGross: 160,
      gross: 160, teacherCut: 93, adminCut: 67, flatDeducted: 5, dueFromStudent: 160,
    };
    const snap = { id: ym, yearMonth: ym, rows: [row], totals: { gross: 160, teacher: 93, admin: 67 }, counts: { total: 1, collected: 1 }, finalizedBy: { name: "Ann" } };
    const out = html(Payroll, { monthSnapshots: [snap] });
    expect(out).toContain("Finalized");
    expect(out).not.toContain("Finalize Month");
    expect(count(out, "Mia Tan")).toBe(1); // only the snapshot row, not the live enrolments
  });
});

describe("EnrolmentForm", () => {
  const form = (props = {}) => renderToStaticMarkup(
    <EnrolmentForm T={T} mode="register" students={students} enrolments={enrolments} teachers={teachers} rooms={rooms}
      instruments={["Piano", "Drum"]} tables={tables} actions={actions} deposit={null} {...props} />,
  );

  it("register: shows an empty deposit field with no standard-fee quote, and billing term choices", () => {
    const out = form();
    expect(out).toContain("Registration deposit");
    expect(out).not.toContain("standard RM");
    expect(out).not.toContain("default is the first month");
    expect(out).toContain("Monthly");
    expect(out).toContain("Quarterly (3 months)");
    // the term select offers exactly monthly + quarterly
    const termSelect = out.match(/Billing term<\/span><select[^>]*>(.*?)<\/select>/)[1];
    expect([...termSelect.matchAll(/value="(\w+)"/g)].map(m => m[1])).toEqual(["monthly", "quarterly"]);
  });

  it("add instrument for an existing student", () => {
    expect(form({ mode: "add", student: students[0] })).toContain("Add Instrument");
  });

  it("edit: shows the collected-fee warning when the fee for this period is already collected", () => {
    const out = renderToStaticMarkup(
      <EnrolmentForm T={T} mode="edit" enrolment={enrolments[0]} students={students} enrolments={enrolments} teachers={teachers} rooms={rooms}
        instruments={["Piano", "Drum"]} tables={tables} actions={actions} deposit={deposits[0]} feeCollectedThisPeriod={false} />,
    );
    expect(out).toContain("Save Changes");
    expect(out).not.toContain("I understand");
    expect(out).toContain("Deposit (RM) — held"); // editable while held
  });

  it("edit: a deposit that was applied is shown locked, not editable", () => {
    const out = renderToStaticMarkup(
      <EnrolmentForm T={T} mode="edit" enrolment={enrolments[0]} students={students} enrolments={enrolments} teachers={teachers} rooms={rooms}
        instruments={["Piano", "Drum"]} tables={tables} actions={actions} deposit={{ ...deposits[0], status: "applied" }} />,
    );
    expect(out).toContain("(locked)");
    expect(out).not.toContain("Deposit (RM) —");
  });

  it("with no instruments set up it says so and blocks saving", () => {
    const out = form({ instruments: [] });
    expect(out).toContain("No instruments are set up yet");
    expect(out).toMatch(/<button[^>]*disabled[^>]*>Register Student/);
  });
});

describe("UX layer (sheet, palette, filters)", () => {
  it("Students: filter chips and one primary action per row", () => {
    const out = html(Students);
    expect(out).toContain("Deposit pending");   // admin-only chip
    expect(out).toContain("aria-pressed");
    expect(out).not.toContain(">Stop<");        // Stop/Delete moved into the detail panel
    expect(html(Students, { currentUser: teacher })).not.toContain("Deposit pending");
  });

  it("Students (mobile): cards open a sheet instead of expanding in place", () => {
    const out = html(Students, { isMobile: true });
    expect(out).toContain('role="button"');
    expect(out).not.toContain("▼");
  });

  it("Command palette lists the pages; teachers only get pages they may open", () => {
    const nav = [{ id: "calendar", label: "Calendar", icon: "▦" }, { id: "students", label: "Students", icon: "♪" }];
    const out = renderToStaticMarkup(
      <CommandPalette T={T} nav={nav} students={students} enrolments={enrolments} currentUser={teacher}
        onClose={() => {}} onPage={() => {}} onStudent={() => {}} />);
    expect(out).toContain("Calendar");
    expect(out).toContain("Students");
    expect(out).not.toContain("Payroll");
  });

  it("Sheet renders an accessible dialog with a close control", () => {
    const out = renderToStaticMarkup(<Sheet T={T} title="More" onClose={() => {}}>{dismiss => <button onClick={dismiss}>Go</button>}</Sheet>);
    expect(out).toContain('role="dialog"');
    expect(out).toContain('aria-label="Close"');
    expect(out).toContain(">Go<");
  });
});
