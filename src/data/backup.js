import { collection, getDocs } from "firebase/firestore";
import { db } from "../firebase.js";

export const BACKUP_COLLECTIONS = [
  "students", "enrolments", "deposits", "teachers", "rooms", "attendance", "one_off_sessions",
  "discounts", "settings", "fees", "payroll_months", "month_snapshots", "month_revisions",
  "class_deferrals", "notifications", "activity_log",
];

const plain = v => {
  if (v?.toDate) return v.toDate().toISOString();
  if (Array.isArray(v)) return v.map(plain);
  if (v && typeof v === "object") return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, plain(x)]));
  return v;
};

/** Read every studio collection and download it as one JSON file. */
export async function downloadBackup(actorName = "") {
  const out = { exportedAt: new Date().toISOString(), exportedBy: actorName, collections: {} };
  for (const name of BACKUP_COLLECTIONS) {
    try {
      const snap = await getDocs(collection(db, name));
      out.collections[name] = snap.docs.map(d => ({ id: d.id, ...plain(d.data()) }));
    } catch (e) {
      out.collections[name] = { error: e.message };   // e.g. admin-only collection read as another role
    }
  }
  const blob = new Blob([JSON.stringify(out, null, 2)], { type: "application/json" });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement("a");
  a.href = url;
  a.download = `studioos-backup-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  URL.revokeObjectURL(url);
  return Object.fromEntries(Object.entries(out.collections).map(([k, v]) => [k, Array.isArray(v) ? v.length : "error"]));
}
