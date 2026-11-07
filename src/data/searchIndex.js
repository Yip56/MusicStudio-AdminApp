// Everything quick search (Ctrl/Cmd+K) can take you to. Edit the keywords freely — they're what staff type.
//
//   id        the data-search="…" value on the element to highlight (unless `target` says otherwise)
//   label     what the result is called
//   page      the page it lives on (App nav id, or "payout_preview")
//   keywords  synonyms / everyday wording
//   roles     who may see it (omit = everyone who can open the page)
//   open      optional handler a view runs first (see useSearchIntent) — only ever harmless UI: a tab, a blank form
//   hint      optional one-line tip shown under the result
const ADMIN = ["admin", "sysadmin"];
const ALL = ["teacher", "admin", "sysadmin"];

export const PAGE_META = {
  dashboard: { roles: ADMIN, keywords: ["home", "overview", "summary", "stats", "welcome"] },
  calendar:  { roles: ALL,   keywords: ["schedule", "timetable", "classes", "sessions", "attendance", "rooms booking", "make-up", "holiday"] },
  students:  { roles: ALL,   keywords: ["pupils", "enrolments", "enrollment", "register", "deposit", "grade", "learners"] },
  payroll:   { roles: ADMIN, keywords: ["salary", "fees", "collect", "commission", "teacher pay", "month end", "money"] },
  discounts: { roles: ADMIN, keywords: ["promotion", "promo", "voucher", "offer", "rebate"] },
  grades:    { roles: ADMIN, keywords: ["fees", "price", "pricing", "instruments", "syllabus", "tuition", "rates"] },
  rooms:     { roles: ADMIN, keywords: ["room", "studio room", "availability", "occupied", "free"] },
  archive:   { roles: ALL,   keywords: ["finalized", "history", "backup", "past months", "notifications", "export"] },
  activity:  { roles: ADMIN, keywords: ["audit", "log", "history", "changes", "who did", "trail"] },
  users:     { roles: ["sysadmin"], keywords: ["accounts", "invite", "staff", "permissions", "roles", "login", "access", "transfer"] },
};

export const SEARCH_ENTRIES = [
  // ── Dashboard
  { id: "dashboard.students",  page: "dashboard", label: "Student count",      keywords: ["total students", "how many students", "headcount", "enrolled"], roles: ADMIN },
  { id: "dashboard.teachers",  page: "dashboard", label: "Teacher count",      keywords: ["how many teachers", "staff count"], roles: ADMIN },
  { id: "dashboard.today",     page: "dashboard", label: "Today's classes",    keywords: ["attendance today", "present", "sessions today", "who is in"], roles: ADMIN },
  { id: "dashboard.collected", page: "dashboard", label: "Fees collected",     keywords: ["revenue", "income", "money in", "paid so far", "takings"], roles: ADMIN },
  { id: "dashboard.deposits",  page: "dashboard", label: "Deposits held",      keywords: ["liability", "registration deposit", "deposit total"], roles: ADMIN },

  // ── Calendar
  { id: "calendar.month",       page: "calendar", label: "Month calendar",           keywords: ["date picker", "previous month", "next month", "pick a day", "go to date"] },
  { id: "calendar.my-classes",  page: "calendar", label: "My classes only (admins who teach)", keywords: ["my students", "own classes", "filter mine", "teacher profile"], roles: ["admin", "sysadmin"] },
  { id: "calendar.views",       page: "calendar", label: "Calendar view switcher",   keywords: ["day view", "month view", "both", "switch view", "layout"] },
  { id: "calendar.book",        page: "calendar", label: "Book a room / extra session", keywords: ["one-off", "extra class", "book session", "room booking", "reserve room", "clash", "make-up class"] },
  { id: "calendar.close-day",   page: "calendar", label: "Mark day closed",          keywords: ["holiday", "closure", "studio closed", "no classes", "close studio"], roles: ADMIN },
  { id: "calendar.run-holiday", page: "calendar", label: "Run classes on a public holiday", keywords: ["open on holiday", "work on holiday", "override holiday"], roles: ADMIN },

  // ── Students
  { id: "students.search",     page: "students", label: "Search students",           keywords: ["find student", "look up", "filter by name"] },
  { id: "students.filters",    page: "students", label: "Filter students",           keywords: ["by instrument", "deposit pending", "stopped students", "show stopped", "chips"] },
  { id: "students.table",      page: "students", label: "Student list",              keywords: ["all students", "enrolments", "table", "who learns what", "teacher of student"] },
  { id: "students.form",       page: "students", label: "Register a new student",    keywords: ["add student", "new student", "enrol", "sign up", "registration", "new pupil", "+ register"], roles: ADMIN, open: "register" },
  { id: "students.instrument", page: "students", label: "Add another instrument to a student", keywords: ["second instrument", "+ instrument", "extra instrument", "new enrolment"], roles: ADMIN, open: "selectFirst", hint: "Opens the first student's details — pick the student you want." },
  { id: "students.edit",       page: "students", label: "Edit a student's enrolment", keywords: ["change teacher", "change time", "change room", "change fee", "billing term", "commission override", "fee override"], roles: ADMIN, open: "selectFirst", hint: "Opens the first student's details — pick the student you want." },
  { id: "students.deposit",    page: "students", label: "Student deposit",           keywords: ["registration deposit", "collect deposit", "apply deposit", "forfeit", "backfill deposit"], roles: ADMIN, open: "selectFirst", hint: "Opens the first student's details — pick the student you want." },
  { id: "students.stop",       page: "students", label: "Stop a student / end enrolment", keywords: ["quit", "withdraw", "leave", "last lesson", "stop lessons", "drop out", "cancel enrolment"], roles: ADMIN, open: "selectFirst", hint: "Opens the first student's details — pick the student you want." },
  { id: "students.delete",     page: "students", label: "Delete a student",          keywords: ["remove student", "erase", "delete all records"], roles: ADMIN, open: "selectFirst", hint: "Opens the first student's details — pick the student you want." },
  { id: "students.grade",      page: "students", label: "Request a grade change",    keywords: ["update grade", "promote", "exam passed", "next grade", "grade request"], roles: ["teacher"], open: "selectFirst" },
  { id: "students.time",       page: "students", label: "Change a class time",       keywords: ["reschedule", "move class", "change day", "change slot"], roles: ["teacher"], open: "selectFirst" },

  // ── Payroll
  { id: "payroll.month",       page: "payroll", label: "Month selector",             keywords: ["previous month", "next month", "change month", "pick month"], roles: ADMIN },
  { id: "payroll.finalize",    page: "payroll", label: "Finalize Month",             keywords: ["close month", "lock month", "month end", "freeze", "snapshot", "end of month"], roles: ADMIN },
  { id: "payroll.flatfee",     page: "payroll", label: "Admin flat fee",             keywords: ["admin fee", "studio cut", "deducted first", "per student fee"], roles: ADMIN },
  { id: "payroll.stats",       page: "payroll", label: "Payroll totals",             keywords: ["teacher payouts", "admin revenue", "total collected", "deposits held", "summary"], roles: ADMIN },
  { id: "payroll.deferrals",   page: "payroll", label: "Fee deferrals overview",     keywords: ["deferred to", "deferred from", "carried over", "postponed payout"], roles: ADMIN },
  { id: "payroll.table",       page: "payroll", label: "Fee collection table",       keywords: ["students fees", "who has paid", "who owes", "unpaid", "outstanding", "collection list"], roles: ADMIN },
  { id: "payroll.collect",     page: "payroll", label: "Collect a fee",              keywords: ["mark paid", "tick", "received payment", "paid", "collected", "un-collect", "drag to collect"], roles: ADMIN },
  { id: "payroll.defer",       page: "payroll", label: "Defer a payout",             keywords: ["postpone payout", "pay later", "move payout", "next month"], roles: ADMIN },
  { id: "payroll.discount",    page: "payroll", label: "Apply a discount to a fee",  keywords: ["promo", "reduce fee", "discount button", "rebate"], roles: ADMIN },
  { id: "payroll.payout",      page: "payroll", label: "Pay Out (teacher payout)",   keywords: ["pay teacher", "salary", "payout preview", "csv", "pay slip", "export payout"], roles: ADMIN },
  { id: "payroll.edit-teacher", page: "payroll", label: "Edit a teacher",            keywords: ["commission %", "teacher instruments", "teacher name", "change commission"], roles: ADMIN },
  { id: "payroll.remove-teacher", page: "payroll", label: "Remove a teacher",        keywords: ["delete teacher", "teacher left"], roles: ADMIN },

  // ── Payout preview (opens the first teacher's payout for the current month)
  { id: "payout.invoice",  page: "payout_preview", area: "Payroll › Pay Out", label: "Download an invoice", keywords: ["bill", "fee request", "pdf", "invoice button", "charge"], roles: ADMIN },
  { id: "payout.receipt",  page: "payout_preview", area: "Payroll › Pay Out", label: "Download a receipt",  keywords: ["proof of payment", "paid receipt", "pdf", "thank you", "payment confirmation"], roles: ADMIN },
  { id: "payout.csv",      page: "payout_preview", area: "Payroll › Pay Out", label: "Download payout CSV", keywords: ["export", "spreadsheet", "excel", "salary sheet", "teacher statement"], roles: ADMIN },
  { id: "payout.markpaid", page: "payout_preview", area: "Payroll › Pay Out", label: "Mark teacher as paid", keywords: ["paid teacher", "payout done", "unmark paid", "salary paid"], roles: ADMIN },

  // ── Discounts
  { id: "discounts.form",   page: "discounts", label: "Create a discount",          keywords: ["new discount", "add promotion", "new promo", "percent off", "rm off"], roles: ADMIN, open: "new" },
  { id: "discounts.table",  page: "discounts", label: "Discount list",              keywords: ["promotions", "active discounts", "expired discounts", "edit discount"], roles: ADMIN },
  { id: "discounts.delete", page: "discounts", label: "Delete a discount",          keywords: ["remove promotion", "remove promo"], roles: ADMIN },

  // ── Grades & Fees
  { id: "grades.classical",     page: "grades", label: "Classical fees",             keywords: ["classical syllabus", "abrsm", "grade fees", "exam fees"], roles: ADMIN },
  { id: "grades.contemporary",  page: "grades", label: "Contemporary fees",          keywords: ["contemporary syllabus", "pop", "beginner intermediate advanced"], roles: ADMIN },
  { id: "grades.both",          page: "grades", label: "Show both syllabi",          keywords: ["classical and contemporary", "all fees"], roles: ADMIN },
  { id: "grades.table",         page: "grades", label: "Fee table",                  keywords: ["price list", "monthly fee", "30 45 60 min", "duration price", "edit fees", "change price"], roles: ADMIN },
  { id: "grades.save",          page: "grades", label: "Save fee changes",           keywords: ["publish fees", "save changes", "update prices"], roles: ADMIN },
  { id: "grades.template",      page: "grades", label: "Download Excel template",    keywords: ["fee template", "xlsx", "spreadsheet", "import template"], roles: ADMIN },
  { id: "grades.import",        page: "grades", label: "Import fees from Excel",     keywords: ["upload fees", "xlsx", "bulk fees", "spreadsheet import"], roles: ADMIN },
  { id: "grades.add-instrument", page: "grades", label: "Add an instrument",         keywords: ["new instrument", "piano", "guitar", "violin", "drums", "+ add"], roles: ADMIN },
  { id: "grades.remove",        page: "grades", label: "Remove an instrument",       keywords: ["delete instrument", "stop offering"], roles: ADMIN },

  // ── Rooms
  { id: "rooms.add",    page: "rooms", label: "Add a room",       keywords: ["new room", "+ add room", "create room", "room types"], roles: ADMIN },
  { id: "rooms.filter", page: "rooms", label: "Filter rooms (free / occupied)", keywords: ["available rooms", "busy rooms", "free now", "occupied now"], roles: ADMIN },

  // ── Archive
  { id: "archive.months",        page: "archive", label: "Finalized months",         keywords: ["closed months", "past payroll", "month snapshots", "history of months"], roles: ADMIN, open: "months" },
  { id: "archive.notifications", page: "archive", label: "Notification archive",     keywords: ["old notifications", "approved requests", "rejected requests", "grade requests history", "clash requests history"], open: "notifications" },
  { id: "archive.backup",        page: "archive", label: "Download full backup",     keywords: ["export database", "save everything", "json backup", "safety copy"], roles: ADMIN, open: "months" },
  { id: "archive.revise",        page: "archive", label: "Revise a finalized month", keywords: ["correct month", "fix finalized", "amend", "edit closed month", "revision"], roles: ["sysadmin"], open: "revise", hint: "Opens the most recent finalized month." },

  // ── Activity log
  { id: "activity.filter", page: "activity", label: "Filter activity by type", keywords: ["payroll changes", "student changes", "deposit changes", "audit filter"], roles: ADMIN },
  { id: "activity.search", page: "activity", label: "Search the activity log", keywords: ["find change", "who changed", "audit search"], roles: ADMIN },
  { id: "activity.table",  page: "activity", label: "Activity log entries",    keywords: ["audit trail", "history", "recent changes"], roles: ADMIN },

  // ── User management
  { id: "users.form",   page: "users", label: "Create an account / invite", keywords: ["add user", "new teacher account", "invite staff", "gmail", "new admin", "transfer account", "admin also teacher", "admin who teaches"], roles: ["sysadmin"] },
  { id: "users.role",   page: "users", label: "Account role picker",        keywords: ["teacher", "admin", "sysadmin", "permissions"], roles: ["sysadmin"] },
  { id: "users.invite", page: "users", label: "Create Invite button",       keywords: ["send invite", "create invite", "create account"], roles: ["sysadmin"] },
  { id: "users.search", page: "users", label: "Search users",               keywords: ["find account", "find staff", "by email"], roles: ["sysadmin"] },
  { id: "users.table",  page: "users", label: "User list",                  keywords: ["accounts", "pending invites", "edit user", "delete account", "transfer", "status"], roles: ["sysadmin"] },
];

// Things that come from live data: students, teachers, rooms, discounts and instruments.
export function buildLiveEntries({ students = [], enrolments = [], teachers = [], rooms = [], discounts = [], instruments = [], role, teacherId, navIds }) {
  const can = page => navIds.includes(page);
  const out = [];

  if (can("students")) {
    const mine = role === "teacher" ? enrolments.filter(e => e.teacherId === teacherId) : enrolments;
    const byStudent = {};
    mine.forEach(e => (byStudent[e.studentId] ??= []).push(e));
    students.forEach(s => {
      const list = byStudent[s.id];
      if (role === "teacher" && !list) return;
      const insts = [...new Set((list ?? []).map(e => e.instrument).filter(Boolean))];
      const first = (list ?? []).find(e => e.status !== "stopped") ?? list?.[0];
      out.push({
        id: `students.row.${first?.id ?? s.id}`, kind: "student", studentId: s.id, page: "students", area: "Students",
        label: s.name, keywords: [...insts, s.phone ?? "", "student"], hint: insts.join(", ") || "Student", icon: "♪",
      });
    });
  }
  if (can("payroll")) teachers.forEach(t => out.push({
    id: `payroll.teacher.${t.id}`, kind: "teacher", page: "payroll", area: "Payroll", label: t.name,
    keywords: [...(t.instruments ?? []), "teacher", "payout", "commission"], hint: `Teacher · ${(t.instruments ?? []).join(", ") || "no instruments"}`, icon: "♫",
  }));
  if (can("rooms")) rooms.forEach(r => out.push({
    id: `rooms.row.${r.id}`, kind: "room", page: "rooms", area: "Rooms", label: r.name,
    keywords: [...(r.types ?? []), "room"], hint: `Room · ${(r.types ?? []).join(", ") || "no type"}`, icon: "⊞",
  }));
  if (can("discounts")) discounts.forEach(d => out.push({
    id: `discounts.row.${d.id}`, kind: "discount", page: "discounts", area: "Discounts", label: d.name,
    keywords: ["discount", "promotion", d.type === "percent" ? `${d.value}%` : `rm ${d.value}`], hint: "Discount", icon: "%",
  }));
  if (can("grades")) instruments.forEach(i => out.push({
    id: `grades.inst.${i}`, kind: "instrument", page: "grades", area: "Grades & Fees", label: `${i} fees`,
    keywords: [i, "instrument", "price", "fees"], hint: "Instrument", icon: "★", open: "instrument", arg: i,
  }));
  return out;
}
