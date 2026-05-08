import { useState, useEffect } from "react";
import { onAuthStateChanged, signInWithPopup, signOut as fbSignOut } from "firebase/auth";
import { doc, getDoc } from "firebase/firestore";
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
          const snap = await getDoc(doc(db, "users", fbUser.uid));
          if (snap.exists()) {
            const data = snap.data();
            setFirestoreUser(data);
            setRole(data.role);
          } else {
            setFirestoreUser(null);
            setRole("denied");
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
