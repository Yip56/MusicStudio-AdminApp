import { useState } from "react";
import { Avatar, Badge, Card, Btn, THead, SectionTitle } from "../components/UI.jsx";
import { GRADE_LABELS, INSTRUMENTS } from "../data/seed.js";

export default function GradesAndFees({ students, setStudents, fees, setFees, T, isMobile }) {
  const [tab,     setTab]     = useState("grades");
  const [feeInst, setFeeInst] = useState("Piano");

  function setGrade(id, grade) {
    setStudents(p => p.map(s => s.id === id ? { ...s, grade } : s));
  }
  function setFeeVal(grade, val) {
    setFees(p => ({ ...p, [feeInst]: { ...p[feeInst], [grade]: Number(val) } }));
  }

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 18 }}>
        <h2 style={{ fontSize: isMobile ? 18 : 24, fontWeight: 700, color: T.text, fontFamily: "'Red Hat Display', 'Plus Jakarta Sans', sans-serif" }}>Grades & Fees</h2>
        <div style={{ display: "flex", gap: 7 }}>
          <Btn T={T} variant={tab === "grades" ? "primary" : "ghost"} style={isMobile ? { padding: "7px 12px", fontSize: 12 } : {}} onClick={() => setTab("grades")}>Grades</Btn>
          <Btn T={T} variant={tab === "fees"   ? "primary" : "ghost"} style={isMobile ? { padding: "7px 12px", fontSize: 12 } : {}} onClick={() => setTab("fees")}>Fees</Btn>
        </div>
      </div>

      {tab === "grades" && (
        isMobile ? (
          /* Mobile: card list */
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {students.map(s => (
              <div key={s.id} style={{ background: T.panel, border: `1px solid ${T.border}`, borderRadius: 14, padding: "13px 14px" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
                  <Avatar name={s.name} size={34} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 14, fontWeight: 600, color: T.text }}>{s.name}</div>
                    <div style={{ fontSize: 12, color: T.textSub }}>{s.instrument}</div>
                  </div>
                  <Badge label={s.grade} color={T.accent} bg={T.accent + "18"} />
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
                  <span style={{ fontSize: 11, color: T.muted, flexShrink: 0 }}>Change to:</span>
                  <select value={s.grade} onChange={e => setGrade(s.id, e.target.value)}
                    style={{ flex: 1, background: T.input, border: `1px solid ${T.border2}`, borderRadius: 8, color: T.text, padding: "8px 10px", fontSize: 13, outline: "none", fontFamily: "inherit", appearance: "none" }}>
                    {GRADE_LABELS.map(g => <option key={g}>{g}</option>)}
                  </select>
                </div>
              </div>
            ))}
            {students.length === 0 && (
              <div style={{ textAlign: "center", padding: "30px 0", color: T.muted, fontSize: 13 }}>No students.</div>
            )}
          </div>
        ) : (
          /* Desktop: table */
          <Card T={T} style={{ padding: 0, overflow: "hidden", border: `0.6px solid ${T.border2}`, borderRadius: 12 }}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <THead T={T} cols={["Student", "Instrument", "Current Grade", "Change Grade"]} />
              <tbody>
                {students.map((s) => (
                  <tr key={s.id}
                    onMouseEnter={e => e.currentTarget.style.background = T.hover}
                    onMouseLeave={e => e.currentTarget.style.background = "transparent"}
                    style={{ borderBottom: `0.6px solid ${T.border}` }}>
                    <td style={{ padding: "11px 14px" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
                        <Avatar name={s.name} size={30} />
                        <span style={{ fontSize: 12, color: T.text, fontWeight: 500 }}>{s.name}</span>
                      </div>
                    </td>
                    <td style={{ padding: "11px 14px", fontSize: 12, color: T.muted }}>{s.instrument}</td>
                    <td style={{ padding: "11px 14px" }}>
                      <Badge label={s.grade} color={T.accent} bg={T.accent + "18"} />
                    </td>
                    <td style={{ padding: "11px 14px" }}>
                      <select value={s.grade} onChange={e => setGrade(s.id, e.target.value)}
                        style={{ background: T.input, border: `0.6px solid ${T.border2}`, borderRadius: 6, color: T.text, padding: "5px 9px", fontSize: 12, outline: "none", fontFamily: "inherit", appearance: "none" }}>
                        {GRADE_LABELS.map(g => <option key={g}>{g}</option>)}
                      </select>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        )
      )}

      {tab === "fees" && (
        <div>
          <div style={{ display: "flex", gap: 7, marginBottom: 16, flexWrap: "wrap" }}>
            {INSTRUMENTS.map(i => (
              <Btn key={i} T={T} variant={feeInst === i ? "primary" : "ghost"}
                style={isMobile ? { padding: "7px 12px", fontSize: 12 } : {}}
                onClick={() => setFeeInst(i)}>{i}</Btn>
            ))}
          </div>
          <Card T={T}>
            <SectionTitle T={T}>Monthly Fees — {feeInst}</SectionTitle>
            <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr 1fr" : "repeat(auto-fill, minmax(190px, 1fr))", gap: 9 }}>
              {GRADE_LABELS.map(g => (
                <div key={g} style={{ background: T.bg, border: `0.6px solid ${T.border2}`, borderRadius: 9, padding: "11px 13px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <span style={{ fontSize: 13, color: T.text, fontWeight: 500 }}>{g}</span>
                  <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                    <span style={{ fontSize: 11, color: T.muted }}>RM</span>
                    <input type="number" value={fees[feeInst]?.[g] ?? 0}
                      onChange={e => setFeeVal(g, e.target.value)}
                      style={{ width: 56, background: T.input, border: `1px solid ${T.border2}`, borderRadius: 6, color: T.accent, padding: "4px 6px", fontSize: 13, outline: "none", fontFamily: "inherit", textAlign: "right", fontWeight: 700 }} />
                  </div>
                </div>
              ))}
            </div>
          </Card>
        </div>
      )}
    </div>
  );
}
