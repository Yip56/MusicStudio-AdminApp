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

  async function resolveNotification(notifId, status, resolvedBy) {
    await updateDoc(doc(db, "notifications", notifId), {
      status, resolvedAt: serverTimestamp(), resolvedBy,
    });
  }

  return { notifications, pendingCount: notifications.length, resolveNotification };
}
