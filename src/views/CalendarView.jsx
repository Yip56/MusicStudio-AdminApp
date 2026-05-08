import { useState, useMemo } from "react";
import { Btn, Badge, Card, SectionTitle } from "../components/UI.jsx";
import { getMergedSessionsForDate, getRecurringDates, fmtDate, uid } from "../utils/helpers.js";
import { TODAY, STATUS_META, DAYS_OF_WEEK } from "../data/seed.js";

// ─── Session Card with hover attendance ──────────────────────────────────────
function SessionCard({ sess, student, teacher, room, onStatusChange, T }) {
  const [hovered, setHovered] = useState(false);
  const sm = STATUS_META[sess.status] ?? { color: T.muted, bg: T.dim, label: "—" };
  const roomColor = room?.color ?? "#888";

  return (
    <div
      style={{ position: "relative" }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      {/* Attendance picker sits flush against the card top — no gap so the mouse never crosses empty space */}
      {hovered && (
        <div style={{
          position: "absolute", bottom: "100%", left: 0, zIndex: 50,
          background: T.panel, border: `1px solid ${T.border2}`, borderRadius: 10,
          padding: "6px", display: "flex", gap: 6, boxShadow: "0 4px 20px rgba(0,0,0,0.4)",
          whiteSpace: "nowrap"
        }}>
          {Object.entries(STATUS_META).map(([key, meta]) => (
            <button key={key} onClick={e => { e.stopPropagation(); onStatusChange(sess.studentId, sess.date, key); }}
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

      <div style={{
        background: T.panel, border: `1px solid ${roomColor}40`,
        borderLeft: `3px solid ${roomColor}`, borderRadius: 10, padding: "10px 12px",
        cursor: "pointer", transition: "box-shadow 0.15s",
        boxShadow: hovered ? `0 0 0 2px ${roomColor}60` : "none"
      }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
          <span style={{ fontSize: 11, fontWeight: 700, color: roomColor }}>{sess.startTime} – {sess.endTime}</span>
          {sess.status !== "pending"
            ? <Badge label={sess.status} color={sm.color} bg={sm.bg} />
            : <span style={{ fontSize: 10, color: T.muted }}>Not marked</span>
          }
        </div>
        {student && <div style={{ fontSize: 12, fontWeight: 600, color: T.text, marginBottom: 2 }}>{student.name}</div>}
        <div style={{ fontSize: 11, color: T.muted }}>{teacher?.name ?? "—"}</div>
        {sess.notes && <div style={{ fontSize: 10, color: T.muted, marginTop: 3, fontStyle: "italic" }}>{sess.notes}</div>}
      </div>
    </div>
  );
}

// ─── Main Calendar view ───────────────────────────────────────────────────────
export default function CalendarView({ students, teachers, rooms, attendanceOverrides, setAttendanceOverrides, T }) {
  const today = new Date();
  const [selDate, setSelDate]   = useState(TODAY);
  const [calYear,  setCalYear]  = useState(today.getFullYear());
  const [calMonth, setCalMonth] = useState(today.getMonth());
  const [viewMode, setViewMode] = useState("both"); // "both" | "month" | "day"

  const daySessions = useMemo(
    () => getMergedSessionsForDate(selDate, students, attendanceOverrides),
    [selDate, students, attendanceOverrides]
  );

  // Build a count of sessions per date for the month
  const monthSessionCounts = useMemo(() => {
    const counts = {};
    const year = calYear, month = calMonth;
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    for (let d = 1; d <= daysInMonth; d++) {
      const dt = `${year}-${String(month + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
      counts[dt] = getMergedSessionsForDate(dt, students, attendanceOverrides).length;
    }
    return counts;
  }, [calYear, calMonth, students, attendanceOverrides]);

  function handleStatusChange(studentId, date, status) {
    setAttendanceOverrides(prev => {
      const existing = prev.find(a => a.studentId === studentId && a.date === date);
      if (existing) return prev.map(a => a.studentId === studentId && a.date === date ? { ...a, status } : a);
      return [...prev, { id: uid(), studentId, date, status, notes: "" }];
    });
  }

  // Calendar grid
  const daysInMonth = new Date(calYear, calMonth + 1, 0).getDate();
  const firstDow    = new Date(calYear, calMonth, 1).getDay();
  const cells       = [...Array(firstDow).fill(null), ...Array.from({ length: daysInMonth }, (_, i) => i + 1)];

  function prevMonth() {
    const d = new Date(calYear, calMonth - 1, 1);
    setCalYear(d.getFullYear()); setCalMonth(d.getMonth());
  }
  function nextMonth() {
    const d = new Date(calYear, calMonth + 1, 1);
    setCalYear(d.getFullYear()); setCalMonth(d.getMonth());
  }

  const MonthGrid = (
    <Card T={T} style={{ padding: 16 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
        <Btn T={T} variant="ghost" style={{ padding: "4px 11px" }} onClick={prevMonth}>‹</Btn>
        <span style={{ fontWeight: 700, color: T.text, fontSize: 14 }}>
          {new Date(calYear, calMonth, 1).toLocaleDateString("en-MY", { month: "long", year: "numeric" })}
        </span>
        <Btn T={T} variant="ghost" style={{ padding: "4px 11px" }} onClick={nextMonth}>›</Btn>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(7,1fr)", gap: 3 }}>
        {["Su","Mo","Tu","We","Th","Fr","Sa"].map(d => (
          <div key={d} style={{ textAlign: "center", fontSize: 10, color: T.muted, padding: "3px 0", fontWeight: 700 }}>{d}</div>
        ))}
        {cells.map((d, i) => {
          if (!d) return <div key={`e${i}`} />;
          const dt = `${calYear}-${String(calMonth + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
          const cnt    = monthSessionCounts[dt] ?? 0;
          const isSel  = dt === selDate;
          const isToday = dt === TODAY;
          return (
            <div key={d} onClick={() => { setSelDate(dt); }}
              style={{
                borderRadius: 7, padding: "5px 3px", textAlign: "center", cursor: "pointer",
                background: isSel ? T.accent + "22" : isToday ? T.hover : "transparent",
                border: `1px solid ${isSel ? T.accent : isToday ? T.border2 : "transparent"}`,
                minHeight: 44, display: "flex", flexDirection: "column", alignItems: "center", gap: 2,
                transition: "background 0.1s"
              }}>
              <span style={{ fontSize: 12, fontWeight: isSel || isToday ? 700 : 400, color: isSel ? T.accent : isToday ? T.accent + "cc" : T.text }}>{d}</span>
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
        <span style={{ fontSize: 14, fontWeight: 700, color: T.text }}>
          {fmtDate(selDate)}
        </span>
      </div>
      {rooms.length === 0 && <p style={{ color: T.muted, fontSize: 13 }}>No rooms configured.</p>}
      <div style={{ display: "grid", gridTemplateColumns: `repeat(${Math.min(rooms.length, 4)}, 1fr)`, gap: 10 }}>
        {rooms.map(room => {
          const roomSess = daySessions.filter(s => s.roomId === room.id).sort((a, b) => a.startTime.localeCompare(b.startTime));
          return (
            <div key={room.id}>
              <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 7 }}>
                <div style={{ width: 9, height: 9, borderRadius: 2, background: room.color }} />
                <span style={{ fontSize: 12, fontWeight: 700, color: T.text }}>{room.name}</span>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 7, minHeight: 80 }}>
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
                      onStatusChange={handleStatusChange} T={T} />
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );

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
    </div>
  );
}
