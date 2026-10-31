import { useState, useEffect, useMemo } from "react";
import { collection, query, where, onSnapshot } from "firebase/firestore";
import { db } from "../firebase.js";
import { Card, Btn, Badge, Modal, Inp, Sel, Stat } from "../components/UI.jsx";
import { reviseRow, totalsForRows, diffSnapshotRows, affectedMonths, deferralChanges } from "../domain/months.js";
import { addMonths, formatYM, formatYMLong } from "../domain/time.js";
import { downloadBackup } from "../data/backup.js";

const errBox = { fontSize: 12, color: "#FF5A65", background: "rgba(255,90,101,0.08)", border: "0.6px solid rgba(255,90,101,0.35)", borderRadius: 6, padding: "8px 11px", lineHeight: 1.6 };
const amberBox = { fontSize: 12, color: "#FDB52A", background: "rgba(253,181,42,0.08)", border: "0.6px solid rgba(253,181,42,0.4)", borderRadius: 6, padding: "8px 11px", lineHeight: 1.6 };
const rm = n => `RM ${Number(n || 0).toFixed(2)}`;
const fmtTs = ts => (ts?.toDate ? ts.toDate() : ts ? new Date(ts) : null)?.toLocaleDateString("en-MY", { day: "numeric", month: "short", year: "numeric" }) ?? "";

/** Notifications that have been read/resolved — kept for reference. */
function useNotificationArchive(enabled) {
  const [items, setItems] = useState([]);
  useEffect(() => {
    if (!enabled) return;
    const q = query(collection(db, "notifications"), where("status", "in", ["approved", "rejected"]));
    return onSnapshot(q, snap => setItems(snap.docs.map(d => ({ id: d.id, ...d.data() }))), err => console.error("[notifications archive]", err.message));
  }, [enabled]);
  return items;
}

/**
 * Archive:
 *   Finalized Months – the immutable snapshot of each finalized month, plus every revision. A
 *   revision recomputes payroll from corrected inputs; the original is never touched.
 *   Notification Archive – every approved / rejected request, for reference.
 */
export default function ArchiveView({
  monthSnapshots, monthRevisions, teachers, students, enrolments, rooms, actions, currentUser, T, isMobile, setDirty,
}) {
  const [tab, setTab]           = useState(currentUser.role === "teacher" ? "notifications" : "months");
  const [openYM, setOpenYM]     = useState(null);
  const [view, setView]         = useState("revised");      // "original" | "revised"
  const [reviseYM, setReviseYM] = useState(null);
  const [draft, setDraft]       = useState([]);
  const [reason, setReason]     = useState("");
  const [error, setError]       = useState(null);
  const [busy, setBusy]         = useState(false);
  const [backupMsg, setBackupMsg] = useState(null);
  const [deferAck, setDeferAck] = useState(null);   // signature of the deferral changes the user confirmed

  const isSys = currentUser.role === "sysadmin";
  const notifs = useNotificationArchive(tab === "notifications");

  const months = [...monthSnapshots].sort((a, b) => b.yearMonth.localeCompare(a.yearMonth));
  const revsOf = ym => monthRevisions.filter(r => r.yearMonth === ym).sort((a, b) => b.revisionNo - a.revisionNo);
  const affectedBy = ym => monthRevisions.filter(r => (r.affectedMonths ?? []).includes(ym));

  // ── revise ─────────────────────────────────────────────────────────────────
  function startRevise(snap) {
    const base = (revsOf(snap.yearMonth)[0] ?? snap).rows;
    setDraft(base.map(r => ({ ...r })));
    setReason(""); setError(null); setDeferAck(null); setReviseYM(snap.yearMonth); setDirty?.(true);
  }
  function edit(eid, field, value) {
    setError(null);
    setDraft(rows => rows.map(r => {
      if (r.eid !== eid) return r;
      try { return reviseRow(r, { [field]: value }); } catch (e) { setError(e.message); return r; }
    }));
  }
  const snapOf = ym => monthSnapshots.find(s => s.yearMonth === ym);
  const changes  = reviseYM ? diffSnapshotRows(snapOf(reviseYM).rows, draft) : [];
  const affected = reviseYM ? affectedMonths(snapOf(reviseYM).rows, draft, reviseYM) : [];
  const draftTotals = totalsForRows(draft);
  // Changing a deferral rewrites the target months' ledgers, so the user must confirm it first.
  // Baseline is what is in effect now (latest revision), so earlier revisions' deferrals aren't re-applied.
  const deferrals    = reviseYM ? deferralChanges((revsOf(reviseYM)[0] ?? snapOf(reviseYM)).rows, draft) : [];
  const deferSig     = JSON.stringify(deferrals.map(d => [d.eid, d.from, d.to]));
  const finalizedYMs = new Set(monthSnapshots.map(s => s.yearMonth));
  const needsDeferAck = deferrals.length > 0 && deferAck !== deferSig;

  async function saveRevision() {
    setBusy(true); setError(null);
    try {
      const res = await actions.saveRevision(reviseYM, { rows: draft, totals: draftTotals, changes, affected, reason, deferrals });
      if (res?.skipped?.length) window.alert?.(`${res.skipped.map(formatYMLong).join(", ")} ${res.skipped.length > 1 ? "are" : "is"} already finalized, so the deferral could not be rewritten there. Revise ${res.skipped.length > 1 ? "those months" : "that month"} too.`);
      setReviseYM(null); setDirty?.(false);
    } catch (e) { setError(e.message); }
    setBusy(false);
  }

  async function backup() {
    setBackupMsg("Preparing backup…");
    try {
      const counts = await downloadBackup(currentUser.displayName || currentUser.email);
      setBackupMsg(`Backup downloaded (${Object.entries(counts).map(([k, v]) => `${k}: ${v}`).join(", ")})`);
    } catch (e) { setBackupMsg(`Backup failed: ${e.message}`); }
  }

  // ── pieces ─────────────────────────────────────────────────────────────────
  const th = { padding: "8px 10px", fontSize: 10, color: T.muted, textTransform: "uppercase", letterSpacing: "0.05em", textAlign: "left", fontWeight: 600, whiteSpace: "nowrap" };
  const td = { padding: "8px 10px", fontSize: 12, color: T.textSub };

  const rowsTable = (rows, orig = null) => (
    <div style={{ overflowX: "auto" }}>
      <table style={{ width: "100%", borderCollapse: "collapse" }}>
        <thead><tr style={{ background: T.panel2 }}>{["Student", "Instrument", "Teacher", "Fee", "Discount", "Rate", "Collected", "Gross", "Teacher", "Admin", "Deferred"].map(h => <th key={h} style={th}>{h}</th>)}</tr></thead>
        <tbody>
          {rows.filter(r => !r.covered).map(r => {
            const o = orig?.find(x => x.eid === r.eid);
            const hi = f => (o && (o[f] ?? null) !== (r[f] ?? null) ? { color: "#FDB52A", fontWeight: 700 } : {});
            return (
              <tr key={r.eid} style={{ borderBottom: `0.6px solid ${T.border}` }}>
                <td style={{ ...td, color: T.text, fontWeight: 500 }}>{r.studentName}</td>
                <td style={td}>{r.instrument ?? "—"}{r.periodMonths > 1 ? ` · ${r.periodMonths}-mo` : ""}</td>
                <td style={td}>{r.teacherName}</td>
                <td style={{ ...td, ...hi("fee") }}>{rm(r.fee)}</td>
                <td style={{ ...td, ...hi("discountAmount") }}>{r.discountAmount > 0 ? `−${rm(r.discountAmount)}` : "—"}</td>
                <td style={{ ...td, ...hi("commissionPct") }}>{r.commissionPct}%</td>
                <td style={{ ...td, ...hi("collected") }}>{r.collected ? "Yes" : "No"}</td>
                <td style={{ ...td, ...hi("gross") }}>{rm(r.gross)}</td>
                <td style={{ ...td, ...hi("teacherCut") }}>{rm(r.teacherCut)}</td>
                <td style={{ ...td, ...hi("adminCut") }}>{rm(r.adminCut)}</td>
                <td style={{ ...td, ...hi("deferredToMonth") }}>{r.deferredToMonth ? `→ ${formatYM(r.deferredToMonth)}` : "—"}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );

  const totalsLine = (t, label) => (
    <div style={{ display: "flex", gap: 18, flexWrap: "wrap", fontSize: 12, color: T.muted, margin: "8px 0" }}>
      <strong style={{ color: T.text }}>{label}</strong>
      <span>Collected <strong style={{ color: "#4ade80" }}>{rm(t.gross)}</strong></span>
      <span>Teachers <strong style={{ color: "#60a5fa" }}>{rm(t.teacher)}</strong></span>
      <span>Admin <strong style={{ color: "#c084fc" }}>{rm(t.admin)}</strong></span>
    </div>
  );

  const monthCard = snap => {
    const ym = snap.yearMonth, revs = revsOf(ym), hits = affectedBy(ym), open = openYM === ym;
    const latest = revs[0];
    return (
      <Card key={ym} T={T} style={{ marginBottom: 12, padding: 0, overflow: "hidden", border: `0.6px solid ${hits.length ? "rgba(253,181,42,0.6)" : T.border2}`, borderRadius: 12 }}>
        <div onClick={() => { setOpenYM(open ? null : ym); setView(latest ? "revised" : "original"); }}
          style={{ display: "flex", alignItems: "center", gap: 12, padding: "14px 16px", cursor: "pointer", flexWrap: "wrap" }}>
          <div style={{ fontSize: 15, fontWeight: 700, color: T.text, minWidth: 130 }}>{formatYMLong(ym)}</div>
          <Badge label="Finalized" color="#14CA74" bg="rgba(5,193,104,0.2)" />
          {revs.length > 0 && <Badge label={`Revised ×${revs.length}`} color="#FDB52A" bg="rgba(255,176,22,0.2)" />}
          {hits.length > 0 && <Badge label={`Affected by ${[...new Set(hits.map(h => formatYM(h.yearMonth)))].join(", ")}`} color="#FDB52A" bg="rgba(255,176,22,0.2)" />}
          <div style={{ marginLeft: "auto", fontSize: 12, color: T.muted }}>
            {snap.counts?.collected ?? "?"}/{snap.counts?.total ?? "?"} collected · {rm((latest ?? snap).totals?.gross)} · by {snap.finalizedBy?.name ?? "?"} {fmtTs(snap.finalizedAt)}
          </div>
          <span style={{ color: T.muted }}>{open ? "▲" : "▼"}</span>
        </div>

        {open && (
          <div style={{ borderTop: `0.6px solid ${T.border}`, padding: 16 }}>
            {hits.length > 0 && (
              <div style={{ ...amberBox, marginBottom: 12 }}>
                A revision of {[...new Set(hits.map(h => formatYMLong(h.yearMonth)))].join(", ")} changed a deferral that points into this month. The numbers below are the original — check whether this month also needs a revision.
              </div>
            )}
            {latest && (
              <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
                <Btn T={T} variant={view === "original" ? "primary" : "ghost"} style={{ fontSize: 11, padding: "5px 12px" }} onClick={() => setView("original")}>Original</Btn>
                <Btn T={T} variant={view === "revised" ? "primary" : "ghost"} style={{ fontSize: 11, padding: "5px 12px" }} onClick={() => setView("revised")}>Revised (rev {latest.revisionNo})</Btn>
              </div>
            )}
            {totalsLine(snap.totals, "Original")}
            {latest && totalsLine(latest.totals, `Revision ${latest.revisionNo}`)}
            {rowsTable(view === "revised" && latest ? latest.rows : snap.rows, view === "revised" && latest ? snap.rows : null)}

            {revs.length > 0 && (
              <div style={{ marginTop: 16 }}>
                <div style={{ fontSize: 11, color: T.muted, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 6 }}>Revision history</div>
                {revs.map(r => (
                  <div key={r.id} style={{ padding: "8px 0", borderBottom: `0.6px solid ${T.border}`, fontSize: 12, color: T.textSub }}>
                    <strong style={{ color: T.text }}>Revision {r.revisionNo}</strong> · {r.createdBy?.name} · {fmtTs(r.createdAt)} — {r.reason}
                    <div style={{ fontSize: 11, color: T.muted }}>{r.changes?.length ?? 0} field change(s){(r.affectedMonths ?? []).length ? ` · also affects ${r.affectedMonths.map(formatYM).join(", ")}` : ""}</div>
                  </div>
                ))}
              </div>
            )}

            <div style={{ marginTop: 14, display: "flex", gap: 10, alignItems: "center" }}>
              {isSys
                ? <Btn T={T} variant="ghost" onClick={() => startRevise(snap)}>Revise this month</Btn>
                : <span style={{ fontSize: 11, color: T.muted }}>Only a sysadmin can revise a finalized month.</span>}
            </div>
          </div>
        )}
      </Card>
    );
  };

  const reviseModal = reviseYM && (
    <Modal T={T} title={`Revise ${formatYMLong(reviseYM)}`} width={980} onClose={() => { setReviseYM(null); setDirty?.(false); }}>
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <div style={{ fontSize: 12, color: T.muted, lineHeight: 1.7 }}>
          Correct the inputs below. Gross, teacher and admin amounts recalculate. The original finalized month is kept as it is — this saves a new revision alongside it.
        </div>
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead><tr style={{ background: T.panel2 }}>{["Student", "Collected", "Fee (RM)", "Discount (RM)", "Rate %", "Defer to", "Gross", "Teacher", "Admin"].map(h => <th key={h} style={th}>{h}</th>)}</tr></thead>
            <tbody>
              {draft.filter(r => !r.covered).map(r => {
                const o = snapOf(reviseYM).rows.find(x => x.eid === r.eid);
                const mark = f => ((o?.[f] ?? null) !== (r[f] ?? null) ? { outline: "1px solid #FDB52A" } : {});
                const num = { width: 74, background: T.input, border: `0.6px solid ${T.border2}`, borderRadius: 4, color: T.text, padding: "4px 6px", fontSize: 12, fontFamily: "inherit" };
                return (
                  <tr key={r.eid} style={{ borderBottom: `0.6px solid ${T.border}` }}>
                    <td style={{ ...td, color: T.text }}>{r.studentName}<div style={{ fontSize: 10, color: T.muted }}>{r.instrument ?? "—"}</div></td>
                    <td style={td}><input type="checkbox" checked={r.collected} style={mark("collected")} onChange={e => edit(r.eid, "collected", e.target.checked)} /></td>
                    <td style={td}><input type="number" min={0} value={r.fee} style={{ ...num, ...mark("fee") }} onChange={e => edit(r.eid, "fee", e.target.value)} /></td>
                    <td style={td}><input type="number" min={0} value={r.discountAmount} style={{ ...num, ...mark("discountAmount") }} onChange={e => edit(r.eid, "discountAmount", e.target.value)} /></td>
                    <td style={td}><input type="number" min={0} max={100} value={r.commissionPct} style={{ ...num, width: 60, ...mark("commissionPct") }} onChange={e => edit(r.eid, "commissionPct", e.target.value)} /></td>
                    <td style={td}>
                      <select value={r.deferredToMonth ?? ""} onChange={e => edit(r.eid, "deferredToMonth", e.target.value)}
                        style={{ background: T.input, color: T.text, border: `0.6px solid ${T.border2}`, borderRadius: 4, padding: "4px 6px", fontSize: 11, fontFamily: "inherit", ...mark("deferredToMonth") }}>
                        <option value="">—</option>
                        {Array.from({ length: 12 }, (_, i) => addMonths(reviseYM, i + 1)).map(m => <option key={m} value={m}>{formatYM(m)}</option>)}
                      </select>
                    </td>
                    <td style={td}>{rm(r.gross)}</td><td style={td}>{rm(r.teacherCut)}</td><td style={td}>{rm(r.adminCut)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {totalsLine(snapOf(reviseYM).totals, "Original")}
        {totalsLine(draftTotals, "Revised")}
        {affected.length > 0 && <div style={amberBox}>This also affects {affected.map(formatYMLong).join(", ")} (deferrals). Those months will be highlighted in the Archive.</div>}
        {deferrals.length > 0 && (
          <div style={amberBox}>
            <strong>Warning — you are changing deferrals.</strong> Saving will rewrite the deferred amounts in the other months' ledgers:
            {deferrals.map(d => (
              <div key={d.eid} style={{ marginTop: 4 }}>
                • {d.studentName}{d.instrument ? ` (${d.instrument})` : ""}: {d.from ? formatYM(d.from) : "not deferred"} → {d.to ? formatYM(d.to) : "not deferred"}
                {d.to ? ` · carries ${rm(d.amount)}` : ""}
                {[d.from, d.to].filter(m => m && finalizedYMs.has(m)).map(m => (
                  <div key={m} style={{ marginLeft: 12, color: "#FF5A65" }}>{formatYMLong(m)} is finalized and cannot be rewritten here — revise that month too.</div>
                ))}
              </div>
            ))}
            <label style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 8, cursor: "pointer" }}>
              <input type="checkbox" checked={!needsDeferAck} onChange={e => setDeferAck(e.target.checked ? deferSig : null)} />
              I understand and want these months updated
            </label>
          </div>
        )}
        <label style={{ display: "flex", flexDirection: "column", gap: 5 }}>
          <span style={{ fontSize: 11, color: T.muted, textTransform: "uppercase", letterSpacing: "0.06em" }}>Reason for revision (required)</span>
          <textarea value={reason} onChange={e => setReason(e.target.value)} placeholder="What was wrong and why it is being corrected…"
            style={{ background: T.input, border: `1px solid ${T.border2}`, borderRadius: 8, color: T.text, padding: "9px 11px", fontSize: 13, outline: "none", fontFamily: "inherit", resize: "vertical", minHeight: 64 }} />
        </label>
        {error && <div style={errBox}>{error}</div>}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <span style={{ fontSize: 11, color: T.muted }}>{changes.length} field change(s)</span>
          <div style={{ display: "flex", gap: 9 }}>
            <Btn T={T} variant="ghost" onClick={() => { setReviseYM(null); setDirty?.(false); }}>Cancel</Btn>
            <Btn T={T} disabled={busy || !reason.trim() || changes.length === 0 || needsDeferAck} onClick={saveRevision}>{busy ? "Saving…" : "Save revision"}</Btn>
          </div>
        </div>
      </div>
    </Modal>
  );

  // ── notification archive ───────────────────────────────────────────────────
  const myNotifs = useMemo(() => notifs
    .filter(n => currentUser.role !== "teacher" || n.toTeacherId === currentUser.teacherId || n.fromTeacherId === currentUser.teacherId)
    .sort((a, b) => (b.resolvedAt?.seconds ?? 0) - (a.resolvedAt?.seconds ?? 0)), [notifs, currentUser]);

  const notifTab = (
    <div>
      {myNotifs.length === 0 && <p style={{ color: T.muted, fontSize: 13 }}>No read notifications yet. Once a request is approved or rejected it is kept here.</p>}
      {myNotifs.map(n => {
        const from = teachers.find(t => t.id === n.fromTeacherId), st = students.find(s => s.id === n.studentId);
        const en = enrolments.find(e => e.id === n.enrolmentId), room = rooms.find(r => r.id === n.requestedRoomId);
        const isClash = n.type === "clash_request";
        const ok = n.status === "approved";
        return (
          <Card key={n.id} T={T} style={{ marginBottom: 10, padding: "12px 16px", border: `0.6px solid ${T.border2}`, borderRadius: 10 }}>
            <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 6, flexWrap: "wrap" }}>
              <Badge label={isClash ? "Room Clash Request" : n.type === "grade_request" ? "Grade Update Request" : n.type} color={isClash ? "#fb923c" : "#60a5fa"} bg={isClash ? "#451a03" : "#0c1a2e"} />
              <Badge label={ok ? "Approved" : "Rejected"} color={ok ? "#14CA74" : "#FF5A65"} bg={ok ? "rgba(5,193,104,0.2)" : "rgba(255,90,101,0.2)"} />
              <span style={{ fontSize: 11, color: T.muted, marginLeft: "auto" }}>{fmtTs(n.resolvedAt)}</span>
            </div>
            <div style={{ fontSize: 12, color: T.textSub, lineHeight: 1.7 }}>
              {isClash
                ? <><strong style={{ color: T.text }}>{from?.name ?? "A teacher"}</strong> asked for <strong style={{ color: T.text }}>{room?.name ?? "a room"}</strong> on {n.requestedDate} {n.requestedStartTime}–{n.requestedEndTime} (clashing with {st?.name ?? "a student"}).</>
                : <><strong style={{ color: T.text }}>{from?.name ?? "A teacher"}</strong> asked to change <strong style={{ color: T.text }}>{st?.name ?? "a student"}</strong>{en?.instrument ? ` (${en.instrument})` : ""} to <strong style={{ color: T.text }}>{n.requestedGrade}</strong>. Reason: {n.reason}</>}
            </div>
          </Card>
        );
      })}
    </div>
  );

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16, gap: 10, flexWrap: "wrap" }}>
        <h2 style={{ fontSize: isMobile ? 18 : 24, fontWeight: 700, color: T.text, fontFamily: "'Red Hat Display', 'Plus Jakarta Sans', sans-serif" }}>Archive</h2>
        <div style={{ display: "flex", gap: 8 }}>
          {currentUser.role !== "teacher" && <Btn T={T} variant={tab === "months" ? "primary" : "ghost"} onClick={() => setTab("months")}>Finalized Months</Btn>}
          <Btn T={T} variant={tab === "notifications" ? "primary" : "ghost"} onClick={() => setTab("notifications")}>Notification Archive</Btn>
        </div>
      </div>

      {tab === "months" && currentUser.role !== "teacher" && (
        <>
          <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 14, flexWrap: "wrap" }}>
            <Btn T={T} variant="ghost" style={{ fontSize: 11 }} onClick={backup}>Download full backup</Btn>
            {backupMsg && <span style={{ fontSize: 11, color: T.muted }}>{backupMsg}</span>}
          </div>
          {months.length === 0
            ? <p style={{ color: T.muted, fontSize: 13, lineHeight: 1.7 }}>No months have been finalized yet. When you press <strong style={{ color: T.text }}>Finalize Month</strong> on the Payroll page, the month is saved here permanently.</p>
            : months.map(monthCard)}
        </>
      )}
      {tab === "notifications" && notifTab}
      {reviseModal}
    </div>
  );
}
