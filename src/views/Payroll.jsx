import { useState, useMemo } from "react";
import { Avatar, Badge, Card, Stat, Inp, Btn, Modal, SectionTitle, Checkbox } from "../components/UI.jsx";
import { buildMonthRows, buildCollectionSnapshot } from "../domain/payroll.js";
import { toSnapshotRow, totalsForRows, summariseMonth, snapshotRowToDisplay } from "../domain/months.js";
import { calcDiscountAmount, isDiscountActiveFor, TERM_LABEL } from "../domain/billing.js";
import { summariseDeposits } from "../domain/deposits.js";
import { addMonths, ymKey, formatYM, formatYMLong } from "../domain/time.js";
import { usePayrollMonth } from "../hooks/usePayrollMonth.js";

const errBox = { fontSize: 12, color: "#FF5A65", background: "rgba(255,90,101,0.08)", border: "0.6px solid rgba(255,90,101,0.35)", borderRadius: 6, padding: "8px 11px", lineHeight: 1.6 };
const rm = n => `RM ${Number(n || 0).toFixed(2)}`;
const MONEY = { green: "#4ade80", blue: "#60a5fa", violet: "#c084fc", amber: "#FDB52A", purple: "#9A91FB" };

export default function Payroll({
  students, enrolments, teachers, instruments, tables, adminFlatFee, attendance, discounts, deposits,
  monthSnapshots, monthRevisions, actions, log, T, currentUser, isMobile, setDirty, openPayoutPreview, goTo,
}) {
  const now = new Date();
  const [selY, setSelY] = useState(now.getFullYear());
  const [selM, setSelM] = useState(now.getMonth());
  const [teacherModal, setTeacherModal] = useState(null);
  const [form,  setForm]  = useState({});
  const [discountFor, setDiscountFor] = useState(null);   // row
  const [discPick,    setDiscPick]    = useState("");
  const [discNote,    setDiscNote]    = useState("");
  const [finalizeOpen, setFinalizeOpen] = useState(false);
  const [finalizeAck,  setFinalizeAck]  = useState(false);
  const [deferOpen,   setDeferOpen]   = useState({});
  const [deferTarget, setDeferTarget] = useState({});
  const [error, setError] = useState(null);
  const [busy,  setBusy]  = useState(false);
  const [flatDraft, setFlatDraft] = useState(null);

  const isTeacher  = currentUser?.role === "teacher";
  const isElevated = !isTeacher;

  const yearMonth = ymKey(selY, selM);
  const monthName = formatYMLong(yearMonth);
  const { feeStatus, payoutStatus, markFeeCollected, setDiscount, deferFee, undeferFee } = usePayrollMonth(yearMonth);

  const snapshot  = monthSnapshots.find(s => s.yearMonth === yearMonth) ?? null;
  const revisions = monthRevisions.filter(r => r.yearMonth === yearMonth).sort((a, b) => b.revisionNo - a.revisionNo);
  const latest    = revisions[0] ?? null;
  const finalized = !!snapshot;
  const [showOriginal, setShowOriginal] = useState(false);

  const studentName = id => students.find(s => s.id === id)?.name ?? "Unknown student";
  const monthOpts = Array.from({ length: 12 }, (_, i) => ({ value: addMonths(yearMonth, 1 + i), label: formatYMLong(addMonths(yearMonth, 1 + i)) }));

  // ── rows: live from the ledger, or frozen from the finalized snapshot / latest revision ──
  const rows = useMemo(() => {
    if (finalized) {
      const src = (showOriginal ? snapshot : latest ?? snapshot).rows;
      return src.map(snapshotRowToDisplay);
    }
    const ctx = { ym: yearMonth, ledger: feeStatus, teachers, tables, adminFlatFee, attendance };
    return buildMonthRows(ctx, enrolments);
  }, [finalized, showOriginal, snapshot, latest, yearMonth, feeStatus, teachers, tables, adminFlatFee, attendance, enrolments]);

  const nameFor = r => r.studentName ?? studentName(r.enrolment.studentId);
  const allRows = teachers.map(t => {
    const mine = rows.filter(r => r.teacherId === t.id);
    const live = mine.filter(r => !r.deferredToMonth);
    return {
      teacher: t, details: mine,
      totTeacher: live.reduce((a, r) => a + r.teacherCut, 0),
      totAdmin:   live.reduce((a, r) => a + r.adminCut, 0),
      totGross:   mine.reduce((a, r) => a + r.gross, 0),
    };
  });
  const shown = isTeacher ? allRows.filter(r => r.teacher.id === currentUser.teacherId) : allRows;
  const grandTeacher = allRows.reduce((a, r) => a + r.totTeacher, 0);
  const grandAdmin   = allRows.reduce((a, r) => a + r.totAdmin, 0);
  const grandGross   = allRows.reduce((a, r) => a + r.totGross, 0);
  const depositSummary = summariseDeposits(deposits);

  const orphanRows = rows.filter(r => !teachers.some(t => t.id === r.teacherId));

  // ── actions ────────────────────────────────────────────────────────────────
  async function run(fn) {
    setBusy(true); setError(null);
    try { await fn(); } catch (e) { setError(e.message); }
    setBusy(false);
  }

  function toggleCollected(r) {
    if (!isElevated || finalized || r.covered) return;
    return run(async () => {
      const next = !r.collected;
      await markFeeCollected(r.eid, next, next ? buildCollectionSnapshot(r) : null, currentUser.uid);
      log({
        type: "payroll", action: next ? "collect" : "uncollect",
        summary: `${next ? "Collected" : "Un-collected"} ${rm(r.net)} — ${nameFor(r)} (${r.enrolment.instrument ?? "—"}) for ${yearMonth}${r.period.months > 1 ? ` (${r.period.months}-month period)` : ""}`,
        entity: { kind: "enrolment", id: r.eid },
        meta: next ? { fee: r.fee, discount: r.discountAmount, commissionPct: r.commissionPct, term: r.period.term } : null,
      });
    });
  }

  function openDiscount(r) {
    setError(null);
    setDiscPick(r.discount?.id ?? "");
    setDiscNote(r.discount?.note ?? "");
    setDiscountFor(r);
  }
  // A discount lasts N months per student, counted from the fee month it was first applied to them
  const grantsOf = r => r?.enrolment?.discountGrants ?? {};
  const eligibleDiscounts = discounts.filter(d => isDiscountActiveFor(d, yearMonth, grantsOf(discountFor)[d.id]));
  const pickedDiscount    = eligibleDiscounts.find(d => d.id === discPick) ?? null;

  function saveDiscountChoice() {
    const r = discountFor;
    return run(async () => {
      const d = pickedDiscount;
      await setDiscount(r.eid, d ? { id: d.id, name: d.name, type: d.type, value: d.value, note: discNote.trim() } : null);
      const grants = grantsOf(r), prevId = r.discount?.id;
      if (d && !grants[d.id]) await actions.setDiscountGrant(r.eid, d.id, yearMonth);
      // undoing the very month that started the window frees the discount to start over
      if (prevId && prevId !== d?.id && grants[prevId] === yearMonth) await actions.setDiscountGrant(r.eid, prevId, null);
      log({
        type: "discount", action: d ? "apply" : "remove",
        summary: d ? `Applied "${d.name}" to ${nameFor(r)} (${r.enrolment.instrument}) for ${yearMonth}: −${rm(calcDiscountAmount(r.fee, d))}` : `Removed discount from ${nameFor(r)} (${r.enrolment.instrument}) for ${yearMonth}`,
        entity: { kind: "enrolment", id: r.eid }, meta: { note: discNote.trim() || null },
      });
      setDiscountFor(null);
    });
  }

  function handleDefer(r) {
    const target = deferTarget[r.eid] ?? monthOpts[0].value;
    return run(async () => {
      await deferFee(r.eid, target, r.hypotheticalGross);
      log({ type: "deferral", action: "defer", summary: `Deferred ${nameFor(r)}'s ${yearMonth} payout (${rm(r.hypotheticalGross)}) to ${target}`, entity: { kind: "enrolment", id: r.eid } });
      setDeferOpen(p => ({ ...p, [r.eid]: false }));
    });
  }
  function handleUndefer(r) {
    return run(async () => {
      await undeferFee(r.eid, r.deferredToMonth);
      log({ type: "deferral", action: "undo", summary: `Undid deferral of ${nameFor(r)}'s ${yearMonth} payout`, entity: { kind: "enrolment", id: r.eid } });
    });
  }

  // ── finalize ───────────────────────────────────────────────────────────────
  const liveSummary = useMemo(() => (finalized ? null : summariseMonth(rows.map(r => toSnapshotRow(r)))), [finalized, rows]);

  function doFinalize() {
    return run(async () => {
      const snapRows = rows.map(r => toSnapshotRow(r, {
        studentName: studentName(r.enrolment.studentId),
        teacherName: teachers.find(t => t.id === r.teacherId)?.name ?? "",
      }));
      const totals = totalsForRows(snapRows);
      const summary = summariseMonth(snapRows);
      const payout = Object.fromEntries(Object.entries(payoutStatus).map(([k, v]) => [k, { paid: !!v.paid, paidAt: v.paidAt ?? null }]));
      await actions.finalizeMonth(yearMonth, { rows: snapRows, totals, summary, payoutStatus: payout });
      setFinalizeOpen(false); setFinalizeAck(false);
    });
  }

  // ── teacher add / edit ─────────────────────────────────────────────────────
  function openAddTeacher()  { setError(null); setForm({ name: "", instruments: [], commissionPct: 60 }); setTeacherModal("add"); }
  function openEditTeacher(t) { setError(null); setForm({ name: t.name, instruments: [...(t.instruments ?? [])], commissionPct: t.commissionPct }); setTeacherModal(t); }
  function saveTeacher() {
    return run(async () => {
      await actions.saveTeacher(teacherModal === "add" ? null : teacherModal.id, form);
      setTeacherModal(null); setDirty?.(false);
    });
  }
  function removeTeacher(t) {
    if (!confirm(`Remove ${t.name}?`)) return;
    return run(() => actions.removeTeacher(t.id));
  }
  function toggleInstrument(inst) {
    setDirty?.(true);
    setForm(f => ({ ...f, instruments: f.instruments.includes(inst) ? f.instruments.filter(i => i !== inst) : [...f.instruments, inst] }));
  }

  // ── deferral summary ───────────────────────────────────────────────────────
  const deferTo = [], deferFrom = [];
  for (const row of shown) for (const d of row.details) {
    if (d.deferredToMonth) deferTo.push({ teacher: row.teacher.name, student: nameFor(d), toMonth: d.deferredToMonth, amount: d.hypotheticalGross });
    for (const df of d.deferredFromDetails) deferFrom.push({ teacher: row.teacher.name, student: nameFor(d), fromMonth: df.ym, amount: df.amount });
  }
  const sumOf = list => list.reduce((s, e) => s + e.amount, 0);

  const deferralCard = isElevated && (
    <Card T={T} style={{ marginBottom: 18, padding: "14px 18px", border: `0.6px solid ${T.border2}`, borderRadius: 12 }}>
      <div style={{ fontSize: 13, fontWeight: 700, color: T.text, marginBottom: 12, fontFamily: "'Red Hat Display', 'Plus Jakarta Sans', sans-serif" }}>Fee Deferrals</div>
      <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr", gap: 20 }}>
        {[["Deferred To", deferTo, "toMonth", "→", MONEY.amber], ["Deferred From", deferFrom, "fromMonth", "←", MONEY.purple]].map(([title, list, key, arrow, color]) => (
          <div key={title}>
            <div style={{ fontSize: 10, fontWeight: 600, color, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 8, paddingBottom: 6, borderBottom: `0.6px solid ${T.border}` }}>{title}</div>
            {list.length === 0 ? <div style={{ fontSize: 12, color: T.muted, fontStyle: "italic" }}>No deferrals</div> : (
              <>
                {list.map((e, i) => (
                  <div key={i} style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", padding: "7px 0", borderBottom: `0.6px solid ${T.border}` }}>
                    <div>
                      <div style={{ fontSize: 12, color: T.text, fontWeight: 500 }}>{e.student}</div>
                      <div style={{ fontSize: 11, color: T.muted }}>{e.teacher}</div>
                      <div style={{ fontSize: 10, color, marginTop: 2 }}>{arrow} {formatYM(e[key])}</div>
                    </div>
                    <div style={{ fontSize: 12, fontWeight: 700, color, flexShrink: 0, marginLeft: 8 }}>{rm(e.amount)}</div>
                  </div>
                ))}
                {list.length > 1 && (
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, fontWeight: 700, marginTop: 8, paddingTop: 6, borderTop: `0.6px solid ${T.border2}` }}>
                    <span style={{ color: T.text }}>Total</span><span style={{ color }}>{rm(sumOf(list))}</span>
                  </div>
                )}
              </>
            )}
          </div>
        ))}
      </div>
    </Card>
  );

  // ── row pieces ─────────────────────────────────────────────────────────────
  const typeBadge = r => r.enrolment.attendanceBased
    ? <Badge label="Att. Based" color="#60a5fa" bg="#0c1a2e" />
    : <Badge label="Full Fee" color={T.muted} bg={T.dim} />;

  // FEE: original struck through when a discount is live, discounted amount larger and bold
  const feeCell = r => {
    if (r.covered) return <span style={{ fontSize: 11, color: T.muted }}>—</span>;
    const discounted = isElevated && r.discountAmount > 0;
    return (
      <div>
        {discounted && <div style={{ fontSize: 10, color: T.muted, textDecoration: "line-through" }}>{rm(r.fee)}</div>}
        <div style={{ fontSize: discounted ? 15 : 11, fontWeight: discounted ? 800 : 400, color: discounted ? "#4ade80" : T.muted }}>
          {rm(isElevated ? r.net : r.net)}
        </div>
        {r.enrolment.attendanceBased && <div style={{ fontSize: 10, color: T.muted }}>{r.attended}/{r.scheduled} cls</div>}
        {r.period.months > 1 && <div style={{ fontSize: 9, color: T.muted }}>{r.period.months}-mo fee</div>}
      </div>
    );
  };

  const discountBtn = r => {
    if (!isElevated || r.covered) return null;
    const disabled = finalized || r.collected;
    return (
      <button disabled={disabled} onClick={() => openDiscount(r)} title={r.collected ? "Un-collect the fee to change its discount" : ""}
        style={{
          fontSize: 10, color: r.discount ? "#4ade80" : T.muted, background: r.discount ? "rgba(20,202,116,0.12)" : T.dim,
          border: r.discount ? "0.6px solid rgba(20,202,116,0.35)" : "none", borderRadius: 3, padding: "2px 8px",
          cursor: disabled ? "default" : "pointer", fontFamily: "inherit", opacity: disabled && !r.discount ? 0.5 : 1,
        }}>
        {r.discount ? `−${rm(r.discountAmount)} · ${r.discount.name}` : "Discount"}
      </button>
    );
  };

  const collectionTop = r => {
    if (r.covered) return <div style={{ fontSize: 10, color: T.muted }}>Covered by {formatYM(r.coveredBy)} fee</div>;
    return (
      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
        <button disabled={!isElevated || finalized || busy} onClick={() => toggleCollected(r)}
          style={{
            width: 16, height: 16, borderRadius: 3, border: `0.6px solid ${r.collected ? "#14CA74" : T.border2}`,
            background: r.collected ? "rgba(5,193,104,0.2)" : T.input, cursor: isElevated && !finalized ? "pointer" : "default",
            display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, padding: 0,
          }}>
          {r.collected && <span style={{ fontSize: 9, color: "#14CA74", lineHeight: 1 }}>✓</span>}
        </button>
        <div>
          <div style={{ fontSize: 10, color: r.collected ? "#14CA74" : T.muted, fontWeight: 500 }}>{r.collected ? "Collected" : "Pending"}</div>
          {r.collected && r.collectedAt && (
            <div style={{ fontSize: 9, color: T.muted }}>
              {(r.collectedAt.toDate ? r.collectedAt.toDate() : new Date(r.collectedAt)).toLocaleDateString("en-MY", { day: "numeric", month: "short" })}
            </div>
          )}
          {isElevated && r.depositApplied > 0 && (
            <div style={{ fontSize: 9, color: MONEY.purple }}>Deposit −{rm(r.depositApplied)} · pays {rm(r.dueFromStudent)}</div>
          )}
        </div>
      </div>
    );
  };

  const deferControls = r => {
    if (!isElevated || r.covered) return null;
    if (r.deferredToMonth) return (
      <div style={{ display: "flex", alignItems: "center", gap: 5, flexWrap: "wrap" }}>
        <Badge label={`→ ${formatYM(r.deferredToMonth)}`} color="#FDB52A" bg="rgba(253,181,42,0.12)" border="rgba(253,181,42,0.3)" />
        {!finalized && <button onClick={() => handleUndefer(r)} style={{ fontSize: 9, color: T.muted, background: "transparent", border: "none", cursor: "pointer", padding: 0, fontFamily: "inherit" }}>Undo</button>}
      </div>
    );
    if (finalized) return r.deferredFromMonths.length ? <div style={{ fontSize: 9, color: MONEY.purple }}>+ from {r.deferredFromMonths.map(formatYM).join(", ")}</div> : null;
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
        {deferOpen[r.eid] ? (
          <div style={{ display: "flex", alignItems: "center", gap: 5, flexWrap: "wrap" }}>
            <select value={deferTarget[r.eid] ?? monthOpts[0].value} onChange={e => setDeferTarget(p => ({ ...p, [r.eid]: e.target.value }))}
              style={{ background: T.input, color: T.text, border: `0.6px solid ${T.border2}`, borderRadius: 4, padding: "2px 5px", fontSize: 10, fontFamily: "inherit", outline: "none", maxWidth: 120 }}>
              {monthOpts.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
            <Btn T={T} style={{ padding: "2px 8px", fontSize: 9 }} onClick={() => handleDefer(r)}>OK</Btn>
            <button onClick={() => setDeferOpen(p => ({ ...p, [r.eid]: false }))} style={{ fontSize: 9, color: T.muted, background: "transparent", border: "none", cursor: "pointer", padding: 0, fontFamily: "inherit" }}>✕</button>
          </div>
        ) : (
          <button onClick={() => setDeferOpen(p => ({ ...p, [r.eid]: true }))}
            style={{ fontSize: 9, color: T.muted, background: T.dim, border: "none", borderRadius: 3, padding: "2px 8px", cursor: "pointer", fontFamily: "inherit", alignSelf: "flex-start" }}>
            Defer payout →
          </button>
        )}
        {r.deferredFromMonths.length > 0 && <div style={{ fontSize: 9, color: MONEY.purple }}>+ from {r.deferredFromMonths.map(formatYM).join(", ")}</div>}
      </div>
    );
  };

  // ── modals ─────────────────────────────────────────────────────────────────
  const teacherForm = teacherModal && isElevated && (
    <Modal T={T} title={teacherModal === "add" ? "Add Teacher" : "Edit Teacher"} onClose={() => { setTeacherModal(null); setDirty?.(false); }}>
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        <Inp T={T} label="Full Name" value={form.name} onChange={e => { setDirty?.(true); setForm(f => ({ ...f, name: e.target.value })); }} />
        <div>
          <div style={{ fontSize: 11, color: T.muted, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 8 }}>Instruments (select all that apply)</div>
          <div style={{ display: "flex", gap: 7, flexWrap: "wrap" }}>
            {instruments.map(inst => {
              const active = form.instruments?.includes(inst);
              return (
                <button key={inst} onClick={() => toggleInstrument(inst)} style={{
                  padding: "5px 12px", borderRadius: 7, border: "none", cursor: "pointer", fontFamily: "inherit", fontSize: 12, fontWeight: 600,
                  background: active ? T.accent + "22" : T.dim, color: active ? T.accent : T.muted, outline: active ? `1px solid ${T.accent}55` : "none",
                }}>{inst}</button>
              );
            })}
            {instruments.length === 0 && <span style={{ fontSize: 12, color: T.muted }}>Add instruments on the Grades & Fees page first.</span>}
          </div>
        </div>
        <Inp T={T} label="Default Commission % (0–100)" type="number" min={0} max={100} value={form.commissionPct}
          onChange={e => { setDirty?.(true); setForm(f => ({ ...f, commissionPct: e.target.value })); }} />
        <div style={{ fontSize: 11, color: T.muted }}>Individual enrolments can override this rate from the Students page.</div>
        {error && <div style={errBox}>{error}</div>}
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 9, marginTop: 4 }}>
          <Btn T={T} variant="ghost" onClick={() => { setTeacherModal(null); setDirty?.(false); }}>Cancel</Btn>
          <Btn T={T} disabled={busy} onClick={saveTeacher}>{teacherModal === "add" ? "Add" : "Save Changes"}</Btn>
        </div>
      </div>
    </Modal>
  );

  const discountModal = discountFor && (
    <Modal T={T} title={`Discount — ${nameFor(discountFor)} (${discountFor.enrolment.instrument ?? "—"})`} width={440} onClose={() => setDiscountFor(null)}>
      <div style={{ display: "flex", flexDirection: "column", gap: 13 }}>
        <div style={{ fontSize: 12, color: T.muted }}>{formatYMLong(yearMonth)} fee: <strong style={{ color: T.text }}>{rm(discountFor.fee)}</strong></div>
        {eligibleDiscounts.length === 0 ? (
          <div style={{ fontSize: 12, color: T.muted, lineHeight: 1.7 }}>No discounts are available for this student in {formatYMLong(yearMonth)}. Create one on the Discounts page.</div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {[{ id: "", name: "No discount" }, ...eligibleDiscounts].map(d => (
              <label key={d.id} style={{ display: "flex", alignItems: "center", gap: 9, padding: "8px 11px", borderRadius: 6, cursor: "pointer", border: `0.6px solid ${discPick === d.id ? T.accent : T.border2}`, background: discPick === d.id ? T.accent + "14" : "transparent" }}>
                <input type="radio" name="disc" checked={discPick === d.id} onChange={() => setDiscPick(d.id)} />
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 12, color: T.text, fontWeight: 600 }}>{d.name}</div>
                  {d.id && <div style={{ fontSize: 11, color: T.muted }}>{d.type === "percent" ? `${d.value}% off` : `${rm(d.value)} off`} → −{rm(calcDiscountAmount(discountFor.fee, d))}</div>}
                </div>
              </label>
            ))}
          </div>
        )}
        {pickedDiscount && (
          <>
            <div style={{ fontSize: 12, color: T.textSub }}>
              New fee: <strong style={{ color: "#4ade80" }}>{rm(discountFor.fee - calcDiscountAmount(discountFor.fee, pickedDiscount))}</strong>
              {pickedDiscount.type === "amount" && pickedDiscount.value > discountFor.fee && <span style={{ color: MONEY.amber }}> (capped at the fee)</span>}
            </div>
            <Inp T={T} label="Note (optional)" value={discNote} onChange={e => setDiscNote(e.target.value)} placeholder="e.g. sibling referral" />
          </>
        )}
        {error && <div style={errBox}>{error}</div>}
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 9 }}>
          <Btn T={T} variant="ghost" onClick={() => setDiscountFor(null)}>Cancel</Btn>
          <Btn T={T} disabled={busy} onClick={saveDiscountChoice}>Save</Btn>
        </div>
      </div>
    </Modal>
  );

  const finalizeModal = finalizeOpen && liveSummary && (
    <Modal T={T} title={`Finalize ${monthName}`} width={500} onClose={() => { setFinalizeOpen(false); setFinalizeAck(false); }}>
      <div style={{ display: "flex", flexDirection: "column", gap: 13 }}>
        <p style={{ fontSize: 13, color: T.textSub, lineHeight: 1.7 }}>
          Finalizing saves this month's fees and payroll as an <strong style={{ color: T.text }}>official, permanent record</strong>. It can't be edited afterwards — mistakes are corrected on the Archive page, which keeps this original.
        </p>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
          {[["Collected", `${liveSummary.collected} of ${liveSummary.total}`], ["Uncollected", liveSummary.uncollected], ["Deferred out", liveSummary.deferredOut], ["Deferred in", liveSummary.deferredIn],
            ["Total collected", rm(liveSummary.gross)], ["Teacher payouts", rm(liveSummary.teacher)], ["Admin revenue", rm(liveSummary.admin)]].map(([k, v]) => (
            <div key={k} style={{ background: T.panel2, border: `0.6px solid ${T.border2}`, borderRadius: 6, padding: "8px 11px" }}>
              <div style={{ fontSize: 10, color: T.muted, textTransform: "uppercase", letterSpacing: "0.05em" }}>{k}</div>
              <div style={{ fontSize: 14, fontWeight: 700, color: T.text }}>{v}</div>
            </div>
          ))}
        </div>
        {liveSummary.uncollected > 0 && (
          <div style={{ ...errBox, color: MONEY.amber, background: "rgba(253,181,42,0.08)", border: "0.6px solid rgba(253,181,42,0.4)" }}>
            <strong>{liveSummary.uncollected} fee(s) are still uncollected</strong> and will be recorded as unpaid:
            <div>{liveSummary.uncollectedRows.slice(0, 8).map(r => <div key={r.eid}>• {r.studentName || studentName(r.studentId)} — {r.instrument ?? "—"}</div>)}
              {liveSummary.uncollectedRows.length > 8 && <div>…and {liveSummary.uncollectedRows.length - 8} more</div>}</div>
          </div>
        )}
        <Checkbox T={T} label={`I have checked every fee — collected, uncollected and deferred — and every payout for ${monthName}.`} checked={finalizeAck} onChange={() => setFinalizeAck(a => !a)} />
        {error && <div style={errBox}>{error}</div>}
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 9 }}>
          <Btn T={T} variant="ghost" onClick={() => { setFinalizeOpen(false); setFinalizeAck(false); }}>Not yet</Btn>
          <Btn T={T} disabled={!finalizeAck || busy} onClick={doFinalize}>{busy ? "Finalizing…" : "Finalize Month"}</Btn>
        </div>
      </div>
    </Modal>
  );

  // ── page chrome ────────────────────────────────────────────────────────────
  const monthNav = (
    <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
      <Btn T={T} variant="ghost" style={{ padding: "5px 11px" }} onClick={() => { const d = new Date(selY, selM - 1, 1); setSelY(d.getFullYear()); setSelM(d.getMonth()); }}>‹</Btn>
      <span style={{ fontSize: isMobile ? 12 : 13, color: T.text, fontWeight: 600, minWidth: isMobile ? 0 : 130, textAlign: "center" }}>{monthName}</span>
      <Btn T={T} variant="ghost" style={{ padding: "5px 11px" }} onClick={() => { const d = new Date(selY, selM + 1, 1); setSelY(d.getFullYear()); setSelM(d.getMonth()); }}>›</Btn>
    </div>
  );

  const finalizedBanner = finalized && (
    <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap", background: "rgba(20,202,116,0.08)", border: "0.6px solid rgba(20,202,116,0.35)", borderRadius: 8, padding: "10px 14px", marginBottom: 16 }}>
      <Badge label="Finalized" color="#14CA74" bg="rgba(5,193,104,0.2)" />
      {latest && <Badge label={`Revised (rev ${latest.revisionNo})`} color="#FDB52A" bg="rgba(255,176,22,0.2)" />}
      <span style={{ fontSize: 12, color: T.textSub, flex: 1 }}>
        Locked{snapshot.finalizedBy?.name ? ` by ${snapshot.finalizedBy.name}` : ""}
        {snapshot.finalizedAt?.toDate ? ` on ${snapshot.finalizedAt.toDate().toLocaleDateString("en-MY", { day: "numeric", month: "long", year: "numeric" })}` : ""}.
        {latest ? (showOriginal ? " Showing the original." : " Showing the latest revision.") : ""}
      </span>
      {latest && <Btn T={T} variant="ghost" style={{ fontSize: 11, padding: "4px 10px" }} onClick={() => setShowOriginal(s => !s)}>{showOriginal ? "Show revised" : "Show original"}</Btn>}
      {isElevated && <Btn T={T} variant="ghost" style={{ fontSize: 11, padding: "4px 10px" }} onClick={() => goTo?.("archive")}>Open in Archive</Btn>}
    </div>
  );

  const affectedBanner = (() => {
    const hit = monthRevisions.filter(r => (r.affectedMonths ?? []).includes(yearMonth));
    if (!hit.length) return null;
    return (
      <div style={{ ...errBox, color: MONEY.amber, background: "rgba(253,181,42,0.08)", border: "0.6px solid rgba(253,181,42,0.4)", marginBottom: 16 }}>
        A revision of {[...new Set(hit.map(r => r.yearMonth))].map(formatYMLong).join(", ")} affects this month (a deferral points here). Check the numbers below.
      </div>
    );
  })();

  const headerRight = (
    <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
      {monthNav}
      {isElevated && !finalized && <Btn T={T} onClick={() => { setError(null); setFinalizeAck(false); setFinalizeOpen(true); }} style={{ marginLeft: 6 }}>Finalize Month</Btn>}
      {isElevated && !isMobile && <Btn T={T} onClick={openAddTeacher} style={{ background: "#CB3CFF", color: "#fff", borderRadius: 4, padding: "8px 16px", fontSize: 12, fontWeight: 500, border: "none" }}>+ Add Teacher</Btn>}
    </div>
  );

  const flatFeeCard = isElevated && !finalized && (
    <Card T={T} style={{ marginBottom: 16, display: "flex", alignItems: "center", gap: 20, padding: "13px 18px", flexWrap: "wrap", border: `0.6px solid ${T.border2}`, borderRadius: 12 }}>
      <SectionTitle T={T}>Admin Flat Fee per Student</SectionTitle>
      <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
        <span style={{ fontSize: 12, color: T.muted }}>RM</span>
        <input type="number" min={0} value={flatDraft ?? adminFlatFee}
          onChange={e => setFlatDraft(e.target.value)}
          onBlur={() => { if (flatDraft !== null && Number(flatDraft) !== adminFlatFee) run(() => actions.saveAdminFlatFee(flatDraft)).then(() => setFlatDraft(null)); else setFlatDraft(null); }}
          style={{ width: 70, background: T.input, border: `1px solid ${T.border2}`, borderRadius: 6, color: T.text, padding: "5px 8px", fontSize: 13, outline: "none", fontFamily: "inherit", textAlign: "center" }} />
        <span style={{ fontSize: 11, color: T.muted }}>deducted first, then split commission (per month of the billing period)</span>
      </div>
      <div style={{ marginLeft: "auto", fontSize: 11, color: T.muted, lineHeight: 1.6 }}>
        Full Fee: Gross = fee after discount<br />Att. Based: Gross = (attended ÷ scheduled) × fee after discount
      </div>
    </Card>
  );

  const stats = isElevated && (
    <div style={{ display: "flex", gap: 12, marginBottom: 18, flexWrap: "wrap" }}>
      <Stat T={T} label="Teacher Payouts" value={rm(grandTeacher)} icon="♪" />
      <Stat T={T} label="Admin Revenue" value={rm(grandAdmin)} icon="₿" />
      <Stat T={T} label="Total Collected" value={rm(grandGross)} icon="✓" />
      <Stat T={T} label="Deposits Held (liability)" value={rm(depositSummary.liability)} icon="⌂" />
    </div>
  );

  const teacherHeader = row => (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "14px 16px", borderBottom: `0.6px solid ${T.border}`, gap: 10, flexWrap: "wrap" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <Avatar name={row.teacher.name} size={34} />
        <div>
          <div style={{ fontSize: 14, fontWeight: 700, color: T.text }}>{row.teacher.name}</div>
          <div style={{ fontSize: 11, color: T.muted }}>{(row.teacher.instruments ?? []).join(", ") || "No instruments"} · {row.teacher.commissionPct}% default commission</div>
        </div>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
        <div style={{ textAlign: "right" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, justifyContent: "flex-end" }}>
            <div style={{ fontSize: 20, fontWeight: 800, color: MONEY.blue }}>{rm(row.totTeacher)}</div>
            {payoutStatus[row.teacher.id]?.paid
              ? <Badge label={`Paid ${payoutStatus[row.teacher.id].paidAt?.toDate?.().toLocaleDateString("en-MY", { day: "numeric", month: "short" }) ?? ""}`} color="#14CA74" bg="rgba(5,193,104,0.2)" border="rgba(5,193,104,0.5)" />
              : <Badge label="Unpaid" color="#FDB52A" bg="rgba(255,176,22,0.2)" border="rgba(255,176,22,0.2)" />}
          </div>
          {isElevated && <div style={{ fontSize: 11, color: T.muted }}>Admin: {rm(row.totAdmin)}</div>}
        </div>
        {isElevated && !isMobile && (
          <>
            <Btn T={T} variant="ghost" style={{ padding: "5px 11px", fontSize: 11 }} onClick={() => openPayoutPreview(row.teacher, selY, selM)}>Pay Out</Btn>
            <Btn T={T} variant="ghost" style={{ padding: "5px 11px", fontSize: 11 }} onClick={() => openEditTeacher(row.teacher)}>Edit</Btn>
            <Btn T={T} variant="danger" style={{ padding: "5px 11px", fontSize: 11 }} onClick={() => removeTeacher(row.teacher)}>Remove</Btn>
          </>
        )}
      </div>
    </div>
  );

  const errorBar = error && !teacherModal && !discountFor && !finalizeOpen && <div style={{ ...errBox, marginBottom: 14 }}>{error}</div>;

  // ── mobile ─────────────────────────────────────────────────────────────────
  if (isMobile) {
    return (
      <div>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14, gap: 8, flexWrap: "wrap" }}>
          <h2 style={{ fontSize: 18, fontWeight: 700, color: T.text, fontFamily: "'Red Hat Display', 'Plus Jakarta Sans', sans-serif" }}>Payroll</h2>
          {headerRight}
        </div>
        {errorBar}{finalizedBanner}{affectedBanner}{deferralCard}
        {shown.map(row => (
          <Card key={row.teacher.id} T={T} style={{ marginBottom: 12, padding: 14 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
              <Avatar name={row.teacher.name} size={36} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 14, fontWeight: 700, color: T.text }}>{row.teacher.name}</div>
                <div style={{ fontSize: 11, color: T.muted }}>{row.teacher.commissionPct}% default commission</div>
              </div>
              <div style={{ textAlign: "right" }}>
                <div style={{ fontSize: 18, fontWeight: 800, color: MONEY.blue }}>RM {row.totTeacher.toFixed(0)}</div>
                <div style={{ fontSize: 10, color: T.muted }}>payout</div>
              </div>
            </div>
            {row.details.length === 0 && <div style={{ fontSize: 12, color: T.muted }}>No students assigned.</div>}
            {row.details.map(d => (
              <div key={d.eid} style={{ borderTop: `1px solid ${T.border}`, padding: "8px 0" }}>
                <div style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, color: T.text, fontWeight: 500 }}>{nameFor(d)}</div>
                    <div style={{ fontSize: 11, color: T.muted }}>{d.enrolment.grade} · {d.enrolment.instrument ?? "—"} · {d.enrolment.schedule?.duration ?? "?"} min</div>
                    <div style={{ marginTop: 3 }}>{feeCell(d)}</div>
                  </div>
                  <div style={{ textAlign: "right", flexShrink: 0 }}>
                    {d.deferredToMonth ? <div style={{ fontSize: 12, color: MONEY.amber, fontWeight: 600 }}>Deferred</div>
                      : <div style={{ fontSize: 13, fontWeight: 700, color: MONEY.blue }}>{rm(d.teacherCut)}</div>}
                    <div style={{ marginTop: 6 }}>{collectionTop(d)}</div>
                  </div>
                </div>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 6 }}>{discountBtn(d)}{deferControls(d)}</div>
              </div>
            ))}
          </Card>
        ))}
        {isElevated && <Btn T={T} onClick={openAddTeacher} style={{ width: "100%", marginTop: 4 }}>+ Add Teacher</Btn>}
        {teacherForm}{discountModal}{finalizeModal}
      </div>
    );
  }

  // ── desktop ────────────────────────────────────────────────────────────────
  // Student | Grade | Duration | Type | Fee | Gross | Teacher | Admin | Collection
  const colGrid = "1.5fr 0.8fr 0.7fr 0.9fr 1.2fr 0.9fr 0.9fr 0.9fr 1.6fr";
  const heads = ["Student", "Grade", "Duration", "Type", "Fee", "Gross", "Teacher", isElevated ? "Admin" : "", "Collection"];
  const sub = { fontSize: 10, color: T.muted };

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 18, gap: 10, flexWrap: "wrap" }}>
        <h2 style={{ fontSize: 24, fontWeight: 700, color: T.text, fontFamily: "'Red Hat Display', 'Plus Jakarta Sans', sans-serif" }}>Payroll</h2>
        {headerRight}
      </div>
      {errorBar}{finalizedBanner}{affectedBanner}{flatFeeCard}{stats}{deferralCard}

      {orphanRows.length > 0 && (
        <div style={{ ...errBox, color: MONEY.amber, background: "rgba(253,181,42,0.08)", border: "0.6px solid rgba(253,181,42,0.4)", marginBottom: 14 }}>
          {orphanRows.length} enrolment(s) belong to a teacher who no longer exists, so they aren't listed below. Reassign them on the Students page.
        </div>
      )}

      {shown.map(row => (
        <Card key={row.teacher.id} T={T} style={{ marginBottom: 14, padding: 0, overflow: "hidden", border: `0.6px solid ${T.border2}`, borderRadius: 12 }}>
          {teacherHeader(row)}
          {row.details.length === 0 && <div style={{ padding: "12px 16px", fontSize: 12, color: T.muted }}>No students billed this month.</div>}

          {row.details.length > 0 && (
            <div style={{ display: "grid", gridTemplateColumns: colGrid, alignItems: "center", padding: "6px 16px 6px 28px", borderBottom: `0.6px solid ${T.border}` }}>
              {heads.map((h, i) => <div key={i} style={{ fontSize: 10, color: T.muted, textTransform: "uppercase", letterSpacing: "0.05em" }}>{h}</div>)}
            </div>
          )}

          {row.details.map(d => (
            <div key={d.eid} style={{ borderBottom: `0.6px solid ${T.border}`, padding: "9px 16px 9px 28px", background: d.deferredToMonth ? T.rowAlt : "transparent", opacity: d.covered ? 0.7 : 1 }}>
              {/* top row */}
              <div style={{ display: "grid", gridTemplateColumns: colGrid, alignItems: "center" }}>
                <div style={{ fontSize: 13, color: T.text, fontWeight: 500 }}>{nameFor(d)}</div>
                <div style={{ fontSize: 11, color: T.muted }}>{d.enrolment.grade}</div>
                <div style={{ fontSize: 11, color: T.muted }}>{d.enrolment.schedule?.duration ?? "—"} min</div>
                <div>{typeBadge(d)}</div>
                <div>{feeCell(d)}</div>
                <div>
                  <div style={{ fontSize: 12, fontWeight: 700, color: MONEY.green }}>{rm(d.gross)}</div>
                  {d.deferredGrossExtra > 0 && <div style={{ fontSize: 9, color: MONEY.purple, marginTop: 1 }}>+{rm(d.deferredGrossExtra)} deferred in</div>}
                </div>
                <div>{d.deferredToMonth ? <div style={{ fontSize: 11, fontWeight: 600, color: MONEY.amber }}>Deferred</div> : <div style={{ fontSize: 12, fontWeight: 700, color: MONEY.blue }}>{rm(d.teacherCut)}</div>}</div>
                {isElevated ? (
                  <div style={{ fontSize: 12, color: d.deferredToMonth ? T.muted : MONEY.violet }}>
                    {d.deferredToMonth ? "—" : <>{rm(d.adminCut)}{d.flatDeducted > 0 && <span style={{ display: "block", fontSize: 9, color: T.muted }}>RM{d.flatDeducted.toFixed(2)} flat</span>}</>}
                  </div>
                ) : <div />}
                {collectionTop(d)}
              </div>
              {/* bottom row */}
              <div style={{ display: "grid", gridTemplateColumns: colGrid, alignItems: "center", marginTop: 5 }}>
                <div style={sub}>{d.enrolment.instrument ?? "No longer offered"} · {TERM_LABEL[d.period.term]?.split(" ")[0] ?? ""}</div>
                <div style={sub}>{d.enrolment.syllabus === "contemporary" ? "Contemporary" : "Classical"}</div>
                <div />
                <div />
                <div>{discountBtn(d)}</div>
                <div />
                <div style={sub}>{!d.covered && `${d.commissionPct}%`}</div>
                <div />
                <div>{deferControls(d)}</div>
              </div>
            </div>
          ))}
        </Card>
      ))}

      {teacherForm}{discountModal}{finalizeModal}
    </div>
  );
}
