import { useState } from "react";
import { Avatar, Badge, Card, Stat, Inp, Sel, Btn, Modal, SectionTitle } from "../components/UI.jsx";
import { INSTRUMENTS } from "../data/seed.js";
import { calcStudentPayroll, uid } from "../utils/helpers.js";
import { usePayrollMonth } from "../hooks/usePayrollMonth.js";

function formatYM(ym) {
  const [y, m] = ym.split("-");
  return new Date(Number(y), Number(m) - 1, 1).toLocaleDateString("en-MY", { month: "short", year: "numeric" });
}

export default function Payroll({ students, teachers, setTeachers, fees, adminFlatFee, setAdminFlatFee, attendanceOverrides, T, currentUser, isMobile, setDirty, openPayoutPreview }) {
  const now = new Date();
  const [selY, setSelY] = useState(now.getFullYear());
  const [selM, setSelM] = useState(now.getMonth());
  const [modal, setModal] = useState(null);
  const [form,  setForm]  = useState({});
  const [deferOpen,   setDeferOpen]   = useState({});
  const [deferTarget, setDeferTarget] = useState({});

  const isTeacher  = currentUser?.role === "teacher";
  const isElevated = !isTeacher;

  const monthName = new Date(selY, selM, 1).toLocaleDateString("en-MY", { month: "long", year: "numeric" });
  const yearMonth = `${selY}-${String(selM + 1).padStart(2, "0")}`;
  const { feeStatus, payoutStatus, markFeeCollected, deferFee, undeferFee } = usePayrollMonth(yearMonth);

  // Next 12 months for the defer picker
  const monthOpts = Array.from({ length: 12 }, (_, i) => {
    const d = new Date(selY, selM + 1 + i, 1);
    return {
      value: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`,
      label: d.toLocaleDateString("en-MY", { month: "long", year: "numeric" }),
    };
  });

  const allRows = teachers.map(t => {
    const myStudents = students.filter(s => s.teacherId === t.id);
    const details = myStudents.map(s => {
      const collected          = feeStatus[s.id]?.collected          ?? false;
      const deferredToMonth    = feeStatus[s.id]?.deferredToMonth    ?? null;
      const deferredFromMonths = feeStatus[s.id]?.deferredFromMonths ?? [];

      const deferredGrossExtra = deferredFromMonths.reduce((sum, ym) => {
        const [y, m] = ym.split("-").map(Number);
        return sum + calcStudentPayroll(s, y, m - 1, fees, t.commissionPct, adminFlatFee, attendanceOverrides, true).gross;
      }, 0);

      // When fee is deferred out, show what the gross would have been (for display only)
      const deferredDisplayGross = deferredToMonth
        ? calcStudentPayroll(s, selY, selM, fees, t.commissionPct, adminFlatFee, attendanceOverrides, true, 0).gross
        : null;

      return {
        student: s,
        collected,
        deferredToMonth,
        deferredFromMonths,
        deferredGrossExtra,
        deferredDisplayGross,
        ...calcStudentPayroll(s, selY, selM, fees, t.commissionPct, adminFlatFee, attendanceOverrides, collected, deferredGrossExtra),
      };
    });
    // Deferred students contribute 0 to both teacher payout and admin fee this month
    const totTeacher = details.reduce((a, d) => a + (d.deferredToMonth ? 0 : d.teacherCut), 0);
    const totAdmin   = details.reduce((a, d) => a + (d.deferredToMonth ? 0 : d.adminCut), 0);
    const totGross   = details.reduce((a, d) => a + d.gross, 0);
    return { teacher: t, details, totTeacher, totAdmin, totGross };
  });

  const rows = isTeacher
    ? allRows.filter(r => r.teacher.id === currentUser.teacherId)
    : allRows;

  const grandTeacher = allRows.reduce((a, r) => a + r.totTeacher, 0);
  const grandAdmin   = allRows.reduce((a, r) => a + r.totAdmin, 0);

  function openEdit(t)  { setForm({ ...t, instruments: [...t.instruments] }); setModal(t); }
  function openAdd()    { setForm({ name: "", instruments: ["Piano"], commissionPct: 60 }); setModal("add"); }

  function save() {
    if (!form.name.trim()) return;
    const entry = { ...form, commissionPct: Number(form.commissionPct) };
    if (modal === "add") setTeachers(p => [...p, { ...entry, id: uid() }]);
    else setTeachers(p => p.map(t => t.id === modal.id ? { ...entry, id: t.id } : t));
    setModal(null);
    setDirty?.(false);
  }

  function removeTeacher(id) { if (confirm("Remove teacher?")) setTeachers(p => p.filter(t => t.id !== id)); }

  function toggleInstrument(inst) {
    setDirty?.(true);
    setForm(f => {
      const has = f.instruments.includes(inst);
      return { ...f, instruments: has ? f.instruments.filter(i => i !== inst) : [...f.instruments, inst] };
    });
  }

  function handleDefer(studentId) {
    const target = deferTarget[studentId] ?? monthOpts[0].value;
    deferFee(studentId, target);
    setDeferOpen(p => ({ ...p, [studentId]: false }));
  }

  const teacherModal = modal && isElevated && (
    <Modal T={T} title={modal === "add" ? "Add Teacher" : "Edit Teacher"} onClose={() => { setModal(null); setDirty?.(false); }}>
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        <Inp T={T} label="Full Name" value={form.name} onChange={e => { setDirty?.(true); setForm(f => ({ ...f, name: e.target.value })); }} />
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
                    outline: active ? `1px solid ${T.accent}55` : "none",
                  }}>{inst}</button>
              );
            })}
          </div>
        </div>
        <Inp T={T} label="Teacher Commission %" type="number" min={0} max={100}
          value={form.commissionPct} onChange={e => { setDirty?.(true); setForm(f => ({ ...f, commissionPct: e.target.value })); }} />
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 9, marginTop: 4 }}>
          <Btn T={T} variant="ghost" onClick={() => { setModal(null); setDirty?.(false); }}>Cancel</Btn>
          <Btn T={T} onClick={save}>{modal === "add" ? "Add" : "Save Changes"}</Btn>
        </div>
      </div>
    </Modal>
  );

  // ── Mobile layout ─────────────────────────────────────────────────────────────
  if (isMobile) {
    return (
      <div>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
          <h2 style={{ fontSize: 18, fontWeight: 700, color: T.text, fontFamily: "'Red Hat Display', 'Plus Jakarta Sans', sans-serif" }}>Payroll</h2>
          <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
            <button onClick={() => { const d = new Date(selY, selM - 1, 1); setSelY(d.getFullYear()); setSelM(d.getMonth()); }}
              style={{ background: T.dim, border: "none", borderRadius: 7, padding: "6px 11px", cursor: "pointer", color: T.muted, fontSize: 14, fontFamily: "inherit" }}>‹</button>
            <span style={{ fontSize: 12, color: T.text, fontWeight: 600 }}>{monthName}</span>
            <button onClick={() => { const d = new Date(selY, selM + 1, 1); setSelY(d.getFullYear()); setSelM(d.getMonth()); }}
              style={{ background: T.dim, border: "none", borderRadius: 7, padding: "6px 11px", cursor: "pointer", color: T.muted, fontSize: 14, fontFamily: "inherit" }}>›</button>
          </div>
        </div>

        {rows.map(row => (
          <Card key={row.teacher.id} T={T} style={{ marginBottom: 12, padding: 14 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
              <Avatar name={row.teacher.name} size={36} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 14, fontWeight: 700, color: T.text }}>{row.teacher.name}</div>
                <div style={{ fontSize: 11, color: T.muted }}>{row.teacher.commissionPct}% commission</div>
              </div>
              <div style={{ textAlign: "right" }}>
                <div style={{ fontSize: 18, fontWeight: 800, color: "#60a5fa" }}>RM {row.totTeacher.toFixed(0)}</div>
                <div style={{ fontSize: 10, color: T.muted }}>payout</div>
              </div>
            </div>

            {row.details.length === 0 && (
              <div style={{ fontSize: 12, color: T.muted }}>No students assigned.</div>
            )}
            {row.details.map(d => (
              <div key={d.student.id} style={{ borderTop: `1px solid ${T.border}` }}>
                <div style={{ display: "flex", alignItems: "flex-start", gap: 10, padding: "8px 0" }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, color: T.text, fontWeight: 500 }}>{d.student.name}</div>
                    <div style={{ fontSize: 11, color: T.muted }}>{d.student.grade} · {d.student.instrument}</div>
                    {d.deferredFromMonths.length > 0 && (
                      <div style={{ fontSize: 10, color: "#9A91FB", marginTop: 2 }}>
                        + RM {d.deferredGrossExtra.toFixed(2)} from {d.deferredFromMonths.map(formatYM).join(", ")}
                      </div>
                    )}
                    {d.deferredToMonth && (
                      <div style={{ fontSize: 10, color: "#FDB52A", marginTop: 2 }}>
                        → Deferred to {formatYM(d.deferredToMonth)}
                        {isElevated && (
                          <button onClick={() => undeferFee(d.student.id, d.deferredToMonth)}
                            style={{ marginLeft: 6, fontSize: 10, color: T.muted, background: "transparent", border: "none", cursor: "pointer", padding: 0 }}>
                            Undo
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
                    <div style={{ textAlign: "right" }}>
                      {d.deferredToMonth
                        ? <div style={{ fontSize: 12, color: "#FDB52A", fontWeight: 600 }}>Deferred</div>
                        : <div style={{ fontSize: 13, fontWeight: 700, color: "#60a5fa" }}>RM {d.teacherCut.toFixed(0)}</div>
                      }
                      {d.student.attendanceBased && (
                        <div style={{ fontSize: 10, color: T.muted }}>{d.attended}/{d.scheduled} cls</div>
                      )}
                    </div>
                    <button
                      disabled={!isElevated}
                      onClick={() => isElevated && markFeeCollected(d.student.id, !d.collected)}
                      style={{
                        padding: "3px 8px", borderRadius: 3, border: `0.6px solid ${d.collected ? "#14CA74" : T.border2}`,
                        background: d.collected ? "rgba(5,193,104,0.2)" : "transparent",
                        color: d.collected ? "#14CA74" : T.muted,
                        fontSize: 10, cursor: isElevated ? "pointer" : "default", fontFamily: "inherit",
                      }}>
                      {d.collected ? "Collected" : "Pending"}
                    </button>
                  </div>
                </div>
                {/* Mobile defer controls */}
                {isElevated && !d.collected && !d.deferredToMonth && (
                  <div style={{ paddingBottom: 8, display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                    {deferOpen[d.student.id] ? (
                      <>
                        <select
                          value={deferTarget[d.student.id] ?? monthOpts[0].value}
                          onChange={e => setDeferTarget(p => ({ ...p, [d.student.id]: e.target.value }))}
                          style={{ background: T.input, color: T.text, border: `0.6px solid ${T.border2}`, borderRadius: 4, padding: "3px 6px", fontSize: 11, fontFamily: "inherit", outline: "none" }}>
                          {monthOpts.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                        </select>
                        <Btn T={T} style={{ padding: "3px 10px", fontSize: 10 }} onClick={() => handleDefer(d.student.id)}>Confirm</Btn>
                        <Btn T={T} variant="ghost" style={{ padding: "3px 10px", fontSize: 10 }}
                          onClick={() => setDeferOpen(p => ({ ...p, [d.student.id]: false }))}>Cancel</Btn>
                      </>
                    ) : (
                      <button onClick={() => setDeferOpen(p => ({ ...p, [d.student.id]: true }))}
                        style={{ fontSize: 10, color: T.muted, background: T.dim, border: "none", borderRadius: 3, padding: "3px 10px", cursor: "pointer", fontFamily: "inherit" }}>
                        Defer fee →
                      </button>
                    )}
                  </div>
                )}
              </div>
            ))}
          </Card>
        ))}

        {teacherModal}
      </div>
    );
  }

  // ── Desktop layout ────────────────────────────────────────────────────────────
  // 9 columns: last col = Payout/Defer controls
  const colGrid = "1.4fr 0.7fr 0.8fr 0.8fr 0.9fr 0.9fr 0.9fr 1fr 1.5fr";

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 18 }}>
        <h2 style={{ fontSize: 24, fontWeight: 700, color: T.text, fontFamily: "'Red Hat Display', 'Plus Jakarta Sans', sans-serif" }}>Payroll</h2>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <Btn T={T} variant="ghost" style={{ padding: "5px 11px" }} onClick={() => { const d = new Date(selY, selM - 1, 1); setSelY(d.getFullYear()); setSelM(d.getMonth()); }}>‹</Btn>
          <span style={{ fontSize: 13, color: T.text, fontWeight: 600, minWidth: 130, textAlign: "center" }}>{monthName}</span>
          <Btn T={T} variant="ghost" style={{ padding: "5px 11px" }} onClick={() => { const d = new Date(selY, selM + 1, 1); setSelY(d.getFullYear()); setSelM(d.getMonth()); }}>›</Btn>
          {isElevated && <Btn T={T} onClick={openAdd} style={{ marginLeft: 8, background: "#CB3CFF", color: "#fff", borderRadius: 4, padding: "8px 16px", fontSize: 12, fontWeight: 500, border: "none" }}>+ Add Teacher</Btn>}
        </div>
      </div>

      {isElevated && (
        <Card T={T} style={{ marginBottom: 16, display: "flex", alignItems: "center", gap: 20, padding: "13px 18px", flexWrap: "wrap", border: `0.6px solid ${T.border2}`, borderRadius: 12 }}>
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
      )}

      {isElevated && (
        <div style={{ display: "flex", gap: 12, marginBottom: 18 }}>
          <Stat T={T} label="Teacher Payouts"  value={`RM ${grandTeacher.toFixed(2)}`} icon="♪" />
          <Stat T={T} label="Admin Revenue"    value={`RM ${grandAdmin.toFixed(2)}`}   icon="₿" />
          <Stat T={T} label="Total Collected"  value={`RM ${(grandTeacher + grandAdmin).toFixed(2)}`} icon="✓" />
        </div>
      )}

      {rows.map(row => (
        <Card key={row.teacher.id} T={T} style={{ marginBottom: 14, padding: 0, overflow: "hidden", border: `0.6px solid ${T.border2}`, borderRadius: 12 }}>
          {/* Teacher header */}
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "14px 16px", borderBottom: `0.6px solid ${T.border}` }}>
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
                <div style={{ display: "flex", alignItems: "center", gap: 8, justifyContent: "flex-end" }}>
                  <div style={{ fontSize: 20, fontWeight: 800, color: "#60a5fa" }}>RM {row.totTeacher.toFixed(2)}</div>
                  {payoutStatus[row.teacher.id]?.paid
                    ? <Badge label={`Paid ${payoutStatus[row.teacher.id].paidAt?.toDate?.().toLocaleDateString("en-MY", { day: "numeric", month: "short" }) ?? ""}`} color="#14CA74" bg="rgba(5,193,104,0.2)" border="rgba(5,193,104,0.5)" />
                    : <Badge label="Unpaid" color="#FDB52A" bg="rgba(255,176,22,0.2)" border="rgba(255,176,22,0.2)" />
                  }
                </div>
                {isElevated && <div style={{ fontSize: 11, color: T.muted }}>Admin: RM {row.totAdmin.toFixed(2)}</div>}
              </div>
              {isElevated && (
                <>
                  <Btn T={T} variant="ghost" style={{ padding: "5px 11px", fontSize: 11 }}
                    onClick={() => openPayoutPreview(row.teacher, selY, selM)}>Export</Btn>
                  <Btn T={T} variant="ghost" style={{ padding: "5px 11px", fontSize: 11 }}
                    onClick={() => openEdit(row.teacher)}>Edit</Btn>
                  <Btn T={T} variant="danger" style={{ padding: "5px 11px", fontSize: 11 }}
                    onClick={() => removeTeacher(row.teacher.id)}>Remove</Btn>
                </>
              )}
            </div>
          </div>

          {row.details.length === 0 && (
            <div style={{ padding: "12px 16px", fontSize: 12, color: T.muted }}>No students assigned.</div>
          )}

          {/* Column headers */}
          {row.details.length > 0 && (
            <div style={{
              display: "grid", gridTemplateColumns: colGrid,
              alignItems: "center", padding: "6px 16px 6px 28px",
              borderBottom: `0.6px solid ${T.border}`,
            }}>
              {["Student", "Grade", "Type", "Fee", "Gross", "Teacher", isElevated ? "Admin" : "", "Collected", isElevated ? "Payout" : ""].map((h, i) => (
                <div key={i} style={{ fontSize: 10, color: T.muted, textTransform: "uppercase", letterSpacing: "0.05em" }}>{h}</div>
              ))}
            </div>
          )}

          {row.details.map(d => (
            <div key={d.student.id} style={{
              display: "grid", gridTemplateColumns: colGrid,
              alignItems: "center", borderBottom: `0.6px solid ${T.border}`,
              padding: "9px 16px 9px 28px",
              background: d.deferredToMonth ? T.rowAlt : "transparent",
            }}>
              {/* Student name */}
              <div style={{ fontSize: 13, color: T.text, fontWeight: 500 }}>{d.student.name}</div>

              {/* Grade */}
              <div style={{ fontSize: 11, color: T.muted }}>{d.student.grade}</div>

              {/* Type badge */}
              <div>
                {d.student.attendanceBased
                  ? <Badge label="Att. Based" color="#60a5fa" bg="#0c1a2e" />
                  : <Badge label="Full Fee"   color={T.muted}  bg={T.dim} />
                }
              </div>

              {/* Fee */}
              <div style={{ fontSize: 11, color: T.muted }}>
                RM {d.fee}
                {d.student.attendanceBased && <span style={{ display: "block", fontSize: 10 }}>{d.attended}/{d.scheduled} cls</span>}
              </div>

              {/* Gross */}
              <div>
                <div style={{ fontSize: 12, fontWeight: 700, color: "#4ade80" }}>
                  RM {d.gross.toFixed(2)}
                </div>
                {d.deferredGrossExtra > 0 && (
                  <div style={{ fontSize: 9, color: "#9A91FB", marginTop: 1 }}>
                    +RM {d.deferredGrossExtra.toFixed(2)} deferred in
                  </div>
                )}
              </div>

              {/* Teacher payout */}
              <div>
                {d.deferredToMonth
                  ? <div style={{ fontSize: 11, fontWeight: 600, color: "#FDB52A" }}>Deferred</div>
                  : <div style={{ fontSize: 12, fontWeight: 700, color: "#60a5fa" }}>RM {d.teacherCut.toFixed(2)}</div>
                }
              </div>

              {/* Admin */}
              {isElevated ? (
                <div style={{ fontSize: 12, color: d.deferredToMonth ? T.muted : "#c084fc" }}>
                  {d.deferredToMonth
                    ? <span style={{ fontSize: 11 }}>—</span>
                    : <>
                        RM {d.adminCut.toFixed(2)}
                        {d.flatDeducted > 0 && <span style={{ display: "block", fontSize: 9, color: T.muted }}>RM{d.flatDeducted.toFixed(2)} flat</span>}
                      </>
                  }
                </div>
              ) : <div />}

              {/* Collected — checkbox only */}
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <button
                  disabled={!isElevated}
                  onClick={() => isElevated && markFeeCollected(d.student.id, !d.collected)}
                  style={{
                    width: 16, height: 16, borderRadius: 3,
                    border: `0.6px solid ${d.collected ? "#14CA74" : T.border2}`,
                    background: d.collected ? "rgba(5,193,104,0.2)" : T.input,
                    cursor: isElevated ? "pointer" : "default",
                    display: "flex", alignItems: "center", justifyContent: "center",
                    flexShrink: 0, padding: 0,
                  }}>
                  {d.collected && <span style={{ fontSize: 9, color: "#14CA74", lineHeight: 1 }}>✓</span>}
                </button>
                <div>
                  <div style={{ fontSize: 10, color: d.collected ? "#14CA74" : T.muted, fontWeight: 500 }}>
                    {d.collected ? "Collected" : "Pending"}
                  </div>
                  {d.collected && feeStatus[d.student.id]?.collectedAt && (
                    <div style={{ fontSize: 9, color: T.muted }}>
                      {feeStatus[d.student.id].collectedAt.toDate?.().toLocaleDateString("en-MY", { day: "numeric", month: "short" }) ?? ""}
                    </div>
                  )}
                </div>
              </div>

              {/* Payout / Defer column */}
              {isElevated ? (
                <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                  {d.deferredToMonth ? (
                    // Already deferred — show badge + Undo
                    <div style={{ display: "flex", alignItems: "center", gap: 5, flexWrap: "wrap" }}>
                      <Badge
                        label={`→ ${formatYM(d.deferredToMonth)}`}
                        color="#FDB52A" bg="rgba(253,181,42,0.12)" border="rgba(253,181,42,0.3)"
                      />
                      <button
                        onClick={() => undeferFee(d.student.id, d.deferredToMonth)}
                        style={{ fontSize: 9, color: T.muted, background: "transparent", border: "none", cursor: "pointer", padding: 0, fontFamily: "inherit" }}>
                        Undo
                      </button>
                    </div>
                  ) : deferOpen[d.student.id] ? (
                    // Picker open
                    <div style={{ display: "flex", alignItems: "center", gap: 5, flexWrap: "wrap" }}>
                      <select
                        value={deferTarget[d.student.id] ?? monthOpts[0].value}
                        onChange={e => setDeferTarget(p => ({ ...p, [d.student.id]: e.target.value }))}
                        style={{
                          background: T.input, color: T.text,
                          border: `0.6px solid ${T.border2}`, borderRadius: 4,
                          padding: "2px 5px", fontSize: 10, fontFamily: "inherit", outline: "none", cursor: "pointer",
                          maxWidth: 120,
                        }}>
                        {monthOpts.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                      </select>
                      <Btn T={T} style={{ padding: "2px 8px", fontSize: 9 }} onClick={() => handleDefer(d.student.id)}>OK</Btn>
                      <button onClick={() => setDeferOpen(p => ({ ...p, [d.student.id]: false }))}
                        style={{ fontSize: 9, color: T.muted, background: "transparent", border: "none", cursor: "pointer", padding: 0, fontFamily: "inherit" }}>✕</button>
                    </div>
                  ) : (
                    // Defer button — available for all students
                    <button
                      onClick={() => setDeferOpen(p => ({ ...p, [d.student.id]: true }))}
                      style={{
                        fontSize: 9, color: T.muted, background: T.dim,
                        border: "none", borderRadius: 3, padding: "2px 8px",
                        cursor: "pointer", fontFamily: "inherit", alignSelf: "flex-start",
                      }}>
                      Defer payout →
                    </button>
                  )}
                  {d.deferredFromMonths.length > 0 && (
                    <div style={{ fontSize: 9, color: "#9A91FB" }}>
                      + from {d.deferredFromMonths.map(formatYM).join(", ")}
                    </div>
                  )}
                </div>
              ) : <div />}
            </div>
          ))}
        </Card>
      ))}

      {teacherModal}
    </div>
  );
}
