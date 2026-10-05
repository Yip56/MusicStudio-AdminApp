import { useState, useRef } from "react";
import * as XLSX from "xlsx";
import { Card, Btn, SectionTitle, Modal } from "../components/UI.jsx";
import { GRADE_LABELS, CONTEMPORARY_GRADE_LABELS } from "../data/seed.js";

const DURATIONS = ["30", "45", "60"];
const DEFAULT_CLASSICAL_ROW = { "30": 0, "45": 0, "60": 0 };

export default function GradesAndFees({ fees, setFees, contemporaryFees, setContemporaryFees, saveFees, T, isMobile, setDirty }) {
  const [syllabus,      setSyllabus]      = useState("classical");
  const [feeInst,       setFeeInst]       = useState(() => Object.keys(fees)[0] ?? "Piano");
  const [saveStatus,    setSaveStatus]    = useState("idle");   // idle | saving | saved | error
  const [importStatus,  setImportStatus]  = useState("idle");   // idle | importing | imported | error
  const [addingInst,    setAddingInst]    = useState(false);
  const [newInstName,   setNewInstName]   = useState("");
  const [confirmRemove, setConfirmRemove] = useState(false);

  const fileInputRef = useRef(null);

  // Dynamic instrument list derived from fees (Firestore source of truth)
  const instruments = Object.keys(fees);

  // ── Manual cell edits ──────────────────────────────────────────────────────
  function setClassicalFee(grade, duration, val) {
    setFees(p => ({ ...p, [feeInst]: { ...p[feeInst], [grade]: { ...p[feeInst]?.[grade], [duration]: Number(val) } } }));
    setDirty(true);
    setSaveStatus("idle");
  }

  function setContemporaryFee(grade, duration, val) {
    setContemporaryFees(p => ({ ...p, [feeInst]: { ...p[feeInst], [grade]: { ...p[feeInst]?.[grade], [duration]: Number(val) } } }));
    setDirty(true);
    setSaveStatus("idle");
  }

  // ── Save to Firestore ──────────────────────────────────────────────────────
  async function handleSave() {
    setSaveStatus("saving");
    try {
      await saveFees();
      setSaveStatus("saved");
      setTimeout(() => setSaveStatus("idle"), 2500);
    } catch {
      setSaveStatus("error");
    }
  }

  // ── Add / remove instruments ──────────────────────────────────────────────
  function confirmAddInstrument() {
    const name = newInstName.trim();
    if (!name || instruments.map(i => i.toLowerCase()).includes(name.toLowerCase())) return;
    const classicalDefaults = Object.fromEntries(GRADE_LABELS.map(g => [g, { ...DEFAULT_CLASSICAL_ROW }]));
    const contemDefaults    = Object.fromEntries(CONTEMPORARY_GRADE_LABELS.map(g => [g, { ...DEFAULT_CLASSICAL_ROW }]));
    setFees(p => ({ ...p, [name]: classicalDefaults }));
    setContemporaryFees(p => ({ ...p, [name]: contemDefaults }));
    setFeeInst(name);
    setNewInstName("");
    setAddingInst(false);
    setDirty(true);
    setSaveStatus("idle");
  }

  function removeInstrument() {
    if (instruments.length <= 1) return;
    setFees(p => { const n = { ...p }; delete n[feeInst]; return n; });
    setContemporaryFees(p => { const n = { ...p }; delete n[feeInst]; return n; });
    setFeeInst(instruments.find(i => i !== feeInst) ?? "");
    setConfirmRemove(false);
    setDirty(true);
    setSaveStatus("idle");
  }

  // ── Excel export ───────────────────────────────────────────────────────────
  // Format: two sheets (Classical, Contemporary).
  // Each sheet: row per grade level, column groups per instrument (30/45/60 min each).
  function downloadTemplate() {
    const wb = XLSX.utils.book_new();
    const headers = ["Level", ...instruments.flatMap(inst => DURATIONS.map(d => `${inst} ${d}min`))];
    const colWidths = [{ wch: 14 }, ...instruments.flatMap(() => [{ wch: 10 }, { wch: 10 }, { wch: 10 }])];

    function makeSheet(gradeLabels, feeSrc) {
      const rows = [
        headers,
        ...gradeLabels.map(grade => [
          grade,
          ...instruments.flatMap(inst => DURATIONS.map(d => feeSrc[inst]?.[grade]?.[d] ?? 0)),
        ]),
      ];
      const ws = XLSX.utils.aoa_to_sheet(rows);
      ws["!cols"] = colWidths;
      return ws;
    }

    XLSX.utils.book_append_sheet(wb, makeSheet(GRADE_LABELS, fees), "Classical");
    XLSX.utils.book_append_sheet(wb, makeSheet(CONTEMPORARY_GRADE_LABELS, contemporaryFees), "Contemporary");
    XLSX.writeFile(wb, "Ark-Music-Fee-Schedule.xlsx");
  }

  // ── Excel import ───────────────────────────────────────────────────────────
  function handleImportClick() {
    fileInputRef.current?.click();
  }

  function handleImportFile(e) {
    const file = e.target.files[0];
    if (!file) return;
    setImportStatus("importing");

    const reader = new FileReader();
    reader.onerror = () => { setImportStatus("error"); e.target.value = ""; };
    reader.onload = (evt) => {
      try {
        const wb = XLSX.read(evt.target.result, { type: "array" });

        function parseSheet(sheetName, gradeLabels) {
          const ws = wb.Sheets[sheetName];
          if (!ws) return null;
          const rows = XLSX.utils.sheet_to_json(ws, { header: 1 });
          if (rows.length < 2) return null;

          // Read instruments from header row dynamically
          const headerRow = rows[0] ?? [];
          const sheetInstruments = [];
          for (let col = 1; col < headerRow.length; col += 3) {
            const header = String(headerRow[col] ?? "");
            const instName = header.replace(/\s*\d+min$/, "").trim();
            if (instName) sheetInstruments.push(instName);
          }

          const result = {};
          rows.slice(1).forEach(row => {
            const grade = String(row[0] ?? "").trim();
            if (!grade || !gradeLabels.includes(grade)) return;
            sheetInstruments.forEach((inst, i) => {
              if (!result[inst]) result[inst] = {};
              const offset = 1 + i * 3;
              result[inst][grade] = {
                "30": Number(row[offset])     || 0,
                "45": Number(row[offset + 1]) || 0,
                "60": Number(row[offset + 2]) || 0,
              };
            });
          });
          return result;
        }

        const newClassical    = parseSheet("Classical",    GRADE_LABELS);
        const newContemporary = parseSheet("Contemporary", CONTEMPORARY_GRADE_LABELS);

        if (!newClassical && !newContemporary) throw new Error("No recognised sheets found");

        if (newClassical)    setFees(newClassical);
        if (newContemporary) setContemporaryFees(newContemporary);
        setDirty(true);
        setSaveStatus("idle");
        setImportStatus("imported");
        setTimeout(() => setImportStatus("idle"), 3000);
      } catch {
        setImportStatus("error");
        setTimeout(() => setImportStatus("idle"), 3000);
      }
      e.target.value = "";
    };
    reader.readAsArrayBuffer(file);
  }

  // ── Labels ─────────────────────────────────────────────────────────────────
  const saveLabel = saveStatus === "saving" ? "Saving…"
    : saveStatus === "saved"  ? "Saved ✓"
    : saveStatus === "error"  ? "Error — retry"
    : "Save Changes";

  const saveBtnVariant = saveStatus === "error" ? "danger"
    : saveStatus === "saved" ? "ghost"
    : "primary";

  const importLabel = importStatus === "importing" ? "Importing…"
    : importStatus === "imported" ? "Imported ✓"
    : importStatus === "error"   ? "Import failed"
    : "Import Excel";

  // ── Table renderer ─────────────────────────────────────────────────────────
  function feeTable(gradeLabels, feeSrc, onChange) {
    return (
      <div style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr style={{ background: T.panel2 }}>
              <th style={thStyle(T, "left")}>Level</th>
              {DURATIONS.map(d => (
                <th key={d} style={thStyle(T, "right")}>
                  {d} <span style={{ fontSize: 9, color: T.muted }}>min</span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {gradeLabels.map((grade, i) => (
              <tr key={grade}
                style={{ borderBottom: `0.6px solid ${T.border}`, background: i % 2 === 1 ? T.rowAlt : "transparent" }}
                onMouseEnter={e => e.currentTarget.style.background = T.hover}
                onMouseLeave={e => e.currentTarget.style.background = i % 2 === 1 ? T.rowAlt : "transparent"}
              >
                <td style={{ padding: "11px 14px", fontSize: 13, color: T.text, fontWeight: 500 }}>{grade}</td>
                {DURATIONS.map(d => (
                  <td key={d} style={{ padding: "8px 14px", textAlign: "right" }}>
                    <div style={{ display: "inline-flex", alignItems: "center", gap: 4, justifyContent: "flex-end" }}>
                      <span style={{ fontSize: 11, color: T.muted }}>RM</span>
                      <input
                        type="number"
                        value={feeSrc[feeInst]?.[grade]?.[d] ?? 0}
                        onChange={e => onChange(grade, d, e.target.value)}
                        style={{
                          width: 64, background: T.input, border: `1px solid ${T.border2}`,
                          borderRadius: 6, color: T.accent, padding: "4px 6px",
                          fontSize: 13, outline: "none", fontFamily: "inherit",
                          textAlign: "right", fontWeight: 700,
                        }}
                      />
                    </div>
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div>
      {/* Header row */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 18, gap: 12, flexWrap: "wrap" }}>
        <h2 style={{ fontSize: isMobile ? 18 : 24, fontWeight: 700, color: T.text, fontFamily: "'Red Hat Display', 'Plus Jakarta Sans', sans-serif" }}>
          Grades & Fees
        </h2>
        <div style={{ display: "flex", gap: 7, flexWrap: "wrap", alignItems: "center" }}>
          <Btn T={T} variant={syllabus === "classical"    ? "primary" : "ghost"} style={isMobile ? { padding: "7px 12px", fontSize: 12 } : {}} onClick={() => setSyllabus("classical")}>Classical</Btn>
          <Btn T={T} variant={syllabus === "contemporary" ? "primary" : "ghost"} style={isMobile ? { padding: "7px 12px", fontSize: 12 } : {}} onClick={() => setSyllabus("contemporary")}>Contemporary</Btn>
          <Btn T={T} variant={syllabus === "both"         ? "primary" : "ghost"} style={isMobile ? { padding: "7px 12px", fontSize: 12 } : {}} onClick={() => setSyllabus("both")}>Both</Btn>
          <div style={{ width: 1, height: 24, background: T.border2, margin: "0 4px" }} />
          <Btn T={T} variant={saveBtnVariant} disabled={saveStatus === "saving"} style={isMobile ? { padding: "7px 14px", fontSize: 12 } : {}} onClick={handleSave}>
            {saveLabel}
          </Btn>
        </div>
      </div>

      {/* Excel import / export row */}
      <div style={{ display: "flex", gap: 8, marginBottom: 16, alignItems: "center", flexWrap: "wrap" }}>
        <span style={{ fontSize: 11, color: T.muted, marginRight: 4 }}>Excel:</span>
        <Btn T={T} variant="ghost" style={{ fontSize: 12, padding: "6px 12px", gap: 5, display: "inline-flex", alignItems: "center", color: T.text }} onClick={downloadTemplate}>
          <DownloadIcon /> Download Template
        </Btn>
        <Btn T={T}
          variant={importStatus === "error" ? "danger" : "ghost"}
          disabled={importStatus === "importing"}
          style={{
            fontSize: 12, padding: "6px 12px", gap: 5, display: "inline-flex", alignItems: "center",
            color: importStatus === "imported" ? "#14CA74" : importStatus === "error" ? undefined : T.text,
          }}
          onClick={handleImportClick}
        >
          <UploadIcon /> {importLabel}
        </Btn>
        <input
          ref={fileInputRef}
          type="file"
          accept=".xlsx,.xls"
          style={{ display: "none" }}
          onChange={handleImportFile}
        />
        {importStatus === "imported" && (
          <span style={{ fontSize: 11, color: "#14CA74" }}>
            Review the values below, then click Save Changes to publish.
          </span>
        )}
      </div>

      {/* Instrument selector */}
      <div style={{ display: "flex", gap: 7, marginBottom: 16, flexWrap: "wrap", alignItems: "center" }}>
        {instruments.map(i => (
          <Btn key={i} T={T} variant={feeInst === i ? "primary" : "ghost"}
            style={isMobile ? { padding: "7px 12px", fontSize: 12 } : {}}
            onClick={() => { setFeeInst(i); setAddingInst(false); }}>
            {i}
          </Btn>
        ))}

        {/* Add instrument */}
        {addingInst ? (
          <div style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
            <input
              autoFocus
              value={newInstName}
              onChange={e => setNewInstName(e.target.value)}
              onKeyDown={e => { if (e.key === "Enter") confirmAddInstrument(); if (e.key === "Escape") { setAddingInst(false); setNewInstName(""); } }}
              placeholder="Instrument name"
              style={{
                background: T.input, border: `1px solid ${T.border2}`, borderRadius: 4,
                color: T.text, padding: "6px 10px", fontSize: 12, outline: "none",
                fontFamily: "inherit", width: 130,
              }}
            />
            <Btn T={T} variant="primary" style={{ fontSize: 12, padding: "6px 10px" }} onClick={confirmAddInstrument}>Add</Btn>
            <Btn T={T} variant="ghost"   style={{ fontSize: 12, padding: "6px 10px" }} onClick={() => { setAddingInst(false); setNewInstName(""); }}>Cancel</Btn>
          </div>
        ) : (
          <Btn T={T} variant="ghost"
            style={{ fontSize: 12, padding: "6px 10px", color: T.muted }}
            onClick={() => setAddingInst(true)}>
            + Add
          </Btn>
        )}

        {/* Remove current instrument — pushed to right */}
        {instruments.length > 1 && !addingInst && (
          <Btn T={T} variant="danger"
            style={{ marginLeft: "auto", fontSize: 12, padding: "6px 12px" }}
            onClick={() => setConfirmRemove(true)}>
            Remove {feeInst}
          </Btn>
        )}
      </div>

      {/* Remove confirmation modal */}
      {confirmRemove && (
        <Modal T={T} title={`Remove ${feeInst}?`} onClose={() => setConfirmRemove(false)} width={380}>
          <p style={{ fontSize: 13, color: T.textSub, marginBottom: 20, lineHeight: 1.6 }}>
            This will delete all fee data for <b style={{ color: T.text }}>{feeInst}</b> from both Classical and Contemporary schedules. This cannot be undone without clicking Save Changes first.
          </p>
          <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
            <Btn T={T} variant="ghost"  onClick={() => setConfirmRemove(false)}>Cancel</Btn>
            <Btn T={T} variant="danger" onClick={removeInstrument}>Confirm Delete {feeInst}</Btn>
          </div>
        </Modal>
      )}

      <Card T={T}>
        {(syllabus === "classical" || syllabus === "both") && (
          <>
            {syllabus === "both" && <SectionTitle T={T}>Classical — {feeInst}</SectionTitle>}
            {feeTable(GRADE_LABELS, fees, setClassicalFee)}
            {syllabus === "both" && <div style={{ height: 28 }} />}
          </>
        )}
        {(syllabus === "contemporary" || syllabus === "both") && (
          <>
            {syllabus === "both" && <SectionTitle T={T}>Contemporary — {feeInst}</SectionTitle>}
            {feeTable(CONTEMPORARY_GRADE_LABELS, contemporaryFees, setContemporaryFee)}
          </>
        )}
      </Card>

      <p style={{ fontSize: 11, color: T.muted, marginTop: 10 }}>
        Changes are not published until you click Save Changes. Saved data syncs to the public fees page immediately.
      </p>
    </div>
  );
}

function thStyle(T, align) {
  return {
    padding: "9px 14px",
    fontSize: 10,
    fontWeight: 600,
    letterSpacing: "0.06em",
    textTransform: "uppercase",
    color: T.muted,
    textAlign: align,
    borderBottom: `0.6px solid ${T.border}`,
    whiteSpace: "nowrap",
  };
}

function DownloadIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <polyline points="7 10 12 15 17 10" />
      <line x1="12" y1="15" x2="12" y2="3" />
    </svg>
  );
}

function UploadIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <polyline points="17 8 12 3 7 8" />
      <line x1="12" y1="3" x2="12" y2="15" />
    </svg>
  );
}
