import { describe, it, expect } from "vitest";
import { checkGradeRequestLimit, validateGradeResolution, buildGradeReply } from "./gradeRequests.js";

const H = 60 * 60 * 1000, M = 60 * 1000, NOW = 10 * H;
const at = ms => ({ createdAt: ms });

describe("grade request rate limit", () => {
  it("allows up to 3 per student per hour, blocks the 4th", () => {
    expect(checkGradeRequestLimit([at(NOW - 5 * M), at(NOW - 4 * M)], NOW).ok).toBe(true);
    const r = checkGradeRequestLimit([at(NOW - 50 * M), at(NOW - 20 * M), at(NOW - 5 * M)], NOW);
    expect(r.ok).toBe(false);
    expect(r.retryInMs).toBe(10 * M);                 // oldest leaves the window in 10 min
    expect(r.message).toContain("10 minutes");
  });
  it("ignores requests older than an hour and accepts Firestore-style timestamps", () => {
    expect(checkGradeRequestLimit([at(NOW - 2 * H), at(NOW - 90 * M), at(NOW - 61 * M)], NOW).ok).toBe(true);
    const ts = ms => ({ toMillis: () => ms });
    expect(checkGradeRequestLimit([{ createdAt: ts(NOW - M) }, { createdAt: ts(NOW - M) }, { createdAt: ts(NOW - M) }], NOW).ok).toBe(false);
  });
  it("counts a pending serverTimestamp (null) as just sent", () => {
    expect(checkGradeRequestLimit([{ createdAt: null }, { createdAt: null }, { createdAt: null }], NOW).ok).toBe(false);
  });
});

describe("grade resolution", () => {
  it("requires a note to reject, not to approve", () => {
    expect(validateGradeResolution("rejected", "  ")).toBeTruthy();
    expect(validateGradeResolution("rejected", "Not ready yet")).toBeNull();
    expect(validateGradeResolution("approved", "")).toBeNull();
  });
  it("builds the teacher's reply", () => {
    const r = buildGradeReply({ id: "n1", fromTeacherId: "t1", studentId: "s1", enrolmentId: "e1", requestedGrade: "Grade 4" }, { outcome: "rejected", note: " wait ", fromGrade: "Grade 3" });
    expect(r).toMatchObject({ type: "grade_reply", toTeacherId: "t1", outcome: "rejected", note: "wait", fromGrade: "Grade 3", status: "pending", requestId: "n1" });
  });
});
