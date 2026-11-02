import { useState, useEffect } from "react";
import { collection, query, where, onSnapshot, updateDoc, doc, serverTimestamp } from "firebase/firestore";
import { db } from "../firebase.js";

export function useNotifications(firestoreUser) {
  const [notifications, setNotifications] = useState([]);

  useEffect(() => {
    if (!firestoreUser) { setNotifications([]); return; }

    const role      = firestoreUser.role;
    const teacherId = firestoreUser.teacherId;
    let q;

    if (role === "teacher" && teacherId) {
      q = query(
        collection(db, "notifications"),
        where("toTeacherId", "==", teacherId),
        where("status", "==", "pending")
      );
    } else if (role === "admin" || role === "sysadmin") {
      q = query(
        collection(db, "notifications"),
        where("toRole", "==", "admin"),
        where("status", "==", "pending")
      );
    } else {
      setNotifications([]);
      return;
    }

    const unsub = onSnapshot(q, snap =>
      setNotifications(snap.docs.map(d => ({ id: d.id, ...d.data() })))
    );
    return unsub;
  }, [firestoreUser]);

  // `note` = the admin's message to the teacher (grade requests); stored on the resolved request
  async function resolveNotification(notifId, status, resolvedBy, note = "") {
    await updateDoc(doc(db, "notifications", notifId), {
      status, resolvedAt: serverTimestamp(), resolvedBy,
      ...(note ? { resolutionNote: note } : {}),
    });
  }

  // A reply the teacher has read: leaves the bell but is not an approved/rejected request, so it stays out of the archive
  async function dismissNotification(notifId) {
    await updateDoc(doc(db, "notifications", notifId), { status: "seen", resolvedAt: serverTimestamp() });
  }

  return { notifications, pendingCount: notifications.length, resolveNotification, dismissNotification };
}
