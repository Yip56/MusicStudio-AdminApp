// Grade-update requests from teachers: rate limit and the reply sent back to the teacher.
// Pure logic — no React, no Firebase.

export const GRADE_REQUEST_LIMIT     = 3;
export const GRADE_REQUEST_WINDOW_MS = 60 * 60 * 1000;

/** Firestore Timestamp | Date | ms | null → ms (a not-yet-resolved serverTimestamp counts as "now"). */
function toMillis(ts, now) {
  if (ts == null) return now;
  if (typeof ts === "number") return ts;
  if (typeof ts.toMillis === "function") return ts.toMillis();
  if (ts instanceof Date) return ts.getTime();
  if (typeof ts.seconds === "number") return ts.seconds * 1000;
  return now;
}

/**
 * A teacher may send at most 3 grade requests per student per hour (sliding window).
 * `previous` = that teacher's earlier grade requests for the same student (each with `createdAt`).
 * Returns { ok: true } or { ok: false, retryInMs, message }.
 */
export function checkGradeRequestLimit(previous, now = Date.now(), { max = GRADE_REQUEST_LIMIT, windowMs = GRADE_REQUEST_WINDOW_MS } = {}) {
  const recent = previous.map(r => toMillis(r.createdAt, now)).filter(t => now - t < windowMs).sort((a, b) => a - b);
  if (recent.length < max) return { ok: true };
  // The oldest request that still counts frees a slot once it leaves the window
  const retryInMs = recent[recent.length - max] + windowMs - now;
  const mins = Math.max(1, Math.ceil(retryInMs / 60000));
  return { ok: false, retryInMs, message: `You've already sent ${max} grade requests for this student in the last hour. Try again in ${mins} minute${mins === 1 ? "" : "s"}.` };
}

/** Rejecting needs a reason for the teacher; approving may carry an optional note. */
export function validateGradeResolution(status, note) {
  if (status === "rejected" && !String(note ?? "").trim()) return "Add a note explaining why the request is rejected.";
  return null;
}

/** The reply notification delivered to the teacher who asked. */
export function buildGradeReply(request, { outcome, note, fromGrade }) {
  return {
    type: "grade_reply",
    toTeacherId: request.fromTeacherId,
    studentId: request.studentId,
    enrolmentId: request.enrolmentId,
    requestId: request.id,
    fromGrade: fromGrade ?? null,
    requestedGrade: request.requestedGrade,
    outcome,                                 // "approved" | "rejected"
    note: String(note ?? "").trim(),
    status: "pending",                       // pending = unread; the teacher dismisses it → "seen"
  };
}
