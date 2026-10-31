import { useState, useMemo } from "react";
import { Inp, Sel, Btn, Checkbox, SectionTitle } from "./UI.jsx";
import { DAYS_OF_WEEK, HOURS, SYLLABI, TODAY } from "../data/seed.js";
import {
  DURATIONS, gradesFor, roomSupportsInstrument, findScheduleConflicts, describeConflict,
  withEndTime, needsCollectedFeeWarning,
} from "../domain/enrolments.js";
import { BILLING_TERMS, TERM_LABEL, buildBillingPatch } from "../domain/billing.js";
import { addMonths, ymOfDate, formatYMLong } from "../domain/time.js";

const warnBox = (T, color = "#FDB52A") => ({
  fontSize: 12, color, background: color + "14", border: `0.6px solid ${color}55`,
  borderRadius: 6, padding: "8px 11px", lineHeight: 1.6,
});

/**
 * One form for all three enrolment flows:
 *   mode "register" – new student + first enrolment + deposit
 *   mode "add"      – another instrument for an existing student (own teacher/room/time/deposit)
 *   mode "edit"     – change an existing enrolment (grade, slot, fee, term, commission…)
 *
 * Grade lock was replaced by Finalize Month: editing grade / duration after this period's fee was
 * collected is allowed, but needs an explicit acknowledgement here.
 */
export default function EnrolmentForm({
  T, mode, student, enrolment, enrolments, students, teachers, rooms, instruments, tables,
  deposit, feeCollectedThisPeriod = false, actions, onDone, onCancel, setDirty,
}) {
  const editing = mode === "edit";
  const startYM = ymOfDate(enrolment?.startDate ?? TODAY);
  const curYM   = ymOfDate(TODAY);

  const [name,  setName]  = useState(student?.name ?? "");
  const [phone, setPhone] = useState(student?.phone ?? "");
  const [f, setF] = useState(() => editing ? {
    instrument: enrolment.instrument ?? "", syllabus: enrolment.syllabus, grade: enrolment.grade,
    teacherId: enrolment.teacherId, attendanceBased: !!enrolment.attendanceBased, schedule: { ...enrolment.schedule },
    billingTerm: enrolment.billingTerm ?? "monthly", commissionPct: enrolment.commissionPct ?? "",
    feeAmount: enrolment.feeOverride?.amount ?? "", feeEffectiveFrom: enrolment.feeOverride?.effectiveFrom ?? addMonths(curYM, feeCollectedThisPeriod ? 1 : 0),
    termEffectiveFrom: addMonths(curYM, 1),
  } : {
    instrument: instruments[0] ?? "", syllabus: "classical", grade: "Beginner", teacherId: "", attendanceBased: false,
    schedule: { dayOfWeek: 6, startTime: "09:00", duration: "60", roomId: "" },
    billingTerm: "monthly", commissionPct: "", feeAmount: "", feeEffectiveFrom: curYM, termEffectiveFrom: curYM,
  });
  const [depositInput,  setDepositInput]  = useState("");
  const [collectNow,    setCollectNow]    = useState(true);
  const [ack,           setAck]           = useState(false);
  const [error,         setError]         = useState(null);
  const [busy,          setBusy]          = useState(false);

  const set = (k, v) => { setDirty?.(true); setF(p => ({ ...p, [k]: v })); };
  const setSched = (k, v) => { setDirty?.(true); setF(p => ({ ...p, schedule: { ...p.schedule, [k]: v } })); };

  const syllabusGrades = gradesFor(f.syllabus);
  const teacherOptions = teachers.filter(t => !f.instrument || (t.instruments ?? []).includes(f.instrument));
  const roomOptions    = rooms.filter(r => roomSupportsInstrument(r, f.instrument));
  const schedule       = withEndTime({ ...f.schedule, dayOfWeek: Number(f.schedule.dayOfWeek) });

  const candidate = {
    ...(enrolment ?? {}), studentId: student?.id ?? enrolment?.studentId ?? "__new__",
    instrument: f.instrument, syllabus: f.syllabus, grade: f.grade, teacherId: f.teacherId,
    attendanceBased: f.attendanceBased, schedule, startDate: enrolment?.startDate ?? TODAY,
  };

  const conflicts = useMemo(
    () => findScheduleConflicts(candidate, enrolments, { ignoreId: enrolment?.id ?? null, asOf: TODAY }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [f.teacherId, f.instrument, JSON.stringify(schedule), enrolments],
  );

  const depositValue = depositInput;

  const gradeWarn = editing && needsCollectedFeeWarning(
    enrolment, { ...enrolment, grade: f.grade, syllabus: f.syllabus, schedule }, feeCollectedThisPeriod,
  );

  const monthOpts = Array.from({ length: 13 }, (_, i) => { const ym = addMonths(curYM, i); return { ym, label: formatYMLong(ym) }; });

  async function submit() {
    setError(null);
    if (!editing && mode === "register" && !name.trim()) { setError("Student name is required."); return; }
    if (gradeWarn && !ack) { setError("Tick the box to confirm you understand the fee was already collected."); return; }
    setBusy(true);
    try {
      if (editing) {
        const patch = {
          instrument: f.instrument || null, syllabus: f.syllabus, grade: f.grade, teacherId: f.teacherId,
          attendanceBased: f.attendanceBased, schedule,
          ...buildBillingPatch(enrolment, {
            feeAmount: f.feeAmount, feeEffectiveFrom: f.feeEffectiveFrom,
            billingTerm: f.billingTerm, termEffectiveFrom: f.termEffectiveFrom, commissionPct: f.commissionPct,
          }),
        };
        await actions.updateEnrolment(enrolment, patch);
      } else {
        const form = {
          instrument: f.instrument, syllabus: f.syllabus, grade: f.grade, teacherId: f.teacherId,
          attendanceBased: f.attendanceBased, schedule, billingTerm: f.billingTerm,
          feeAmount: f.feeAmount, commissionPct: f.commissionPct,
        };
        if (mode === "register") await actions.registerStudent({ student: { name, phone }, enrolment: form, depositAmount: depositValue, collectNow });
        else await actions.addEnrolment({ studentId: student.id, enrolment: form, depositAmount: depositValue, collectNow });
      }
      setDirty?.(false);
      onDone?.();
    } catch (e) {
      setError(e.message);
    }
    setBusy(false);
  }

  const noInstruments = instruments.length === 0;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      {noInstruments && <div style={warnBox(T, "#FF5A65")}>No instruments are set up yet. Add them on the Grades & Fees page first.</div>}

      {mode === "register" && (
        <div style={{ display: "flex", gap: 11 }}>
          <Inp T={T} label="Full Name" value={name} onChange={e => { setDirty?.(true); setName(e.target.value); }} />
          <Inp T={T} label="Phone (optional)" value={phone} onChange={e => { setDirty?.(true); setPhone(e.target.value); }} />
        </div>
      )}
      {mode !== "register" && (
        <div style={{ fontSize: 12, color: T.muted }}>Student: <strong style={{ color: T.text }}>{student?.name ?? students.find(s => s.id === enrolment?.studentId)?.name}</strong></div>
      )}

      <div style={{ display: "flex", gap: 11 }}>
        <Sel T={T} label="Instrument" value={f.instrument} onChange={e => { set("instrument", e.target.value); set("teacherId", ""); setSched("roomId", ""); }}>
          {editing && !f.instrument && <option value="">— none —</option>}
          {instruments.map(i => <option key={i}>{i}</option>)}
        </Sel>
        <Sel T={T} label="Syllabus" value={f.syllabus} onChange={e => { set("syllabus", e.target.value); set("grade", gradesFor(e.target.value)[0]); }}>
          {SYLLABI.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
        </Sel>
        <Sel T={T} label="Grade / Level" value={f.grade} onChange={e => set("grade", e.target.value)}>
          {syllabusGrades.map(g => <option key={g}>{g}</option>)}
        </Sel>
      </div>

      {gradeWarn && (
        <div style={warnBox(T)}>
          This enrolment's fee for the current period has already been collected. Changing the grade or lesson length will
          <strong> not</strong> change the collected amount — it only affects future fees.
          <div style={{ marginTop: 6 }}><Checkbox T={T} label="I understand" checked={ack} onChange={() => setAck(a => !a)} /></div>
        </div>
      )}

      <Sel T={T} label="Teacher" value={f.teacherId} onChange={e => set("teacherId", e.target.value)}>
        <option value="">— Select teacher —</option>
        {teacherOptions.map(t => <option key={t.id} value={t.id}>{t.name} ({(t.instruments ?? []).join(", ")})</option>)}
      </Sel>
      {f.instrument && teacherOptions.length === 0 && <div style={warnBox(T)}>No teacher is set up to teach {f.instrument}.</div>}

      <div style={{ background: T.panel2, border: `0.6px solid ${T.border2}`, borderRadius: 10, padding: 14 }}>
        <SectionTitle T={T}>Weekly class</SectionTitle>
        <div style={{ display: "flex", flexDirection: "column", gap: 11 }}>
          <Sel T={T} label="Day" value={f.schedule.dayOfWeek} onChange={e => setSched("dayOfWeek", Number(e.target.value))}>
            {DAYS_OF_WEEK.map((d, i) => <option key={d} value={i}>{d}</option>)}
          </Sel>
          <div style={{ display: "flex", gap: 11 }}>
            <Sel T={T} label="Start" value={f.schedule.startTime} onChange={e => setSched("startTime", e.target.value)}>
              {HOURS.map(h => <option key={h}>{h}</option>)}
            </Sel>
            <Sel T={T} label="Duration" value={f.schedule.duration} onChange={e => setSched("duration", e.target.value)}>
              {DURATIONS.map(d => <option key={d} value={d}>{d} min</option>)}
            </Sel>
          </div>
          <div style={{ fontSize: 11, color: T.muted, marginTop: -4 }}>Ends at <span style={{ color: T.text }}>{schedule.endTime}</span></div>
          <Sel T={T} label={`Room${f.instrument ? ` (${f.instrument} rooms)` : ""}`} value={f.schedule.roomId} onChange={e => setSched("roomId", e.target.value)}>
            <option value="">— Select room —</option>
            {roomOptions.map(r => <option key={r.id} value={r.id}>{r.name} — {(r.types ?? []).join(", ")}</option>)}
          </Sel>
          {f.instrument && roomOptions.length === 0 && <div style={warnBox(T)}>No room is set up for {f.instrument}. Add the type to a room on the Rooms page.</div>}
        </div>
        {conflicts.length > 0 && (
          <div style={{ ...warnBox(T, "#FF5A65"), marginTop: 10 }}>
            <strong>Clash — this slot can't be saved:</strong>
            {conflicts.map((c, i) => <div key={i}>• {describeConflict(c, { students, teachers, rooms })}</div>)}
          </div>
        )}
      </div>

      <Checkbox T={T} label="Attendance-based fee (prorated by classes attended)" checked={f.attendanceBased} onChange={() => set("attendanceBased", !f.attendanceBased)} />

      <div style={{ background: T.panel2, border: `0.6px solid ${T.border2}`, borderRadius: 10, padding: 14 }}>
        <SectionTitle T={T}>Fees & commission</SectionTitle>
        <div style={{ display: "flex", flexDirection: "column", gap: 11 }}>
          <div style={{ display: "flex", gap: 11 }}>
            <Sel T={T} label="Billing term" value={f.billingTerm} onChange={e => set("billingTerm", e.target.value)}>
              {BILLING_TERMS.map(t => <option key={t} value={t}>{TERM_LABEL[t]}</option>)}
            </Sel>
            {editing && f.billingTerm !== (enrolment.billingTerm ?? "monthly") && (
              <Sel T={T} label="Term changes from" value={f.termEffectiveFrom} onChange={e => set("termEffectiveFrom", e.target.value)}>
                {monthOpts.map(o => <option key={o.ym} value={o.ym}>{o.label}</option>)}
              </Sel>
            )}
          </div>
          <div style={{ display: "flex", gap: 11 }}>
            <Inp T={T} label="Monthly fee (RM)" type="number" min={0} placeholder="Leave blank to use the Grades & Fees price"
              value={f.feeAmount} onChange={e => set("feeAmount", e.target.value)} />
            {editing && f.feeAmount !== "" && (
              <Sel T={T} label="Fee applies from" value={f.feeEffectiveFrom} onChange={e => set("feeEffectiveFrom", e.target.value)}>
                {monthOpts.map(o => <option key={o.ym} value={o.ym}>{o.label}</option>)}
              </Sel>
            )}
          </div>
          <Inp T={T} label="Teacher commission % (blank = teacher's default)" type="number" min={0} max={100} placeholder={teachers.find(t => t.id === f.teacherId)?.commissionPct ?? "default"}
            value={f.commissionPct} onChange={e => set("commissionPct", e.target.value)} />
          <div style={{ fontSize: 11, color: T.muted, lineHeight: 1.6 }}>
            Fee, term and commission changes only affect fees that haven't been collected yet. Collected fees keep the amount and rate they were collected at.
          </div>
        </div>
      </div>

      {!editing && (
        <div style={{ background: T.panel2, border: `0.6px solid ${T.border2}`, borderRadius: 10, padding: 14 }}>
          <SectionTitle T={T}>Registration deposit</SectionTitle>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <Inp T={T} label="Deposit (RM)" type="number" min={0}
              value={depositValue} onChange={e => { setDirty?.(true); setDepositInput(e.target.value); }} />
            <Checkbox T={T} label="Deposit received now (registration is complete once the deposit is collected)" checked={collectNow} onChange={() => setCollectNow(c => !c)} />
            <div style={{ fontSize: 11, color: T.muted, lineHeight: 1.6 }}>
              The deposit is not refundable. It is kept as a liability and used to pay the final month's fee when this enrolment stops.
            </div>
          </div>
        </div>
      )}

      {editing && deposit && (
        <div style={{ fontSize: 12, color: T.muted }}>Deposit: <strong style={{ color: T.text }}>RM {deposit.amount}</strong> — {deposit.status}</div>
      )}

      {error && <div style={warnBox(T, "#FF5A65")}>{error}</div>}

      <div style={{ display: "flex", justifyContent: "flex-end", gap: 9, marginTop: 4 }}>
        <Btn T={T} variant="ghost" onClick={onCancel}>Cancel</Btn>
        <Btn T={T} disabled={busy || noInstruments || conflicts.length > 0} onClick={submit}>
          {busy ? "Saving…" : mode === "register" ? "Register Student" : mode === "add" ? "Add Instrument" : "Save Changes"}
        </Btn>
      </div>
    </div>
  );
}
