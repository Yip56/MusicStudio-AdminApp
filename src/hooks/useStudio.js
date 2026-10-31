import { useState, useEffect, useMemo } from "react";
import {
  collection, doc, setDoc, updateDoc, deleteDoc, deleteField, arrayUnion, arrayRemove, writeBatch, runTransaction, onSnapshot, serverTimestamp,
} from "firebase/firestore";
import { db } from "../firebase.js";
import { useCollection } from "./useCollection.js";
import { logActivity } from "../data/activity.js";
import { diffFields } from "../domain/audit.js";
import {
  validateEnrolment, findScheduleConflicts, describeConflict, newEnrolmentDoc, stopEnrolmentPatch,
} from "../domain/enrolments.js";
import { assertCommissionPct, getBillingPeriod, validateDiscount } from "../domain/billing.js";
import { newDeposit, collectDeposit, applyDeposit, forfeitDeposit, editDepositAmount, defaultDepositAmount } from "../domain/deposits.js";
import { buildEnrolmentRow, buildCollectionSnapshot } from "../domain/payroll.js";
import { getInstruments, findUnavailableInstrumentRefs } from "../domain/instruments.js";
import { ymOfDate } from "../domain/time.js";
import { TODAY } from "../data/seed.js";

const strip = ({ id, ...rest }) => rest; // never write the doc id into the doc body

/**
 * The studio's data store. Everything that used to live in App state (students, teachers, rooms,
 * attendance, one-off sessions…) is a Firestore collection now; this hook subscribes to all of
 * them and exposes the write actions, each of which validates and writes an activity-log entry.
 *
 *   students/{id}            person: name, phone, notes
 *   enrolments/{id}          student + instrument: teacher, slot, grade, fee, term, commission (see domain/enrolments)
 *   deposits/{enrolmentId}   one registration deposit per enrolment (see domain/deposits)
 *   teachers/{id}  rooms/{id}  attendance/{enrolmentId_date}  one_off_sessions/{id}  discounts/{id}
 *   settings/studio          { adminFlatFee }
 *   month_snapshots/{ym}     immutable finalized month     month_revisions/{id}  corrections to a finalized month
 */
export function useStudio({ enabled, actor, fees, contemporaryFees }) {
  const students   = useCollection("students",         enabled);
  const enrolments = useCollection("enrolments",       enabled);
  // Admin-only collections (see firestore.rules) — teachers never subscribe to them
  const isAdmin    = enabled && (actor?.role === "admin" || actor?.role === "sysadmin");
  const deposits   = useCollection("deposits",         isAdmin);
  const teachers   = useCollection("teachers",         enabled);
  const rooms      = useCollection("rooms",            enabled);
  const attendance = useCollection("attendance",       enabled);
  const oneOffs    = useCollection("one_off_sessions", enabled);
  const discounts  = useCollection("discounts",        isAdmin);
  const snapshots  = useCollection("month_snapshots",  isAdmin);
  const revisions  = useCollection("month_revisions",  isAdmin);

  const [settings, setSettings] = useState({ adminFlatFee: 5 });
  useEffect(() => {
    if (!enabled) return;
    return onSnapshot(doc(db, "settings", "studio"), s => { if (s.exists()) setSettings(p => ({ ...p, ...s.data() })); }, () => {});
  }, [enabled]);

  const tables      = useMemo(() => ({ fees, contemporaryFees }), [fees, contemporaryFees]);
  const instruments = useMemo(() => getInstruments(fees, contemporaryFees), [fees, contemporaryFees]);

  const log = (entry) => logActivity(entry, actor);
  const nameOf = id => students.items.find(s => s.id === id)?.name ?? "student";

  // ── validation shared by every enrolment write ──────────────────────────────
  function checkEnrolment(candidate, ignoreId = null) {
    const errors = validateEnrolment(candidate, { rooms: rooms.items, teachers: teachers.items, instruments });
    if (errors.length) throw new Error(errors.join(" "));
    const conflicts = findScheduleConflicts(candidate, enrolments.items, { ignoreId, asOf: TODAY });
    if (conflicts.length) {
      const ctx = { students: students.items, teachers: teachers.items, rooms: rooms.items };
      throw new Error(conflicts.map(c => describeConflict(c, ctx)).join(" "));
    }
  }

  // ── students & enrolments ───────────────────────────────────────────────────
  async function registerStudent({ student, enrolment: form, depositAmount, collectNow = false }) {
    if (!student.name?.trim()) throw new Error("Student name is required.");
    const studentRef = doc(collection(db, "students"));
    const enrolRef   = doc(collection(db, "enrolments"));
    const e = newEnrolmentDoc({ ...form, studentId: studentRef.id }, { today: TODAY });
    checkEnrolment(e);
    let dep = newDeposit({ enrolmentId: enrolRef.id, studentId: studentRef.id, amount: depositAmount });
    if (collectNow) dep = collectDeposit(dep, { by: actor.uid, at: serverTimestamp() });

    const batch = writeBatch(db);
    batch.set(studentRef, { name: student.name.trim(), phone: student.phone ?? "", notes: student.notes ?? "", createdAt: serverTimestamp() });
    batch.set(enrolRef, { ...e, createdAt: serverTimestamp() });
    batch.set(doc(db, "deposits", enrolRef.id), { ...dep, createdAt: serverTimestamp() });
    await batch.commit();
    await log({ type: "student", action: "register", summary: `Registered ${student.name.trim()} for ${e.instrument}`, entity: { kind: "student", id: studentRef.id } });
    await log({ type: "deposit", action: collectNow ? "collect" : "create", summary: `Deposit RM ${dep.amount} for ${student.name.trim()} (${e.instrument}) — ${dep.status}`, entity: { kind: "enrolment", id: enrolRef.id } });
    return { studentId: studentRef.id, enrolmentId: enrolRef.id };
  }

  /** A second (third…) instrument for an existing student. */
  async function addEnrolment({ studentId, enrolment: form, depositAmount, collectNow = false }) {
    const enrolRef = doc(collection(db, "enrolments"));
    const e = newEnrolmentDoc({ ...form, studentId }, { today: TODAY });
    checkEnrolment(e);
    let dep = newDeposit({ enrolmentId: enrolRef.id, studentId, amount: depositAmount });
    if (collectNow) dep = collectDeposit(dep, { by: actor.uid, at: serverTimestamp() });
    const batch = writeBatch(db);
    batch.set(enrolRef, { ...e, createdAt: serverTimestamp() });
    batch.set(doc(db, "deposits", enrolRef.id), { ...dep, createdAt: serverTimestamp() });
    await batch.commit();
    await log({ type: "enrolment", action: "create", summary: `New enrolment: ${nameOf(studentId)} — ${e.instrument}`, entity: { kind: "enrolment", id: enrolRef.id } });
    await log({ type: "deposit", action: collectNow ? "collect" : "create", summary: `Deposit RM ${dep.amount} for ${nameOf(studentId)} (${e.instrument}) — ${dep.status}`, entity: { kind: "enrolment", id: enrolRef.id } });
    return enrolRef.id;
  }

  async function saveStudent(id, data) {
    if (!data.name?.trim()) throw new Error("Student name is required.");
    const prev = students.items.find(s => s.id === id);
    await updateDoc(doc(db, "students", id), { name: data.name.trim(), phone: data.phone ?? "", notes: data.notes ?? "" });
    await log({ type: "student", action: "update", summary: `Edited student ${data.name.trim()}`, entity: { kind: "student", id }, changes: diffFields(prev, data, ["name", "phone", "notes"]) });
  }

  /**
   * Edit an enrolment. `patch` may contain schedule/teacher/grade/… and the billing fields
   * produced by buildBillingPatch (feeOverride, termChanges+billingTerm, commissionPct).
   * Fee, term and commission edits each get their own history entry.
   */
  async function updateEnrolment(prev, patch) {
    const next = { ...prev, ...patch };
    if (["schedule", "teacherId", "instrument", "grade", "syllabus"].some(k => k in patch)) checkEnrolment(next, prev.id);
    if ("commissionPct" in patch && patch.commissionPct !== null) assertCommissionPct(patch.commissionPct);
    await updateDoc(doc(db, "enrolments", prev.id), patch);

    const who = `${nameOf(prev.studentId)} (${prev.instrument ?? "no instrument"})`;
    const entity = { kind: "enrolment", id: prev.id };
    const groups = [
      ["fee", ["feeOverride"], "Fee override"],
      ["term", ["termChanges"], "Billing term"],
      ["commission", ["commissionPct"], "Commission rate"],
      ["enrolment", ["grade", "syllabus", "teacherId", "attendanceBased", "schedule", "instrument", "status", "endDate"], "Enrolment"],
    ];
    for (const [type, keys, label] of groups) {
      const changes = diffFields(prev, next, keys.filter(k => k in patch));
      if (changes.length) await log({ type, action: "update", summary: `${label} changed for ${who}`, entity, changes });
    }
  }

  // Reads the deposit + the final fee's ledger entry, writes the deposit, the ledger and (optionally)
  // the enrolment — all in one transaction so a deposit can never be applied twice.
  async function applyDepositTx(enrolment, extraWrites) {
    const period = getBillingPeriod(enrolment, ymOfDate(enrolment.endDate));
    if (!period.active) throw new Error("This enrolment has no final billing period.");
    const depRef    = doc(db, "deposits", enrolment.id);
    const ledgerRef = doc(db, "payroll_months", period.startYM);
    return runTransaction(db, async tx => {
      const depSnap = await tx.get(depRef);
      const ledSnap = await tx.get(ledgerRef);
      let outcome = { applied: false, reason: "No held deposit." };

      if (depSnap.exists() && depSnap.data().status === "held") {
        const ledger = ledSnap.exists() ? ledSnap.data().feeStatus ?? {} : {};
        if (ledger[enrolment.id]?.collected) {
          outcome = { applied: false, reason: "The final month's fee is already marked collected. Un-collect it, then apply the deposit." };
        } else {
          const row = buildEnrolmentRow(
            { ym: period.startYM, ledger, teachers: teachers.items, tables, adminFlatFee: settings.adminFlatFee, attendance: attendance.items },
            enrolment,
          );
          const { deposit, plan } = applyDeposit(depSnap.data(), { finalFeeDue: row.net, yearMonth: period.startYM, by: actor.uid, at: serverTimestamp() });
          const entry = { depositApplied: { depositId: enrolment.id, amount: plan.applied } };
          if (plan.balanceDue === 0 && row.net > 0) {
            Object.assign(entry, { collected: true, collectedAt: serverTimestamp(), collectedBy: "deposit", snap: buildCollectionSnapshot(row) });
          }
          tx.update(depRef, deposit);
          tx.set(ledgerRef, { feeStatus: { [enrolment.id]: entry } }, { merge: true });
          outcome = { applied: true, plan, deposit, yearMonth: period.startYM, autoCollected: plan.balanceDue === 0 && row.net > 0 };
        }
      }
      extraWrites?.(tx);
      return outcome;
    });
  }

  /** Stop an enrolment after lesson month `lastYM`; a held deposit is applied to the final fee automatically. */
  async function stopEnrolment(enrolment, lastYM) {
    const patch   = stopEnrolmentPatch(enrolment, lastYM);
    const stopped = { ...enrolment, ...patch };
    const outcome = await applyDepositTx(stopped, tx => tx.update(doc(db, "enrolments", enrolment.id), patch));
    const who = `${nameOf(enrolment.studentId)} (${enrolment.instrument})`;
    await log({ type: "enrolment", action: "stop", summary: `Stopped ${who} after ${lastYM}`, entity: { kind: "enrolment", id: enrolment.id }, changes: diffFields(enrolment, stopped, ["status", "endDate"]) });
    if (outcome.applied) {
      await log({ type: "deposit", action: "apply", summary: `Deposit RM ${outcome.deposit.amount} applied to ${who}'s final fee (${outcome.yearMonth}): offset RM ${outcome.plan.applied}, student pays RM ${outcome.plan.balanceDue}`, entity: { kind: "enrolment", id: enrolment.id }, meta: outcome.plan });
    }
    return outcome;
  }

  /** Manual "Apply deposit" for an already-stopped enrolment (e.g. the fee was un-collected first). */
  async function applyDepositNow(enrolment) {
    if (enrolment.status !== "stopped") throw new Error("Stop the enrolment first.");
    const outcome = await applyDepositTx(enrolment);
    if (outcome.applied) {
      await log({ type: "deposit", action: "apply", summary: `Deposit applied to ${nameOf(enrolment.studentId)} (${enrolment.instrument}) final fee (${outcome.yearMonth}): offset RM ${outcome.plan.applied}, student pays RM ${outcome.plan.balanceDue}`, entity: { kind: "enrolment", id: enrolment.id }, meta: outcome.plan });
    }
    return outcome;
  }

  async function removeStudent(id) {
    const mine = enrolments.items.filter(e => e.studentId === id);
    const depOf = e => deposits.items.find(d => d.id === e.id);
    if (mine.some(e => depOf(e)?.status === "held")) {
      throw new Error("This student has a held deposit. Stop the enrolment so the deposit is applied before deleting.");
    }
    if (mine.some(e => ["applied", "forfeited"].includes(depOf(e)?.status))) {
      throw new Error("This student has deposit history that must be kept (applied/forfeited deposits can't be deleted). Use Stop on their enrolments instead.");
    }
    const batch = writeBatch(db);
    mine.forEach(e => {
      batch.delete(doc(db, "enrolments", e.id));
      if (depOf(e)) batch.delete(doc(db, "deposits", e.id));   // only pending deposits reach this point (see firestore.rules)
    });
    batch.delete(doc(db, "students", id));
    await batch.commit();
    await log({ type: "student", action: "delete", summary: `Deleted student ${nameOf(id)} and ${mine.length} enrolment(s)`, entity: { kind: "student", id } });
  }

  // ── deposits ────────────────────────────────────────────────────────────────
  async function runDepositTx(enrolmentId, fn) {
    const ref = doc(db, "deposits", enrolmentId);
    return runTransaction(db, async tx => {
      const snap = await tx.get(ref);
      if (!snap.exists()) throw new Error("No deposit record for this enrolment.");
      const next = fn(snap.data());
      tx.update(ref, next);
      return next;
    });
  }
  const depLabel = enrolmentId => {
    const e = enrolments.items.find(x => x.id === enrolmentId);
    return e ? `${nameOf(e.studentId)} (${e.instrument})` : enrolmentId;
  };

  async function collectDepositFor(enrolmentId) {
    const d = await runDepositTx(enrolmentId, dep => collectDeposit(dep, { by: actor.uid, at: serverTimestamp() }));
    await log({ type: "deposit", action: "collect", summary: `Deposit RM ${d.amount} collected — ${depLabel(enrolmentId)}. Registration complete.`, entity: { kind: "enrolment", id: enrolmentId } });
  }

  async function editDepositFor(enrolmentId, amount) {
    const before = deposits.items.find(d => d.id === enrolmentId);
    const d = await runDepositTx(enrolmentId, dep => editDepositAmount(dep, amount));
    await log({ type: "deposit", action: "edit", summary: `Deposit amount changed — ${depLabel(enrolmentId)}`, entity: { kind: "enrolment", id: enrolmentId }, changes: [{ field: "amount", from: before?.amount ?? null, to: d.amount }] });
  }

  async function forfeitDepositFor(enrolmentId, reason) {
    await runDepositTx(enrolmentId, dep => forfeitDeposit(dep, { by: actor.uid, at: serverTimestamp(), reason }));
    await log({ type: "deposit", action: "forfeit", summary: `Deposit forfeited — ${depLabel(enrolmentId)}${reason ? `: ${reason}` : ""}`, entity: { kind: "enrolment", id: enrolmentId } });
  }

  /** Admin backfill for enrolments that pre-date deposits. */
  async function backfillDeposit(enrolment, amount, collected = true) {
    const ref = doc(db, "deposits", enrolment.id);
    await runTransaction(db, async tx => {
      if ((await tx.get(ref)).exists()) throw new Error("This enrolment already has a deposit record.");
      let dep = newDeposit({ enrolmentId: enrolment.id, studentId: enrolment.studentId, amount });
      if (collected) dep = collectDeposit(dep, { by: actor.uid, at: serverTimestamp() });
      tx.set(ref, { ...dep, backfilled: true, createdAt: serverTimestamp() });
    });
    await log({ type: "deposit", action: "backfill", summary: `Deposit RM ${amount} backfilled — ${depLabel(enrolment.id)}${collected ? " (collected)" : " (pending)"}`, entity: { kind: "enrolment", id: enrolment.id } });
  }

  // ── teachers & rooms ────────────────────────────────────────────────────────
  async function saveTeacher(id, data) {
    if (!data.name?.trim()) throw new Error("Teacher name is required.");
    const pct = assertCommissionPct(data.commissionPct);
    const picked = data.instruments ?? [];
    const bad = picked.filter(i => !instruments.includes(i));
    if (bad.length) throw new Error(`Not offered any more: ${bad.join(", ")}.`);
    const body = { name: data.name.trim(), instruments: picked, commissionPct: pct };
    const ref = id ? doc(db, "teachers", id) : doc(collection(db, "teachers"));
    const prev = teachers.items.find(t => t.id === id);
    await setDoc(ref, body, { merge: true });
    await log({
      type: id ? "commission" : "teacher", action: id ? "update" : "create",
      summary: id ? `Edited teacher ${body.name}` : `Added teacher ${body.name}`,
      entity: { kind: "teacher", id: ref.id }, changes: id ? diffFields(prev, body, ["name", "instruments", "commissionPct"]) : [],
    });
    return ref.id;
  }

  async function removeTeacher(id) {
    const t = teachers.items.find(x => x.id === id);
    const live = enrolments.items.filter(e => e.teacherId === id && (e.status !== "stopped" || e.endDate >= TODAY));
    if (live.length) throw new Error(`${t?.name ?? "This teacher"} still has ${live.length} active enrolment(s). Reassign them first.`);
    await deleteDoc(doc(db, "teachers", id));
    await log({ type: "teacher", action: "delete", summary: `Removed teacher ${t?.name ?? id}`, entity: { kind: "teacher", id } });
  }

  async function saveRoom(id, data) {
    if (!data.name?.trim()) throw new Error("Room name is required.");
    if (!data.types?.length) throw new Error("Pick at least one room type.");
    const body = { name: data.name.trim(), types: data.types, color: data.color };
    const ref = id ? doc(db, "rooms", id) : doc(collection(db, "rooms"));
    const prev = rooms.items.find(r => r.id === id);
    await setDoc(ref, body, { merge: true });
    await log({ type: "room", action: id ? "update" : "create", summary: `${id ? "Edited" : "Added"} room ${body.name}`, entity: { kind: "room", id: ref.id }, changes: id ? diffFields(prev, body, ["name", "types", "color"]) : [] });
  }

  async function removeRoom(id) {
    const r = rooms.items.find(x => x.id === id);
    const live = enrolments.items.filter(e => e.schedule?.roomId === id && (e.status !== "stopped" || e.endDate >= TODAY));
    if (live.length) throw new Error(`${r?.name ?? "This room"} is used by ${live.length} active enrolment(s). Move them first.`);
    await deleteDoc(doc(db, "rooms", id));
    await log({ type: "room", action: "delete", summary: `Removed room ${r?.name ?? id}`, entity: { kind: "room", id } });
  }

  // ── attendance & one-off bookings ───────────────────────────────────────────
  async function setAttendance(enrolmentId, date, status, notes = "") {
    const ref = doc(db, "attendance", `${enrolmentId}_${date}`);
    if (!status || status === "pending") await deleteDoc(ref).catch(() => {});
    else await setDoc(ref, { enrolmentId, date, status, notes });
  }
  async function addOneOff(session) {
    const ref = session.id ? doc(db, "one_off_sessions", session.id) : doc(collection(db, "one_off_sessions"));
    await setDoc(ref, strip(session));
    return ref.id;
  }
  const updateOneOff = (id, patch) => updateDoc(doc(db, "one_off_sessions", id), patch);
  const deleteOneOff = id => deleteDoc(doc(db, "one_off_sessions", id));

  /**
   * Instruments that were removed from Grades & Fees may still be referenced by teachers, rooms or
   * enrolments. Replace those references with null / drop them (no fee, no duration) so nothing
   * keeps pointing at an instrument the studio no longer teaches.
   */
  async function cleanupInstruments() {
    const { teacherPatches, enrolmentPatches, roomPatches } = findUnavailableInstrumentRefs(
      instruments, { teachers: teachers.items, enrolments: enrolments.items, rooms: rooms.items },
    );
    const total = teacherPatches.length + enrolmentPatches.length + roomPatches.length;
    if (!total) return 0;
    const batch = writeBatch(db);
    teacherPatches.forEach(({ id, ...p }) => batch.update(doc(db, "teachers", id), p));
    enrolmentPatches.forEach(({ id, ...p }) => batch.update(doc(db, "enrolments", id), p));
    roomPatches.forEach(({ id, ...p }) => batch.update(doc(db, "rooms", id), p));
    await batch.commit();
    await log({ type: "instrument", action: "cleanup", summary: `Removed references to instruments no longer offered: ${teacherPatches.length} teacher(s), ${enrolmentPatches.length} enrolment(s), ${roomPatches.length} room(s)` });
    return total;
  }

  // ── discounts & settings ────────────────────────────────────────────────────
  async function saveDiscount(id, data) {
    const errors = validateDiscount(data);
    if (errors.length) throw new Error(errors.join(" "));
    const body = { name: data.name.trim(), type: data.type, value: Number(data.value), startMonth: data.startMonth, durationMonths: Number(data.durationMonths), note: data.note ?? "" };
    const ref = id ? doc(db, "discounts", id) : doc(collection(db, "discounts"));
    await setDoc(ref, body, { merge: true });
    await log({ type: "discount", action: id ? "update" : "create", summary: `${id ? "Edited" : "Created"} discount "${body.name}" (${body.type === "percent" ? body.value + "%" : "RM " + body.value})`, entity: { kind: "discount", id: ref.id } });
  }
  async function deleteDiscount(id) {
    const d = discounts.items.find(x => x.id === id);
    await deleteDoc(doc(db, "discounts", id));
    await log({ type: "discount", action: "delete", summary: `Deleted discount "${d?.name ?? id}"`, entity: { kind: "discount", id } });
  }

  /** Record (ym) or clear (null) the fee month a discount was first applied to an enrolment — its N months count from there. */
  async function setDiscountGrant(enrolmentId, discountId, ym) {
    await updateDoc(doc(db, "enrolments", enrolmentId), { [`discountGrants.${discountId}`]: ym ?? deleteField() });
  }

  async function saveAdminFlatFee(value) {
    const n = Number(value);
    if (!Number.isFinite(n) || n < 0) throw new Error("Admin fee must be zero or more.");
    await setDoc(doc(db, "settings", "studio"), { adminFlatFee: n }, { merge: true });
    await log({ type: "settings", action: "update", summary: `Admin flat fee set to RM ${n}`, changes: [{ field: "adminFlatFee", from: settings.adminFlatFee, to: n }] });
  }

  // ── finalized months ────────────────────────────────────────────────────────
  async function finalizeMonth(ym, { rows, totals, summary, payoutStatus }) {
    const ref = doc(db, "month_snapshots", ym);
    await runTransaction(db, async tx => {
      if ((await tx.get(ref)).exists()) throw new Error(`${ym} is already finalized.`);
      tx.set(ref, {
        yearMonth: ym, rows, totals, payoutStatus: payoutStatus ?? {},
        counts: { total: summary.total, collected: summary.collected, uncollected: summary.uncollected, deferredOut: summary.deferredOut },
        finalizedBy: { uid: actor.uid, name: actor.displayName || actor.email }, finalizedAt: serverTimestamp(),
      });
    });
    await log({ type: "month", action: "finalize", summary: `Finalized ${ym}: ${summary.collected}/${summary.total} collected, ${summary.uncollected} uncollected`, entity: { kind: "month", id: ym }, meta: { gross: totals.gross, teacher: totals.teacher, admin: totals.admin } });
  }

  /**
   * `deferrals` (from domain/months deferralChanges) are applied to the old/new target months'
   * ledgers. A finalized target is rule-locked, so it is left alone and returned in `skipped` —
   * it stays highlighted in the Archive and needs its own revision.
   */
  async function saveRevision(ym, { rows, totals, changes, affected, reason, deferrals = [] }) {
    if (!reason?.trim()) throw new Error("Give a reason for the revision.");
    if (!changes.length) throw new Error("Nothing was changed.");
    const revisionNo = revisions.items.filter(r => r.yearMonth === ym).length + 1;
    const ref = doc(collection(db, "month_revisions"));
    await setDoc(ref, { yearMonth: ym, revisionNo, reason: reason.trim(), rows, totals, changes, affectedMonths: affected, createdBy: { uid: actor.uid, name: actor.displayName || actor.email }, createdAt: serverTimestamp() });

    const finalized = new Set(snapshots.items.map(s => s.yearMonth));
    const batch = writeBatch(db), rewritten = [], skipped = [];
    const touch = (target, eid, fields) => {
      if (finalized.has(target)) { if (!skipped.includes(target)) skipped.push(target); return; }
      batch.set(doc(db, "payroll_months", target), { feeStatus: { [eid]: fields } }, { merge: true });
      if (!rewritten.includes(target)) rewritten.push(target);
    };
    for (const d of deferrals) {
      if (d.from) touch(d.from, d.eid, { deferredFromMonths: arrayRemove(ym), deferredFromAmounts: { [ym]: deleteField() } });
      if (d.to)   touch(d.to,   d.eid, { deferredFromMonths: arrayUnion(ym),  deferredFromAmounts: { [ym]: d.amount } });
    }
    if (rewritten.length) await batch.commit();

    await log({
      type: "month", action: "revise", summary: `Revision ${revisionNo} of ${ym}: ${changes.length} change(s). ${reason.trim()}`,
      entity: { kind: "month", id: ym },
      meta: { affected, deferrals: deferrals.map(d => ({ enrolmentId: d.eid, from: d.from, to: d.to, amount: d.amount })), rewritten, skipped },
    });
    return { revisionNo, rewritten, skipped };
  }

  return {
    students: students.items, enrolments: enrolments.items, deposits: deposits.items,
    teachers: teachers.items, rooms: rooms.items, attendance: attendance.items,
    oneOffSessions: oneOffs.items, discounts: discounts.items,
    monthSnapshots: snapshots.items, monthRevisions: revisions.items,
    adminFlatFee: settings.adminFlatFee, instruments, tables,
    loaded: [students, enrolments, teachers, rooms].every(c => c.loaded),
    log,
    actions: {
      registerStudent, addEnrolment, saveStudent, updateEnrolment, stopEnrolment, applyDepositNow, removeStudent,
      collectDepositFor, editDepositFor, forfeitDepositFor, backfillDeposit,
      saveTeacher, removeTeacher, saveRoom, removeRoom,
      setAttendance, addOneOff, updateOneOff, deleteOneOff,
      saveDiscount, deleteDiscount, setDiscountGrant, saveAdminFlatFee, finalizeMonth, saveRevision, cleanupInstruments,
      checkEnrolment, defaultDepositAmount: (e, ym) => defaultDepositAmount(e, ym, fees, contemporaryFees),
    },
  };
}
