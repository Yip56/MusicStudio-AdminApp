import { useState, useEffect } from "react";
import {
  collection, onSnapshot, addDoc, deleteDoc,
  doc, serverTimestamp,
} from "firebase/firestore";
import { db } from "../firebase.js";

/**
 * Real-time listener for all class deferrals (makeup sessions).
 *
 * Collection: class_deferrals/{id}
 * Shape:
 *   studentId:    string
 *   teacherId:    string
 *   originalDate: "YYYY-MM-DD"   — the missed class date
 *   makeupDate:   "YYYY-MM-DD"   — when the makeup is scheduled
 *   feeYearMonth: "YYYY-MM"      — payroll month the fee belongs to
 *   createdBy:    uid
 *   createdAt:    Timestamp
 *
 * Only applies to non-attendance-based students (enforced in the UI, not here).
 */
export function useClassDeferrals() {
  const [deferrals, setDeferrals] = useState([]);

  useEffect(() => {
    return onSnapshot(collection(db, "class_deferrals"), snap => {
      setDeferrals(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    });
  }, []);

  async function addDeferral({ studentId, teacherId, originalDate, makeupDate, createdBy }) {
    await addDoc(collection(db, "class_deferrals"), {
      studentId,
      teacherId,
      originalDate,
      makeupDate,
      feeYearMonth: originalDate.slice(0, 7),
      createdBy,
      createdAt: serverTimestamp(),
    });
  }

  async function removeDeferral(id) {
    await deleteDoc(doc(db, "class_deferrals", id));
  }

  return { deferrals, addDeferral, removeDeferral };
}
