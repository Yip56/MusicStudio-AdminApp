import { useState, useRef, useCallback } from "react";

/**
 * Error-message state that also counts repeats: setting the same message again bumps `shake`,
 * which <ShakeBox shake={shake}> turns into a shake so a blocked retry is hard to miss.
 * Returns [error, setError, shake]; setError(null) clears the message.
 */
export function useShakeError() {
  const [error, setErr]   = useState(null);
  const [shake, setShake] = useState(0);
  const last = useRef(null);
  const setError = useCallback(msg => {
    if (msg && last.current) setShake(n => n + 1);
    if (msg) last.current = msg;
    setErr(msg);
  }, []);
  return [error, setError, shake];
}
