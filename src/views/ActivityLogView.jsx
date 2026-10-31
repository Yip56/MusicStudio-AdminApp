import { useState, useEffect, useMemo } from "react";
import { collection, query, orderBy, limit, onSnapshot } from "firebase/firestore";
import { db } from "../firebase.js";
import { Card, Badge, Btn, Sel } from "../components/UI.jsx";
import { AUDIT_TYPES } from "../domain/audit.js";

const TYPE_COLOR = {
  deposit: "#9A91FB", fee: "#14CA74", term: "#14CA74", commission: "#c084fc", payroll: "#60a5fa", payout: "#60a5fa",
  deferral: "#FDB52A", discount: "#4ade80", month: "#CB3CFF", student: "#00C2FF", enrolment: "#00C2FF",
};
const show = v => (v === null || v === undefined ? "—" : typeof v === "object" ? JSON.stringify(v) : String(v));

/** Append-only history of fees, payroll, students in/out, deposits, revisions and settings. Admin / sysadmin only. */
export default function ActivityLogView({ T, isMobile }) {
  const [entries, setEntries] = useState([]);
  const [typeF,   setTypeF]   = useState("all");
  const [search,  setSearch]  = useState("");
  const [open,    setOpen]    = useState(null);
  const [max,     setMax]     = useState(300);

  useEffect(() => {
    const q = query(collection(db, "activity_log"), orderBy("createdAt", "desc"), limit(max));
    return onSnapshot(q, snap => setEntries(snap.docs.map(d => ({ id: d.id, ...d.data() }))), err => console.error("[activity_log]", err.message));
  }, [max]);

  const rows = useMemo(() => entries.filter(e => {
    if (typeF !== "all" && e.type !== typeF) return false;
    const q = search.trim().toLowerCase();
    return !q || `${e.summary} ${e.actorName} ${e.action}`.toLowerCase().includes(q);
  }), [entries, typeF, search]);

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16, gap: 10, flexWrap: "wrap" }}>
        <h2 style={{ fontSize: isMobile ? 18 : 24, fontWeight: 700, color: T.text, fontFamily: "'Red Hat Display', 'Plus Jakarta Sans', sans-serif" }}>Activity Log</h2>
        <div style={{ display: "flex", gap: 10, alignItems: "flex-end" }}>
          <Sel T={T} value={typeF} onChange={e => setTypeF(e.target.value)} style={{ minWidth: 150 }}>
            <option value="all">All activity</option>
            {Object.entries(AUDIT_TYPES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </Sel>
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search…"
            style={{ background: T.input, border: `0.6px solid ${T.border2}`, borderRadius: 4, color: T.text, padding: "9px 14px", fontSize: 12, outline: "none", fontFamily: "inherit", height: 38, width: isMobile ? 120 : 200 }} />
        </div>
      </div>
      <p style={{ fontSize: 12, color: T.muted, marginBottom: 12 }}>Every fee, payroll, enrolment, deposit and revision change is recorded here and can't be edited or deleted.</p>

      <Card T={T} style={{ padding: 0, overflow: "hidden", border: `0.6px solid ${T.border2}`, borderRadius: 12 }}>
        {rows.length === 0 && <div style={{ padding: 20, textAlign: "center", color: T.muted, fontSize: 13 }}>Nothing recorded yet.</div>}
        {rows.map(e => {
          const color = TYPE_COLOR[e.type] ?? "#AEB9E1";
          const isOpen = open === e.id;
          const when = e.createdAt?.toDate?.();
          return (
            <div key={e.id} style={{ borderBottom: `0.6px solid ${T.border}` }}>
              <div onClick={() => (e.changes?.length || e.meta) && setOpen(isOpen ? null : e.id)}
                style={{ display: "flex", gap: 12, alignItems: "flex-start", padding: "10px 16px", cursor: e.changes?.length || e.meta ? "pointer" : "default", flexWrap: isMobile ? "wrap" : "nowrap" }}>
                <div style={{ width: 120, flexShrink: 0, fontSize: 11, color: T.muted }}>
                  {when ? when.toLocaleDateString("en-MY", { day: "numeric", month: "short" }) + " " + when.toLocaleTimeString("en-MY", { hour: "2-digit", minute: "2-digit" }) : "…"}
                </div>
                <div style={{ width: 96, flexShrink: 0 }}><Badge label={AUDIT_TYPES[e.type] ?? e.type} color={color} bg={color + "22"} /></div>
                <div style={{ flex: 1, fontSize: 12, color: T.text, lineHeight: 1.6 }}>
                  {e.summary}
                  <div style={{ fontSize: 10, color: T.muted }}>{e.actorName}{e.actorRole ? ` (${e.actorRole})` : ""} · {e.action}</div>
                </div>
                {(e.changes?.length > 0 || e.meta) && <span style={{ color: T.muted, fontSize: 11 }}>{isOpen ? "▲" : "▼"}</span>}
              </div>
              {isOpen && (
                <div style={{ padding: "0 16px 12px 240px", fontSize: 11, color: T.muted, lineHeight: 1.7 }}>
                  {e.changes?.map((c, i) => <div key={i}><strong style={{ color: T.text }}>{c.field}</strong>: {show(c.from)} → {show(c.to)}</div>)}
                  {e.meta && <div>{show(e.meta)}</div>}
                </div>
              )}
            </div>
          );
        })}
      </Card>
      {entries.length >= max && <div style={{ marginTop: 12 }}><Btn T={T} variant="ghost" onClick={() => setMax(m => m + 300)}>Load older</Btn></div>}
    </div>
  );
}
