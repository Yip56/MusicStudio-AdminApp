import { useState } from "react";

/** Free-text remark for one lesson on one date. Saved with the button (not per keystroke); blank + Save clears it. */
export default function RemarkField({ sess, remark, canEdit, onSave, T }) {
  const saved = remark?.text ?? "";
  const [text, setText] = useState(saved);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const dirty = text.trim() !== saved;
  const isSaved = !dirty && !!saved;

  async function save() {
    setBusy(true); setError(null);
    try { await onSave(sess, text); }
    catch { setError("Couldn't save the remark. Try again."); }
    setBusy(false);
  }

  const label = { fontSize: 10, color: T.muted, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 5 };

  if (!canEdit) {
    if (!saved) return null;
    return (
      <div style={{ marginBottom: 10 }}>
        <div style={label}>Remarks</div>
        <div style={{ fontSize: 12, color: T.text, whiteSpace: "pre-wrap", wordBreak: "break-word" }}>{saved}</div>
      </div>
    );
  }

  return (
    <div style={{ marginBottom: 10 }}>
      <div style={label}>Remarks · this lesson only</div>
      <textarea
        value={text} maxLength={500} rows={3}
        onChange={e => setText(e.target.value)}
        placeholder="e.g. trial lesson, bring exam book…"
        style={{
          width: "100%", boxSizing: "border-box", resize: "vertical", background: T.input,
          border: `0.6px solid ${T.border2}`, borderRadius: 4, color: T.text, fontSize: 12,
          padding: "7px 9px", fontFamily: "inherit", outline: "none",
        }}
      />
      {error && <div style={{ fontSize: 11, color: "#FF5A65", marginTop: 4 }}>{error}</div>}
      <button
        onClick={save} disabled={!dirty || busy}
        style={{
          width: "100%", marginTop: 6, padding: "8px 0", borderRadius: 6, border: "none",
          // Unsaved edits: bright accent. Saved (text matches what's stored): same colour, darkened. Nothing to save: neutral.
          background: dirty || isSaved ? T.accent : T.dim, color: dirty || isSaved ? "#fff" : T.muted,
          filter: isSaved ? "brightness(0.55)" : "none",
          cursor: dirty && !busy ? "pointer" : "default", fontFamily: "inherit", fontSize: 12, fontWeight: 700,
        }}
      >{busy ? "Saving…" : isSaved ? "Saved ✓" : saved && !text.trim() ? "Clear remark" : "Save remark"}</button>
    </div>
  );
}
