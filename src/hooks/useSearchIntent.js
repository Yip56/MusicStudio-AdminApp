import { useEffect, useRef } from "react";

// A view calls this with the `intent` prop from quick search. When the intent targets this page it runs
// handlers[intent.open](intent.arg) once — e.g. switch a tab or open a (harmless) form — before the highlight lands.
export function useSearchIntent(intent, page, handlers) {
  const seen = useRef(0);
  useEffect(() => {
    if (!intent || intent.page !== page || seen.current === intent.nonce) return;
    seen.current = intent.nonce;
    if (intent.open) handlers?.[intent.open]?.(intent.arg);
  }, [intent?.nonce]);   // eslint-disable-line react-hooks/exhaustive-deps
}
