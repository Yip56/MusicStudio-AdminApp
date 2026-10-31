import { useState, useEffect } from "react";

const read = q => typeof window !== "undefined" && !!window.matchMedia && window.matchMedia(q).matches;

export function useMediaQuery(query) {
  const [matches, setMatches] = useState(() => read(query));
  useEffect(() => {
    if (!window.matchMedia) return;
    const mq = window.matchMedia(query);
    const on = () => setMatches(mq.matches);
    on();
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, [query]);
  return matches;
}
