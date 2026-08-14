import { useState, useEffect } from "react";
import { onAuthStateChanged, signInWithPopup, signOut as fbSignOut } from "firebase/auth";
import { doc, getDoc, getDocs, setDoc, deleteDoc, collection, query, where, serverTimestamp } from "firebase/firestore";
import { auth, db, googleProvider } from "../firebase.js";

export function useAuth() {
  const [user,          setUser]          = useState(null);
  const [firestoreUser, setFirestoreUser] = useState(null);
  const [role,          setRole]          = useState(null);
  const [loading,       setLoading]       = useState(true);
  const [authError,     setAuthError]     = useState(null);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async fbUser => {
      try {
        if (fbUser) {
          setUser(fbUser);

          // Check for existing user doc first
          const userSnap = await getDoc(doc(db, "users", fbUser.uid));
          if (userSnap.exists()) {
            const data = userSnap.data();
            setFirestoreUser(data);
            setRole(data.role);
          } else {
            // No user doc — check for a pending invite matching their email
            const inviteSnap = await getDocs(
              query(collection(db, "invites"), where("email", "==", fbUser.email.toLowerCase()))
            );
            if (!inviteSnap.empty) {
              const inviteDoc = inviteSnap.docs[0];
              const invite    = inviteDoc.data();
              // Claim the invite: create users/{uid}, delete the invite
              const userData = {
                uid:         fbUser.uid,
                email:       fbUser.email.toLowerCase(),
                displayName: fbUser.displayName || invite.displayName,
                photoURL:    fbUser.photoURL    || null,
                role:        invite.role,
                teacherId:   invite.teacherId   || null,
                createdAt:   invite.createdAt,
                createdBy:   invite.createdBy,
                claimedAt:   serverTimestamp(),
              };
              await setDoc(doc(db, "users", fbUser.uid), userData);
              await deleteDoc(inviteDoc.ref);
              setFirestoreUser(userData);
              setRole(invite.role);
            } else {
              setFirestoreUser(null);
              setRole("denied");
            }
          }
        } else {
          setUser(null);
          setFirestoreUser(null);
          setRole(null);
        }
      } catch (err) {
        console.error("Auth state error:", err);
        setAuthError("Firestore error: " + err.message);
        setRole(null);
      } finally {
        setLoading(false);
      }
    });
    return unsub;
  }, []);

  async function signInWithGoogle() {
    setAuthError(null);
    try {
      await signInWithPopup(auth, googleProvider);
    } catch (err) {
      console.error("Sign-in error:", err);
      setAuthError(err.code + ": " + err.message);
    }
  }

  async function signOut() {
    await fbSignOut(auth);
    setUser(null);
    setFirestoreUser(null);
    setRole(null);
    setAuthError(null);
  }

  return { user, firestoreUser, role, loading, authError, signInWithGoogle, signOut };
}
