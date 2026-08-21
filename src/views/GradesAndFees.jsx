import { useState } from "react";
import { Card, Btn, SectionTitle } from "../components/UI.jsx";
import { GRADE_LABELS, CONTEMPORARY_GRADE_LABELS, INSTRUMENTS } from "../data/seed.js";

export default function GradesAndFees({ fees, setFees, contemporaryFees, setContemporaryFees, T, isMobile }) {
  const [syllabus, setSyllabus] = useState("classical");
  const [feeInst,  setFeeInst]  = useState("Piano");

  function setClassicalFee(grade, val) {
    setFees(p => ({ ...p, [feeInst]: { ...p[feeInst], [grade]: Number(val) } }));
  }
  function setContemporaryFee(grade, val) {
    setContemporaryFees(p => ({ ...p, [feeInst]: { ...p[feeInst], [grade]: Number(val) } }));
  }

  const feeCell = (label, value, onChange) => (
    <div key={label} style={{ background: T.bg, border: `0.6px solid ${T.border2}`, borderRadius: 9, padding: "11px 13px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
      <span style={{ fontSize: 13, color: T.text, fontWeight: 500 }}>{label}</span>
      <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
        <span style={{ fontSize: 11, color: T.muted }}>RM</span>
        <input type="number" value={value ?? 0} onChange={e => onChange(label, e.target.value)}
          style={{ width: 56, background: T.input, border: `1px solid ${T.border2}`, borderRadius: 6, color: T.accent, padding: "4px 6px", fontSize: 13, outline: "none", fontFamily: "inherit", textAlign: "right", fontWeight: 700 }} />
      </div>
    </div>
  );

  const classicalSection = (
    <>
      <SectionTitle T={T}>Classical — {feeInst}</SectionTitle>
      <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr 1fr" : "repeat(auto-fill, minmax(190px, 1fr))", gap: 9, marginBottom: syllabus === "both" ? 24 : 0 }}>
        {GRADE_LABELS.map(g => feeCell(g, fees[feeInst]?.[g], setClassicalFee))}
      </div>
    </>
  );

  const contemporarySection = (
    <>
      <SectionTitle T={T}>Contemporary — {feeInst}</SectionTitle>
      <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr 1fr" : "repeat(auto-fill, minmax(190px, 1fr))", gap: 9 }}>
        {CONTEMPORARY_GRADE_LABELS.map(g => feeCell(g, contemporaryFees[feeInst]?.[g], setContemporaryFee))}
      </div>
    </>
  );

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 18 }}>
        <h2 style={{ fontSize: isMobile ? 18 : 24, fontWeight: 700, color: T.text, fontFamily: "'Red Hat Display', 'Plus Jakarta Sans', sans-serif" }}>Grades & Fees</h2>
        <div style={{ display: "flex", gap: 7 }}>
          <Btn T={T} variant={syllabus === "classical"    ? "primary" : "ghost"} style={isMobile ? { padding: "7px 12px", fontSize: 12 } : {}} onClick={() => setSyllabus("classical")}>Classical</Btn>
          <Btn T={T} variant={syllabus === "contemporary" ? "primary" : "ghost"} style={isMobile ? { padding: "7px 12px", fontSize: 12 } : {}} onClick={() => setSyllabus("contemporary")}>Contemporary</Btn>
          <Btn T={T} variant={syllabus === "both"         ? "primary" : "ghost"} style={isMobile ? { padding: "7px 12px", fontSize: 12 } : {}} onClick={() => setSyllabus("both")}>Both</Btn>
        </div>
      </div>

      <div style={{ display: "flex", gap: 7, marginBottom: 16, flexWrap: "wrap" }}>
        {INSTRUMENTS.map(i => (
          <Btn key={i} T={T} variant={feeInst === i ? "primary" : "ghost"}
            style={isMobile ? { padding: "7px 12px", fontSize: 12 } : {}}
            onClick={() => setFeeInst(i)}>{i}</Btn>
        ))}
      </div>

      <Card T={T}>
        {syllabus === "classical"    && classicalSection}
        {syllabus === "contemporary" && contemporarySection}
        {syllabus === "both"         && <>{classicalSection}{contemporarySection}</>}
      </Card>
    </div>
  );
}
