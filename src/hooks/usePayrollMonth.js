import { useState, useEffect } from "react";
import {
  doc, onSnapshot, updateDoc, setDoc, serverTimestamp,
  arrayUnion, arrayRemove, deleteField,
} from "firebase/firestore";
import { db } from "../firebase.js";

/**
 * Firestore-backed ledger for a single year-month (e.g. "2026-08").
 *
 * Document: payroll_months/{yearMonth}
 *   feeStatus: {
 *     [enrolmentId]: {
 *       collected, collectedAt, collectedBy
 *       snap:               { periodFee, discountAmount, commissionPct, adminFlatFee, term, periodMonths, periodStart }
 *                           frozen at collection — see domain/payroll.js
 *       discount:           { id, name, type, value, note } | null   (chosen for this fee month)
 *       depositApplied:     { depositId, amount }                    (written when the enrolment stops)
 *       deferredToMonth:    "2026-09" | null     — this month's payout moved to another month
 *       deferredFromMonths: ["2026-08"]          — months combined into this month
 *       deferredFromAmounts:{ "2026-08": 120 }
 *     }
 *   }
 *   payoutStatus: { [teacherId]: { paid, paidAt } }
 *
 * Once a month is finalized (month_snapshots/{ym} exists) firestore.rules reject every write here.
 */
export function usePayrollMonth(yearMonth) {
  const [feeStatus,    setFeeStatus]    = useState({});
  const [payoutStatus, setPayoutStatus] = useState({});
  const [loaded,       setLoaded]       = useState(false);

  useEffect(() => {
    if (!yearMonth) return;
    setLoaded(false);
    const ref = doc(db, "payroll_months", yearMonth);
    return onSnapshot(ref, snap => {
      const data = snap.data() ?? {};
      setFeeStatus(data.feeStatus      ?? {});
      setPayoutStatus(data.payoutStatus ?? {});
      setLoaded(true);
    }, () => setLoaded(true));
  }, [yearMonth]);

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

  /** `snap` (from buildCollectionSnapshot) is stored when collecting and cleared when un-collecting. */
  async function markFeeCollected(enrolmentId, collected, snap = null, by = null) {
    await _upsert(doc(db, "payroll_months", yearMonth), {
      [`feeStatus.${enrolmentId}.collected`]:   collected,
      [`feeStatus.${enrolmentId}.collectedAt`]: collected ? serverTimestamp() : null,
      [`feeStatus.${enrolmentId}.collectedBy`]: collected ? by : null,
      [`feeStatus.${enrolmentId}.snap`]:        collected ? snap : null,
    });
  }

  async function setDiscount(enrolmentId, discount) {
    await _upsert(doc(db, "payroll_months", yearMonth), {
      [`feeStatus.${enrolmentId}.discount`]: discount ?? null,
    });
  }

  async function markPayoutPaid(teacherId, paid) {
    await _upsert(doc(db, "payroll_months", yearMonth), {
      [`payoutStatus.${teacherId}.paid`]:   paid,
      [`payoutStatus.${teacherId}.paidAt`]: paid ? serverTimestamp() : null,
    });
  }

  /**
   * Defer this month's payout for an enrolment to targetYearMonth.
   * grossAmount is the total gross being carried over (including any chained deferrals already
   * rolled into this month).
   */
  async function deferFee(enrolmentId, targetYearMonth, grossAmount = 0) {
    await _upsert(doc(db, "payroll_months", yearMonth), {
      [`feeStatus.${enrolmentId}.deferredToMonth`]: targetYearMonth,
    });
    await _upsert(doc(db, "payroll_months", targetYearMonth), {
      [`feeStatus.${enrolmentId}.deferredFromMonths`]: arrayUnion(yearMonth),
      [`feeStatus.${enrolmentId}.deferredFromAmounts.${yearMonth}`]: grossAmount,
    });
  }

  async function undeferFee(enrolmentId, targetYearMonth) {
    await _upsert(doc(db, "payroll_months", yearMonth), {
      [`feeStatus.${enrolmentId}.deferredToMonth`]: null,
    });
    await _upsert(doc(db, "payroll_months", targetYearMonth), {
      [`feeStatus.${enrolmentId}.deferredFromMonths`]: arrayRemove(yearMonth),
      [`feeStatus.${enrolmentId}.deferredFromAmounts.${yearMonth}`]: deleteField(),
    });
  }

  return { feeStatus, payoutStatus, loaded, markFeeCollected, setDiscount, markPayoutPaid, deferFee, undeferFee };
}
