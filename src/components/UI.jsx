import { useState } from "react";

// ─── Avatar ───────────────────────────────────────────────────────────────────
export function Avatar({ name, size = 34 }) {
  const ini = name.split(" ").map(w => w[0]).slice(0, 2).join("");
  const hue = [...name].reduce((a, c) => a + c.charCodeAt(0), 0) % 360;
  return (
    <div style={{
      width: size, height: size, borderRadius: "50%",
      background: `hsl(${hue},40%,28%)`, border: `1.5px solid hsl(${hue},40%,38%)`,
      display: "flex", alignItems: "center", justifyContent: "center",
      fontSize: size * 0.35, fontWeight: 700, color: "#e8e8f0", flexShrink: 0
    }}>{ini}</div>
  );
}

// ─── Badge ────────────────────────────────────────────────────────────────────
export function Badge({ label, color = "#aaa", bg = "#1a1a2a" }) {
  return (
    <span style={{
      fontSize: 10, fontWeight: 700, letterSpacing: "0.07em", padding: "2px 7px",
      borderRadius: 99, color, background: bg, border: `1px solid ${color}30`,
      textTransform: "uppercase", whiteSpace: "nowrap"
    }}>{label}</span>
  );
}

// ─── Card ─────────────────────────────────────────────────────────────────────
export function Card({ children, style = {}, T }) {
  return (
    <div style={{
      background: T.panel, border: `1px solid ${T.border}`,
      borderRadius: 14, padding: 20, ...style
    }}>{children}</div>
  );
}

// ─── Stat ─────────────────────────────────────────────────────────────────────
export function Stat({ label, value, sub, color, T }) {
  const ac = color || T.accent;
  return (
    <div style={{
      background: T.panel, border: `1px solid ${T.border}`, borderRadius: 14,
      padding: "18px 20px", flex: 1, minWidth: 140
    }}>
      <div style={{ fontSize: 11, color: T.muted, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 5 }}>{label}</div>
      <div style={{ fontSize: 26, fontWeight: 800, color: ac, lineHeight: 1 }}>{value}</div>
      {sub && <div style={{ fontSize: 11, color: T.muted, marginTop: 5 }}>{sub}</div>}
    </div>
  );
}

// ─── Input ────────────────────────────────────────────────────────────────────
export function Inp({ label, T, style: extraStyle = {}, ...p }) {
  return (
    <label style={{ display: "flex", flexDirection: "column", gap: 5, flex: 1 }}>
      {label && <span style={{ fontSize: 11, color: T.muted, textTransform: "uppercase", letterSpacing: "0.06em" }}>{label}</span>}
      <input style={{
        background: T.input, border: `1px solid ${T.border2}`, borderRadius: 8,
        color: T.text, padding: "8px 11px", fontSize: 13, outline: "none",
        fontFamily: "inherit", ...extraStyle
      }} {...p} />
    </label>
  );
}

// ─── Select ───────────────────────────────────────────────────────────────────
export function Sel({ label, children, T, style: extraStyle = {}, ...p }) {
  return (
    <label style={{ display: "flex", flexDirection: "column", gap: 5, flex: 1 }}>
      {label && <span style={{ fontSize: 11, color: T.muted, textTransform: "uppercase", letterSpacing: "0.06em" }}>{label}</span>}
      <select style={{
        background: T.input, border: `1px solid ${T.border2}`, borderRadius: 8,
        color: T.text, padding: "8px 11px", fontSize: 13, outline: "none",
        fontFamily: "inherit", appearance: "none", ...extraStyle
      }} {...p}>{children}</select>
    </label>
  );
}

// ─── Button ───────────────────────────────────────────────────────────────────
export function Btn({ children, variant = "primary", style = {}, T, ...p }) {
  const base = {
    padding: "8px 16px", borderRadius: 8, fontSize: 13, cursor: "pointer",
    border: "none", fontFamily: "inherit", fontWeight: 600, transition: "opacity 0.12s",
  };
  const variants = (T) => ({
    primary: { background: T.accent, color: "#0b0b0f" },
    ghost:   { background: "transparent", color: T.muted, border: `1px solid ${T.border2}` },
    danger:  { background: "#3d1010", color: "#f87171", border: "1px solid #7f1d1d" },
    subtle:  { background: T.dim, color: T.muted },
    active:  { background: T.accent + "22", color: T.accent, border: `1px solid ${T.accent}44` },
  });
  const v = T ? (variants(T)[variant] || variants(T).primary) : { background: "#e8b84b", color: "#0b0b0f" };
  return <button style={{ ...base, ...v, ...style }} {...p}>{children}</button>;
}

// ─── Modal ────────────────────────────────────────────────────────────────────
export function Modal({ title, onClose, children, T, width = 460 }) {
  const mobile = typeof window !== "undefined" && window.innerWidth < 768;
  const innerStyle = mobile
    ? { background: T.panel, width: "100%", height: "100%", overflowY: "auto", padding: 20, display: "flex", flexDirection: "column" }
    : { background: T.panel, border: `1px solid ${T.border2}`, borderRadius: 18, padding: 28, width, maxWidth: "94vw", maxHeight: "88vh", overflowY: "auto" };
  return (
    <div style={{
      position: "fixed", inset: 0, background: mobile ? "transparent" : "rgba(0,0,0,0.75)",
      display: "flex", alignItems: mobile ? "flex-start" : "center", justifyContent: "center", zIndex: 200
    }} onClick={mobile ? undefined : onClose}>
      <div style={innerStyle} onClick={e => e.stopPropagation()}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
          <span style={{ fontSize: 16, fontWeight: 800, color: T.text }}>{title}</span>
          <button onClick={onClose} style={{ background: "none", border: "none", color: T.muted, fontSize: 18, cursor: "pointer" }}>✕</button>
        </div>
        {children}
      </div>
    </div>
  );
}

// ─── Section Title ────────────────────────────────────────────────────────────
export function SectionTitle({ children, T }) {
  return (
    <div style={{ fontSize: 11, fontWeight: 700, color: T.muted, textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 12 }}>
      {children}
    </div>
  );
}

// ─── Table Head ───────────────────────────────────────────────────────────────
export function THead({ cols, T }) {
  return (
    <thead>
      <tr style={{ borderBottom: `1px solid ${T.border}` }}>
        {cols.map(c => (
          <th key={c} style={{
            padding: "10px 14px", textAlign: "left", fontSize: 10,
            color: T.muted, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.07em"
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
        width: 18, height: 18, borderRadius: 4, border: `1.5px solid ${checked ? T.accent : T.border2}`,
        background: checked ? T.accent : T.input, display: "flex", alignItems: "center",
        justifyContent: "center", cursor: "pointer", transition: "all 0.12s", flexShrink: 0
      }}>
        {checked && <span style={{ fontSize: 11, color: "#0b0b0f", fontWeight: 900, lineHeight: 1 }}>✓</span>}
      </div>
      <span style={{ fontSize: 13, color: T.textSub }}>{label}</span>
    </label>
  );
}
