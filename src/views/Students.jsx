import { useState } from "react";
import { Avatar, Badge, Card, Inp, Sel, Btn, Modal, THead, Checkbox, SectionTitle } from "../components/UI.jsx";
import { GRADE_LABELS, INSTRUMENTS, DAYS_OF_WEEK, HOURS } from "../data/seed.js";
import { uid } from "../utils/helpers.js";

const BLANK = {
  name: "", instrument: "Piano", grade: "No Grade", teacherId: "",
  attendanceBased: false,
  schedule: { dayOfWeek: 6, startTime: "09:00", endTime: "10:00", roomId: "" }
};

export default function Students({ students, setStudents, teachers, rooms, T }) {
  const [search, setSearch] = useState("");
  const [modal, setModal]   = useState(null);
  const [form, setForm]     = useState(BLANK);

  const filtered = students.filter(s =>
    s.name.toLowerCase().includes(search.toLowerCase()) ||
    s.instrument.toLowerCase().includes(search.toLowerCase())
  );

  function openAdd()   { setForm({ ...BLANK, teacherId: teachers[0]?.id ?? "", schedule: { ...BLANK.schedule, roomId: rooms[0]?.id ?? "" } }); setModal("add"); }
  function openEdit(s) { setForm({ ...s, schedule: { ...s.schedule } }); setModal(s); }

  function save() {
    if (!form.name.trim()) return;
    const entry = {
      ...form,
      schedule: { ...form.schedule, dayOfWeek: Number(form.schedule.dayOfWeek) }
    };
    if (modal === "add") setStudents(p => [...p, { ...entry, id: uid() }]);
    else setStudents(p => p.map(s => s.id === modal.id ? { ...entry, id: s.id } : s));
    setModal(null);
  }

  function remove(id) { if (confirm("Remove this student?")) setStudents(p => p.filter(s => s.id !== id)); }

  function setSched(key, val) { setForm(f => ({ ...f, schedule: { ...f.schedule, [key]: val } })); }

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 18 }}>
        <h2 style={{ fontSize: 22, fontWeight: 800, color: T.text }}>Students</h2>
        <div style={{ display: "flex", gap: 10 }}>
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search…"
            style={{ background: T.panel, border: `1px solid ${T.border2}`, borderRadius: 8, color: T.text, padding: "7px 13px", fontSize: 13, outline: "none", fontFamily: "inherit" }} />
          <Btn T={T} onClick={openAdd}>+ Add Student</Btn>
        </div>
      </div>

      <Card T={T} style={{ padding: 0, overflow: "hidden" }}>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <THead T={T} cols={["Student", "Instrument", "Grade", "Teacher", "Class Day", "Time", "Att. Based", "Actions"]} />
          <tbody>
            {filtered.map((s, i) => {
              const teacher = teachers.find(t => t.id === s.teacherId);
              const room    = rooms.find(r => r.id === s.schedule?.roomId);
              return (
                <tr key={s.id} style={{ borderBottom: `1px solid ${T.border}`, background: i % 2 ? T.rowAlt : "transparent" }}>
                  <td style={{ padding: "11px 14px" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
                      <Avatar name={s.name} size={30} />
                      <div>
                        <div style={{ fontSize: 13, color: T.text, fontWeight: 500 }}>{s.name}</div>
                        {room && <div style={{ fontSize: 10, color: T.muted }}>{room.name}</div>}
                      </div>
                    </div>
                  </td>
                  <td style={{ padding: "11px 14px", fontSize: 13, color: T.textSub }}>{s.instrument}</td>
                  <td style={{ padding: "11px 14px" }}><Badge label={s.grade} color={T.accent} bg={T.accent + "18"} /></td>
                  <td style={{ padding: "11px 14px", fontSize: 13, color: T.textSub }}>{teacher?.name ?? "—"}</td>
                  <td style={{ padding: "11px 14px", fontSize: 12, color: T.textSub }}>{DAYS_OF_WEEK[s.schedule?.dayOfWeek ?? 0]}</td>
                  <td style={{ padding: "11px 14px", fontSize: 12, color: T.muted }}>{s.schedule?.startTime} – {s.schedule?.endTime}</td>
                  <td style={{ padding: "11px 14px" }}>
                    {s.attendanceBased
                      ? <Badge label="Att. Based" color="#60a5fa" bg="#0c1a2e" />
                      : <Badge label="Full Fee"   color={T.muted}  bg={T.dim} />
                    }
                  </td>
                  <td style={{ padding: "11px 14px" }}>
                    <div style={{ display: "flex", gap: 6 }}>
                      <Btn T={T} variant="ghost" style={{ padding: "5px 11px", fontSize: 11 }} onClick={() => openEdit(s)}>Edit</Btn>
                      <Btn T={T} variant="danger" style={{ padding: "5px 11px", fontSize: 11 }} onClick={() => remove(s.id)}>Remove</Btn>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </Card>

      {modal && (
        <Modal T={T} title={modal === "add" ? "Add Student" : "Edit Student"} onClose={() => setModal(null)} width={500}>
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <Inp T={T} label="Full Name" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />

            <div style={{ display: "flex", gap: 11 }}>
              <Sel T={T} label="Instrument" value={form.instrument} onChange={e => setForm(f => ({ ...f, instrument: e.target.value }))}>
                {INSTRUMENTS.map(i => <option key={i}>{i}</option>)}
              </Sel>
              <Sel T={T} label="Grade" value={form.grade} onChange={e => setForm(f => ({ ...f, grade: e.target.value }))}>
                {GRADE_LABELS.map(g => <option key={g}>{g}</option>)}
              </Sel>
            </div>

            <Sel T={T} label="Teacher" value={form.teacherId} onChange={e => setForm(f => ({ ...f, teacherId: e.target.value }))}>
              <option value="">— Select teacher —</option>
              {teachers.map(t => <option key={t.id} value={t.id}>{t.name} ({t.instruments.join(", ")})</option>)}
            </Sel>

            <div style={{ background: T.panel2, border: `1px solid ${T.border}`, borderRadius: 10, padding: 14 }}>
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
                  <Sel T={T} label="End Time" value={form.schedule.endTime} onChange={e => setSched("endTime", e.target.value)}>
                    {HOURS.map(h => <option key={h}>{h}</option>)}
                  </Sel>
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
              onChange={() => setForm(f => ({ ...f, attendanceBased: !f.attendanceBased }))}
            />

            <div style={{ display: "flex", justifyContent: "flex-end", gap: 9, marginTop: 4 }}>
              <Btn T={T} variant="ghost" onClick={() => setModal(null)}>Cancel</Btn>
              <Btn T={T} onClick={save}>{modal === "add" ? "Add Student" : "Save Changes"}</Btn>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
