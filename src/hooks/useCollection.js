import { useState, useEffect } from "react";
import { collection, onSnapshot } from "firebase/firestore";
import { db } from "../firebase.js";

/**
 * Live listener for a whole Firestore collection. Documents come back as `{ id, ...data }`.
 * `enabled` gates the subscription until the user is signed in (rules require auth).
 * `loaded` flips true after the first snapshot (or error), so callers can tell
 * "still loading" from "genuinely empty".
 */
export function useCollection(name, enabled = true) {
  const [items,  setItems]  = useState([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (!enabled) { setItems([]); setLoaded(false); return; }
    return onSnapshot(
      collection(db, name),
      snap => { setItems(snap.docs.map(d => ({ id: d.id, ...d.data() }))); setLoaded(true); },
      err  => { console.error(`[${name}] listener failed:`, err.message); setLoaded(true); },
    );
  }, [name, enabled]);

  return { items, loaded };
}
