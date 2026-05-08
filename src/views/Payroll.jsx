import { useState } from "react";
import { Avatar, Badge, Card, Stat, Inp, Sel, Btn, Modal, SectionTitle } from "../components/UI.jsx";
import { INSTRUMENTS } from "../data/seed.js";
import { calcStudentPayroll, uid } from "../utils/helpers.js";

export default function Payroll({ students, teachers, setTeachers, fees, adminFlatFee, setAdminFlatFee, attendanceOverrides, T }) {
  const now = new Date();
  const [selY, setSelY] = useState(now.getFullYear());
  const [selM, setSelM] = useState(now.getMonth());
  const [modal, setModal] = useState(null);
  const [form,  setForm]  = useState({});

  const monthName = new Date(selY, selM, 1).toLocaleDateString("en-MY", { month: "long", year: "numeric" });

  const rows = teachers.map(t => {
    const myStudents = students.filter(s => s.teacherId === t.id);
    const details = myStudents.map(s => ({
      student: s,
      ...calcStudentPayroll(s, selY, selM, fees, t.commissionPct, adminFlatFee, attendanceOverrides)
    }));
    const totTeacher = details.reduce((a, d) => a + d.teacherCut, 0);
    const totAdmin   = details.reduce((a, d) => a + d.adminCut, 0);
    const totFlat    = details.reduce((a, d) => a + d.adminFlatFee, 0);
    const totGross   = details.reduce((a, d) => a + d.gross, 0);
    return { teacher: t, details, totTeacher, totAdmin, totFlat, totGross };
  });

  const grandTeacher = rows.reduce((a, r) => a + r.totTeacher, 0);
  const grandAdmin   = rows.reduce((a, r) => a + r.totAdmin + r.totFlat, 0);

  function openEdit(t)  { setForm({ ...t, instruments: [...t.instruments] }); setModal(t); }
  function openAdd()    { setForm({ name: "", instruments: ["Piano"], commissionPct: 60 }); setModal("add"); }

  function save() {
    if (!form.name.trim()) return;
    const entry = { ...form, commissionPct: Number(form.commissionPct) };
    if (modal === "add") setTeachers(p => [...p, { ...entry, id: uid() }]);
    else setTeachers(p => p.map(t => t.id === modal.id ? { ...entry, id: t.id } : t));
    setModal(null);
  }

  function removeTeacher(id) { if (confirm("Remove teacher?")) setTeachers(p => p.filter(t => t.id !== id)); }

  function toggleInstrument(inst) {
    setForm(f => {
      const has = f.instruments.includes(inst);
      return { ...f, instruments: has ? f.instruments.filter(i => i !== inst) : [...f.instruments, inst] };
    });
  }

  return (
    <div>
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 18 }}>
        <h2 style={{ fontSize: 22, fontWeight: 800, color: T.text }}>Payroll</h2>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <Btn T={T} variant="ghost" style={{ padding: "5px 11px" }} onClick={() => { const d = new Date(selY, selM - 1, 1); setSelY(d.getFullYear()); setSelM(d.getMonth()); }}>‹</Btn>
          <span style={{ fontSize: 13, color: T.text, fontWeight: 600, minWidth: 130, textAlign: "center" }}>{monthName}</span>
          <Btn T={T} variant="ghost" style={{ padding: "5px 11px" }} onClick={() => { const d = new Date(selY, selM + 1, 1); setSelY(d.getFullYear()); setSelM(d.getMonth()); }}>›</Btn>
          <Btn T={T} onClick={openAdd} style={{ marginLeft: 8 }}>+ Add Teacher</Btn>
        </div>
      </div>

      {/* Config bar */}
      <Card T={T} style={{ marginBottom: 16, display: "flex", alignItems: "center", gap: 20, padding: "13px 18px", flexWrap: "wrap" }}>
        <SectionTitle T={T}>Admin Flat Fee per Student</SectionTitle>
        <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
          <span style={{ fontSize: 12, color: T.muted }}>RM</span>
          <input type="number" min={0} value={adminFlatFee}
            onChange={e => setAdminFlatFee(Number(e.target.value))}
            style={{ width: 70, background: T.input, border: `1px solid ${T.border2}`, borderRadius: 6, color: T.text, padding: "5px 8px", fontSize: 13, outline: "none", fontFamily: "inherit", textAlign: "center" }} />
          <span style={{ fontSize: 11, color: T.muted }}>deducted first, then split commission</span>
        </div>
        <div style={{ marginLeft: "auto", fontSize: 11, color: T.muted, lineHeight: 1.6 }}>
          Full Fee: Gross = full monthly fee<br />
          Att. Based: Gross = (attended ÷ scheduled) × fee
        </div>
      </Card>

      {/* Summary */}
      <div style={{ display: "flex", gap: 12, marginBottom: 18 }}>
        <Stat T={T} label="Teacher Payouts"  value={`RM ${grandTeacher.toFixed(0)}`} color="#60a5fa" />
        <Stat T={T} label="Admin Revenue"    value={`RM ${grandAdmin.toFixed(0)}`}   color="#c084fc" />
        <Stat T={T} label="Total Collected"  value={`RM ${(grandTeacher + grandAdmin).toFixed(0)}`} color={T.accent} />
      </div>

      {/* Per-teacher cards */}
      {rows.map(row => (
        <Card key={row.teacher.id} T={T} style={{ marginBottom: 14, padding: 0, overflow: "hidden" }}>
          {/* Teacher header */}
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "14px 16px", borderBottom: `1px solid ${T.border}` }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <Avatar name={row.teacher.name} size={34} />
              <div>
                <div style={{ fontSize: 14, fontWeight: 700, color: T.text }}>{row.teacher.name}</div>
                <div style={{ fontSize: 11, color: T.muted }}>
                  {row.teacher.instruments.join(", ")} · {row.teacher.commissionPct}% commission
                </div>
              </div>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
              <div style={{ textAlign: "right" }}>
                <div style={{ fontSize: 20, fontWeight: 800, color: "#60a5fa" }}>RM {row.totTeacher.toFixed(2)}</div>
                <div style={{ fontSize: 11, color: T.muted }}>Admin: RM {(row.totAdmin + row.totFlat).toFixed(2)}</div>
              </div>
              <Btn T={T} variant="ghost" style={{ padding: "5px 11px", fontSize: 11 }} onClick={() => openEdit(row.teacher)}>Edit</Btn>
              <Btn T={T} variant="danger" style={{ padding: "5px 11px", fontSize: 11 }} onClick={() => removeTeacher(row.teacher.id)}>Remove</Btn>
            </div>
          </div>

          {row.details.length === 0 && (
            <div style={{ padding: "12px 16px", fontSize: 12, color: T.muted }}>No students assigned.</div>
          )}

          {/* Per-student rows */}
          {row.details.map(d => (
            <div key={d.student.id} style={{
              display: "grid", gridTemplateColumns: "1.8fr 1fr 1fr 1fr 1.1fr 1.1fr 1fr",
              alignItems: "center", gap: 0, borderBottom: `1px solid ${T.border}`, padding: "9px 16px 9px 28px"
            }}>
              <div style={{ fontSize: 13, color: T.text, fontWeight: 500 }}>{d.student.name}</div>
              <div style={{ fontSize: 11, color: T.muted }}>{d.student.grade}</div>
              <div>
                {d.student.attendanceBased
                  ? <Badge label="Att. Based" color="#60a5fa" bg="#0c1a2e" />
                  : <Badge label="Full Fee"   color={T.muted}  bg={T.dim} />
                }
              </div>
              <div style={{ fontSize: 11, color: T.muted }}>
                Fee: RM {d.fee}
                {d.student.attendanceBased && <span style={{ display: "block", fontSize: 10 }}>{d.attended}/{d.scheduled} cls</span>}
              </div>
              <div style={{ fontSize: 12, fontWeight: 700, color: "#4ade80" }}>Gross: RM {d.gross.toFixed(2)}</div>
              <div style={{ fontSize: 12, fontWeight: 700, color: "#60a5fa" }}>Teacher: RM {d.teacherCut.toFixed(2)}</div>
              <div style={{ fontSize: 12, color: "#c084fc" }}>
                Admin: RM {(d.adminCut + d.adminFlatFee).toFixed(2)}
                {d.adminFlatFee > 0 && <span style={{ display: "block", fontSize: 9, color: T.muted }}>incl. RM{d.adminFlatFee} fee</span>}
              </div>
            </div>
          ))}
        </Card>
      ))}

      {/* Teacher modal */}
      {modal && (
        <Modal T={T} title={modal === "add" ? "Add Teacher" : "Edit Teacher"} onClose={() => setModal(null)}>
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <Inp T={T} label="Full Name" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />

            <div>
              <div style={{ fontSize: 11, color: T.muted, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 8 }}>Instruments (select all that apply)</div>
              <div style={{ display: "flex", gap: 7, flexWrap: "wrap" }}>
                {INSTRUMENTS.map(inst => {
                  const active = form.instruments?.includes(inst);
                  return (
                    <button key={inst} onClick={() => toggleInstrument(inst)}
                      style={{
                        padding: "5px 12px", borderRadius: 7, border: "none", cursor: "pointer",
                        fontFamily: "inherit", fontSize: 12, fontWeight: 600,
                        background: active ? T.accent + "22" : T.dim,
                        color: active ? T.accent : T.muted,
                        outline: active ? `1px solid ${T.accent}55` : "none"
                      }}>{inst}</button>
                  );
                })}
              </div>
            </div>

            <Inp T={T} label="Teacher Commission %" type="number" min={0} max={100}
              value={form.commissionPct} onChange={e => setForm(f => ({ ...f, commissionPct: e.target.value }))} />

            <div style={{ display: "flex", justifyContent: "flex-end", gap: 9, marginTop: 4 }}>
              <Btn T={T} variant="ghost" onClick={() => setModal(null)}>Cancel</Btn>
              <Btn T={T} onClick={save}>{modal === "add" ? "Add" : "Save Changes"}</Btn>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
