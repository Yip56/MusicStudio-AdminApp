import { useState, forwardRef } from "react";

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
    border: "none", fontFamily: "inherit", fontWeight: 500, transition: "opacity 0.12s",
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

// ─── Modal ────────────────────────────────────────────────────────────────────
export function Modal({ title, onClose, children, T, width = 460 }) {
  const mobile = typeof window !== "undefined" && window.innerWidth < 768;
  const innerStyle = mobile
    ? { background: T.panel, width: "100%", height: "100%", overflowY: "auto", padding: 20, display: "flex", flexDirection: "column" }
    : {
        background: T.panel, border: `0.6px solid ${T.border2}`,
        borderRadius: 12, padding: 28, width, maxWidth: "94vw", maxHeight: "88vh", overflowY: "auto",
        boxShadow: "0px 17px 17px 0px rgba(1,5,17,0.1)"
      };
  return (
    <div style={{
      position: "fixed", inset: 0, background: mobile ? "transparent" : "rgba(0,0,0,0.8)",
      display: "flex", alignItems: mobile ? "flex-start" : "center", justifyContent: "center", zIndex: 200
    }} onClick={mobile ? undefined : onClose}>
      <div style={innerStyle} onClick={e => e.stopPropagation()}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
          <span style={{ fontSize: 16, fontWeight: 600, color: T.text }}>{title}</span>
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
