import { useState, useMemo } from "react";
import { Avatar, Badge, Card, Inp, Sel, Btn, Modal, THead } from "../components/UI.jsx";
import EnrolmentForm from "../components/EnrolmentForm.jsx";
import { DAYS_OF_WEEK, TODAY } from "../data/seed.js";
import { gradesFor } from "../domain/enrolments.js";
import { TERM_LABEL, getBillingPeriod, resolveMonthlyFee } from "../domain/billing.js";
import { isRegistrationComplete } from "../domain/deposits.js";
import { addMonths, ymOfDate, formatYMLong } from "../domain/time.js";
import { usePayrollMonth } from "../hooks/usePayrollMonth.js";

const DEP_META = {
  pending:   { label: "Deposit pending",  color: "#FDB52A" },
  held:      { label: "Deposit held",     color: "#14CA74" },
  applied:   { label: "Deposit applied",  color: "#9A91FB" },
  forfeited: { label: "Deposit forfeited", color: "#FF5A65" },
};

const errBox = { fontSize: 12, color: "#FF5A65", background: "rgba(255,90,101,0.08)", border: "0.6px solid rgba(255,90,101,0.35)", borderRadius: 6, padding: "8px 11px", lineHeight: 1.6 };

// Wrapper so the edit form knows whether this period's fee has been collected
function EditModal({ enrolment, ...props }) {
  const curYM = ymOfDate(TODAY);
  const period = getBillingPeriod(enrolment, curYM);
  const { feeStatus } = usePayrollMonth(period.active ? period.startYM : curYM);
  const collected = period.active && !!feeStatus[enrolment.id]?.collected;
  return <EnrolmentForm {...props} mode="edit" enrolment={enrolment} feeCollectedThisPeriod={collected} />;
}

export default function Students({
  students, enrolments, deposits, teachers, rooms, instruments, tables, actions,
  T, currentUser, sendGradeRequest, isMobile, setDirty,
}) {
  const [search,      setSearch]      = useState("");
  const [showStopped, setShowStopped] = useState(false);
  const [modal,       setModal]       = useState(null);   // {kind:"register"} | {kind:"add"|"edit"|"stop"|"deposit"|"delete"|"grade", ...}
  const [expandedId,  setExpandedId]  = useState(null);
  const [error,       setError]       = useState(null);
  const [busy,        setBusy]        = useState(false);
  const [stopYM,      setStopYM]      = useState(ymOfDate(TODAY));
  const [depInput,    setDepInput]    = useState("");
  const [forfeitWhy,  setForfeitWhy]  = useState("");
  const [gradeForm,   setGradeForm]   = useState({ requestedGrade: "", reason: "" });
  const [gradeOk,     setGradeOk]     = useState(null);
  const [notice,      setNotice]      = useState(null);

  const isTeacher  = currentUser?.role === "teacher";
  const isElevated = !isTeacher;
  const studentOf  = id => students.find(s => s.id === id);
  const depositOf  = id => deposits.find(d => d.id === id);

  const live = e => e.status !== "stopped" || (e.endDate && e.endDate >= TODAY);
  const count = useMemo(() => {
    const c = {};
    enrolments.filter(live).forEach(e => { c[e.studentId] = (c[e.studentId] ?? 0) + 1; });
    return c;
  }, [enrolments]);

  const rows = enrolments
    .filter(e => isTeacher ? e.teacherId === currentUser.teacherId : true)
    .filter(e => showStopped || live(e))
    .filter(e => {
      const q = search.toLowerCase();
      return (studentOf(e.studentId)?.name ?? "").toLowerCase().includes(q) || (e.instrument ?? "").toLowerCase().includes(q);
    })
    .sort((a, b) => (studentOf(a.studentId)?.name ?? "").localeCompare(studentOf(b.studentId)?.name ?? "") || (a.instrument ?? "").localeCompare(b.instrument ?? ""));

  const close = () => { setModal(null); setError(null); setNotice(null); setDirty?.(false); };
  async function run(fn, after) {
    setBusy(true); setError(null);
    try { const r = await fn(); after?.(r); } catch (e) { setError(e.message); }
    setBusy(false);
  }

  const shared = { T, students, enrolments, teachers, rooms, instruments, tables, actions, setDirty };

  // ── modals ────────────────────────────────────────────────────────────────
  const formModal = modal && ["register", "add", "edit"].includes(modal.kind) && isElevated && (
    <Modal T={T} width={560} onClose={close}
      title={modal.kind === "register" ? "Register Student" : modal.kind === "add" ? `Add Instrument — ${modal.student.name}` : "Edit Enrolment"}>
      {modal.kind === "edit"
        ? <EditModal {...shared} enrolment={modal.enrolment} deposit={depositOf(modal.enrolment.id)} onDone={close} onCancel={close} />
        : <EnrolmentForm {...shared} mode={modal.kind} student={modal.student} deposit={null} onDone={close} onCancel={close} />}
    </Modal>
  );

  const stopModal = modal?.kind === "stop" && (() => {
    const e = modal.enrolment, dep = depositOf(e.id);
    const fee = resolveMonthlyFee(e, stopYM, tables.fees, tables.contemporaryFees);
    return (
      <Modal T={T} title={`Stop enrolment — ${studentOf(e.studentId)?.name} (${e.instrument})`} width={460} onClose={close}>
        <div style={{ display: "flex", flexDirection: "column", gap: 13 }}>
          <Sel T={T} label="Last lesson month" value={stopYM} onChange={ev => setStopYM(ev.target.value)}>
            {Array.from({ length: 14 }, (_, i) => addMonths(ymOfDate(TODAY), i - 1)).map(ym => <option key={ym} value={ym}>{formatYMLong(ym)}</option>)}
          </Sel>
          <div style={{ fontSize: 12, color: T.muted, lineHeight: 1.7 }}>
            Lessons stop after <strong style={{ color: T.text }}>{formatYMLong(stopYM)}</strong>.
            {dep?.status === "held"
              ? <> The held deposit of <strong style={{ color: T.text }}>RM {dep.amount}</strong> will be deducted from the final fee automatically (monthly fee RM {fee}
                  {fee > dep.amount ? <> — the student pays the remaining <strong style={{ color: T.text }}>RM {fee - dep.amount}</strong></> : fee === dep.amount ? " — the student pays nothing" : <> — the extra RM {dep.amount - fee} is forfeited</>}).</>
              : dep?.status === "pending" ? " The deposit was never collected, so nothing will be deducted."
              : " There is no held deposit to apply."}
          </div>
          {notice && <div style={{ ...errBox, color: "#FDB52A", background: "#FDB52A14", border: "0.6px solid #FDB52A55" }}>{notice}</div>}
          {error && <div style={errBox}>{error}</div>}
          <div style={{ display: "flex", justifyContent: "flex-end", gap: 9 }}>
            <Btn T={T} variant="ghost" onClick={close}>Cancel</Btn>
            <Btn T={T} variant="danger" disabled={busy} onClick={() => run(() => actions.stopEnrolment(e, stopYM), r => {
              if (r.applied || !dep || dep.status !== "held") close(); else setNotice(`Enrolment stopped. ${r.reason}`);
            })}>{busy ? "Stopping…" : "Stop enrolment"}</Btn>
          </div>
        </div>
      </Modal>
    );
  })();

  const depositModal = modal?.kind === "deposit" && (() => {
    const e = modal.enrolment, dep = depositOf(e.id), who = `${studentOf(e.studentId)?.name} (${e.instrument})`;
    const meta = dep && DEP_META[dep.status];
    return (
      <Modal T={T} title={`Deposit — ${who}`} width={440} onClose={close}>
        <div style={{ display: "flex", flexDirection: "column", gap: 13 }}>
          {!dep ? (
            <>
              <div style={{ fontSize: 12, color: T.muted, lineHeight: 1.7 }}>This enrolment pre-dates deposits and has none on record. Backfill one if the student paid a deposit.</div>
              <Inp T={T} label="Deposit (RM)" type="number" min={0} value={depInput} onChange={ev => setDepInput(ev.target.value)} />
              {error && <div style={errBox}>{error}</div>}
              <div style={{ display: "flex", justifyContent: "flex-end", gap: 9 }}>
                <Btn T={T} variant="ghost" onClick={() => run(() => actions.backfillDeposit(e, depInput, false), close)}>Record as pending</Btn>
                <Btn T={T} disabled={busy} onClick={() => run(() => actions.backfillDeposit(e, depInput, true), close)}>Record as collected</Btn>
              </div>
            </>
          ) : (
            <>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div style={{ fontSize: 22, fontWeight: 700, color: T.text }}>RM {dep.amount}</div>
                <Badge label={meta.label} color={meta.color} bg={meta.color + "22"} />
              </div>
              {dep.status === "applied" && (
                <div style={{ fontSize: 12, color: T.muted, lineHeight: 1.7 }}>
                  Applied to the {dep.appliedToMonth} fee: RM {dep.appliedAmount} offset (final fee RM {dep.finalFeeDue})
                  {dep.forfeitedAmount > 0 ? `, RM ${dep.forfeitedAmount} forfeited` : ""}. A deposit can only be applied once.
                </div>
              )}
              {dep.status === "forfeited" && <div style={{ fontSize: 12, color: T.muted }}>Forfeited{dep.forfeitReason ? `: ${dep.forfeitReason}` : ""}.</div>}
              {["pending", "held"].includes(dep.status) && (
                <div style={{ display: "flex", gap: 8, alignItems: "flex-end" }}>
                  <Inp T={T} label="Change amount (RM)" type="number" min={0} value={depInput} placeholder={String(dep.amount)} onChange={ev => setDepInput(ev.target.value)} />
                  <Btn T={T} variant="ghost" disabled={busy || !depInput} onClick={() => run(() => actions.editDepositFor(e.id, depInput), () => setDepInput(""))}>Update</Btn>
                </div>
              )}
              {dep.status === "pending" && (
                <Btn T={T} disabled={busy} onClick={() => run(() => actions.collectDepositFor(e.id), close)}>Mark deposit as collected</Btn>
              )}
              {dep.status === "held" && e.status === "stopped" && (
                <Btn T={T} disabled={busy} onClick={() => run(() => actions.applyDepositNow(e), r => (r.applied ? close() : setError(r.reason)))}>Apply deposit to final fee</Btn>
              )}
              {dep.status === "held" && (
                <div style={{ display: "flex", gap: 8, alignItems: "flex-end" }}>
                  <Inp T={T} label="Forfeit deposit — reason" value={forfeitWhy} onChange={ev => setForfeitWhy(ev.target.value)} />
                  <Btn T={T} variant="danger" disabled={busy || !forfeitWhy.trim()} onClick={() => run(() => actions.forfeitDepositFor(e.id, forfeitWhy.trim()), close)}>Forfeit</Btn>
                </div>
              )}
              {error && <div style={errBox}>{error}</div>}
            </>
          )}
        </div>
      </Modal>
    );
  })();

  const deleteModal = modal?.kind === "delete" && (
    <Modal T={T} title="Delete student?" width={400} onClose={close}>
      <p style={{ fontSize: 13, color: T.textSub, lineHeight: 1.7, marginBottom: 16 }}>
        <strong style={{ color: T.text }}>{modal.student.name}</strong> and all of their enrolments will be removed. Stopping an enrolment is usually better — it keeps the history and applies the deposit.
      </p>
      {error && <div style={{ ...errBox, marginBottom: 12 }}>{error}</div>}
      <div style={{ display: "flex", justifyContent: "flex-end", gap: 9 }}>
        <Btn T={T} variant="ghost" onClick={close}>Cancel</Btn>
        <Btn T={T} variant="danger" disabled={busy} onClick={() => run(() => actions.removeStudent(modal.student.id), close)}>Delete</Btn>
      </div>
    </Modal>
  );

  const gradeModal = modal?.kind === "grade" && (
    <Modal T={T} title="Request Grade Update" width={420} onClose={close}>
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        <div style={{ background: T.bg, border: `0.6px solid ${T.border2}`, borderRadius: 9, padding: "11px 14px" }}>
          <div style={{ fontSize: 11, color: T.muted, marginBottom: 4, textTransform: "uppercase", letterSpacing: "0.06em" }}>Student · Instrument</div>
          <div style={{ fontSize: 14, fontWeight: 600, color: T.text }}>{studentOf(modal.enrolment.studentId)?.name} · {modal.enrolment.instrument}</div>
          <div style={{ marginTop: 6 }}><Badge label={`Now: ${modal.enrolment.grade}`} color={T.accent} bg={T.accent + "18"} /></div>
        </div>
        <Sel T={T} label="Requested Grade" value={gradeForm.requestedGrade} onChange={ev => setGradeForm(f => ({ ...f, requestedGrade: ev.target.value }))}>
          {gradesFor(modal.enrolment.syllabus).map(g => <option key={g}>{g}</option>)}
        </Sel>
        <label style={{ display: "flex", flexDirection: "column", gap: 5 }}>
          <span style={{ fontSize: 11, color: T.muted, textTransform: "uppercase", letterSpacing: "0.06em" }}>Reason</span>
          <textarea value={gradeForm.reason} onChange={ev => setGradeForm(f => ({ ...f, reason: ev.target.value }))} placeholder="Explain why the grade should be updated…"
            style={{ background: T.input, border: `1px solid ${T.border2}`, borderRadius: 8, color: T.text, padding: "9px 11px", fontSize: 13, outline: "none", fontFamily: "inherit", resize: "vertical", minHeight: 80 }} />
        </label>
        {gradeOk ? <div style={{ fontSize: 12, color: "#4ade80", textAlign: "center" }}>{gradeOk}</div>
                 : <div style={{ fontSize: 11, color: T.muted }}>This request will be sent to the admin for approval.</div>}
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 9 }}>
          <Btn T={T} variant="ghost" onClick={() => { close(); setGradeOk(null); }}>Close</Btn>
          {!gradeOk && <Btn T={T} onClick={async () => {
            if (!gradeForm.reason.trim()) return;
            await sendGradeRequest({ fromTeacherId: currentUser.teacherId, studentId: modal.enrolment.studentId, enrolmentId: modal.enrolment.id, requestedGrade: gradeForm.requestedGrade, reason: gradeForm.reason });
            setGradeOk("Grade update request sent to admin.");
          }}>Send Request</Btn>}
        </div>
      </div>
    </Modal>
  );

  const modals = <>{formModal}{stopModal}{depositModal}{deleteModal}{gradeModal}</>;

  // ── shared bits ───────────────────────────────────────────────────────────
  const openGrade = e => { setGradeForm({ requestedGrade: e.grade, reason: "" }); setGradeOk(null); setModal({ kind: "grade", enrolment: e }); };
  const openDeposit = e => { setDepInput(""); setForfeitWhy(""); setError(null); setModal({ kind: "deposit", enrolment: e }); };
  const openStop = e => { setStopYM(ymOfDate(TODAY)); setError(null); setNotice(null); setModal({ kind: "stop", enrolment: e }); };

  const depBadge = e => {
    if (!isElevated) return null;
    const dep = depositOf(e.id);
    if (!dep) return <Badge label="No deposit record" color="#AEB9E1" bg="#37446B33" />;
    const m = DEP_META[dep.status];
    return <Badge label={m.label} color={m.color} bg={m.color + "22"} />;
  };
  const statusBadge = e => e.status === "stopped"
    ? <Badge label={`Stopped · last ${ymOfDate(e.endDate)}`} color="#FF5A65" bg="rgba(255,90,101,0.15)" />
    : (isElevated && depositOf(e.id) && !isRegistrationComplete(depositOf(e.id)))
      ? <Badge label="Registration incomplete" color="#FDB52A" bg="rgba(255,176,22,0.2)" /> : null;
  const timeCell = e => (
    <>
      {e.schedule?.startTime}
      {e.schedule?.duration && <span style={{ marginLeft: 6, fontSize: 10, fontWeight: 600, color: T.accent, background: T.accent + "18", border: `0.6px solid ${T.accent}40`, borderRadius: 4, padding: "1px 5px" }}>{e.schedule.duration} min</span>}
    </>
  );
  const actionsFor = e => (
    <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
      {isElevated && <>
        <Btn T={T} variant="ghost" style={{ padding: "5px 11px", fontSize: 11 }} onClick={() => { setError(null); setModal({ kind: "edit", enrolment: e }); }}>Edit</Btn>
        <Btn T={T} variant="ghost" style={{ padding: "5px 11px", fontSize: 11 }} onClick={() => openDeposit(e)}>Deposit</Btn>
        <Btn T={T} variant="ghost" style={{ padding: "5px 11px", fontSize: 11 }} onClick={() => { setError(null); setModal({ kind: "add", student: studentOf(e.studentId) }); }}>+ Instrument</Btn>
        {e.status !== "stopped" && <Btn T={T} variant="danger" style={{ padding: "5px 11px", fontSize: 11 }} onClick={() => openStop(e)}>Stop</Btn>}
        <Btn T={T} variant="ghost" style={{ padding: "5px 11px", fontSize: 11, color: "#FF5A65" }} onClick={() => { setError(null); setModal({ kind: "delete", student: studentOf(e.studentId) }); }}>Delete</Btn>
        {e.status === "stopped" && depositOf(e.id)?.status === "held" && <Btn T={T} style={{ padding: "5px 11px", fontSize: 11 }} onClick={() => openDeposit(e)}>Apply deposit</Btn>}
      </>}
      {isTeacher && <Btn T={T} variant="ghost" style={{ padding: "5px 11px", fontSize: 11 }} onClick={() => openGrade(e)}>Request Grade</Btn>}
    </div>
  );

  const header = (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: isMobile ? 14 : 18, gap: 10, flexWrap: "wrap" }}>
      <h2 style={{ fontSize: isMobile ? 18 : 24, fontWeight: 700, color: T.text, fontFamily: "'Red Hat Display', 'Plus Jakarta Sans', sans-serif" }}>Students</h2>
      <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
        {!isMobile && (
          <div style={{ position: "relative" }}>
            <span style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", fontSize: 14, pointerEvents: "none", color: T.muted }}>🔍</span>
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search…"
              style={{ background: T.input, border: `0.6px solid ${T.border2}`, borderRadius: 4, color: T.text, padding: "9px 14px 9px 36px", fontSize: 12, outline: "none", fontFamily: "inherit", height: 42 }} />
          </div>
        )}
        {isElevated && <Btn T={T} onClick={() => { setError(null); setModal({ kind: "register" }); }} style={isMobile ? { padding: "7px 14px", fontSize: 12 } : {}}>{isMobile ? "+ Add" : "+ Register Student"}</Btn>}
      </div>
    </div>
  );
  const toolbar = (
    <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 12 }}>
      {isMobile && <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search students…"
        style={{ flex: 1, background: T.input, border: `0.6px solid ${T.border2}`, borderRadius: 4, color: T.text, padding: "9px 14px", fontSize: 12, outline: "none", fontFamily: "inherit", height: 42 }} />}
      <Btn T={T} variant={showStopped ? "active" : "ghost"} style={{ fontSize: 11, padding: "6px 12px" }} onClick={() => setShowStopped(s => !s)}>{showStopped ? "Hide stopped" : "Show stopped"}</Btn>
      {isElevated && instruments.length === 0 && <span style={{ fontSize: 11, color: "#FDB52A" }}>Add instruments on Grades & Fees before registering students.</span>}
    </div>
  );
  const multi = e => (count[e.studentId] ?? 0) > 1 && <Badge label={`${count[e.studentId]} instruments`} color="#9A91FB" bg="rgba(154,145,251,0.15)" />;

  // ── mobile ────────────────────────────────────────────────────────────────
  if (isMobile) {
    return (
      <div>
        {header}{toolbar}
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {rows.map(e => {
            const s = studentOf(e.studentId), teacher = teachers.find(t => t.id === e.teacherId), room = rooms.find(r => r.id === e.schedule?.roomId);
            const open = expandedId === e.id;
            return (
              <div key={e.id} style={{ background: T.panel, border: `1px solid ${T.border}`, borderRadius: 14, overflow: "hidden", opacity: e.status === "stopped" ? 0.7 : 1 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "13px 14px" }}>
                  <Avatar name={s?.name ?? "?"} size={36} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 14, fontWeight: 600, color: T.text, marginBottom: 3 }}>{s?.name ?? "—"}</div>
                    <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
                      <span style={{ fontSize: 12, color: T.textSub }}>{e.instrument ?? "—"}</span>
                      <Badge label={e.grade} color={T.accent} bg={T.accent + "18"} />
                      {multi(e)}
                    </div>
                  </div>
                  <button onClick={() => setExpandedId(open ? null : e.id)} style={{ background: T.dim, border: "none", borderRadius: 8, padding: "6px 10px", cursor: "pointer", fontSize: 12, color: T.muted, fontFamily: "inherit" }}>{open ? "▲" : "▼"}</button>
                </div>
                {open && (
                  <div style={{ borderTop: `1px solid ${T.border}`, padding: "12px 14px", display: "flex", flexDirection: "column", gap: 8 }}>
                    {isElevated && teacher && <div style={{ fontSize: 12, color: T.textSub }}><span style={{ color: T.muted }}>Teacher: </span>{teacher.name}</div>}
                    <div style={{ fontSize: 12, color: T.textSub }}><span style={{ color: T.muted }}>Class: </span>{DAYS_OF_WEEK[e.schedule?.dayOfWeek ?? 0]}, {timeCell(e)}</div>
                    {room && <div style={{ fontSize: 12, color: T.textSub }}><span style={{ color: T.muted }}>Room: </span>{room.name}</div>}
                    <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                      {e.attendanceBased ? <Badge label="Att. Based" color="#60a5fa" bg="#0c1a2e" /> : <Badge label="Full Fee" color={T.muted} bg={T.dim} />}
                      {isElevated && <Badge label={TERM_LABEL[e.billingTerm ?? "monthly"]} color={T.muted} bg={T.dim} />}
                      {depBadge(e)}{statusBadge(e)}
                    </div>
                    {actionsFor(e)}
                  </div>
                )}
              </div>
            );
          })}
          {rows.length === 0 && <div style={{ textAlign: "center", padding: "30px 0", color: T.muted, fontSize: 13 }}>No students found.</div>}
        </div>
        {modals}
      </div>
    );
  }

  // ── desktop ───────────────────────────────────────────────────────────────
  const cols = isTeacher
    ? ["Student", "Instrument", "Grade", "Class Day", "Time", "Fee Type", "Actions"]
    : ["Student", "Instrument", "Grade", "Teacher", "Class", "Term", "Fee Type", "Status", "Actions"];

  return (
    <div>
      {header}{toolbar}
      <Card T={T} style={{ padding: 0, overflow: "hidden", border: `0.6px solid ${T.border2}`, borderRadius: 12 }}>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <THead T={T} cols={cols} />
          <tbody>
            {rows.map(e => {
              const s = studentOf(e.studentId), teacher = teachers.find(t => t.id === e.teacherId), room = rooms.find(r => r.id === e.schedule?.roomId);
              return (
                <tr key={e.id} onMouseEnter={ev => ev.currentTarget.style.background = T.hover} onMouseLeave={ev => ev.currentTarget.style.background = "transparent"}
                  style={{ borderBottom: `0.6px solid ${T.border}`, opacity: e.status === "stopped" ? 0.65 : 1 }}>
                  <td style={{ padding: "11px 14px" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
                      <Avatar name={s?.name ?? "?"} size={30} />
                      <div>
                        <div style={{ fontSize: 12, color: T.text, fontWeight: 500 }}>{s?.name ?? "—"}</div>
                        <div style={{ display: "flex", gap: 5, alignItems: "center", marginTop: 2 }}>{room && <span style={{ fontSize: 10, color: T.muted }}>{room.name}</span>}{multi(e)}</div>
                      </div>
                    </div>
                  </td>
                  <td style={{ padding: "11px 14px", fontSize: 12, color: e.instrument ? T.muted : "#FDB52A" }}>{e.instrument ?? "No longer offered"}</td>
                  <td style={{ padding: "11px 14px" }}><Badge label={e.grade} color={T.accent} bg={T.accent + "18"} /></td>
                  {isElevated && <td style={{ padding: "11px 14px", fontSize: 12, color: T.muted }}>{teacher?.name ?? "—"}</td>}
                  {isTeacher && <td style={{ padding: "11px 14px", fontSize: 12, color: T.muted }}>{DAYS_OF_WEEK[e.schedule?.dayOfWeek ?? 0]}</td>}
                  <td style={{ padding: "11px 14px", fontSize: 12, color: T.muted }}>
                    {isElevated && <div>{DAYS_OF_WEEK[e.schedule?.dayOfWeek ?? 0]}</div>}
                    {timeCell(e)}
                  </td>
                  {isElevated && <td style={{ padding: "11px 14px", fontSize: 11, color: T.muted }}>{TERM_LABEL[e.billingTerm ?? "monthly"]}</td>}
                  <td style={{ padding: "11px 14px" }}>
                    {e.attendanceBased ? <Badge label="Att. Based" color="#60a5fa" bg="#0c1a2e" /> : <Badge label="Full Fee" color={T.muted} bg={T.dim} />}
                  </td>
                  {isElevated && <td style={{ padding: "11px 14px" }}><div style={{ display: "flex", flexDirection: "column", gap: 4, alignItems: "flex-start" }}>{depBadge(e)}{statusBadge(e)}</div></td>}
                  <td style={{ padding: "11px 14px" }}>{actionsFor(e)}</td>
                </tr>
              );
            })}
            {rows.length === 0 && <tr><td colSpan={cols.length} style={{ padding: "20px 14px", textAlign: "center", color: T.muted, fontSize: 13 }}>No students found.</td></tr>}
          </tbody>
        </table>
      </Card>
      {isElevated && rows.length > 0 && (
        <div style={{ marginTop: 10, fontSize: 11, color: T.muted }}>
          A student with two instruments has two rows — each with its own teacher, room, time, fee and deposit. "Delete" removes the student and all of their enrolments; "Stop" ends one enrolment and keeps the history.
        </div>
      )}
      {modals}
    </div>
  );
}
