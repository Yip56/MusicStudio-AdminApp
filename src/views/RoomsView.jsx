import { useState, useMemo } from "react";
import { Card, Btn, Badge, Modal, Inp, Sel, SectionTitle } from "../components/UI.jsx";
import { TODAY, INSTRUMENTS, ROOM_COLORS, STATUS_META } from "../data/seed.js";
import { getMergedSessionsForDate, uid } from "../utils/helpers.js";

export default function RoomsView({ rooms, setRooms, students, teachers, attendanceOverrides, T, isMobile }) {
  const [selRoom,  setSelRoom]  = useState(null);
  const [modal,    setModal]    = useState(null);
  const [form,     setForm]     = useState({});
  const [filter,   setFilter]   = useState("all");
  const [viewDate, setViewDate] = useState(TODAY);

  const roomSessions = useMemo(() => {
    if (!selRoom) return [];
    return getMergedSessionsForDate(viewDate, students, attendanceOverrides)
      .filter(s => s.roomId === selRoom.id)
      .sort((a, b) => a.startTime.localeCompare(b.startTime));
  }, [selRoom, viewDate, students, attendanceOverrides]);

  const todaySessions = useMemo(() => getMergedSessionsForDate(TODAY, students, attendanceOverrides), [students, attendanceOverrides]);

  const filteredRooms = rooms.filter(r => {
    const occupied = todaySessions.some(s => s.roomId === r.id);
    if (filter === "free")     return !occupied;
    if (filter === "occupied") return occupied;
    return true;
  });

  function openAdd()   { setForm({ name: "", type: "Piano", color: ROOM_COLORS[0] }); setModal("add"); }
  function openEdit(r) { setForm({ ...r }); setModal(r); }
  function save() {
    if (!form.name.trim()) return;
    if (modal === "add") setRooms(p => [...p, { ...form, id: uid() }]);
    else setRooms(p => p.map(r => r.id === modal.id ? { ...form, id: r.id } : r));
    setModal(null);
  }
  function remove(id) { if (confirm("Remove room?")) { setRooms(p => p.filter(r => r.id !== id)); if (selRoom?.id === id) setSelRoom(null); } }

  const roomDetailPanel = selRoom && (
    <Card T={T} style={{ padding: 0, overflow: "hidden" }}>
      <div style={{ padding: "14px 16px", borderBottom: `1px solid ${T.border}`, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
          <div style={{ width: 12, height: 12, borderRadius: 3, background: selRoom.color }} />
          <span style={{ fontSize: 15, fontWeight: 700, color: T.text }}>{selRoom.name}</span>
          <span style={{ fontSize: 11, color: T.muted }}>— Availability</span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <input type="date" value={viewDate} onChange={e => setViewDate(e.target.value)}
            style={{ background: T.input, border: `1px solid ${T.border2}`, borderRadius: 7, color: T.text, padding: "5px 9px", fontSize: 12, outline: "none", fontFamily: "inherit" }} />
          <button onClick={() => setSelRoom(null)} style={{ background: "none", border: "none", color: T.muted, fontSize: 16, cursor: "pointer" }}>✕</button>
        </div>
      </div>

      {roomSessions.length === 0 ? (
        <div style={{ padding: 24, textAlign: "center", color: T.muted, fontSize: 13 }}>
          Room is fully available on this date.
        </div>
      ) : (
        <div>
          {roomSessions.map((sess, i) => {
            const st = students.find(s => s.id === sess.studentId);
            const tc = teachers.find(t => t.id === sess.teacherId);
            const sm = STATUS_META[sess.status] ?? { color: T.muted, bg: T.dim, label: "Pending" };
            return (
              <div key={sess.id} style={{
                display: "flex", alignItems: "center", gap: 14, padding: "12px 16px",
                borderBottom: i < roomSessions.length - 1 ? `1px solid ${T.border}` : "none"
              }}>
                <div style={{ minWidth: 90, textAlign: "center", background: selRoom.color + "15",
                  border: `1px solid ${selRoom.color}30`, borderRadius: 8, padding: "6px 8px" }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: selRoom.color }}>{sess.startTime}</div>
                  <div style={{ fontSize: 10, color: T.muted }}>to</div>
                  <div style={{ fontSize: 12, fontWeight: 700, color: selRoom.color }}>{sess.endTime}</div>
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: T.text }}>{st?.name ?? "?"}</div>
                  <div style={{ fontSize: 11, color: T.muted, marginTop: 2 }}>{tc?.name ?? "?"}</div>
                  {sess.notes && <div style={{ fontSize: 10, color: T.muted, fontStyle: "italic", marginTop: 2 }}>{sess.notes}</div>}
                </div>
                <Badge label={sess.status === "pending" ? "Not marked" : sess.status}
                  color={sm.color} bg={sm.bg} />
              </div>
            );
          })}
        </div>
      )}

      <div style={{ padding: "12px 16px", borderTop: `1px solid ${T.border}` }}>
        <SectionTitle T={T}>Timeline (8:00 – 20:00)</SectionTitle>
        <div style={{ position: "relative", height: 28, background: T.bg, borderRadius: 6, overflow: "hidden" }}>
          {roomSessions.map(sess => {
            const toMin = t => { const [h, m] = t.split(":").map(Number); return (h - 8) * 60 + m; };
            const total = 12 * 60;
            const left  = (toMin(sess.startTime) / total) * 100;
            const width = ((toMin(sess.endTime) - toMin(sess.startTime)) / total) * 100;
            return (
              <div key={sess.id} title={`${sess.startTime}–${sess.endTime}`}
                style={{ position: "absolute", top: 2, height: 24, left: `${left}%`, width: `${Math.max(width, 1)}%`,
                  background: selRoom.color, borderRadius: 4, opacity: 0.85 }} />
            );
          })}
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", marginTop: 3, fontSize: 9, color: T.muted }}>
          {["8am","10am","12pm","2pm","4pm","6pm","8pm"].map(t => <span key={t}>{t}</span>)}
        </div>
      </div>
    </Card>
  );

  const roomModal = modal && (
    <Modal T={T} title={modal === "add" ? "Add Room" : "Edit Room"} onClose={() => setModal(null)}>
      <div style={{ display: "flex", flexDirection: "column", gap: 13 }}>
        <Inp T={T} label="Room Name" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
        <Sel T={T} label="Room Type" value={form.type} onChange={e => setForm(f => ({ ...f, type: e.target.value }))}>
          {INSTRUMENTS.map(i => <option key={i}>{i}</option>)}
        </Sel>
        <div>
          <div style={{ fontSize: 11, color: T.muted, marginBottom: 8, textTransform: "uppercase", letterSpacing: "0.06em" }}>Color</div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {ROOM_COLORS.map(c => (
              <button key={c} onClick={() => setForm(f => ({ ...f, color: c }))}
                style={{ width: 26, height: 26, borderRadius: 6, background: c, border: "none", cursor: "pointer",
                  outline: form.color === c ? "2px solid white" : "2px solid transparent", outlineOffset: 2 }} />
            ))}
          </div>
        </div>
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 9, marginTop: 4 }}>
          <Btn T={T} variant="ghost" onClick={() => setModal(null)}>Cancel</Btn>
          <Btn T={T} onClick={save}>{modal === "add" ? "Add Room" : "Save"}</Btn>
        </div>
      </div>
    </Modal>
  );

  // ── Mobile layout ─────────────────────────────────────────────────────────────
  if (isMobile) {
    return (
      <div>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
          <h2 style={{ fontSize: 18, fontWeight: 800, color: T.text }}>Rooms</h2>
          <Btn T={T} onClick={openAdd} style={{ padding: "7px 14px", fontSize: 12 }}>+ Add</Btn>
        </div>

        {/* Filter tabs */}
        <div style={{ display: "flex", gap: 6, marginBottom: 12 }}>
          {["all","free","occupied"].map(f => (
            <Btn key={f} T={T} variant={filter === f ? "active" : "ghost"}
              style={{ flex: 1, padding: "7px 0", fontSize: 12 }}
              onClick={() => setFilter(f)}>
              {f.charAt(0).toUpperCase() + f.slice(1)}
            </Btn>
          ))}
        </div>

        {/* Room cards — single column */}
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {filteredRooms.map(r => {
            const occupied = todaySessions.filter(s => s.roomId === r.id);
            const isSelected = selRoom?.id === r.id;
            return (
              <div key={r.id}>
                <div onClick={() => setSelRoom(isSelected ? null : r)}
                  style={{
                    background: T.panel, borderRadius: 14, padding: "14px 16px",
                    border: `1px solid ${isSelected ? r.color : T.border}`,
                    borderLeft: `4px solid ${r.color}`,
                    cursor: "pointer"
                  }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                    <div>
                      <div style={{ fontSize: 14, fontWeight: 700, color: T.text }}>{r.name}</div>
                      <div style={{ fontSize: 11, color: T.muted, marginTop: 2 }}>{r.type}</div>
                    </div>
                    <div style={{ display: "flex", gap: 5 }}>
                      <Btn T={T} variant="ghost" style={{ padding: "3px 9px", fontSize: 11 }} onClick={e => { e.stopPropagation(); openEdit(r); }}>Edit</Btn>
                      <Btn T={T} variant="danger" style={{ padding: "3px 9px", fontSize: 11 }} onClick={e => { e.stopPropagation(); remove(r.id); }}>✕</Btn>
                    </div>
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    {occupied.length === 0
                      ? <Badge label="Free today" color="#4ade80" bg="#052e16" />
                      : <Badge label={`${occupied.length} session${occupied.length > 1 ? "s" : ""} today`} color="#fbbf24" bg="#451a03" />
                    }
                    <span style={{ fontSize: 11, color: T.muted }}>{isSelected ? "▲ hide" : "▼ details"}</span>
                  </div>
                </div>

                {/* Inline detail panel on mobile */}
                {isSelected && (
                  <div style={{ marginTop: 8 }}>
                    {roomDetailPanel}
                  </div>
                )}
              </div>
            );
          })}
          {filteredRooms.length === 0 && (
            <p style={{ color: T.muted, fontSize: 13, textAlign: "center", paddingTop: 20 }}>No rooms match this filter.</p>
          )}
        </div>

        {roomModal}
      </div>
    );
  }

  // ── Desktop layout ────────────────────────────────────────────────────────────
  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 18 }}>
        <h2 style={{ fontSize: 22, fontWeight: 800, color: T.text }}>Rooms</h2>
        <div style={{ display: "flex", gap: 7, alignItems: "center" }}>
          {["all","free","occupied"].map(f => (
            <Btn key={f} T={T} variant={filter === f ? "active" : "ghost"}
              style={{ padding: "6px 13px", fontSize: 12 }}
              onClick={() => setFilter(f)}>
              {f.charAt(0).toUpperCase() + f.slice(1)}
            </Btn>
          ))}
          <Btn T={T} onClick={openAdd} style={{ marginLeft: 6 }}>+ Add Room</Btn>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: selRoom ? "1fr 1.6fr" : "1fr", gap: 14 }}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: 10, alignContent: "start" }}>
          {filteredRooms.map(r => {
            const occupied = todaySessions.filter(s => s.roomId === r.id);
            const isSelected = selRoom?.id === r.id;
            return (
              <div key={r.id}
                onClick={() => setSelRoom(isSelected ? null : r)}
                style={{
                  background: T.panel, borderRadius: 12, padding: "14px 16px",
                  border: `1px solid ${isSelected ? r.color : T.border}`,
                  borderLeft: `4px solid ${r.color}`,
                  cursor: "pointer", transition: "border-color 0.15s",
                  boxShadow: isSelected ? `0 0 0 1px ${r.color}40` : "none"
                }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 8 }}>
                  <div>
                    <div style={{ fontSize: 14, fontWeight: 700, color: T.text }}>{r.name}</div>
                    <div style={{ fontSize: 11, color: T.muted, marginTop: 2 }}>{r.type}</div>
                  </div>
                  <div style={{ display: "flex", gap: 5 }}>
                    <Btn T={T} variant="ghost" style={{ padding: "3px 9px", fontSize: 11 }} onClick={e => { e.stopPropagation(); openEdit(r); }}>Edit</Btn>
                    <Btn T={T} variant="danger" style={{ padding: "3px 9px", fontSize: 11 }} onClick={e => { e.stopPropagation(); remove(r.id); }}>✕</Btn>
                  </div>
                </div>
                {occupied.length === 0
                  ? <Badge label="Free today" color="#4ade80" bg="#052e16" />
                  : <Badge label={`${occupied.length} session${occupied.length > 1 ? "s" : ""} today`} color="#fbbf24" bg="#451a03" />
                }
              </div>
            );
          })}
          {filteredRooms.length === 0 && (
            <p style={{ color: T.muted, fontSize: 13 }}>No rooms match this filter.</p>
          )}
        </div>

        {roomDetailPanel}
      </div>

      {roomModal}
    </div>
  );
}
