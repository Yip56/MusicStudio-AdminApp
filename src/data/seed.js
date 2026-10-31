// ─── Constants ────────────────────────────────────────────────────────────────
// No demo data lives here any more — students, teachers, rooms etc. are all in Firestore.
// The instrument list is NOT a constant: it is derived from the Grades & Fees page
// (see src/domain/instruments.js).
export const GRADE_LABELS = [
  "Beginner","Grade 1","Grade 2","Grade 3","Grade 4",
  "Grade 5","Grade 6","Grade 7","Grade 8"
];

export const CONTEMPORARY_GRADE_LABELS = ["Beginner","Intermediate","Advanced"];

export const SYLLABI = [
  { value: "classical",    label: "Classical" },
  { value: "contemporary", label: "Contemporary" },
];

export const DAYS_OF_WEEK = ["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"];

export const HOURS = Array.from({ length: 28 }, (_, i) => {
  const h = Math.floor(i / 2) + 8;
  const m = i % 2 === 0 ? "00" : "30";
  return `${String(h).padStart(2, "0")}:${m}`;
});

// Local-date "YYYY-MM-DD" (toISOString would return the UTC date, which is wrong after 4pm in KL)
function localDate(d = new Date()) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
export const TODAY = localDate();

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
