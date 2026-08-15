import { useState, useEffect } from "react";
import {
  doc, onSnapshot, updateDoc, setDoc, serverTimestamp,
  arrayUnion, arrayRemove,
} from "firebase/firestore";
import { db } from "../firebase.js";

/**
 * Firestore-backed payroll state for a single year-month (e.g. "2026-08").
 *
 * Document: payroll_months/{yearMonth}
 * Shape:
 *   feeStatus: {
 *     [studentId]: {
 *       collected:          bool
 *       collectedAt:        Timestamp | null
 *       deferredToMonth:    string | null   // "2026-09" — this month's fee moved to another month
 *       deferredFromMonths: string[]        // ["2026-08"] — months combined into this month
 *     }
 *   }
 *   payoutStatus: { [teacherId]: { paid: bool, paidAt: Timestamp | null } }
 */
export function usePayrollMonth(yearMonth) {
  const [feeStatus,    setFeeStatus]    = useState({});
  const [payoutStatus, setPayoutStatus] = useState({});

  useEffect(() => {
    if (!yearMonth) return;
    const ref = doc(db, "payroll_months", yearMonth);
    return onSnapshot(ref, snap => {
      const data = snap.data() ?? {};
      setFeeStatus(data.feeStatus    ?? {});
      setPayoutStatus(data.payoutStatus ?? {});
    });
  }, [yearMonth]);

  // ── internal helpers ────────────────────────────────────────────────────────

  async function _upsert(ref, updates) {
    try {
      await updateDoc(ref, updates);
    } catch (e) {
      if (e.code === "not-found") {
        await setDoc(ref, { feeStatus: {}, payoutStatus: {} });
        await updateDoc(ref, updates);
      } else {
        throw e;
      }
    }
  }

  async function _upsertArray(ref, updates) {
    try {
      await updateDoc(ref, updates);
    } catch (e) {
      if (e.code === "not-found") {
        await setDoc(ref, { feeStatus: {}, payoutStatus: {} });
        await updateDoc(ref, updates);
      } else {
        throw e;
      }
    }
  }

  // ── public API ──────────────────────────────────────────────────────────────

  async function markFeeCollected(studentId, collected) {
    await _upsert(doc(db, "payroll_months", yearMonth), {
      [`feeStatus.${studentId}.collected`]:   collected,
      [`feeStatus.${studentId}.collectedAt`]: collected ? serverTimestamp() : null,
    });
  }

  async function markPayoutPaid(teacherId, paid) {
    await _upsert(doc(db, "payroll_months", yearMonth), {
      [`payoutStatus.${teacherId}.paid`]:   paid,
      [`payoutStatus.${teacherId}.paidAt`]: paid ? serverTimestamp() : null,
    });
  }

  /**
   * Defer this month's fee for a student to targetYearMonth.
   * - Marks this month's entry with deferredToMonth = target
   * - Adds this month to target's deferredFromMonths array
   * - Clears collected status on this month (fee not yet received)
   */
  async function deferFee(studentId, targetYearMonth) {
    const srcRef = doc(db, "payroll_months", yearMonth);
    const tgtRef = doc(db, "payroll_months", targetYearMonth);

    await _upsert(srcRef, {
      [`feeStatus.${studentId}.deferredToMonth`]: targetYearMonth,
    });

    await _upsertArray(tgtRef, {
      [`feeStatus.${studentId}.deferredFromMonths`]: arrayUnion(yearMonth),
    });
  }

  /**
   * Undo a fee deferral that was pointing to targetYearMonth.
   * - Clears this month's deferredToMonth
   * - Removes this month from target's deferredFromMonths array
   */
  async function undeferFee(studentId, targetYearMonth) {
    const srcRef = doc(db, "payroll_months", yearMonth);
    const tgtRef = doc(db, "payroll_months", targetYearMonth);

    await _upsert(srcRef, {
      [`feeStatus.${studentId}.deferredToMonth`]: null,
    });

    await _upsertArray(tgtRef, {
      [`feeStatus.${studentId}.deferredFromMonths`]: arrayRemove(yearMonth),
    });
  }

  return { feeStatus, payoutStatus, markFeeCollected, markPayoutPaid, deferFee, undeferFee };
}
