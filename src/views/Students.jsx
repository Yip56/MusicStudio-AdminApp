import { useState } from "react";
import { Avatar, Badge, Card, Inp, Sel, Btn, Modal, THead, Checkbox, SectionTitle } from "../components/UI.jsx";
import { GRADE_LABELS, INSTRUMENTS, DAYS_OF_WEEK, HOURS } from "../data/seed.js";
import { uid } from "../utils/helpers.js";

const DURATIONS = [
  { value: "30", label: "30 min" },
  { value: "45", label: "45 min" },
  { value: "60", label: "60 min" },
];

function addMinutes(timeStr, mins) {
  const [h, m] = timeStr.split(":").map(Number);
  const total = h * 60 + m + Number(mins);
  return `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
}

const BLANK = {
  name: "", instrument: "Piano", grade: "No Grade", teacherId: "",
  attendanceBased: false,
  schedule: { dayOfWeek: 6, startTime: "09:00", endTime: "10:00", duration: "60", roomId: "" }
};

export default function Students({ students, setStudents, teachers, rooms, T, currentUser, sendGradeRequest, isMobile, setDirty }) {
  const [search,       setSearch]       = useState("");
  const [modal,        setModal]        = useState(null);
  const [form,         setForm]         = useState(BLANK);
  const [gradeModal,   setGradeModal]   = useState(null);
  const [gradeForm,    setGradeForm]    = useState({ requestedGrade: "No Grade", reason: "" });
  const [gradeSuccess, setGradeSuccess] = useState(null);
  const [expandedId,   setExpandedId]   = useState(null);

  const isTeacher   = currentUser?.role === "teacher";
  const isElevated  = !isTeacher;

  const visibleStudents = isTeacher
    ? students.filter(s => s.teacherId === currentUser.teacherId)
    : students;

  const filtered = visibleStudents.filter(s =>
    s.name.toLowerCase().includes(search.toLowerCase()) ||
    s.instrument.toLowerCase().includes(search.toLowerCase())
  );

  function openAdd() {
    setForm({ ...BLANK, teacherId: teachers[0]?.id ?? "", schedule: { ...BLANK.schedule, roomId: rooms[0]?.id ?? "" } });
    setModal("add");
  }
  function openEdit(s) { setForm({ ...s, schedule: { ...s.schedule } }); setModal(s); }

  function save() {
    if (!form.name.trim()) return;
    const entry = { ...form, schedule: { ...form.schedule, dayOfWeek: Number(form.schedule.dayOfWeek) } };
    if (modal === "add") setStudents(p => [...p, { ...entry, id: uid() }]);
    else setStudents(p => p.map(s => s.id === modal.id ? { ...entry, id: s.id } : s));
    setModal(null);
    setDirty?.(false);
  }

  function remove(id) { if (confirm("Remove this student?")) setStudents(p => p.filter(s => s.id !== id)); }

  function setSched(key, val) {
    setDirty?.(true);
    setForm(f => {
      const next = { ...f.schedule, [key]: val };
      // Keep endTime in sync whenever startTime or duration changes
      if (key === "startTime" || key === "duration") {
        next.endTime = addMinutes(
          key === "startTime" ? val : next.startTime,
          key === "duration"  ? val : next.duration,
        );
      }
      return { ...f, schedule: next };
    });
  }

  function openGradeRequest(student) {
    setGradeForm({ requestedGrade: student.grade, reason: "" });
    setGradeModal(student);
    setGradeSuccess(null);
  }

  async function submitGradeRequest() {
    if (!gradeForm.reason.trim()) return;
    await sendGradeRequest({
      fromTeacherId: currentUser.teacherId,
      studentId:     gradeModal.id,
      requestedGrade: gradeForm.requestedGrade,
      reason:        gradeForm.reason,
    });
    setGradeSuccess("Grade update request sent to admin.");
    setGradeForm({ requestedGrade: "No Grade", reason: "" });
  }

  const studentModal = modal && isElevated && (
    <Modal T={T} title={modal === "add" ? "Add Student" : "Edit Student"} onClose={() => { setModal(null); setDirty?.(false); }} width={500}>
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        <Inp T={T} label="Full Name" value={form.name} onChange={e => { setDirty?.(true); setForm(f => ({ ...f, name: e.target.value })); }} />
        <div style={{ display: "flex", gap: 11 }}>
          <Sel T={T} label="Instrument" value={form.instrument} onChange={e => { setDirty?.(true); setForm(f => ({ ...f, instrument: e.target.value })); }}>
            {INSTRUMENTS.map(i => <option key={i}>{i}</option>)}
          </Sel>
          <Sel T={T} label="Grade" value={form.grade} onChange={e => { setDirty?.(true); setForm(f => ({ ...f, grade: e.target.value })); }}>
            {GRADE_LABELS.map(g => <option key={g}>{g}</option>)}
          </Sel>
        </div>
        <Sel T={T} label="Teacher" value={form.teacherId} onChange={e => { setDirty?.(true); setForm(f => ({ ...f, teacherId: e.target.value })); }}>
          <option value="">— Select teacher —</option>
          {teachers.map(t => <option key={t.id} value={t.id}>{t.name} ({t.instruments.join(", ")})</option>)}
        </Sel>
        <div style={{ background: T.panel2, border: `0.6px solid ${T.border2}`, borderRadius: 10, padding: 14 }}>
          <SectionTitle T={T}>Recurring Class Schedule</SectionTitle>
          <div style={{ display: "flex", flexDirection: "column", gap: 11 }}>
            <Sel T={T} label="Day of Week" value={form.schedule.dayOfWeek}
              onChange={e => setSched("dayOfWeek", Number(e.target.value))}>
              {DAYS_OF_WEEK.map((d, i) => <option key={d} value={i}>{d}</option>)}
            </Sel>
            <div style={{ display: "flex", gap: 11 }}>
              <Sel T={T} label="Start Time" value={form.schedule.startTime} onChange={e => setSched("startTime", e.target.value)}>
                {HOURS.map(h => <option key={h}>{h}</option>)}
              </Sel>
              <Sel T={T} label="Duration" value={form.schedule.duration ?? "60"} onChange={e => setSched("duration", e.target.value)}>
                {DURATIONS.map(d => <option key={d.value} value={d.value}>{d.label}</option>)}
              </Sel>
            </div>
            <div style={{ fontSize: 11, color: T.muted, marginTop: -4 }}>
              End time: <span style={{ color: T.text }}>{form.schedule.endTime}</span>
            </div>
            <Sel T={T} label="Room" value={form.schedule.roomId} onChange={e => setSched("roomId", e.target.value)}>
              <option value="">— Select room —</option>
              {rooms.map(r => <option key={r.id} value={r.id}>{r.name} ({r.type})</option>)}
            </Sel>
          </div>
        </div>
        <Checkbox T={T}
          label="Attendance-based commission (fee prorated by classes attended)"
          checked={form.attendanceBased}
          onChange={() => { setDirty?.(true); setForm(f => ({ ...f, attendanceBased: !f.attendanceBased })); }}
        />
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 9, marginTop: 4 }}>
          <Btn T={T} variant="ghost" onClick={() => { setModal(null); setDirty?.(false); }}>Cancel</Btn>
          <Btn T={T} onClick={save}>{modal === "add" ? "Add Student" : "Save Changes"}</Btn>
        </div>
      </div>
    </Modal>
  );

  const gradeModalEl = gradeModal && (
    <Modal T={T} title="Request Grade Update" onClose={() => { setGradeModal(null); setGradeSuccess(null); }} width={420}>
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        <div style={{ background: T.bg, border: `0.6px solid ${T.border2}`, borderRadius: 9, padding: "11px 14px" }}>
          <div style={{ fontSize: 11, color: T.muted, marginBottom: 4, textTransform: "uppercase", letterSpacing: "0.06em" }}>Student</div>
          <div style={{ fontSize: 14, fontWeight: 600, color: T.text }}>{gradeModal.name}</div>
        </div>
        <div style={{ background: T.bg, border: `0.6px solid ${T.border2}`, borderRadius: 9, padding: "11px 14px" }}>
          <div style={{ fontSize: 11, color: T.muted, marginBottom: 4, textTransform: "uppercase", letterSpacing: "0.06em" }}>Current Grade</div>
          <Badge label={gradeModal.grade} color={T.accent} bg={T.accent + "18"} />
        </div>
        <Sel T={T} label="Requested Grade" value={gradeForm.requestedGrade}
          onChange={e => setGradeForm(f => ({ ...f, requestedGrade: e.target.value }))}>
          {GRADE_LABELS.map(g => <option key={g}>{g}</option>)}
        </Sel>
        <label style={{ display: "flex", flexDirection: "column", gap: 5 }}>
          <span style={{ fontSize: 11, color: T.muted, textTransform: "uppercase", letterSpacing: "0.06em" }}>Reason</span>
          <textarea value={gradeForm.reason} onChange={e => setGradeForm(f => ({ ...f, reason: e.target.value }))}
            placeholder="Explain why the grade should be updated…"
            style={{ background: T.input, border: `1px solid ${T.border2}`, borderRadius: 8, color: T.text, padding: "9px 11px", fontSize: 13, outline: "none", fontFamily: "inherit", resize: "vertical", minHeight: 80 }} />
        </label>
        {gradeSuccess
          ? <div style={{ fontSize: 12, color: "#4ade80", textAlign: "center" }}>{gradeSuccess}</div>
          : <div style={{ fontSize: 11, color: T.muted }}>This request will be sent to the admin for approval.</div>
        }
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 9, marginTop: 4 }}>
          <Btn T={T} variant="ghost" onClick={() => { setGradeModal(null); setGradeSuccess(null); }}>Close</Btn>
          {!gradeSuccess && <Btn T={T} onClick={submitGradeRequest}>Send Request</Btn>}
        </div>
      </div>
    </Modal>
  );

  // ── Mobile card list ──────────────────────────────────────────────────────────
  if (isMobile) {
    return (
      <div>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
          <h2 style={{ fontSize: 18, fontWeight: 700, color: T.text, fontFamily: "'Red Hat Display', 'Plus Jakarta Sans', sans-serif" }}>Students</h2>
          {isElevated && <Btn T={T} onClick={openAdd} style={{ padding: "7px 14px", fontSize: 12 }}>+ Add</Btn>}
        </div>

        <div style={{ position: "relative", marginBottom: 12 }}>
          <span style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", fontSize: 14, pointerEvents: "none", color: T.muted }}>🔍</span>
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search students…"
            style={{ width: "100%", boxSizing: "border-box", background: T.input, border: `0.6px solid ${T.border2}`, borderRadius: 4, color: T.text, padding: "9px 14px 9px 36px", fontSize: 12, outline: "none", fontFamily: "inherit", height: 42 }} />
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {filtered.map(s => {
            const teacher  = teachers.find(t => t.id === s.teacherId);
            const room     = rooms.find(r => r.id === s.schedule?.roomId);
            const expanded = expandedId === s.id;
            return (
              <div key={s.id} style={{ background: T.panel, border: `1px solid ${T.border}`, borderRadius: 14, overflow: "hidden" }}>
                {/* Key info row */}
                <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "13px 14px" }}>
                  <Avatar name={s.name} size={36} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 14, fontWeight: 600, color: T.text, marginBottom: 3 }}>{s.name}</div>
                    <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
                      <span style={{ fontSize: 12, color: T.textSub }}>{s.instrument}</span>
                      <Badge label={s.grade} color={T.accent} bg={T.accent + "18"} />
                    </div>
                  </div>
                  <button onClick={() => setExpandedId(expanded ? null : s.id)}
                    style={{ background: T.dim, border: "none", borderRadius: 8, padding: "6px 10px", cursor: "pointer", fontSize: 12, color: T.muted, fontFamily: "inherit", flexShrink: 0 }}>
                    {expanded ? "▲" : "▼"}
                  </button>
                </div>

                {/* Expanded details */}
                {expanded && (
                  <div style={{ borderTop: `1px solid ${T.border}`, padding: "12px 14px", display: "flex", flexDirection: "column", gap: 8 }}>
                    {isElevated && teacher && (
                      <div style={{ fontSize: 12, color: T.textSub }}>
                        <span style={{ color: T.muted }}>Teacher: </span>{teacher.name}
                      </div>
                    )}
                    <div style={{ fontSize: 12, color: T.textSub }}>
                      <span style={{ color: T.muted }}>Schedule: </span>
                      {DAYS_OF_WEEK[s.schedule?.dayOfWeek ?? 0]}, {s.schedule?.startTime}
                      {s.schedule?.duration && (
                        <span style={{ marginLeft: 5, fontSize: 10, fontWeight: 600, color: T.accent, background: T.accent + "18", border: `0.6px solid ${T.accent}40`, borderRadius: 4, padding: "1px 5px" }}>
                          {s.schedule.duration} min
                        </span>
                      )}
                    </div>
                    {room && (
                      <div style={{ fontSize: 12, color: T.textSub }}>
                        <span style={{ color: T.muted }}>Room: </span>{room.name}
                      </div>
                    )}
                    <div>
                      {s.attendanceBased
                        ? <Badge label="Att. Based" color="#60a5fa" bg="#0c1a2e" />
                        : <Badge label="Full Fee"   color={T.muted}  bg={T.dim} />
                      }
                    </div>
                    <div style={{ display: "flex", gap: 8, marginTop: 4 }}>
                      {isElevated && (
                        <>
                          <Btn T={T} variant="ghost" style={{ flex: 1, fontSize: 12 }} onClick={() => openEdit(s)}>Edit</Btn>
                        </>
                      )}
                      {isTeacher && (
                        <Btn T={T} variant="ghost" style={{ flex: 1, fontSize: 12 }} onClick={() => openGradeRequest(s)}>
                          Request Grade
                        </Btn>
                      )}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
          {filtered.length === 0 && (
            <div style={{ textAlign: "center", padding: "30px 0", color: T.muted, fontSize: 13 }}>No students found.</div>
          )}
        </div>

        {studentModal}
        {gradeModalEl}
      </div>
    );
  }

  // ── Desktop table ─────────────────────────────────────────────────────────────
  const tableCols = isTeacher
    ? ["Student", "Instrument", "Grade", "Class Day", "Time", "Att. Based", "Actions"]
    : ["Student", "Instrument", "Grade", "Teacher", "Class Day", "Time", "Att. Based", "Actions"];

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 18 }}>
        <h2 style={{ fontSize: 24, fontWeight: 700, color: T.text, fontFamily: "'Red Hat Display', 'Plus Jakarta Sans', sans-serif" }}>Students</h2>
        <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
          <div style={{ position: "relative" }}>
            <span style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", fontSize: 14, pointerEvents: "none", color: T.muted }}>🔍</span>
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search…"
              style={{ background: T.input, border: `0.6px solid ${T.border2}`, borderRadius: 4, color: T.text, padding: "9px 14px 9px 36px", fontSize: 12, outline: "none", fontFamily: "inherit", height: 42 }} />
          </div>
          {isElevated && <Btn T={T} onClick={openAdd} style={{ background: "#CB3CFF", color: "#fff", borderRadius: 4, padding: "8px 16px", fontSize: 12, fontWeight: 500, border: "none" }}>+ Add Student</Btn>}
        </div>
      </div>

      <Card T={T} style={{ padding: 0, overflow: "hidden", border: `0.6px solid ${T.border2}`, borderRadius: 12 }}>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <THead T={T} cols={tableCols} />
          <tbody>
            {filtered.map((s) => {
              const teacher = teachers.find(t => t.id === s.teacherId);
              const room    = rooms.find(r => r.id === s.schedule?.roomId);
              return (
                <tr key={s.id}
                  onMouseEnter={e => e.currentTarget.style.background = T.hover}
                  onMouseLeave={e => e.currentTarget.style.background = "transparent"}
                  style={{ borderBottom: `0.6px solid ${T.border}` }}>
                  <td style={{ padding: "11px 14px" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
                      <Avatar name={s.name} size={30} />
                      <div>
                        <div style={{ fontSize: 12, color: T.text, fontWeight: 500 }}>{s.name}</div>
                        {room && <div style={{ fontSize: 10, color: T.muted }}>{room.name}</div>}
                      </div>
                    </div>
                  </td>
                  <td style={{ padding: "11px 14px", fontSize: 12, color: T.muted }}>{s.instrument}</td>
                  <td style={{ padding: "11px 14px" }}><Badge label={s.grade} color={T.accent} bg={T.accent + "18"} /></td>
                  {isElevated && (
                    <td style={{ padding: "11px 14px", fontSize: 12, color: T.muted }}>{teacher?.name ?? "—"}</td>
                  )}
                  <td style={{ padding: "11px 14px", fontSize: 12, color: T.muted }}>{DAYS_OF_WEEK[s.schedule?.dayOfWeek ?? 0]}</td>
                  <td style={{ padding: "11px 14px", fontSize: 12, color: T.muted }}>
                    {s.schedule?.startTime}
                    {s.schedule?.duration && (
                      <span style={{ marginLeft: 6, fontSize: 10, fontWeight: 600, color: T.accent, background: T.accent + "18", border: `0.6px solid ${T.accent}40`, borderRadius: 4, padding: "1px 5px" }}>
                        {s.schedule.duration} min
                      </span>
                    )}
                  </td>
                  <td style={{ padding: "11px 14px" }}>
                    {s.attendanceBased
                      ? <Badge label="Att. Based" color="#60a5fa" bg="#0c1a2e" />
                      : <Badge label="Full Fee"   color={T.muted}  bg={T.dim} />
                    }
                  </td>
                  <td style={{ padding: "11px 14px" }}>
                    <div style={{ display: "flex", gap: 6 }}>
                      {isElevated && (
                        <>
                          <Btn T={T} variant="ghost" style={{ padding: "5px 11px", fontSize: 11 }} onClick={() => openEdit(s)}>Edit</Btn>
                        </>
                      )}
                      {isTeacher && (
                        <Btn T={T} variant="ghost" style={{ padding: "5px 11px", fontSize: 11 }} onClick={() => openGradeRequest(s)}>
                          Request Grade
                        </Btn>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
            {filtered.length === 0 && (
              <tr><td colSpan={tableCols.length} style={{ padding: "20px 14px", textAlign: "center", color: T.muted, fontSize: 13 }}>No students found.</td></tr>
            )}
          </tbody>
        </table>
      </Card>

      {studentModal}
      {gradeModalEl}
    </div>
  );
}
