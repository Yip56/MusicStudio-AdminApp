import { useState, useMemo } from "react";
import { Btn, Badge, Card, SectionTitle, Sel, Modal } from "../components/UI.jsx";
import { fmtDate, uid } from "../utils/helpers.js";
import { getMergedSessionsForDate, roomSupportsInstrument } from "../domain/enrolments.js";
import { timesOverlap } from "../domain/time.js";
import { TODAY, STATUS_META, HOURS } from "../data/seed.js";

// ─── Session Card — click to open attendance popup ────────────────────────────
function SessionCard({ sess, student, enrolment, teacher, room, onStatusChange, onScheduleMakeup, onRemoveDeferral, onDeleteSession, T, currentUser }) {
  const defaultDefer = (() => {
    const d = new Date(sess.date + "T00:00:00");
    d.setDate(d.getDate() + 7);
    return { year: d.getFullYear(), month: d.getMonth() + 1, day: d.getDate() };
  })();

  const [modalOpen,     setModalOpen]     = useState(false);
  const [showDefer,     setShowDefer]     = useState(false);
  const [makeupYear,    setMakeupYear]    = useState(defaultDefer.year);
  const [makeupMonth,   setMakeupMonth]   = useState(defaultDefer.month);
  const [makeupDay,     setMakeupDay]     = useState(defaultDefer.day);
  const [makeupStart,   setMakeupStart]   = useState("");
  const [makeupEnd,     setMakeupEnd]     = useState("");
  const [confirmDelete, setConfirmDelete] = useState(false);

  const sm        = STATUS_META[sess.status] ?? { color: T.muted, bg: T.dim, label: "—" };
  const roomColor = room?.color ?? "#888";

  const isOwnSession  = !currentUser || currentUser.role !== "teacher" || sess.teacherId === currentUser.teacherId;
  const displayName   = isOwnSession ? (student?.name ?? "—") : "Occupied";
  const canMarkAttend = isOwnSession && currentUser?.role !== undefined;

  function tryClose() {
    setModalOpen(false);
    setShowDefer(false);
    setConfirmDelete(false);
  }

  function handleStatusBtn(key) {
    // clicking the active status again unmarks it
    const newStatus = sess.status === key ? "pending" : key;
    onStatusChange(sess, newStatus);
    setModalOpen(false);
  }

  function handleSchedule() {
    const makeupDate = `${makeupYear}-${String(makeupMonth).padStart(2,"0")}-${String(makeupDay).padStart(2,"0")}`;
    onScheduleMakeup(sess, makeupDate, makeupStart || null, makeupEnd || null);
    setModalOpen(false);
    setShowDefer(false);
  }

  const inp = {
    background: T.input, border: `0.6px solid ${T.border2}`, borderRadius: 3,
    color: T.text, fontSize: 11, padding: "4px 6px", fontFamily: "inherit", outline: "none",
  };

  return (
    <>
      <div
        onClick={() => canMarkAttend && setModalOpen(true)}
        style={{
          background: T.panel, border: `1px solid ${roomColor}40`,
          borderLeft: `3px solid ${roomColor}`, borderRadius: 10, padding: "10px 12px",
          cursor: canMarkAttend ? "pointer" : "default",
          opacity: sess.status === "pending_approval" ? 0.75 : 1,
        }}
      >
        <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:4 }}>
          <span style={{ fontSize:11, fontWeight:700, color:roomColor }}>{sess.startTime} – {sess.endTime}</span>
          <div style={{ display:"flex", alignItems:"center", gap:5 }}>
            {sess.isMakeup && (
              <span style={{ fontSize:9, background:"rgba(154,145,251,0.2)", color:"#9A91FB", borderRadius:2, padding:"1px 5px", border:"0.6px solid rgba(154,145,251,0.3)" }}>
                Makeup · from {sess.originalDate}
              </span>
            )}
            {sess.status !== "pending"
              ? <Badge label={sm.label} color={sm.color} bg={sm.bg} />
              : <span style={{ fontSize:10, color:T.muted }}>Not marked</span>
            }
          </div>
        </div>
        <div style={{ fontSize:12, fontWeight:600, color:isOwnSession ? T.text : T.muted, marginBottom:2 }}>
          {displayName}{isOwnSession && enrolment?.instrument && <span style={{ fontWeight:500, color:roomColor }}> · {enrolment.instrument}</span>}
        </div>
        {isOwnSession && <div style={{ fontSize:11, color:T.muted }}>{teacher?.name ?? "—"}</div>}
        {sess.notes && isOwnSession && <div style={{ fontSize:10, color:T.muted, marginTop:3, fontStyle:"italic" }}>{sess.notes}</div>}
      </div>

      {modalOpen && (
        <div
          onClick={tryClose}
          style={{
            position:"fixed", inset:0, background:"rgba(0,0,0,0.75)", zIndex:200,
            display:"flex", alignItems:"center", justifyContent:"center",
          }}
        >
          <div
            onClick={e => e.stopPropagation()}
            style={{
              background:T.panel, border:`0.6px solid ${T.border2}`, borderRadius:12,
              padding:20, width:320, boxShadow:"0px 17px 17px rgba(1,5,17,0.3)",
              maxHeight:"90vh", overflowY:"auto",
            }}
          >
            {/* Header */}
            <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", marginBottom:14 }}>
              <div>
                <div style={{ fontWeight:700, color:T.text, fontSize:14, marginBottom:2 }}>{displayName}</div>
                <div style={{ color:T.muted, fontSize:11 }}>{sess.startTime}–{sess.endTime} · {enrolment?.instrument ? enrolment.instrument + " · " : ""}{teacher?.name ?? "—"}</div>
              </div>
              <button onClick={tryClose} style={{ background:"none", border:"none", color:T.muted, fontSize:22, cursor:"pointer", padding:"0 2px", lineHeight:1 }}>×</button>
            </div>

            {/* Current status */}
            <div style={{ display:"flex", alignItems:"center", gap:6, marginBottom:12, fontSize:11, color:T.muted }}>
              Status: <Badge label={sm.label} color={sm.color} bg={sm.bg} />
            </div>

            {/* Deferred class info */}
            {sess.isDeferred && (
              <div style={{ background:"rgba(154,145,251,0.1)", border:"0.6px solid rgba(154,145,251,0.35)", borderRadius:7, padding:"8px 10px", marginBottom:10, fontSize:11, color:"#9A91FB" }}>
                Makeup scheduled for <strong>{sess.makeupDate}</strong>
              </div>
            )}

            {/* Present / Absent — hidden for deferred sessions */}
            {!sess.isDeferred && (
              <div style={{ display:"flex", gap:8, marginBottom:10 }}>
                {[["present","Present"],["absent","Absent"]].map(([key,label]) => {
                  const meta = STATUS_META[key];
                  const active = sess.status === key;
                  return (
                    <button key={key} onClick={() => handleStatusBtn(key)} style={{
                      flex:1, padding:"9px 0", borderRadius:6,
                      border: active ? `1px solid ${meta.color}` : `0.6px solid ${T.border2}`,
                      background: active ? meta.bg : T.dim,
                      color: active ? meta.color : T.muted,
                      cursor:"pointer", fontFamily:"inherit", fontSize:12, fontWeight:700,
                    }}>{label}</button>
                  );
                })}
              </div>
            )}

            {/* Remove Deferral — only on the original deferred session */}
            {sess.isDeferred && (
              <button
                onClick={() => { onRemoveDeferral(sess.deferralId); setModalOpen(false); }}
                style={{
                  width:"100%", padding:"9px 0", borderRadius:6, marginBottom:10,
                  border:`0.6px solid rgba(255,90,101,0.4)`,
                  background:"rgba(255,90,101,0.08)", color:"#FF5A65",
                  cursor:"pointer", fontFamily:"inherit", fontSize:12, fontWeight:700,
                }}
              >Remove Deferral</button>
            )}

            {/* Delete Session — one-off sessions only, admin/sysadmin only */}
            {sess.isOneOff && (currentUser?.role === "admin" || currentUser?.role === "sysadmin") && (
              confirmDelete ? (
                <div style={{ background:"rgba(255,90,101,0.08)", border:"0.6px solid rgba(255,90,101,0.35)", borderRadius:7, padding:"10px 12px", marginBottom:10 }}>
                  <div style={{ fontSize:12, color:"#FF5A65", fontWeight:600, marginBottom:8 }}>Delete this session?</div>
                  <div style={{ display:"flex", gap:7 }}>
                    <button
                      onClick={() => { onDeleteSession(sess); setModalOpen(false); setConfirmDelete(false); }}
                      style={{
                        flex:1, padding:"8px 0", borderRadius:6, border:"none",
                        background:"#FF5A65", color:"#fff",
                        cursor:"pointer", fontFamily:"inherit", fontSize:12, fontWeight:700,
                      }}
                    >Yes, Delete</button>
                    <button
                      onClick={() => setConfirmDelete(false)}
                      style={{
                        flex:1, padding:"8px 0", borderRadius:6,
                        border:`0.6px solid ${T.border2}`, background:T.dim, color:T.muted,
                        cursor:"pointer", fontFamily:"inherit", fontSize:12, fontWeight:700,
                      }}
                    >Cancel</button>
                  </div>
                </div>
              ) : (
                <button
                  onClick={() => setConfirmDelete(true)}
                  style={{
                    width:"100%", padding:"9px 0", borderRadius:6, marginBottom:10,
                    border:"0.6px solid rgba(255,90,101,0.35)",
                    background:"rgba(255,90,101,0.06)", color:"#FF5A65",
                    cursor:"pointer", fontFamily:"inherit", fontSize:12, fontWeight:700,
                  }}
                >Delete Session</button>
              )
            )}

            {/* Defer Class — only for non-attendance-based, non-makeup, non-already-deferred sessions */}
            {!enrolment?.attendanceBased && !sess.isMakeup && !sess.isDeferred && (
              <>
                <button
                  onClick={() => setShowDefer(v => !v)}
                  style={{
                    width:"100%", padding:"9px 0", borderRadius:6,
                    border: showDefer ? "1px solid #9A91FB" : `0.6px solid ${T.border2}`,
                    background: showDefer ? "rgba(154,145,251,0.2)" : T.dim,
                    color: showDefer ? "#9A91FB" : T.muted,
                    cursor:"pointer", fontFamily:"inherit", fontSize:12, fontWeight:700,
                    marginBottom: showDefer ? 10 : 0,
                  }}
                >
                  {showDefer ? "▲ Defer Class" : "▼ Defer Class"}
                </button>

                {showDefer && (
                  <div style={{ background:T.panel2, borderRadius:8, border:`0.6px solid ${T.border2}`, padding:12 }}>
                    <div style={{ fontSize:10, color:"#9A91FB", fontWeight:600, marginBottom:8 }}>Makeup Date</div>

                    <div style={{ display:"flex", gap:4, marginBottom:8 }}>
                      <input type="number" value={makeupYear} min={2020} max={2035}
                        onChange={e => setMakeupYear(Number(e.target.value))}
                        style={{ ...inp, width:60 }} placeholder="Year" />
                      <input type="number" value={makeupMonth} min={1} max={12}
                        onChange={e => setMakeupMonth(Number(e.target.value))}
                        style={{ ...inp, width:48 }} placeholder="Mo" />
                      <input type="number" value={makeupDay} min={1} max={31}
                        onChange={e => setMakeupDay(Number(e.target.value))}
                        style={{ ...inp, width:44 }} placeholder="Day" />
                    </div>

                    <div style={{ display:"flex", gap:4, marginBottom:10 }}>
                      <input type="time" value={makeupStart}
                        onChange={e => setMakeupStart(e.target.value)}
                        style={{ ...inp, flex:1 }} placeholder="Start time" />
                      <input type="time" value={makeupEnd}
                        onChange={e => setMakeupEnd(e.target.value)}
                        style={{ ...inp, flex:1 }} placeholder="End time" />
                    </div>

                    <button onClick={handleSchedule} style={{
                      width:"100%", padding:"9px 0", borderRadius:6, border:"none",
                      background:"#9A91FB", color:"#fff",
                      cursor:"pointer", fontFamily:"inherit", fontSize:12, fontWeight:700,
                    }}>Schedule Makeup</button>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      )}
    </>
  );
}

// ─── Main Calendar view ───────────────────────────────────────────────────────
export default function CalendarView({
  students, enrolments, teachers, rooms, attendance, actions,
  oneOffSessions,
  deferrals, addDeferral, removeDeferral, updateDeferralStatus,
  T, currentUser, sendClashRequest, isMobile, setDirty,
}) {
  const today = new Date();
  const [selDate, setSelDate]   = useState(TODAY);
  const [calYear,  setCalYear]  = useState(today.getFullYear());
  const [calMonth, setCalMonth] = useState(today.getMonth());
  const [viewMode, setViewMode] = useState("both");

  const [bookModal,     setBookModal]     = useState(null);
  const [bookForm,      setBookForm]      = useState({ enrolmentId: "", startTime: "09:00", endTime: "10:00" });
  const [clashWarning,  setClashWarning]  = useState(null);
  const [bookSuccess,   setBookSuccess]   = useState(false);
  const [bookTimeError, setBookTimeError] = useState(null);
  const [bookBusy,      setBookBusy]      = useState(false);

  const isTeacher  = currentUser?.role === "teacher";

  const daySessions = useMemo(
    () => getMergedSessionsForDate(selDate, enrolments, attendance),
    [selDate, enrolments, attendance]
  );

  const allDaySessions = useMemo(() => {
    const oneOff = (oneOffSessions ?? []).filter(s => s.date === selDate);
    return [...daySessions, ...oneOff];
  }, [daySessions, oneOffSessions, selDate]);

  const makeupSessions = useMemo(() =>
    (deferrals ?? [])
      .filter(d => d.makeupDate === selDate)
      .map(d => {
        const st = enrolments.find(e => e.id === d.enrolmentId);
        return {
          id:           `makeup_${d.id}`,
          deferralId:   d.id,
          enrolmentId:  d.enrolmentId,
          studentId:    st?.studentId,
          teacherId:    d.teacherId,
          roomId:       st?.schedule?.roomId ?? "",
          date:         selDate,
          startTime:    d.makeupStartTime ?? st?.schedule?.startTime ?? "09:00",
          endTime:      d.makeupEndTime   ?? st?.schedule?.endTime   ?? "10:00",
          isRecurring:  false,
          isMakeup:     true,
          originalDate: d.originalDate,
          feeYearMonth: d.feeYearMonth,
          status:       d.makeupStatus ?? "pending",
        };
      }),
    [deferrals, selDate, enrolments]
  );

  const combinedSessions = useMemo(() => {
    const all = [...allDaySessions, ...makeupSessions];
    return all.map(sess => {
      // Tag recurring sessions that have been deferred (and not yet explicitly marked present/absent)
      if (!sess.isMakeup && !sess.isOneOff && sess.status === "pending") {
        const deferral = deferrals?.find(d => d.enrolmentId === sess.enrolmentId && d.originalDate === sess.date);
        if (deferral) {
          return { ...sess, status: "deferred", isDeferred: true, deferralId: deferral.id, makeupDate: deferral.makeupDate };
        }
      }
      return sess;
    });
  }, [allDaySessions, makeupSessions, deferrals]);

  const monthSessionCounts = useMemo(() => {
    const counts = {};
    const year = calYear, month = calMonth;
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    for (let d = 1; d <= daysInMonth; d++) {
      const dt = `${year}-${String(month + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
      counts[dt] = getMergedSessionsForDate(dt, enrolments, attendance).length
        + (oneOffSessions ?? []).filter(s => s.date === dt).length
        + (deferrals ?? []).filter(d => d.makeupDate === dt).length;
    }
    return counts;
  }, [calYear, calMonth, enrolments, attendance, oneOffSessions, deferrals]);

  function handleStatusChange(sess, status) {
    if (sess.isMakeup) {
      // Makeup sessions store attendance on the deferral doc to avoid key collision with recurring sessions
      updateDeferralStatus(sess.deferralId, status === "pending" ? null : status);
    } else if (sess.isOneOff) {
      actions.updateOneOff(sess.id, { status });
    } else {
      // Recurring sessions: one attendance doc per (enrolment, date); "pending" removes it
      actions.setAttendance(sess.enrolmentId, sess.date, status);
    }
  }

  function handleDeleteSession(sess) {
    actions.deleteOneOff(sess.id);
  }

  function handleScheduleMakeup(sess, makeupDate, makeupStartTime, makeupEndTime) {
    addDeferral({
      enrolmentId:  sess.enrolmentId,
      studentId:    sess.studentId,
      teacherId:    sess.teacherId,
      originalDate: sess.date,
      makeupDate,
      makeupStartTime,
      makeupEndTime,
      createdBy:    currentUser?.uid ?? "",
    });
  }

  const daysInMonth = new Date(calYear, calMonth + 1, 0).getDate();
  const firstDow    = new Date(calYear, calMonth, 1).getDay();
  const cells       = [...Array(firstDow).fill(null), ...Array.from({ length: daysInMonth }, (_, i) => i + 1)];

  function prevMonth() { const d = new Date(calYear, calMonth - 1, 1); setCalYear(d.getFullYear()); setCalMonth(d.getMonth()); }
  function nextMonth() { const d = new Date(calYear, calMonth + 1, 1); setCalYear(d.getFullYear()); setCalMonth(d.getMonth()); }

  // One bookable entry per live enrolment, so a two-instrument student is listed once per instrument
  const bookable = enrolments
    .filter(e => e.status !== "stopped" || (e.endDate && e.endDate >= TODAY))
    .filter(e => !isTeacher || e.teacherId === currentUser.teacherId)
    .map(e => ({ e, label: `${students.find(s => s.id === e.studentId)?.name ?? "?"} — ${e.instrument ?? "no instrument"}` }))
    .sort((a, b) => a.label.localeCompare(b.label));

  function openBookModal(roomId) {
    const defaultTeacherId = isTeacher ? currentUser.teacherId : (teachers[0]?.id ?? "");
    setBookForm({ enrolmentId: bookable[0]?.e.id ?? "", startTime: "09:00", endTime: "10:00", teacherId: defaultTeacherId });
    setBookModal({ roomId });
    setBookSuccess(false);
    setClashWarning(null);
    setBookTimeError(null);
  }

  async function checkAndBook() {
    if (!bookForm.enrolmentId || !bookForm.startTime || !bookForm.endTime) return;
    if (bookForm.endTime <= bookForm.startTime) {
      setBookTimeError("End time must be after start time.");
      return;
    }
    setBookTimeError(null);
    const enrol   = enrolments.find(e => e.id === bookForm.enrolmentId);
    const { roomId } = bookModal;
    const room    = rooms.find(r => r.id === roomId);
    const teacherId = bookForm.teacherId || enrol?.teacherId || currentUser.teacherId;

    // Hard rules (no override): the room must suit the instrument, and neither the student nor
    // the teacher can be in two places at once.
    if (!roomSupportsInstrument(room, enrol?.instrument)) {
      setBookTimeError(`${room?.name ?? "This room"} is not set up for ${enrol?.instrument ?? "this instrument"}.`);
      return;
    }
    const overlaps = s => s.status !== "pending_approval" && timesOverlap(bookForm.startTime, bookForm.endTime, s.startTime, s.endTime);
    if (combinedSessions.some(s => s.studentId === enrol?.studentId && overlaps(s))) {
      setBookTimeError("This student already has another class at that time.");
      return;
    }
    if (combinedSessions.some(s => s.teacherId === teacherId && overlaps(s))) {
      setBookTimeError("This teacher is already teaching at that time.");
      return;
    }

    // A booked room can still be requested from the other teacher (clash request flow)
    const roomSessions = combinedSessions.filter(s => s.roomId === roomId);
    const clash = roomSessions.find(s =>
      timesOverlap(bookForm.startTime, bookForm.endTime, s.startTime, s.endTime)
    );
    const newSession = {
      id:        uid(),
      enrolmentId: bookForm.enrolmentId,
      studentId: enrol?.studentId,
      teacherId,
      roomId,
      date:      selDate,
      startTime: bookForm.startTime,
      endTime:   bookForm.endTime,
      notes:     "",
      isOneOff:  true,
    };
    if (!clash) {
      try {
        setBookBusy(true);
        await actions.addOneOff({ ...newSession, status: "pending" });
        setBookSuccess(true);
        setDirty?.(false);
      } catch (e) { setBookTimeError(e.message); }
      setBookBusy(false);
    } else {
      const clashTeacher = teachers.find(t => t.id === clash.teacherId);
      setClashWarning({ newSession, clash, clashTeacher });
    }
  }

  async function confirmClashRequest() {
    const { newSession, clash, clashTeacher } = clashWarning;
    const pendingSession = { ...newSession, status: "pending_approval" };
    await actions.addOneOff(pendingSession);
    await sendClashRequest({
      fromTeacherId:      currentUser.teacherId,
      toTeacherId:        clash.teacherId,
      studentId:          clash.studentId,
      enrolmentId:        clash.enrolmentId ?? null,
      requestedDate:      selDate,
      requestedStartTime: newSession.startTime,
      requestedEndTime:   newSession.endTime,
      requestedRoomId:    newSession.roomId,
      sessionId:          newSession.id,
      reason:             "",
    });
    setClashWarning(null);
    setBookSuccess(true);
    setDirty?.(false);
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
          const roomSess = combinedSessions
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
                  const en = enrolments.find(e => e.id === sess.enrolmentId);
                  const tc = teachers.find(t => t.id === sess.teacherId);
                  return (
                    <div key={sess.id}>
                      <SessionCard sess={sess} student={st} enrolment={en} teacher={tc} room={room}
                        onStatusChange={handleStatusChange}
                        onScheduleMakeup={handleScheduleMakeup}
                        onRemoveDeferral={removeDeferral}
                        onDeleteSession={handleDeleteSession}
                        T={T} currentUser={currentUser} />
                      {sess.isMakeup && (
                        <button
                          onClick={() => removeDeferral(sess.deferralId)}
                          style={{ background:"none", border:"none", color:T.muted, fontSize:10, cursor:"pointer", padding:"2px 0", fontFamily:"inherit" }}>
                          × Remove makeup
                        </button>
                      )}
                    </div>
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
        <Modal T={T} title="Book Session" onClose={() => { setBookModal(null); setBookSuccess(false); setDirty?.(false); }} width={400}>
          {bookSuccess ? (
            <div style={{ textAlign: "center", padding: "10px 0" }}>
              <div style={{ fontSize: 28, marginBottom: 12 }}>✅</div>
              <div style={{ fontSize: 14, color: T.text, fontWeight: 600, marginBottom: 8 }}>Session booked!</div>
              <Btn T={T} onClick={() => { setBookModal(null); setBookSuccess(false); setDirty?.(false); }}>Done</Btn>
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              <div style={{ background: T.bg, border: `1px solid ${T.border}`, borderRadius: 9, padding: "10px 13px", fontSize: 12, color: T.muted }}>
                Date: <strong style={{ color: T.text }}>{fmtDate(selDate)}</strong>
              </div>
              <Sel T={T} label="Teacher" value={bookForm.teacherId ?? ""}
                onChange={e => { setDirty?.(true); setBookForm(f => ({ ...f, teacherId: e.target.value })); }}>
                <option value="">— Select teacher —</option>
                {teachers.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
              </Sel>
              <Sel T={T} label="Student — instrument" value={bookForm.enrolmentId}
                onChange={e => { setDirty?.(true); setBookForm(f => ({ ...f, enrolmentId: e.target.value })); }}>
                {bookable.length === 0 && <option value="">No students</option>}
                {bookable.map(b => <option key={b.e.id} value={b.e.id}>{b.label}</option>)}
              </Sel>
              <div style={{ display: "flex", gap: 11 }}>
                <Sel T={T} label="Start Time" value={bookForm.startTime}
                  onChange={e => { setDirty?.(true); setBookTimeError(null); setBookForm(f => ({ ...f, startTime: e.target.value })); }}>
                  {HOURS.map(h => <option key={h}>{h}</option>)}
                </Sel>
                <Sel T={T} label="End Time" value={bookForm.endTime}
                  onChange={e => { setDirty?.(true); setBookTimeError(null); setBookForm(f => ({ ...f, endTime: e.target.value })); }}>
                  {HOURS.filter(h => h > bookForm.startTime).map(h => <option key={h}>{h}</option>)}
                </Sel>
              </div>
              {bookTimeError && (
                <div style={{ fontSize: 12, color: "#FF5A65", background: "rgba(255,90,101,0.08)", border: "0.6px solid rgba(255,90,101,0.35)", borderRadius: 6, padding: "7px 10px" }}>
                  {bookTimeError}
                </div>
              )}
              <div style={{ display: "flex", justifyContent: "flex-end", gap: 9, marginTop: 4 }}>
                <Btn T={T} variant="ghost" onClick={() => { setBookModal(null); setDirty?.(false); }}>Cancel</Btn>
                <Btn T={T} disabled={bookBusy} onClick={checkAndBook}>Check & Book</Btn>
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
