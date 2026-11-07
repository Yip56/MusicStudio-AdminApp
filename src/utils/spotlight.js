// Highlight an element tagged data-search="<id>": wait for it to render, scroll to it, pulse a ring ~3 s.
const DURATION = 3200;
let clear = null;

const visible = el => !!(el.offsetParent || el.getClientRects().length);

export function spotlight(id, { wait = 3000 } = {}) {
  if (typeof document === "undefined") return () => {};
  const sel = `[data-search="${String(id).replace(/"/g, '\\"')}"]`;
  let done = false, obs = null, timer = null;

  const find = () => [...document.querySelectorAll(sel)].find(visible);
  const stop = () => { done = true; obs?.disconnect(); clearTimeout(timer); };

  const show = el => {
    clear?.();
    el.scrollIntoView({ block: "center", behavior: "smooth" });
    el.classList.remove("sos-spot"); void el.offsetWidth;   // restart the animation if hit twice
    el.classList.add("sos-spot");
    const off = () => { el.classList.remove("sos-spot"); window.removeEventListener("pointerdown", off, true); clearTimeout(t); clear = null; };
    const t = setTimeout(off, DURATION);
    window.addEventListener("pointerdown", off, true);
    clear = off;
  };

  const first = find();
  if (first) { show(first); return stop; }
  obs = new MutationObserver(() => { const el = find(); if (el && !done) { stop(); show(el); } });
  obs.observe(document.body, { childList: true, subtree: true });
  timer = setTimeout(stop, wait);
  return stop;
}
