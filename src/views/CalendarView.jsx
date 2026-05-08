import { useState, useMemo } from "react";
import { Btn, Badge, Card, SectionTitle, Sel, Modal } from "../components/UI.jsx";
import { getMergedSessionsForDate, getRecurringDates, fmtDate, uid, timesOverlap } from "../utils/helpers.js";
import { TODAY, STATUS_META, HOURS } from "../data/seed.js";

// ─── Session Card with hover/tap attendance ───────────────────────────────────
function SessionCard({ sess, student, teacher, room, onStatusChange, T, currentUser, isMobile }) {
  const [hovered,  setHovered]  = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const sm = STATUS_META[sess.status] ?? { color: T.muted, bg: T.dim, label: "—" };
  const roomColor = room?.color ?? "#888";

  const isOwnSession  = !currentUser || currentUser.role !== "teacher" || sess.teacherId === currentUser.teacherId;
  const displayName   = isOwnSession ? (student?.name ?? "—") : "Occupied";
  const canMarkAttend = isOwnSession && currentUser?.role !== undefined;

  // Mobile: tap to toggle picker; Desktop: hover to show picker
  const showPicker = isMobile ? pickerOpen : hovered;

  function handleCardClick() {
    if (isMobile && canMarkAttend) setPickerOpen(o => !o);
  }

  return (
    <div
      style={{ position: "relative" }}
      onMouseEnter={() => !isMobile && setHovered(true)}
      onMouseLeave={() => !isMobile && setHovered(false)}
    >
      {showPicker && canMarkAttend && (
        <div style={{
          position: "absolute", bottom: "100%", left: 0, zIndex: 50,
          background: T.panel, border: `1px solid ${T.border2}`, borderRadius: 10,
          padding: "6px", display: "flex", gap: 6, boxShadow: "0 4px 20px rgba(0,0,0,0.4)",
          whiteSpace: "nowrap", flexWrap: isMobile ? "wrap" : "nowrap"
        }}>
          {Object.entries(STATUS_META).filter(([k]) => k !== "pending_approval").map(([key, meta]) => (
            <button key={key} onClick={e => { e.stopPropagation(); onStatusChange(sess, key); setPickerOpen(false); }}
              style={{
                padding: "5px 11px", borderRadius: 7, border: "none", cursor: "pointer",
                fontFamily: "inherit", fontSize: 11, fontWeight: 700,
                background: sess.status === key ? meta.bg : T.dim,
                color: sess.status === key ? meta.color : T.muted,
                outline: sess.status === key ? `1px solid ${meta.color}` : "none",
              }}>{meta.label}</button>
          ))}
        </div>
      )}

      <div onClick={handleCardClick} style={{
        background: T.panel, border: `1px solid ${roomColor}40`,
        borderLeft: `3px solid ${roomColor}`, borderRadius: 10, padding: "10px 12px",
        cursor: canMarkAttend ? "pointer" : "default", transition: "box-shadow 0.15s",
        boxShadow: hovered ? `0 0 0 2px ${roomColor}60` : "none",
        opacity: sess.status === "pending_approval" ? 0.75 : 1,
      }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
          <span style={{ fontSize: 11, fontWeight: 700, color: roomColor }}>{sess.startTime} – {sess.endTime}</span>
          {sess.status !== "pending"
            ? <Badge label={sm.label} color={sm.color} bg={sm.bg} />
            : <span style={{ fontSize: 10, color: T.muted }}>Not marked</span>
          }
        </div>
        <div style={{ fontSize: 12, fontWeight: 600, color: isOwnSession ? T.text : T.muted, marginBottom: 2 }}>{displayName}</div>
        {isOwnSession && <div style={{ fontSize: 11, color: T.muted }}>{teacher?.name ?? "—"}</div>}
        {sess.notes && isOwnSession && <div style={{ fontSize: 10, color: T.muted, marginTop: 3, fontStyle: "italic" }}>{sess.notes}</div>}
      </div>
    </div>
  );
}

// ─── Main Calendar view ───────────────────────────────────────────────────────
export default function CalendarView({
  students, teachers, rooms, attendanceOverrides, setAttendanceOverrides,
  oneOffSessions, setOneOffSessions,
  T, currentUser, sendClashRequest, isMobile,
}) {
  const today = new Date();
  const [selDate, setSelDate]   = useState(TODAY);
  const [calYear,  setCalYear]  = useState(today.getFullYear());
  const [calMonth, setCalMonth] = useState(today.getMonth());
  const [viewMode, setViewMode] = useState("both");

  const [bookModal,    setBookModal]    = useState(null);
  const [bookForm,     setBookForm]     = useState({ studentId: "", startTime: "09:00", endTime: "10:00" });
  const [clashWarning, setClashWarning] = useState(null);
  const [bookSuccess,  setBookSuccess]  = useState(false);

  const isTeacher  = currentUser?.role === "teacher";

  const daySessions = useMemo(
    () => getMergedSessionsForDate(selDate, students, attendanceOverrides),
    [selDate, students, attendanceOverrides]
  );

  const allDaySessions = useMemo(() => {
    const oneOff = (oneOffSessions ?? []).filter(s => s.date === selDate);
    return [...daySessions, ...oneOff];
  }, [daySessions, oneOffSessions, selDate]);

  const monthSessionCounts = useMemo(() => {
    const counts = {};
    const year = calYear, month = calMonth;
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    for (let d = 1; d <= daysInMonth; d++) {
      const dt = `${year}-${String(month + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
      counts[dt] = getMergedSessionsForDate(dt, students, attendanceOverrides).length
        + (oneOffSessions ?? []).filter(s => s.date === dt).length;
    }
    return counts;
  }, [calYear, calMonth, students, attendanceOverrides, oneOffSessions]);

  function handleStatusChange(sess, status) {
    if (sess.isOneOff) {
      // One-off sessions carry their own status — update directly
      setOneOffSessions(prev => prev.map(s => s.id === sess.id ? { ...s, status } : s));
    } else {
      // Recurring sessions use attendanceOverrides, keyed by (studentId, date)
      setAttendanceOverrides(prev => {
        const existing = prev.find(a => a.studentId === sess.studentId && a.date === sess.date);
        if (existing) return prev.map(a => a.studentId === sess.studentId && a.date === sess.date ? { ...a, status } : a);
        return [...prev, { id: uid(), studentId: sess.studentId, date: sess.date, status, notes: "" }];
      });
    }
  }

  const daysInMonth = new Date(calYear, calMonth + 1, 0).getDate();
  const firstDow    = new Date(calYear, calMonth, 1).getDay();
  const cells       = [...Array(firstDow).fill(null), ...Array.from({ length: daysInMonth }, (_, i) => i + 1)];

  function prevMonth() { const d = new Date(calYear, calMonth - 1, 1); setCalYear(d.getFullYear()); setCalMonth(d.getMonth()); }
  function nextMonth() { const d = new Date(calYear, calMonth + 1, 1); setCalYear(d.getFullYear()); setCalMonth(d.getMonth()); }

  const bookableStudents = isTeacher
    ? students.filter(s => s.teacherId === currentUser.teacherId)
    : students;

  function openBookModal(roomId) {
    const defaultTeacherId = isTeacher ? currentUser.teacherId : (teachers[0]?.id ?? "");
    setBookForm({ studentId: bookableStudents[0]?.id ?? "", startTime: "09:00", endTime: "10:00", teacherId: defaultTeacherId });
    setBookModal({ roomId });
    setBookSuccess(false);
    setClashWarning(null);
  }

  function checkAndBook() {
    if (!bookForm.studentId || !bookForm.startTime || !bookForm.endTime) return;
    const student = students.find(s => s.id === bookForm.studentId);
    const { roomId } = bookModal;
    const roomSessions = allDaySessions.filter(s => s.roomId === roomId);
    const clash = roomSessions.find(s =>
      timesOverlap(bookForm.startTime, bookForm.endTime, s.startTime, s.endTime)
    );
    const newSession = {
      id:        uid(),
      studentId: bookForm.studentId,
      teacherId: bookForm.teacherId || student?.teacherId || currentUser.teacherId,
      roomId,
      date:      selDate,
      startTime: bookForm.startTime,
      endTime:   bookForm.endTime,
      notes:     "",
      isOneOff:  true,
    };
    if (!clash) {
      setOneOffSessions(prev => [...prev, { ...newSession, status: "pending" }]);
      setBookSuccess(true);
    } else {
      const clashTeacher = teachers.find(t => t.id === clash.teacherId);
      setClashWarning({ newSession, clash, clashTeacher });
    }
  }

  async function confirmClashRequest() {
    const { newSession, clash, clashTeacher } = clashWarning;
    const pendingSession = { ...newSession, status: "pending_approval" };
    setOneOffSessions(prev => [...prev, pendingSession]);
    await sendClashRequest({
      fromTeacherId:      currentUser.teacherId,
      toTeacherId:        clash.teacherId,
      studentId:          clash.studentId,
      requestedDate:      selDate,
      requestedStartTime: newSession.startTime,
      requestedEndTime:   newSession.endTime,
      requestedRoomId:    newSession.roomId,
      sessionId:          newSession.id,
      reason:             "",
    });
    setClashWarning(null);
    setBookSuccess(true);
  }

  const MonthGrid = (
    <Card T={T} style={{ padding: isMobile ? 12 : 16 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
        <Btn T={T} variant="ghost" style={{ padding: "4px 11px" }} onClick={prevMonth}>‹</Btn>
        <span style={{ fontWeight: 700, color: T.text, fontSize: 14 }}>
          {new Date(calYear, calMonth, 1).toLocaleDateString("en-MY", { month: "long", year: "numeric" })}
        </span>
        <Btn T={T} variant="ghost" style={{ padding: "4px 11px" }} onClick={nextMonth}>›</Btn>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(7,1fr)", gap: 2 }}>
        {["Su","Mo","Tu","We","Th","Fr","Sa"].map(d => (
          <div key={d} style={{ textAlign: "center", fontSize: 10, color: T.muted, padding: "3px 0", fontWeight: 700 }}>{d}</div>
        ))}
        {cells.map((d, i) => {
          if (!d) return <div key={`e${i}`} />;
          const dt      = `${calYear}-${String(calMonth + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
          const cnt     = monthSessionCounts[dt] ?? 0;
          const isSel   = dt === selDate;
          const isToday = dt === TODAY;
          return (
            <div key={d} onClick={() => setSelDate(dt)}
              style={{
                borderRadius: 7, padding: isMobile ? "4px 2px" : "5px 3px", textAlign: "center", cursor: "pointer",
                background: isSel ? T.accent + "22" : isToday ? T.hover : "transparent",
                border: `1px solid ${isSel ? T.accent : isToday ? T.border2 : "transparent"}`,
                minHeight: isMobile ? 36 : 44, display: "flex", flexDirection: "column", alignItems: "center", gap: 2,
                transition: "background 0.1s"
              }}>
              <span style={{ fontSize: isMobile ? 11 : 12, fontWeight: isSel || isToday ? 700 : 400, color: isSel ? T.accent : isToday ? T.accent + "cc" : T.text }}>{d}</span>
              {cnt > 0 && (
                <span style={{ fontSize: 9, background: T.accent, color: "#0b0b0f", borderRadius: 99, padding: "1px 5px", fontWeight: 700 }}>{cnt}</span>
              )}
            </div>
          );
        })}
      </div>
    </Card>
  );

  const DayView = (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
        <span style={{ fontSize: 14, fontWeight: 700, color: T.text }}>{fmtDate(selDate)}</span>
      </div>
      {rooms.length === 0 && <p style={{ color: T.muted, fontSize: 13 }}>No rooms configured.</p>}
      <div style={{
        display: "grid",
        gridTemplateColumns: isMobile ? "1fr" : `repeat(${Math.min(rooms.length, 4)}, 1fr)`,
        gap: 10
      }}>
        {rooms.map(room => {
          const roomSess = allDaySessions
            .filter(s => s.roomId === room.id)
            .sort((a, b) => a.startTime.localeCompare(b.startTime));
          return (
            <div key={room.id}>
              <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 7 }}>
                <div style={{ width: 9, height: 9, borderRadius: 2, background: room.color }} />
                <span style={{ fontSize: 12, fontWeight: 700, color: T.text }}>{room.name}</span>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 7, minHeight: 60 }}>
                {roomSess.length === 0 && (
                  <div style={{ background: T.bg, border: `1px dashed ${T.border}`, borderRadius: 9,
                    padding: "14px 10px", textAlign: "center", fontSize: 11, color: T.dim }}>
                    Available
                  </div>
                )}
                {roomSess.map(sess => {
                  const st = students.find(s => s.id === sess.studentId);
                  const tc = teachers.find(t => t.id === sess.teacherId);
                  return (
                    <SessionCard key={sess.id} sess={sess} student={st} teacher={tc} room={room}
                      onStatusChange={handleStatusChange} T={T} currentUser={currentUser} isMobile={isMobile} />
                  );
                })}
                <button onClick={() => openBookModal(room.id)} style={{
                  background: "none", border: `1px dashed ${T.border2}`, borderRadius: 9,
                  padding: "8px 10px", cursor: "pointer", fontSize: 11, color: T.muted,
                  fontFamily: "inherit", transition: "border-color 0.12s"
                }}>
                  + Book Session
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );

  const bookingModals = (
    <>
      {bookModal && !clashWarning && (
        <Modal T={T} title="Book Session" onClose={() => { setBookModal(null); setBookSuccess(false); }} width={400}>
          {bookSuccess ? (
            <div style={{ textAlign: "center", padding: "10px 0" }}>
              <div style={{ fontSize: 28, marginBottom: 12 }}>✅</div>
              <div style={{ fontSize: 14, color: T.text, fontWeight: 600, marginBottom: 8 }}>Session booked!</div>
              <Btn T={T} onClick={() => { setBookModal(null); setBookSuccess(false); }}>Done</Btn>
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              <div style={{ background: T.bg, border: `1px solid ${T.border}`, borderRadius: 9, padding: "10px 13px", fontSize: 12, color: T.muted }}>
                Date: <strong style={{ color: T.text }}>{fmtDate(selDate)}</strong>
              </div>
              <Sel T={T} label="Teacher" value={bookForm.teacherId ?? ""}
                onChange={e => setBookForm(f => ({ ...f, teacherId: e.target.value }))}>
                <option value="">— Select teacher —</option>
                {teachers.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
              </Sel>
              <Sel T={T} label="Student" value={bookForm.studentId}
                onChange={e => setBookForm(f => ({ ...f, studentId: e.target.value }))}>
                {bookableStudents.length === 0 && <option value="">No students</option>}
                {bookableStudents.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
              </Sel>
              <div style={{ display: "flex", gap: 11 }}>
                <Sel T={T} label="Start Time" value={bookForm.startTime}
                  onChange={e => setBookForm(f => ({ ...f, startTime: e.target.value }))}>
                  {HOURS.map(h => <option key={h}>{h}</option>)}
                </Sel>
                <Sel T={T} label="End Time" value={bookForm.endTime}
                  onChange={e => setBookForm(f => ({ ...f, endTime: e.target.value }))}>
                  {HOURS.map(h => <option key={h}>{h}</option>)}
                </Sel>
              </div>
              <div style={{ display: "flex", justifyContent: "flex-end", gap: 9, marginTop: 4 }}>
                <Btn T={T} variant="ghost" onClick={() => setBookModal(null)}>Cancel</Btn>
                <Btn T={T} onClick={checkAndBook}>Check & Book</Btn>
              </div>
            </div>
          )}
        </Modal>
      )}

      {clashWarning && (
        <Modal T={T} title="Room Conflict Detected" onClose={() => setClashWarning(null)} width={440}>
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            <div style={{ background: "#451a0330", border: "1px solid #fb923c40", borderRadius: 10, padding: "13px 16px", fontSize: 13, color: T.text, lineHeight: 1.7 }}>
              This room is occupied by <strong>{clashWarning.clashTeacher?.name ?? "another teacher"}</strong>'s
              student during this time. A clash request will be sent to them for approval.
            </div>
            <div style={{ fontSize: 12, color: T.muted, lineHeight: 1.6 }}>
              Your session will be saved as <strong style={{ color: "#94a3b8" }}>Pending Approval</strong> and
              will become active once the other teacher approves.
            </div>
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 9 }}>
              <Btn T={T} variant="ghost" onClick={() => setClashWarning(null)}>Cancel</Btn>
              <Btn T={T} onClick={confirmClashRequest} style={{ background: "#fb923c", color: "#0b0b0f" }}>
                Send Clash Request
              </Btn>
            </div>
          </div>
        </Modal>
      )}
    </>
  );

  // ── Mobile: always stacked ────────────────────────────────────────────────────
  if (isMobile) {
    return (
      <div>
        <h2 style={{ fontSize: 18, fontWeight: 800, color: T.text, marginBottom: 14 }}>Calendar</h2>
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          {MonthGrid}
          {DayView}
        </div>
        {bookingModals}
      </div>
    );
  }

  // ── Desktop ───────────────────────────────────────────────────────────────────
  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 18 }}>
        <h2 style={{ fontSize: 22, fontWeight: 800, color: T.text }}>Calendar & Rooms</h2>
        <div style={{ display: "flex", gap: 6 }}>
          {[["both","Both"],["month","Month"],["day","Day"]].map(([id, label]) => (
            <Btn key={id} T={T} variant={viewMode === id ? "active" : "ghost"}
              style={{ padding: "6px 14px", fontSize: 12 }} onClick={() => setViewMode(id)}>{label}</Btn>
          ))}
        </div>
      </div>

      {viewMode === "month" && MonthGrid}
      {viewMode === "day"   && DayView}
      {viewMode === "both"  && (
        <div style={{ display: "grid", gridTemplateColumns: "320px 1fr", gap: 16, alignItems: "start" }}>
          <div>{MonthGrid}</div>
          <div>{DayView}</div>
        </div>
      )}

      {bookingModals}
    </div>
  );
}
