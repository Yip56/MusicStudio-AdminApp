import { collection, addDoc, serverTimestamp } from "firebase/firestore";
import { db } from "../firebase.js";
import { buildAuditEntry } from "../domain/audit.js";

/**
 * Append one entry to `activity_log`. Logging must never break the action it describes,
 * so failures are reported to the console and swallowed.
 */
export async function logActivity(entry, actor) {
  try {
    await addDoc(collection(db, "activity_log"), { ...buildAuditEntry({ ...entry, actor }), createdAt: serverTimestamp() });
  } catch (e) {
    console.error("[activity_log] write failed:", e.message);
  }
}
