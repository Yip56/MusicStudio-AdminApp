// ─── Constants ────────────────────────────────────────────────────────────────
export const GRADE_LABELS = [
  "Beginner","Grade 1","Grade 2","Grade 3","Grade 4",
  "Grade 5","Grade 6","Grade 7","Grade 8"
];

export const CONTEMPORARY_GRADE_LABELS = ["Beginner","Intermediate","Advanced"];

export const INSTRUMENTS = ["Piano","Drum","Guitar","Violin","Vocals","Flute"];

export const DAYS_OF_WEEK = ["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"];

export const HOURS = Array.from({ length: 28 }, (_, i) => {
  const h = Math.floor(i / 2) + 8;
  const m = i % 2 === 0 ? "00" : "30";
  return `${String(h).padStart(2, "0")}:${m}`;
});

export const TODAY = new Date().toISOString().split("T")[0];

export const STATUS_META = {
  present:          { label: "Present",          color: "#14CA74", bg: "rgba(5,193,104,0.2)",   border: "rgba(5,193,104,0.5)" },
  absent:           { label: "Absent",           color: "#FF5A65", bg: "rgba(255,90,101,0.2)",  border: "rgba(255,90,101,0.2)" },
  deferred:         { label: "Deferred",         color: "#9A91FB", bg: "rgba(154,145,251,0.15)", border: "rgba(154,145,251,0.3)" },
  pending_approval: { label: "Pending",          color: "#FDB52A", bg: "rgba(255,176,22,0.2)",  border: "rgba(255,176,22,0.2)" },
};

export const ROOM_COLORS = [
  "#60a5fa","#818cf8","#a78bfa","#fb923c",
  "#4ade80","#f87171","#fbbf24","#e879f9","#34d399","#f472b6"
];

// ─── Seed Data ────────────────────────────────────────────────────────────────
export const SEED_ROOMS = [
  { id: "r1", name: "Piano Room 1", type: "Piano",  color: "#60a5fa" },
  { id: "r2", name: "Piano Room 2", type: "Piano",  color: "#818cf8" },
  { id: "r3", name: "Piano Room 3", type: "Piano",  color: "#a78bfa" },
  { id: "r4", name: "Drum Room",    type: "Drum",   color: "#fb923c" },
];

// Pricing formula: 30-min is the base (160 for Beginner, +15 per classical grade).
// 45-min = 30-min × 1.5 (rounded to nearest RM 5). 60-min = 30-min × 2. All instruments same schedule.
function classicalRow(base30) {
  return { "30": base30, "45": Math.round(base30 * 1.5 / 5) * 5, "60": base30 * 2 };
}
const CLASSICAL_ROWS = {
  "Beginner": classicalRow(160), "Grade 1": classicalRow(175), "Grade 2": classicalRow(190),
  "Grade 3":  classicalRow(205), "Grade 4": classicalRow(220), "Grade 5": classicalRow(235),
  "Grade 6":  classicalRow(250), "Grade 7": classicalRow(265), "Grade 8": classicalRow(280),
};

export const SEED_FEES = {
  Piano:  { ...CLASSICAL_ROWS },
  Drum:   { ...CLASSICAL_ROWS },
  Guitar: { ...CLASSICAL_ROWS },
  Violin: { ...CLASSICAL_ROWS },
  Vocals: { ...CLASSICAL_ROWS },
  Flute:  { ...CLASSICAL_ROWS },
};

export const SEED_CONTEMPORARY_FEES = {
  Piano:  { "Beginner": classicalRow(160), "Intermediate": classicalRow(200), "Advanced": classicalRow(250) },
  Drum:   { "Beginner": classicalRow(160), "Intermediate": classicalRow(200), "Advanced": classicalRow(250) },
  Guitar: { "Beginner": classicalRow(160), "Intermediate": classicalRow(200), "Advanced": classicalRow(250) },
  Violin: { "Beginner": classicalRow(160), "Intermediate": classicalRow(200), "Advanced": classicalRow(250) },
  Vocals: { "Beginner": classicalRow(160), "Intermediate": classicalRow(200), "Advanced": classicalRow(250) },
  Flute:  { "Beginner": classicalRow(160), "Intermediate": classicalRow(200), "Advanced": classicalRow(250) },
};

export const SEED_TEACHERS = [
  { id: "t1", name: "Ms. Sarah Lin",   instruments: ["Piano"],        commissionPct: 60 },
  { id: "t2", name: "Mr. Daniel Osei", instruments: ["Drum","Guitar"], commissionPct: 55 },
  { id: "t3", name: "Ms. Priya Nair",  instruments: ["Piano","Violin"],commissionPct: 60 },
];

// Students have a recurring schedule: { dayOfWeek (0-6), startTime, endTime, roomId }
export const SEED_STUDENTS = [
  {
    id: "s1", name: "Aiden Chew",  instrument: "Piano", grade: "Grade 2",
    teacherId: "t1", attendanceBased: false,
    schedule: { dayOfWeek: 6, startTime: "09:00", endTime: "10:00", roomId: "r1" }
  },
  {
    id: "s2", name: "Bella Ong",   instrument: "Drum",  grade: "Grade 1",
    teacherId: "t2", attendanceBased: false,
    schedule: { dayOfWeek: 6, startTime: "10:00", endTime: "11:00", roomId: "r4" }
  },
  {
    id: "s3", name: "Carlos Tan",  instrument: "Piano", grade: "Grade 5",
    teacherId: "t3", attendanceBased: true,
    schedule: { dayOfWeek: 3, startTime: "11:00", endTime: "12:00", roomId: "r2" }
  },
  {
    id: "s4", name: "Diana Foo",   instrument: "Piano", grade: "Beginner",
    teacherId: "t1", attendanceBased: false,
    schedule: { dayOfWeek: 1, startTime: "14:00", endTime: "15:00", roomId: "r1" }
  },
  {
    id: "s5", name: "Ethan Lim",   instrument: "Drum",  grade: "Grade 3",
    teacherId: "t2", attendanceBased: true,
    schedule: { dayOfWeek: 2, startTime: "15:00", endTime: "16:00", roomId: "r4" }
  },
];

// Attendance overrides: { studentId, date, status, notes }
// Generated sessions come from recurring schedules; overrides track attendance changes
export const SEED_ATTENDANCE = [
  { id: "a1", studentId: "s1", date: TODAY, status: "present", notes: "" },
  { id: "a2", studentId: "s2", date: TODAY, status: "absent",  notes: "Called sick" },
  { id: "a3", studentId: "s3", date: TODAY, status: "present", notes: "" },
];
