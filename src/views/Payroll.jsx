import { useState, useMemo, useRef, useEffect } from "react";
import { Avatar, Badge, Card, Stat, Inp, Btn, Modal, SectionTitle, Checkbox, ShakeBox } from "../components/UI.jsx";
import { useShakeError } from "../hooks/useShakeError.js";
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
  students, enrolments, teachers, instruments, tables, adminFlatFee, attendance, calendar, discounts, deposits,
  monthSnapshots, monthRevisions, actions, log, T, currentUser, isMobile, setDirty, openPayoutPreview, goTo, intent,
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
  const [drag, setDrag] = useState(null);                  // click-drag over Collection ticks: { target, ids:Set }
  const dragRef = useRef(null);
  const pendingLogs = useRef({});                         // eid → timer: collect/un-collect log entries waiting out the 3 s grace
  const [deferOpen,   setDeferOpen]   = useState({});
  const [deferTarget, setDeferTarget] = useState({});
  const [error, setError, errShake] = useShakeError();
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
    const ctx = { ym: yearMonth, ledger: feeStatus, teachers, tables, adminFlatFee, attendance, calendar };
    return buildMonthRows(ctx, enrolments);
  }, [finalized, showOriginal, snapshot, latest, yearMonth, feeStatus, teachers, tables, adminFlatFee, attendance, calendar, enrolments]);

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

  // ── teacher details pop-up ──────────────────────────────────────────────────
  // Clicking a teacher opens a modal with all of their students and every control (collect, discount, defer, pay out, edit).
  // starts open when arriving from quick search (intent is set before this page mounts)
  const [modalTeacherId, setModalTeacherId] = useState(() => /^payroll\.teacher\.(.+)$/.exec(intent?.page === "payroll" ? intent.id ?? "" : "")?.[1] ?? null);
  const feeRowsOf = row => row.details.filter(d => !d.covered);
  const toCollect = row => finalized ? 0 : feeRowsOf(row).filter(d => !d.collected).length;
  // Quick search: open the teacher it points at (or the first one for a generic fee control)
  useEffect(() => {
    if (intent?.page !== "payroll" || !intent.id) return;
    const m = /^payroll\.teacher\.(.+)$/.exec(intent.id);
    if (m) setModalTeacherId(m[1]);
    else if (/^payroll\.(collect|defer|discount|table)$/.test(intent.id) && shown[0]) setModalTeacherId(shown[0].teacher.id);
  }, [intent?.nonce]);   // eslint-disable-line react-hooks/exhaustive-deps
  const summaryLine = row => {
    const fee = feeRowsOf(row), n = toCollect(row);
    return (
      <span>
        {fee.length} student{fee.length === 1 ? "" : "s"} · {finalized ? fee.filter(d => d.collected).length : fee.length - n} collected
        {n > 0 && <span style={{ color: MONEY.amber, fontWeight: 600 }}> · {n} to collect</span>}
      </span>
    );
  };
  const chevron = () => <span aria-hidden style={{ display: "inline-block", width: 14, fontSize: 12, color: T.muted }}>▸</span>;
  const toggleProps = row => ({
    role: "button", tabIndex: 0,
    onClick: () => setModalTeacherId(row.teacher.id),
    onKeyDown: e => { if ((e.key === "Enter" || e.key === " ") && e.target === e.currentTarget) { e.preventDefault(); setModalTeacherId(row.teacher.id); } },
  });

  // ── actions ────────────────────────────────────────────────────────────────
  async function run(fn) {
    setBusy(true); setError(null);
    try { await fn(); } catch (e) { setError(e.message); }
    setBusy(false);
  }

  function setCollected(r, next) {
    if (!isElevated || finalized || r.covered || r.collected === next) return;
    return markFeeCollected(r.eid, next, next ? buildCollectionSnapshot(r) : null, currentUser.uid).then(() => {
      // Only record a change that sticks: flipping a fee back within 3 s was a slip, so neither flip is logged.
      const key = `${yearMonth}:${r.eid}`, pending = pendingLogs.current;
      if (pending[key]) { clearTimeout(pending[key]); delete pending[key]; return; }
      pending[key] = setTimeout(() => { delete pending[key]; logCollect(r, next); }, 3000);
    });
  }
  function logCollect(r, next) {
    log({
      type: "payroll", action: next ? "collect" : "uncollect",
      summary: `${next ? "Collected" : "Un-collected"} ${rm(r.net)} — ${nameFor(r)} (${r.enrolment.instrument ?? "—"}) for ${yearMonth}${r.period.months > 1 ? ` (${r.period.months}-month period)` : ""}`,
      entity: { kind: "enrolment", id: r.eid },
      meta: next ? { fee: r.fee, discount: r.discountAmount, commissionPct: r.commissionPct, term: r.period.term } : null,
    });
  }
  const toggleCollected = r => run(() => setCollected(r, !r.collected));

  // Click-drag over the Collection ticks: the first box pressed decides the new state (tick or untick);
  // every box dragged across is set to it when the mouse is released. Works with mouse, pen and touch.
  const startDrag = (e, r) => {
    if (e.button > 0 || r.covered) return;
    const d = { target: !r.collected, ids: new Set([r.eid]), teacherId: r.teacherId, anchor: r.eid };
    dragRef.current = d; setDrag({ ...d });
  };
  useEffect(() => {
    let lastY = null, raf = 0;
    const select = y => {
      const d = dragRef.current; if (!d) return;
      // The invisible rectangle is the dragging teacher's own table: only that table's rows are ever
      // considered, so a drag can never reach another teacher. Pointer outside it clamps to its first/last row.
      const zone = document.querySelector(`[data-collect-zone="${d.teacherId}"]`); if (!zone) return;
      const els = [...zone.querySelectorAll("[data-collect-row]")];
      const a = els.findIndex(el => el.dataset.collectRow === d.anchor); if (a < 0) return;
      let i = els.findIndex(el => { const b = el.getBoundingClientRect(); return y >= b.top && y <= b.bottom; });
      if (i < 0) i = y < els[0].getBoundingClientRect().top ? 0 : els.length - 1;
      const ids = new Set(els.slice(Math.min(a, i), Math.max(a, i) + 1).map(el => el.dataset.collectRow));
      if (ids.size === d.ids.size && [...ids].every(x => d.ids.has(x))) return;
      d.ids = ids; setDrag({ ...d });
    };
    // Nearest scrollable ancestor (the modal/panel body), or null for the page itself
    const scroller = el => {
      for (let n = el?.parentElement; n && n !== document.body; n = n.parentElement) {
        const oy = getComputedStyle(n).overflowY;
        if ((oy === "auto" || oy === "scroll") && n.scrollHeight > n.clientHeight) return n;
      }
      return null;
    };
    // While the pointer is held within EDGE px of the top/bottom of the scroll area, keep scrolling
    // (faster the closer to / past the edge) and re-select rows under the stationary pointer.
    const EDGE = 60, MAX = 18;
    const tick = () => {
      raf = 0;
      const d = dragRef.current; if (!d || lastY == null) return;
      const zone = document.querySelector(`[data-collect-zone="${d.teacherId}"]`);
      const sc = scroller(zone);
      const top = sc ? sc.getBoundingClientRect().top : 0;
      const bottom = sc ? sc.getBoundingClientRect().bottom : window.innerHeight;
      let dy = 0;
      if (lastY < top + EDGE) dy = -Math.min(MAX, ((top + EDGE - lastY) / EDGE) * MAX);
      else if (lastY > bottom - EDGE) dy = Math.min(MAX, ((lastY - (bottom - EDGE)) / EDGE) * MAX);
      if (dy) {
        if (sc) sc.scrollTop += dy; else window.scrollBy(0, dy);
        select(lastY);
      }
      raf = requestAnimationFrame(tick);
    };
    const over = e => {
      if (!dragRef.current) return;
      lastY = e.clientY; select(lastY);
      if (!raf) raf = requestAnimationFrame(tick);
    };
    const up = () => {
      cancelAnimationFrame(raf); raf = 0; lastY = null;
      const d = dragRef.current; if (!d) return;
      dragRef.current = null; setDrag(null);
      const picked = rows.filter(r => d.ids.has(r.eid) && !r.covered && r.collected !== d.target);
      if (picked.length) run(async () => { for (const r of picked) await setCollected(r, d.target); });
    };
    window.addEventListener("pointermove", over);
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", up);
    return () => { window.removeEventListener("pointermove", over); window.removeEventListener("pointerup", up); window.removeEventListener("pointercancel", up); };
  });

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
  // Teachers are created on User Management (role = Teacher); Payroll only edits/removes them.
  function openEditTeacher(t) { setError(null); setForm({ name: t.name, instruments: [...(t.instruments ?? [])], commissionPct: t.commissionPct }); setTeacherModal(t); }
  function saveTeacher() {
    return run(async () => {
      await actions.saveTeacher(teacherModal.id, form);
      setTeacherModal(null); setDirty?.(false);
    });
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

  const deferralCard = isElevated && (deferTo.length > 0 || deferFrom.length > 0) && (
    <Card T={T} spot="payroll.deferrals" style={{ marginBottom: 18, padding: "14px 18px", border: `0.6px solid ${T.border2}`, borderRadius: 12 }}>
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
      <button data-search="payroll.discount" disabled={disabled} onClick={() => openDiscount(r)} title={r.collected ? "Un-collect the fee to change its discount" : ""}
        style={{
          fontSize: 10, color: r.discount ? "#4ade80" : T.muted, background: r.discount ? "rgba(20,202,116,0.12)" : T.dim,
          border: r.discount ? "0.6px solid rgba(20,202,116,0.35)" : "none", borderRadius: 3, padding: "2px 8px",
          cursor: disabled ? "default" : "pointer", fontFamily: "inherit", opacity: disabled && !r.discount ? 0.5 : 1,
        }}>
        {r.discount ? `−${rm(r.discountAmount)} · ${r.discount.name}` : "Discount"}
      </button>
    );
  };

  const COLLECT_SIZE = 52;   // default collect button size

  // Big square collect button (tap to toggle, drag over several to set them all)
  const collectBtn = (r, size = COLLECT_SIZE, width = size) => {
    if (r.covered) return <div style={{ width, height: size }} />;
    const tick = drag?.ids.has(r.eid) ? drag.target : r.collected;   // preview while dragging
    const can = isElevated && !finalized;
    return (
      <button data-search="payroll.collect" disabled={!isElevated || finalized || busy} data-collect-eid={r.eid}
        onPointerDown={e => startDrag(e, r)} onMouseDown={e => e.preventDefault()} onClick={e => { if (e.detail === 0) toggleCollected(r); }}
        title={can ? "Click to collect or un-collect. Drag over several to set them all." : ""}
        style={{
          width, height: size, borderRadius: 8, padding: 0, flexShrink: 0, boxSizing: "border-box",
          border: `1.5px ${tick ? "solid" : "dashed"} ${tick ? "#14CA74" : T.border2}`,
          background: tick ? "rgba(20,202,116,0.2)" : T.input, cursor: can ? "pointer" : "default",
          display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 2,
          touchAction: "none", userSelect: "none", fontFamily: "inherit",
          outline: drag?.ids.has(r.eid) ? `2px solid ${T.accent}` : "none",
        }}>
        <span style={{ fontSize: size * 0.42, color: tick ? "#14CA74" : T.muted, lineHeight: 1, fontWeight: 700 }}>{tick ? "✓" : "○"}</span>
        <span style={{ fontSize: 9, color: tick ? "#14CA74" : T.muted, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.04em" }}>{tick ? "Paid" : "Collect"}</span>
      </button>
    );
  };

  const collectInfo = r => {
    if (r.covered) return <div style={{ fontSize: 10, color: T.muted }}>Covered by {formatYM(r.coveredBy)} fee</div>;
    return (
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
          <button data-search="payroll.defer" onClick={() => setDeferOpen(p => ({ ...p, [r.eid]: true }))}
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
    <Modal T={T} spot="payroll.edit-teacher.form" title="Edit Teacher" onClose={() => { setTeacherModal(null); setDirty?.(false); }}>
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
        {error && <ShakeBox shake={errShake} style={errBox}>{error}</ShakeBox>}
        <Btn T={T} data-search="payroll.remove-teacher" variant="danger" disabled={busy}
          onClick={() => run(async () => { if (!confirm(`Remove ${teacherModal.name}?`)) return; await actions.removeTeacher(teacherModal.id); setTeacherModal(null); setDirty?.(false); })}>
          Remove teacher profile
        </Btn>
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 9, marginTop: 4 }}>
          <Btn T={T} variant="ghost" onClick={() => { setTeacherModal(null); setDirty?.(false); }}>Cancel</Btn>
          <Btn T={T} disabled={busy} onClick={saveTeacher}>Save Changes</Btn>
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
        {error && <ShakeBox shake={errShake} style={errBox}>{error}</ShakeBox>}
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
        {error && <ShakeBox shake={errShake} style={errBox}>{error}</ShakeBox>}
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 9 }}>
          <Btn T={T} variant="ghost" onClick={() => { setFinalizeOpen(false); setFinalizeAck(false); }}>Not yet</Btn>
          <Btn T={T} disabled={!finalizeAck || busy} onClick={doFinalize}>{busy ? "Finalizing…" : "Finalize Month"}</Btn>
        </div>
      </div>
    </Modal>
  );

  // ── page chrome ────────────────────────────────────────────────────────────
  const monthNav = (
    <div data-search="payroll.month" style={{ display: "flex", gap: 8, alignItems: "center" }}>
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
      {isElevated && !finalized && <Btn T={T} data-search="payroll.finalize" onClick={() => { setError(null); setFinalizeAck(false); setFinalizeOpen(true); }} style={{ marginLeft: 6 }}>Finalize Month</Btn>}
    </div>
  );

  const flatFeeCard = isElevated && !finalized && (
    <Card T={T} spot="payroll.flatfee" style={{ marginBottom: 16, display: "flex", alignItems: "center", gap: 20, padding: "13px 18px", flexWrap: "wrap", border: `0.6px solid ${T.border2}`, borderRadius: 12 }}>
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
    <div data-search="payroll.stats" style={{ display: "flex", gap: 12, marginBottom: 18, flexWrap: "wrap" }}>
      <Stat T={T} label="Teacher Payouts" value={rm(grandTeacher)} icon="♪" />
      <Stat T={T} label="Admin Revenue" value={rm(grandAdmin)} icon="₿" />
      <Stat T={T} label="Total Collected" value={rm(grandGross)} icon="✓" />
      <Stat T={T} label="Deposits Held (liability)" value={rm(depositSummary.liability)} icon="⌂" />
    </div>
  );

  const paidBadge = row => payoutStatus[row.teacher.id]?.paid
    ? <Badge label={`Paid ${payoutStatus[row.teacher.id].paidAt?.toDate?.().toLocaleDateString("en-MY", { day: "numeric", month: "short" }) ?? ""}`} color="#14CA74" bg="rgba(5,193,104,0.2)" border="rgba(5,193,104,0.5)" />
    : <Badge label="Unpaid" color="#FDB52A" bg="rgba(255,176,22,0.2)" border="rgba(255,176,22,0.2)" />;

  const teacherHeader = row => (
    <div data-search={`payroll.teacher.${row.teacher.id}`} {...toggleProps(row)} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "14px 16px", gap: 10, flexWrap: "wrap", cursor: "pointer" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        {chevron()}
        <Avatar name={row.teacher.name} size={34} />
        <div style={{ fontSize: 14, fontWeight: 700, color: T.text }}>{row.teacher.name}</div>
      </div>
      <div style={{ textAlign: "right" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, justifyContent: "flex-end" }}>
          <div style={{ fontSize: 20, fontWeight: 800, color: MONEY.blue }}>{rm(row.totTeacher)}</div>
          {paidBadge(row)}
        </div>
        {isElevated && <div style={{ fontSize: 11, color: T.muted }}>Admin: {rm(row.totAdmin)}</div>}
      </div>
    </div>
  );

  // one student inside the pop-up: every detail and control that used to live in the table row
  const sub = { fontSize: 10, color: T.muted };
  const studentRow = d => (
    <div key={d.eid} data-collect-row={d.eid} style={{ borderTop: `0.6px solid ${T.border}`, padding: "12px 0", opacity: d.covered ? 0.7 : 1 }}>
      <div style={{ display: "flex", alignItems: "flex-start", gap: 12 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 13, color: T.text, fontWeight: 600, overflowWrap: "anywhere" }}>{nameFor(d)}</div>
          <div style={{ fontSize: 11, color: T.muted, marginTop: 1 }}>
            {d.enrolment.instrument ?? "No longer offered"} · {d.enrolment.syllabus === "contemporary" ? "Contemporary" : "Classical"} · {d.enrolment.grade} · {d.enrolment.schedule?.duration ?? "?"} min · {TERM_LABEL[d.period.term]?.split(" ")[0] ?? ""}
          </div>
          <div style={{ display: "flex", alignItems: "flex-start", gap: 18, flexWrap: "wrap", marginTop: 8 }}>
            <div><div style={sub}>Type</div><div style={{ marginTop: 2 }}>{typeBadge(d)}</div></div>
            <div><div style={sub}>Fee</div>{feeCell(d)}</div>
            <div>
              <div style={sub}>Gross</div>
              <div style={{ fontSize: 12, fontWeight: 700, color: MONEY.green }}>{rm(d.gross)}</div>
              {d.deferredGrossExtra > 0 && <div style={{ fontSize: 9, color: MONEY.purple }}>+{rm(d.deferredGrossExtra)} deferred in</div>}
            </div>
            <div>
              <div style={sub}>Teacher{!d.covered && ` · ${d.commissionPct}%`}</div>
              {d.deferredToMonth ? <div style={{ fontSize: 12, fontWeight: 600, color: MONEY.amber }}>Deferred</div> : <div style={{ fontSize: 12, fontWeight: 700, color: MONEY.blue }}>{rm(d.teacherCut)}</div>}
            </div>
            {isElevated && (
              <div>
                <div style={sub}>Admin</div>
                <div style={{ fontSize: 12, color: d.deferredToMonth ? T.muted : MONEY.violet }}>
                  {d.deferredToMonth ? "—" : <>{rm(d.adminCut)}{d.flatDeducted > 0 && <span style={{ display: "block", fontSize: 9, color: T.muted }}>RM{d.flatDeducted.toFixed(2)} flat</span>}</>}
                </div>
              </div>
            )}
          </div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", marginTop: 8 }}>{discountBtn(d)}{deferControls(d)}</div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
          {collectInfo(d)}
          {collectBtn(d, 52, 72)}
        </div>
      </div>
    </div>
  );

  const modalRow = shown.find(r => r.teacher.id === modalTeacherId) ?? null;
  const teacherDetailModal = modalRow && (
    <Modal T={T} spot={`payroll.teacher.${modalRow.teacher.id}.details`} title={modalRow.teacher.name} width={720} onClose={() => setModalTeacherId(null)}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, flexWrap: "wrap", marginBottom: 12 }}>
        <div style={{ fontSize: 11, color: T.muted, minWidth: 0 }}>
          <div>{(modalRow.teacher.instruments ?? []).join(", ") || "No instruments"} · {modalRow.teacher.commissionPct}% default commission</div>
          <div style={{ marginTop: 1 }}>{summaryLine(modalRow)} · {monthName}</div>
        </div>
        <div style={{ textAlign: "right" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, justifyContent: "flex-end" }}>
            <div style={{ fontSize: 20, fontWeight: 800, color: MONEY.blue }}>{rm(modalRow.totTeacher)}</div>
            {paidBadge(modalRow)}
          </div>
          {isElevated && <div style={{ fontSize: 11, color: T.muted }}>Admin: {rm(modalRow.totAdmin)}</div>}
        </div>
      </div>
      {isElevated && (
        <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
          <Btn T={T} data-search="payroll.payout" variant="ghost" style={{ flex: 1, padding: "9px 10px", fontSize: 12 }} onClick={() => { setModalTeacherId(null); openPayoutPreview(modalRow.teacher, selY, selM); }}>Pay Out</Btn>
          <Btn T={T} data-search="payroll.edit-teacher" variant="ghost" style={{ flex: 1, padding: "9px 10px", fontSize: 12 }} onClick={() => { setModalTeacherId(null); openEditTeacher(modalRow.teacher); }}>Edit</Btn>
        </div>
      )}
      {error && !discountFor && <ShakeBox shake={errShake} style={{ ...errBox, marginBottom: 12 }}>{error}</ShakeBox>}
      {modalRow.details.length === 0 && <div style={{ fontSize: 12, color: T.muted }}>No students billed this month.</div>}
      <div data-collect-zone={modalRow.teacher.id} data-search="payroll.table">
        {modalRow.details.map(studentRow)}
      </div>
    </Modal>
  );

  const errorBar = error && !teacherModal && !discountFor && !finalizeOpen && <ShakeBox shake={errShake} style={{ ...errBox, marginBottom: 14 }}>{error}</ShakeBox>;

  // ── mobile ─────────────────────────────────────────────────────────────────
  if (isMobile) {
    return (
      <div>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14, gap: 8, flexWrap: "wrap" }}>
          <h2 style={{ fontSize: 18, fontWeight: 700, color: T.text, fontFamily: "'Red Hat Display', 'Plus Jakarta Sans', sans-serif" }}>Payroll</h2>
          {headerRight}
        </div>
        {errorBar}{finalizedBanner}{affectedBanner}{deferralCard}
        {shown.length === 0 && !isTeacher && <div style={{ ...errBox, marginBottom: 12, color: T.muted }}>No teachers yet. Payroll lists every teacher profile; add one on User Mgmt (role Teacher). If a Teacher account already exists there with a red "No teacher profile" badge, click Edit on it and save to create the profile.</div>}
        {shown.map(row => (
          <Card key={row.teacher.id} T={T} style={{ marginBottom: 12, padding: 14 }}>
            <div data-search={`payroll.teacher.${row.teacher.id}`} {...toggleProps(row)} style={{ display: "flex", alignItems: "center", gap: 10, cursor: "pointer", minHeight: 44 }}>
              {chevron()}
              <Avatar name={row.teacher.name} size={36} />
              <div style={{ flex: 1, minWidth: 0, fontSize: 14, fontWeight: 700, color: T.text }}>{row.teacher.name}</div>
              <div style={{ textAlign: "right" }}>
                <div style={{ fontSize: 18, fontWeight: 800, color: MONEY.blue }}>RM {row.totTeacher.toFixed(0)}</div>
                <div style={{ fontSize: 10, color: T.muted }}>payout</div>
              </div>
            </div>
          </Card>
        ))}
        {teacherDetailModal}{teacherForm}{discountModal}{finalizeModal}
      </div>
    );
  }

  // ── desktop ────────────────────────────────────────────────────────────────
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

      {shown.length === 0 && !isTeacher && <div style={{ ...errBox, marginBottom: 12, color: T.muted }}>No teachers yet. Payroll lists every teacher profile; add one on User Mgmt (role Teacher). If a Teacher account already exists there with a red "No teacher profile" badge, click Edit on it and save to create the profile.</div>}
      {shown.map(row => (
        <Card key={row.teacher.id} T={T} style={{ marginBottom: 14, padding: 0, overflow: "hidden", border: `0.6px solid ${T.border2}`, borderRadius: 12 }}>
          {teacherHeader(row)}
        </Card>
      ))}

      {teacherDetailModal}{teacherForm}{discountModal}{finalizeModal}
    </div>
  );
}
