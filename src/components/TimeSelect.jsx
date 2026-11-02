// Hour + minute pickers; minutes move in 5-minute steps (00, 05, 10 … 55).
const MINUTE_STEPS = Array.from({ length: 12 }, (_, i) => i * 5);
const pad = n => String(n).padStart(2, "0");

export default function TimeSelect({ value, onChange, style }) {
  const [h, m] = value.split(":");
  return (
    <div style={{ display: "flex", gap: 3, flex: 1 }}>
      <select value={h} onChange={e => onChange(`${e.target.value}:${m}`)} style={{ ...style, flex: 1 }}>
        {Array.from({ length: 24 }, (_, i) => <option key={i} value={pad(i)}>{pad(i)}</option>)}
      </select>
      <select value={m} onChange={e => onChange(`${h}:${e.target.value}`)} style={{ ...style, flex: 1 }}>
        {MINUTE_STEPS.map(n => <option key={n} value={pad(n)}>{pad(n)}</option>)}
      </select>
    </div>
  );
}
