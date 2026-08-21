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

export const SEED_FEES = {
  Piano:  { "Beginner":160,"Grade 1":175,"Grade 2":190,"Grade 3":205,"Grade 4":220,"Grade 5":235,"Grade 6":250,"Grade 7":265,"Grade 8":280 },
  Drum:   { "Beginner":160,"Grade 1":170,"Grade 2":185,"Grade 3":200,"Grade 4":215,"Grade 5":230,"Grade 6":245,"Grade 7":260,"Grade 8":275 },
  Guitar: { "Beginner":150,"Grade 1":165,"Grade 2":180,"Grade 3":195,"Grade 4":210,"Grade 5":225,"Grade 6":240,"Grade 7":255,"Grade 8":270 },
  Violin: { "Beginner":170,"Grade 1":185,"Grade 2":200,"Grade 3":215,"Grade 4":230,"Grade 5":245,"Grade 6":260,"Grade 7":275,"Grade 8":290 },
  Vocals: { "Beginner":140,"Grade 1":155,"Grade 2":170,"Grade 3":185,"Grade 4":200,"Grade 5":215,"Grade 6":230,"Grade 7":245,"Grade 8":260 },
  Flute:  { "Beginner":150,"Grade 1":165,"Grade 2":180,"Grade 3":195,"Grade 4":210,"Grade 5":225,"Grade 6":240,"Grade 7":255,"Grade 8":270 },
};

export const SEED_CONTEMPORARY_FEES = {
  Piano:  { "Beginner":160,"Intermediate":200,"Advanced":250 },
  Drum:   { "Beginner":160,"Intermediate":200,"Advanced":250 },
  Guitar: { "Beginner":160,"Intermediate":200,"Advanced":250 },
  Violin: { "Beginner":160,"Intermediate":200,"Advanced":250 },
  Vocals: { "Beginner":160,"Intermediate":200,"Advanced":250 },
  Flute:  { "Beginner":160,"Intermediate":200,"Advanced":250 },
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
