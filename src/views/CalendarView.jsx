import { useState, useMemo } from "react";
import { Btn, Badge, Card, SectionTitle, Sel, Inp, Modal, ShakeBox } from "../components/UI.jsx";
import TimeSelect from "../components/TimeSelect.jsx";
import { fmtDate, uid } from "../utils/helpers.js";
import { getMergedSessionsForDate, getHolidayName, getFifthWeekEnrolments, roomSupportsInstrument, defaultMakeupSlot, findMakeupConflicts } from "../domain/enrolments.js";
import { dayStatus, fifthKey, listCalendarDays } from "../domain/calendar.js";
import { timesOverlap, toMinutes, addMinutes } from "../domain/time.js";
import { TODAY, STATUS_META, HOURS } from "../data/seed.js";

// ─── Session Card — click to open attendance popup ────────────────────────────
function SessionCard({ sess, student, enrolment, teacher, room, onStatusChange, onScheduleMakeup, onRemoveDeferral, onDeleteSession, getSessionsOn, T, currentUser }) {
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
  // Default make-up slot: right after the original class, same length (12:30–13:00 → 13:00–13:30)
  const defaultSlot = defaultMakeupSlot(sess.startTime, sess.endTime);
  const [makeupStart,   setMakeupStart]   = useState(defaultSlot.startTime);
  const [makeupEnd,     setMakeupEnd]     = useState(defaultSlot.endTime);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deferShake,   setDeferShake]   = useState(0);

  const sm        = STATUS_META[sess.status] ?? { color: T.muted, bg: T.dim, label: "—" };
  const roomColor = room?.color ?? "#888";

  const isOwnSession  = !currentUser || currentUser.role !== "teacher" || sess.teacherId === currentUser.teacherId;
  const highlightOwn  = isOwnSession && currentUser?.role === "teacher";
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

  const makeupDate = `${makeupYear}-${String(makeupMonth).padStart(2,"0")}-${String(makeupDay).padStart(2,"0")}`;
  const makeupConflicts = showDefer && makeupEnd > makeupStart
    ? findMakeupConflicts(
        { studentId: sess.studentId, teacherId: sess.teacherId, roomId: sess.roomId, startTime: makeupStart, endTime: makeupEnd },
        getSessionsOn(makeupDate)
      )
    : [];
  const makeupError = makeupEnd <= makeupStart ? "End time must be after the start time."
    : makeupConflicts.length > 0 ? "That time is occupied — pick another slot." : null;

  // Moving the start keeps the class length
  function changeMakeupStart(v) {
    const len = toMinutes(makeupEnd) - toMinutes(makeupStart);
    setMakeupStart(v);
    if (len > 0) setMakeupEnd(addMinutes(v, len));
  }

  function handleSchedule() {
    if (makeupError) { setDeferShake(n => n + 1); return; }
    onScheduleMakeup(sess, makeupDate, makeupStart, makeupEnd);
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
          background: T.panel,
          // A teacher's own classes get an accent outline so they stand out from other teachers' bookings.
          border: sess.isDeferred ? `1px solid ${T.border}` : highlightOwn ? `1.5px solid ${T.accent}` : `1px solid ${roomColor}40`,
          borderLeft: sess.isDeferred ? `3px solid ${T.border2}` : `3px solid ${roomColor}`,
          borderRadius: 10, padding: sess.isDeferred ? "6px 12px" : "10px 12px",
          cursor: canMarkAttend ? "pointer" : "default",
          opacity: sess.status === "pending_approval" ? 0.75 : 1,
        }}
      >
        {sess.isDeferred ? (
          // Deferred class: one muted line (the make-up is where the class really happens). Click still opens it to undo.
          <div title={`Deferred — make-up on ${sess.makeupDate}`} style={{ display:"flex", alignItems:"center", gap:6, minWidth:0, opacity:0.5, filter:"saturate(0.3)" }}>
            <span style={{ fontSize:10, fontWeight:700, color:T.muted, flexShrink:0, textDecoration:"line-through" }}>{sess.startTime}</span>
            <span style={{ fontSize:11, color:T.muted, flex:1, minWidth:0, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{displayName}</span>
            <span style={{ fontSize:9, color:T.muted, flexShrink:0 }}>Deferred → {sess.makeupDate}</span>
          </div>
        ) : (<>
        <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:4 }}>
          <span style={{ fontSize:11, fontWeight:700, color:roomColor }}>{sess.startTime} – {sess.endTime}</span>
          <div style={{ display:"flex", alignItems:"center", gap:5 }}>
            {sess.isMakeup && (
              <span style={{ fontSize:9, background:"rgba(154,145,251,0.2)", color:"#9A91FB", borderRadius:2, padding:"1px 5px", border:"0.6px solid rgba(154,145,251,0.3)" }}>
                Makeup · from {sess.originalDate}
              </span>
            )}
            {isOwnSession && (sess.status !== "pending"
              ? <Badge label={sm.label} color={sm.color} bg={sm.bg} />
              : <span style={{ fontSize:10, color:T.muted }}>Not marked</span>
            )}
          </div>
        </div>
        <div style={{ fontSize:12, fontWeight:600, color:isOwnSession ? T.text : T.muted, marginBottom:2 }}>
          {displayName}{isOwnSession && enrolment?.instrument && <span style={{ fontWeight:500, color:roomColor }}> · {enrolment.instrument}</span>}
        </div>
        {isOwnSession && <div style={{ fontSize:11, color:T.muted }}>{teacher?.name ?? "—"}</div>}
        {sess.notes && isOwnSession && <div style={{ fontSize:10, color:T.muted, marginTop:3, fontStyle:"italic" }}>{sess.notes}</div>}
        </>)}
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

            {/* Cancel Booking — one-off (booked) sessions only, any role that can open the card */}
            {sess.isOneOff && (
              confirmDelete ? (
                <div style={{ background:"rgba(255,90,101,0.08)", border:"0.6px solid rgba(255,90,101,0.35)", borderRadius:7, padding:"10px 12px", marginBottom:10 }}>
                  <div style={{ fontSize:12, color:"#FF5A65", fontWeight:600, marginBottom:8 }}>Cancel this booking?</div>
                  <div style={{ display:"flex", gap:7 }}>
                    <button
                      onClick={() => { onDeleteSession(sess); setModalOpen(false); setConfirmDelete(false); }}
                      style={{
                        flex:1, padding:"8px 0", borderRadius:6, border:"none",
                        background:"#FF5A65", color:"#fff",
                        cursor:"pointer", fontFamily:"inherit", fontSize:12, fontWeight:700,
                      }}
                    >Yes, Cancel Booking</button>
                    <button
                      onClick={() => setConfirmDelete(false)}
                      style={{
                        flex:1, padding:"8px 0", borderRadius:6,
                        border:`0.6px solid ${T.border2}`, background:T.dim, color:T.muted,
                        cursor:"pointer", fontFamily:"inherit", fontSize:12, fontWeight:700,
                      }}
                    >Keep</button>
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
                >Cancel Booking</button>
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
                      <TimeSelect value={makeupStart} onChange={changeMakeupStart} style={inp} />
                      <span style={{ color:T.muted, fontSize:11, alignSelf:"center" }}>to</span>
                      <TimeSelect value={makeupEnd} onChange={setMakeupEnd} style={inp} />
                    </div>

                    {makeupError && (
                      <ShakeBox shake={deferShake} style={{ fontSize:11, color:"#FF5A65", marginBottom:8 }}>{makeupError}</ShakeBox>
                    )}

                    <button onClick={handleSchedule} aria-disabled={!!makeupError} style={{
                      width:"100%", padding:"9px 0", borderRadius:6, border:"none",
                      background:"#9A91FB", color:"#fff",
                      cursor: makeupError ? "not-allowed" : "pointer", opacity: makeupError ? 0.5 : 1,
                      fontFamily:"inherit", fontSize:12, fontWeight:700,
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
  students, enrolments, teachers, rooms, attendance, calendar, actions,
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
  const [bookShake,     setBookShake]     = useState(0);
  const [bookBusy,      setBookBusy]      = useState(false);

  const isTeacher  = currentUser?.role === "teacher";
  const isAdmin    = currentUser?.role === "admin" || currentUser?.role === "sysadmin";
  // An admin who also has a teacher profile can narrow the calendar to their own classes (still an admin: sees and edits everything otherwise)
  const [myOnly, setMyOnly] = useState(false);
  const canMyOnly = isAdmin && !!currentUser?.teacherId;
  const mineOnly  = isTeacher || (canMyOnly && myOnly);

  // Holiday / closure / 5th-week controls (admin only)
  const [calError,   setCalError]   = useState(null);
  const [calBusy,    setCalBusy]    = useState(false);
  const [closeForm,  setCloseForm]  = useState(null);          // { name } while the day's "mark closed" form is open
  const [addForm,    setAddForm]    = useState({ date: "", name: "" });
  async function runCal(fn) {
    setCalError(null); setCalBusy(true);
    try { await fn(); } catch (e) { setCalError(e.message); }
    setCalBusy(false);
  }

  const daySessions = useMemo(
    () => getMergedSessionsForDate(selDate, enrolments, attendance, calendar),
    [selDate, enrolments, attendance, calendar]
  );

  const allDaySessions = useMemo(() => {
    const oneOff = (oneOffSessions ?? []).filter(s => s.date === selDate);
    return [...daySessions, ...oneOff];
  }, [daySessions, oneOffSessions, selDate]);

  const makeupSessions = useMemo(() =>
    (deferrals ?? [])
      .filter(d => d.makeupDate === selDate && enrolments.some(e => e.id === d.enrolmentId))
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
      // Teachers see the badge count for their own classes only; the day view still shows every room's bookings.
      const mine = x => !mineOnly || x.teacherId === currentUser.teacherId;
      counts[dt] = getMergedSessionsForDate(dt, enrolments, attendance, calendar).filter(mine).length
        + (oneOffSessions ?? []).filter(s => s.date === dt && mine(s)).length
        + (deferrals ?? []).filter(d => d.makeupDate === dt && mine(d) && enrolments.some(e => e.id === d.enrolmentId)).length;
    }
    return counts;
  }, [calYear, calMonth, enrolments, attendance, calendar, oneOffSessions, deferrals, mineOnly, currentUser?.teacherId]);

  // Dates in the shown month where someone's 5th lesson is off (teachers: their own students only)
  const fifthWeekDates = useMemo(() => {
    const set = new Set();
    const daysInMonth = new Date(calYear, calMonth + 1, 0).getDate();
    for (let d = 1; d <= daysInMonth; d++) {
      const dt = `${calYear}-${String(calMonth + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
      if (getHolidayName(dt, calendar)) continue;
      if (getFifthWeekEnrolments(dt, enrolments, calendar)
        .some(e => !calendar?.fifth?.[fifthKey(e.id, dt)] && (!mineOnly || e.teacherId === currentUser.teacherId))) set.add(dt);
    }
    return set;
  }, [calYear, calMonth, enrolments, calendar, mineOnly, currentUser?.teacherId]);

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

  // Everything occupying a given date (used to block make-ups on taken slots). Deferred originals free their slot.
  function getSessionsOn(date) {
    const recurring = getMergedSessionsForDate(date, enrolments, attendance, calendar)
      .filter(x => !(deferrals ?? []).some(d => d.enrolmentId === x.enrolmentId && d.originalDate === date));
    const makeups = (deferrals ?? [])
      .filter(d => d.makeupDate === date)
      .map(d => {
        const e = enrolments.find(en => en.id === d.enrolmentId);
        return e && {
          studentId: e.studentId, teacherId: d.teacherId, roomId: e.schedule?.roomId,
          startTime: d.makeupStartTime ?? e.schedule?.startTime, endTime: d.makeupEndTime ?? e.schedule?.endTime,
        };
      }).filter(Boolean);
    return [...recurring, ...(oneOffSessions ?? []).filter(x => x.date === date), ...makeups];
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
    .filter(e => !mineOnly || e.teacherId === currentUser.teacherId)
    .map(e => ({ e, label: `${students.find(s => s.id === e.studentId)?.name ?? "?"} — ${e.instrument ?? "no instrument"}` }))
    .sort((a, b) => a.label.localeCompare(b.label));

  function openBookModal(roomId) {
    const defaultTeacherId = isTeacher || canMyOnly ? currentUser.teacherId : (teachers[0]?.id ?? "");
    setBookForm({ enrolmentId: bookable[0]?.e.id ?? "", startTime: "09:00", endTime: "10:00", teacherId: defaultTeacherId });
    setBookModal({ roomId });
    setBookSuccess(false);
    setClashWarning(null);
    setBookTimeError(null);
  }

  // Show a block message; if the same one is already showing (user retried), shake it
  function blockBook(msg) {
    if (msg && bookTimeError) setBookShake(n => n + 1);
    setBookTimeError(msg);
  }

  async function checkAndBook() {
    if (!bookForm.enrolmentId || !bookForm.startTime || !bookForm.endTime) return;
    if (bookForm.endTime <= bookForm.startTime) {
      blockBook("End time must be after start time.");
      return;
    }
    blockBook(null);
    const enrol   = enrolments.find(e => e.id === bookForm.enrolmentId);
    const { roomId } = bookModal;
    const room    = rooms.find(r => r.id === roomId);
    const teacherId = bookForm.teacherId || enrol?.teacherId || currentUser.teacherId;

    // Hard rules (no override): the room must suit the instrument, and neither the student nor
    // the teacher can be in two places at once.
    if (!roomSupportsInstrument(room, enrol?.instrument)) {
      blockBook(`${room?.name ?? "This room"} is not set up for ${enrol?.instrument ?? "this instrument"}.`);
      return;
    }
    const overlaps = s => s.status !== "pending_approval" && timesOverlap(bookForm.startTime, bookForm.endTime, s.startTime, s.endTime);
    if (combinedSessions.some(s => s.studentId === enrol?.studentId && overlaps(s))) {
      blockBook("This student already has another class at that time.");
      return;
    }
    if (combinedSessions.some(s => s.teacherId === teacherId && overlaps(s))) {
      blockBook("This teacher is already teaching at that time.");
      return;
    }

    // A booked room can still be requested from the other teacher (clash request flow) — teachers only.
    // Admins have no one to ask: they are told to move or remove the clashing class first.
    const roomSessions = combinedSessions.filter(s => s.roomId === roomId);
    const clash = roomSessions.find(s =>
      timesOverlap(bookForm.startTime, bookForm.endTime, s.startTime, s.endTime)
    );
    if (clash && isAdmin) {
      const who = students.find(x => x.id === clash.studentId)?.name ?? "a student";
      const by  = teachers.find(t => t.id === clash.teacherId)?.name ?? "another teacher";
      blockBook(`${room?.name ?? "This room"} is already booked ${clash.startTime}–${clash.endTime} (${who}, ${by}). Move or remove that class before booking here.`);
      return;
    }
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
      } catch (e) { blockBook(e.message); }
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
    <Card T={T} spot="calendar.month" style={{ padding: isMobile ? 12 : 16 }}>
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
              <span title={getHolidayName(dt, calendar) ?? (dayStatus(dt, calendar).overridden ? `${dayStatus(dt, calendar).builtin} (classes running)` : fifthWeekDates.has(dt) ? "5th week lesson" : undefined)} style={{ fontSize: isMobile ? 11 : 12, fontWeight: isSel || isToday ? 700 : 400, color: isSel ? T.accent : isToday ? T.accent + "cc" : getHolidayName(dt, calendar) ? "#FDB52A" : dayStatus(dt, calendar).overridden ? "#14CA74" : fifthWeekDates.has(dt) ? "#00C2FF" : T.text }}>{d}</span>
              {cnt > 0 && (
                <span style={{ fontSize: 9, background: T.accent, color: T.onAccent, borderRadius: 99, padding: "1px 5px", fontWeight: 700 }}>{cnt}</span>
              )}
            </div>
          );
        })}
      </div>
    </Card>
  );

  // Classes whose room no longer exists (room deleted after a stopped enrolment, or a make-up whose
  // enrolment is gone). They are in the date badge, so they must be visible somewhere.
  const orphanSessions = combinedSessions
    .filter(s => !rooms.some(r => r.id === s.roomId))
    .sort((a, b) => a.startTime.localeCompare(b.startTime));

  // 5th lesson of the month is off, per student. Teachers only see their own students.
  const fifthWeek = getFifthWeekEnrolments(selDate, enrolments, calendar)
    .filter(e => !mineOnly || e.teacherId === currentUser.teacherId);
  const fifthOff     = fifthWeek.filter(e => !calendar?.fifth?.[fifthKey(e.id, selDate)]);
  const fifthRunning = fifthWeek.filter(e =>  calendar?.fifth?.[fifthKey(e.id, selDate)]);
  const fifthLabel = e => `${students.find(s => s.id === e.studentId)?.name ?? "Student"} (${e.instrument ?? "class"} ${e.schedule.startTime})`;
  const dayInfo = dayStatus(selDate, calendar);
  const linkBtn = { background: "none", border: "none", color: T.accent, cursor: "pointer", fontSize: 11, fontWeight: 600, fontFamily: "inherit", padding: "0 0 0 8px" };

  const DayView = (
    <div>
      <div style={{ display: "flex", alignItems: "center", flexWrap: "wrap", gap: 10, marginBottom: 12 }}>
        <span style={{ fontSize: 14, fontWeight: 700, color: T.text }}>{fmtDate(selDate)}</span>
        {canMyOnly && (
          <label data-search="calendar.my-classes" style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 12, color: T.muted, cursor: "pointer" }}>
            <input type="checkbox" checked={myOnly} onChange={e => setMyOnly(e.target.checked)} /> My classes only
          </label>
        )}
        {dayInfo.closed && (
          <span style={{ fontSize: 11, fontWeight: 600, color: "#FDB52A", background: "#FDB52A18", border: "1px solid #FDB52A55", borderRadius: 4, padding: "2px 8px" }}>
            {dayInfo.source === "custom" ? "Closed" : "Public holiday"} · {dayInfo.name} · no classes
          </span>
        )}
        {dayInfo.overridden && (
          <span style={{ fontSize: 11, fontWeight: 600, color: "#14CA74", background: "#14CA7418", border: "1px solid #14CA7455", borderRadius: 4, padding: "2px 8px" }}>
            {dayInfo.builtin} · classes running
          </span>
        )}
        {isAdmin && (
          <span style={{ display: "inline-flex", gap: 6 }}>
            {dayInfo.closed && dayInfo.source === "public" && (
              <Btn T={T} data-search="calendar.run-holiday" variant="ghost" disabled={calBusy} style={{ padding: "3px 10px", fontSize: 11 }}
                onClick={() => runCal(() => actions.setDayOverride(selDate, "open"))}>Run classes</Btn>
            )}
            {dayInfo.closed && dayInfo.source === "custom" && (
              <Btn T={T} variant="ghost" disabled={calBusy} style={{ padding: "3px 10px", fontSize: 11 }}
                onClick={() => runCal(() => actions.clearDayOverride(selDate))}>Remove closure</Btn>
            )}
            {dayInfo.overridden && (
              <Btn T={T} variant="ghost" disabled={calBusy} style={{ padding: "3px 10px", fontSize: 11 }}
                onClick={() => runCal(() => actions.clearDayOverride(selDate))}>Undo</Btn>
            )}
            {!dayInfo.closed && !dayInfo.overridden && !closeForm && (
              <Btn T={T} data-search="calendar.close-day" variant="ghost" style={{ padding: "3px 10px", fontSize: 11 }}
                onClick={() => setCloseForm({ name: "" })}>Mark day closed</Btn>
            )}
          </span>
        )}
      </div>
      {isAdmin && closeForm && !dayInfo.closed && (
        <div style={{ display: "flex", gap: 8, alignItems: "flex-end", marginBottom: 12 }}>
          <Inp T={T} label="Closure name" placeholder="e.g. Studio closed – flood" value={closeForm.name}
            onChange={e => setCloseForm({ name: e.target.value })} />
          <Btn T={T} disabled={calBusy} onClick={() => runCal(async () => { await actions.setDayOverride(selDate, "closed", closeForm.name); setCloseForm(null); })}>Close day</Btn>
          <Btn T={T} variant="ghost" onClick={() => { setCloseForm(null); setCalError(null); }}>Cancel</Btn>
        </div>
      )}
      {calError && <div style={{ color: "#FF5A65", fontSize: 12, marginBottom: 10 }}>{calError}</div>}
      {fifthOff.length > 0 && !dayInfo.closed && (
        <div style={{ marginBottom: 12, border: `1px solid #00C2FF55`, background: "#00C2FF12", borderRadius: 9, padding: "8px 10px" }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: T.text, marginBottom: 4 }}>
            5th week lesson · no class
            {isAdmin && fifthOff.length > 1 && (
              <button style={linkBtn} disabled={calBusy}
                onClick={() => runCal(() => actions.runFifthLessons(selDate, fifthOff.map(e => e.id)))}>Run all</button>
            )}
          </div>
          {fifthOff.map(e => (
            <div key={e.id} style={{ fontSize: 11, color: T.muted, padding: "2px 0" }}>
              {fifthLabel(e)}
              {isAdmin && <button style={linkBtn} disabled={calBusy} onClick={() => runCal(() => actions.runFifthLessons(selDate, [e.id]))}>Run</button>}
            </div>
          ))}
        </div>
      )}
      {fifthRunning.length > 0 && !dayInfo.closed && (
        <div style={{ marginBottom: 12, border: `1px solid #14CA7455`, background: "#14CA7412", borderRadius: 9, padding: "8px 10px" }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: T.text, marginBottom: 4 }}>5th week lesson · running</div>
          {fifthRunning.map(e => (
            <div key={e.id} style={{ fontSize: 11, color: T.muted, padding: "2px 0" }}>
              {fifthLabel(e)}
              {isAdmin && <button style={linkBtn} disabled={calBusy} onClick={() => runCal(() => actions.clearFifthLesson(selDate, e.id))}>Undo</button>}
            </div>
          ))}
        </div>
      )}
      {rooms.length === 0 && <p style={{ color: T.muted, fontSize: 13 }}>No rooms configured.</p>}
      {orphanSessions.length > 0 && (
        <div style={{ marginBottom: 14, border: `1px solid #FDB52A55`, background: "#FDB52A12", borderRadius: 9, padding: 10 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: T.text, marginBottom: 2 }}>No room</div>
          <div style={{ fontSize: 11, color: T.muted, marginBottom: 8 }}>
            These classes point to a room that no longer exists.
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
            {orphanSessions.map(sess => (
              <SessionCard key={sess.id} sess={sess}
                student={students.find(s => s.id === sess.studentId)}
                enrolment={enrolments.find(e => e.id === sess.enrolmentId)}
                teacher={teachers.find(t => t.id === sess.teacherId)}
                room={null}
                onStatusChange={handleStatusChange}
                onScheduleMakeup={handleScheduleMakeup}
                onRemoveDeferral={removeDeferral}
                onDeleteSession={handleDeleteSession}
                        getSessionsOn={getSessionsOn}
                T={T} currentUser={currentUser} />
            ))}
          </div>
        </div>
      )}
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
                        getSessionsOn={getSessionsOn}
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
                <button data-search="calendar.book" onClick={() => openBookModal(room.id)} style={{
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

  const upcomingDays = listCalendarDays(calYear, calendar).filter(d => d.date >= TODAY); // passed ones are hidden
  const HolidaysPanel = isAdmin && (
    <Card T={T} style={{ padding: isMobile ? 12 : 16, marginTop: 14 }}>
      <SectionTitle T={T}>Holidays & closures · {calYear}</SectionTitle>
      <div style={{ fontSize: 11, color: T.muted, marginBottom: 10 }}>
        Public holidays have no classes. Run a holiday to hold classes anyway, or add a closure of your own.
      </div>
      {upcomingDays.length === 0 && <div style={{ fontSize: 11, color: T.dim, padding: "6px 0" }}>No upcoming holidays or closures in {calYear}.</div>}
      {upcomingDays.map(d => (
        <div key={d.date} style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 0", borderTop: `0.6px solid ${T.border}`, fontSize: 12 }}>
          <button onClick={() => { setSelDate(d.date); setCalMonth(Number(d.date.slice(5, 7)) - 1); }}
            style={{ background: "none", border: "none", cursor: "pointer", color: T.text, fontFamily: "inherit", fontSize: 12, textAlign: "left", flex: 1, padding: 0 }}>
            <span style={{ color: T.muted }}>{d.date.slice(5)} </span>{d.closed ? d.name : d.builtin}
          </button>
          <span style={{ fontSize: 10, fontWeight: 600, color: d.closed ? "#FDB52A" : "#14CA74" }}>{d.closed ? "Closed" : "Running"}</span>
          <Btn T={T} variant="ghost" disabled={calBusy} style={{ padding: "2px 8px", fontSize: 10 }}
            onClick={() => runCal(() => d.closed && d.source === "public" ? actions.setDayOverride(d.date, "open") : actions.clearDayOverride(d.date))}>
            {d.closed && d.source === "public" ? "Run" : d.source === "custom" ? "Remove" : "Undo"}
          </Btn>
        </div>
      ))}
      <div style={{ display: "flex", gap: 8, alignItems: "flex-end", marginTop: 10, flexWrap: "wrap" }}>
        <Inp T={T} label="Date" type="date" value={addForm.date} onChange={e => setAddForm(f => ({ ...f, date: e.target.value }))} />
        <Inp T={T} label="Closure name" placeholder="e.g. Hari Raya" value={addForm.name} onChange={e => setAddForm(f => ({ ...f, name: e.target.value }))} />
        <Btn T={T} disabled={calBusy}
          onClick={() => runCal(async () => { await actions.setDayOverride(addForm.date, "closed", addForm.name); setAddForm({ date: "", name: "" }); })}>+ Add</Btn>
      </div>
    </Card>
  );
  const MonthSide = <div>{MonthGrid}{HolidaysPanel}</div>;

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
              {!isTeacher && (
                <Sel T={T} label="Teacher" value={bookForm.teacherId ?? ""}
                  onChange={e => { setDirty?.(true); setBookForm(f => ({ ...f, teacherId: e.target.value })); }}>
                  <option value="">— Select teacher —</option>
                  {teachers.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                </Sel>
              )}
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
                <ShakeBox shake={bookShake} style={{ fontSize: 12, color: "#FF5A65", background: "rgba(255,90,101,0.08)", border: "0.6px solid rgba(255,90,101,0.35)", borderRadius: 6, padding: "7px 10px" }}>
                  {bookTimeError}
                </ShakeBox>
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
              {rooms.find(r => r.id === clashWarning.newSession.roomId)?.name ?? "This room"} is occupied at{" "}
              {clashWarning.newSession.startTime}–{clashWarning.newSession.endTime}. A clash request will be sent
              {isTeacher ? " to the teacher using it" : ` to ${clashWarning.clashTeacher?.name ?? "the teacher using it"}`} for approval.
            </div>
            <div style={{ fontSize: 12, color: T.muted, lineHeight: 1.6 }}>
              Your session will be saved as <strong style={{ color: "#94a3b8" }}>Pending Approval</strong> and
              will become active once it is approved.
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
          {MonthSide}
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
        <div data-search="calendar.views" style={{ display: "flex", gap: 6 }}>
          {[["both","Both"],["month","Month"],["day","Day"]].map(([id, label]) => (
            <Btn key={id} T={T} variant={viewMode === id ? "active" : "ghost"}
              style={{ padding: "6px 14px", fontSize: 12 }} onClick={() => setViewMode(id)}>{label}</Btn>
          ))}
        </div>
      </div>

      {viewMode === "month" && MonthSide}
      {viewMode === "day"   && DayView}
      {viewMode === "both"  && (
        <div style={{ display: "grid", gridTemplateColumns: "320px 1fr", gap: 16, alignItems: "start" }}>
          {MonthSide}
          <div>{DayView}</div>
        </div>
      )}

      {bookingModals}
    </div>
  );
}
