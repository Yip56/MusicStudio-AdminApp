import { useState, useEffect, useRef, forwardRef } from "react";
import { useMediaQuery } from "../hooks/useMediaQuery.js";

// ─── Avatar ───────────────────────────────────────────────────────────────────
export function Avatar({ name, size = 32 }) {
  const ini = name.split(" ").map(w => w[0]).slice(0, 2).join("");
  const hue = [...name].reduce((a, c) => a + c.charCodeAt(0), 0) % 360;
  return (
    <div style={{
      width: size, height: size, borderRadius: "50%",
      background: `hsl(${hue},40%,28%)`,
      display: "flex", alignItems: "center", justifyContent: "center",
      fontSize: size * 0.35, fontWeight: 700, color: "#FFFFFF", flexShrink: 0
    }}>{ini}</div>
  );
}

// ─── Badge ────────────────────────────────────────────────────────────────────
export function Badge({ label, color = "#AEB9E1", bg = "#0A1330", border }) {
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", gap: 4,
      fontSize: 10, fontWeight: 500, padding: "2px 6px",
      borderRadius: 2, color, background: bg,
      border: `0.6px solid ${border || color + "80"}`,
      whiteSpace: "nowrap"
    }}>
      <span style={{ width: 3, height: 3, borderRadius: "50%", background: color, flexShrink: 0 }} />
      {label}
    </span>
  );
}

// ─── Card ─────────────────────────────────────────────────────────────────────
export const Card = forwardRef(function Card({ children, style = {}, T }, ref) {
  return (
    <div ref={ref} style={{
      background: T.panel, border: `0.6px solid ${T.border2}`,
      borderRadius: 12, padding: 20,
      boxShadow: "1px 1px 1px 0px rgba(16,25,52,0.4)",
      ...style
    }}>{children}</div>
  );
});

// ─── Stat ─────────────────────────────────────────────────────────────────────
export function Stat({ label, value, sub, color, icon = "◈", T }) {
  const ac = color || T.accent;
  const isPositive = sub && !sub.toString().startsWith("-");
  return (
    <div style={{
      background: T.panel, border: `0.6px solid ${T.border2}`, borderRadius: 8,
      padding: "19px 20px", flex: 1, minWidth: 140,
      boxShadow: "1px 1px 1px 0px rgba(16,25,52,0.4)"
    }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
          <span style={{ fontSize: 12, color: T.muted }}>{icon}</span>
          <span style={{ fontSize: 12, fontWeight: 500, color: T.muted }}>{label}</span>
        </div>
        <span style={{ fontSize: 16, color: T.muted, cursor: "default" }}>⋯</span>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <span style={{ fontSize: 24, fontWeight: 600, color: T.text, lineHeight: "32px" }}>{value}</span>
        {sub && (
          <span style={{
            fontSize: 10, fontWeight: 500, padding: "2px 5px", borderRadius: 2,
            background: isPositive ? "rgba(5,193,104,0.2)" : "rgba(255,90,101,0.2)",
            color: isPositive ? "#14CA74" : "#FF5A65",
            border: `0.6px solid ${isPositive ? "rgba(5,193,104,0.2)" : "rgba(255,90,101,0.2)"}`
          }}>{sub}</span>
        )}
      </div>
    </div>
  );
}

// ─── Input ────────────────────────────────────────────────────────────────────
export function Inp({ label, T, style: extraStyle = {}, ...p }) {
  const [focused, setFocused] = useState(false);
  return (
    <label style={{ display: "flex", flexDirection: "column", gap: 5, flex: 1 }}>
      {label && <span style={{ fontSize: 11, color: T.muted, textTransform: "uppercase", letterSpacing: "0.06em" }}>{label}</span>}
      <input
        style={{
          background: T.input, borderRadius: 4,
          border: focused ? "0.6px solid #CB3CFF" : `0.6px solid ${T.border2}`,
          boxShadow: focused ? "0 0 0 2px rgba(203,60,255,0.15)" : "none",
          color: T.text, padding: "9px 14px", fontSize: 12,
          outline: "none", fontFamily: "inherit", transition: "border 0.12s, box-shadow 0.12s",
          ...extraStyle
        }}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        {...p}
      />
    </label>
  );
}

// ─── Select ───────────────────────────────────────────────────────────────────
export function Sel({ label, children, T, style: extraStyle = {}, ...p }) {
  const [focused, setFocused] = useState(false);
  return (
    <label style={{ display: "flex", flexDirection: "column", gap: 5, flex: 1 }}>
      {label && <span style={{ fontSize: 11, color: T.muted, textTransform: "uppercase", letterSpacing: "0.06em" }}>{label}</span>}
      <select
        style={{
          background: T.input, borderRadius: 4,
          border: focused ? "0.6px solid #CB3CFF" : `0.6px solid ${T.border2}`,
          boxShadow: focused ? "0 0 0 2px rgba(203,60,255,0.15)" : "none",
          color: T.text, padding: "9px 14px", fontSize: 12,
          outline: "none", fontFamily: "inherit", appearance: "none",
          transition: "border 0.12s, box-shadow 0.12s", ...extraStyle
        }}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        {...p}
      >{children}</select>
    </label>
  );
}

// ─── Button ───────────────────────────────────────────────────────────────────
export function Btn({ children, variant = "primary", style = {}, T, ...p }) {
  const base = {
    padding: "8px 16px", borderRadius: 4, fontSize: 12, cursor: "pointer",
    border: "none", fontFamily: "inherit", fontWeight: 500, transition: "transform 0.1s ease-out, opacity 0.12s",
  };
  const variants = (T) => ({
    primary:   { background: "#CB3CFF", color: "#fff" },
    secondary: { background: T ? T.panel2 : "#0A1330", color: "#fff" },
    ghost:     { background: "transparent", color: T ? T.muted : "#AEB9E1", border: `1px solid ${T ? T.border2 : "#343B4F"}` },
    danger:    { background: "#2d0a1a", color: "#FF5A65", border: "1px solid #7f1d1d" },
    subtle:    { background: T ? T.dim : "#37446B", color: T ? T.muted : "#AEB9E1" },
    active:    { background: "rgba(203,60,255,0.1)", color: "#CB3CFF" },
  });
  const v = T ? (variants(T)[variant] || variants(T).primary) : variants(null).primary;
  return <button style={{ ...base, ...v, ...style }} {...p}>{children}</button>;
}

// ─── Sheet (mobile bottom sheet) ──────────────────────────────────────────────
// Springs in from the bottom, follows the finger 1:1 when dragged by its header, and on release
// projects the flick (Apple's deceleration formula) to decide between dismissing and snapping back.
const project = (v, rate = 0.99) => (v / 1000) * rate / (1 - rate);          // v in px/s → px
const rubber = (o, dim = 160, c = 0.55) => (o * dim * c) / (dim + c * Math.abs(o));

export function Sheet({ title, onClose, children, T, dismissOnScrim = true }) {
  const [shown, setShown] = useState(false);
  const [dy, setDy] = useState(0);
  const [dragging, setDragging] = useState(false);
  const drag = useRef(null);
  const panel = useRef(null);
  const timer = useRef(null);
  const closing = useRef(false);

  useEffect(() => {
    let r2;
    const r1 = requestAnimationFrame(() => { r2 = requestAnimationFrame(() => setShown(true)); });
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { cancelAnimationFrame(r1); cancelAnimationFrame(r2); clearTimeout(timer.current); document.body.style.overflow = prev; };
  }, []);

  const dismiss = () => {
    if (closing.current) return;
    closing.current = true;
    setShown(false); setDy(0);
    timer.current = setTimeout(onClose, 260);
  };

  const onDown = e => {
    if (e.target.closest("button")) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    drag.current = { y0: e.clientY, samples: [{ t: performance.now(), y: e.clientY }] };
    setDragging(true);
  };
  const onMove = e => {
    const d = drag.current; if (!d) return;
    const raw = e.clientY - d.y0;
    setDy(raw < 0 ? rubber(raw) : raw);
    d.samples.push({ t: performance.now(), y: e.clientY });
    if (d.samples.length > 5) d.samples.shift();
  };
  const onUp = () => {
    const d = drag.current; if (!d) return;
    drag.current = null; setDragging(false);
    const a = d.samples[0], b = d.samples[d.samples.length - 1];
    const v = b.t > a.t ? ((b.y - a.y) / (b.t - a.t)) * 1000 : 0;
    const h = panel.current?.offsetHeight ?? 400;
    if (dy + project(v) > Math.min(160, h * 0.4)) dismiss(); else setDy(0);
  };

  const h = panel.current?.offsetHeight || 500;
  const ease = "cubic-bezier(0.2, 0.9, 0.25, 1)";
  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 200 }}>
      <div onClick={dismissOnScrim ? dismiss : undefined} style={{
        position: "absolute", inset: 0, background: "rgba(0,0,0,0.55)",
        opacity: shown ? Math.max(0, 1 - dy / h) : 0, transition: dragging ? "none" : "opacity 0.25s ease-out",
      }} />
      <div ref={panel} className="sos-sheet sos-glass" role="dialog" aria-modal="true" aria-label={title}
        style={{
          position: "absolute", left: 0, right: 0, bottom: 0, maxHeight: "92dvh",
          display: "flex", flexDirection: "column",
          background: T.panel + "f5", borderTop: `0.6px solid ${T.border2}`,
          borderRadius: "22px 22px 0 0", boxShadow: "0 -12px 40px rgba(0,0,0,0.35)",
          paddingBottom: "env(safe-area-inset-bottom)",
          transform: shown ? `translateY(${dy}px)` : "translateY(100%)", opacity: shown ? 1 : 0,
          transition: dragging ? "none" : `transform 0.38s ${ease}, opacity 0.2s`,
        }}>
        <div onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp}
          style={{ touchAction: "none", flexShrink: 0, padding: "8px 20px 4px", cursor: "grab" }}>
          <div style={{ width: 38, height: 5, borderRadius: 9, background: T.dim, margin: "0 auto 10px" }} />
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", minHeight: 36 }}>
            <span style={{ fontSize: 17, fontWeight: 700, color: T.text, letterSpacing: "-0.01em" }}>{title}</span>
            <button onClick={dismiss} aria-label="Close" style={{ background: T.dim + "55", border: "none", color: T.muted, width: 32, height: 32, borderRadius: "50%", fontSize: 14, cursor: "pointer" }}>✕</button>
          </div>
        </div>
        <div style={{ overflowY: "auto", overscrollBehavior: "contain", padding: "10px 20px 22px", flex: 1 }}>
          {typeof children === "function" ? children(dismiss) : children}
        </div>
      </div>
    </div>
  );
}

// ─── Modal ────────────────────────────────────────────────────────────────────
// Centered dialog on desktop; bottom sheet on phones. The sheet is only dismissed by its handle / ✕
// (never by a stray tap outside) because most modals here hold unsaved form input.
export function Modal({ title, onClose, children, T, width = 460 }) {
  const mobile = useMediaQuery("(max-width: 767px)");
  useEffect(() => {
    if (mobile) return;
    const h = e => { if (e.key === "Escape") onClose?.(); };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [mobile, onClose]);

  if (mobile) return <Sheet T={T} title={title} onClose={onClose} dismissOnScrim={false}>{children}</Sheet>;
  return (
    <div className="sos-fade" style={{
      position: "fixed", inset: 0, background: "rgba(0,0,0,0.8)",
      display: "flex", alignItems: "center", justifyContent: "center", zIndex: 200
    }} onClick={onClose}>
      <div className="sos-pop" role="dialog" aria-modal="true" aria-label={title} onClick={e => e.stopPropagation()} style={{
        background: T.panel, border: `0.6px solid ${T.border2}`,
        borderRadius: 12, padding: 28, width, maxWidth: "94vw", maxHeight: "88vh", overflowY: "auto",
        boxShadow: "0px 17px 17px 0px rgba(1,5,17,0.1)"
      }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
          <span style={{ fontSize: 16, fontWeight: 600, color: T.text, letterSpacing: "-0.01em" }}>{title}</span>
          <button onClick={onClose} aria-label="Close" style={{ background: "none", border: "none", color: T.muted, fontSize: 18, cursor: "pointer" }}>✕</button>
        </div>
        {children}
      </div>
    </div>
  );
}

// ─── Section Title ────────────────────────────────────────────────────────────
export function SectionTitle({ children, T }) {
  return (
    <div style={{ fontSize: 16, fontWeight: 500, color: T.text, marginBottom: 14, lineHeight: "18px" }}>
      {children}
    </div>
  );
}

// ─── Table Head ───────────────────────────────────────────────────────────────
export function THead({ cols, T }) {
  return (
    <thead>
      <tr style={{ background: T.panel2, borderBottom: `0.6px solid ${T.border2}` }}>
        {cols.map(c => (
          <th key={c} style={{
            padding: "10px 14px", textAlign: "left", fontSize: 10,
            color: T.muted, fontWeight: 600, textTransform: "uppercase",
            letterSpacing: "0.07em", whiteSpace: "nowrap"
          }}>{c}</th>
        ))}
      </tr>
    </thead>
  );
}

// ─── Checkbox ────────────────────────────────────────────────────────────────
export function Checkbox({ label, checked, onChange, T }) {
  return (
    <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer" }}>
      <div onClick={onChange} style={{
        width: 18, height: 18, borderRadius: 4,
        border: `0.6px solid ${checked ? "#CB3CFF" : T.border2}`,
        background: checked ? "#CB3CFF" : T.input,
        display: "flex", alignItems: "center", justifyContent: "center",
        cursor: "pointer", transition: "all 0.12s", flexShrink: 0
      }}>
        {checked && <span style={{ fontSize: 11, color: "#fff", fontWeight: 700, lineHeight: 1 }}>✓</span>}
      </div>
      <span style={{ fontSize: 13, color: T.textSub }}>{label}</span>
    </label>
  );
}
