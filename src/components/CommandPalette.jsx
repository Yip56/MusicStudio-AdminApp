import { useState, useMemo, useRef, useEffect } from "react";

// Ctrl/⌘+K: jump to a page or a student. Teachers only find students they teach.
export default function CommandPalette({ T, nav, students, enrolments, currentUser, onClose, onPage, onStudent }) {
  const [q, setQ] = useState("");
  const [i, setI] = useState(0);
  const inputRef = useRef(null);
  const listRef = useRef(null);

  useEffect(() => { inputRef.current?.focus(); }, []);

  const items = useMemo(() => {
    const ql = q.trim().toLowerCase();
    const pages = nav.map(n => ({ kind: "page", id: n.id, label: n.label, icon: n.icon, hint: "Page" }));
    if (!ql) return pages;
    const mine = currentUser.role === "teacher"
      ? new Set(enrolments.filter(e => e.teacherId === currentUser.teacherId).map(e => e.studentId)) : null;
    const insts = {};
    enrolments.forEach(e => { if (e.instrument) (insts[e.studentId] ??= new Set()).add(e.instrument); });
    const people = students
      .filter(s => !mine || mine.has(s.id))
      .map(s => ({ kind: "student", id: s.id, label: s.name, icon: "♪", hint: [...(insts[s.id] ?? [])].join(", ") || "Student" }));
    return [...pages, ...people]
      .filter(x => x.label.toLowerCase().includes(ql) || x.hint.toLowerCase().includes(ql))
      .slice(0, 10);
  }, [q, nav, students, enrolments, currentUser]);

  useEffect(() => { setI(0); }, [q]);
  useEffect(() => { listRef.current?.children[i]?.scrollIntoView({ block: "nearest" }); }, [i]);

  const pick = item => {
    if (!item) return;
    onClose();
    if (item.kind === "page") onPage(item.id); else onStudent(item.id);
  };
  const onKey = e => {
    if (e.key === "Escape") { e.preventDefault(); onClose(); }
    else if (e.key === "ArrowDown") { e.preventDefault(); setI(x => Math.min(x + 1, items.length - 1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setI(x => Math.max(x - 1, 0)); }
    else if (e.key === "Enter") { e.preventDefault(); pick(items[i]); }
  };

  return (
    <div className="sos-fade" onClick={onClose} style={{
      position: "fixed", inset: 0, zIndex: 400, background: "rgba(0,0,0,0.6)",
      display: "flex", justifyContent: "center", alignItems: "flex-start", padding: "max(12vh, env(safe-area-inset-top)) 12px 0",
    }}>
      <div className="sos-pop sos-glass" role="dialog" aria-modal="true" aria-label="Quick search" onClick={e => e.stopPropagation()}
        style={{
          width: 560, maxWidth: "100%", background: T.panel + "f2", border: `0.6px solid ${T.border2}`,
          borderRadius: 14, boxShadow: "0 24px 60px rgba(0,0,0,0.45)", overflow: "hidden",
        }}>
        <input ref={inputRef} value={q} onChange={e => setQ(e.target.value)} onKeyDown={onKey}
          placeholder="Search students or jump to a page…" aria-label="Search"
          style={{
            width: "100%", background: "transparent", border: "none", outline: "none", color: T.text,
            padding: "16px 18px", fontSize: 15, fontFamily: "inherit", borderBottom: `0.6px solid ${T.border2}`,
          }} />
        <div ref={listRef} style={{ maxHeight: "50vh", overflowY: "auto", padding: 6 }}>
          {items.length === 0 && <div style={{ padding: "18px 12px", fontSize: 13, color: T.muted, textAlign: "center" }}>Nothing matches “{q}”.</div>}
          {items.map((it, idx) => (
            <div key={it.kind + it.id} onClick={() => pick(it)} onPointerMove={() => setI(idx)}
              style={{
                display: "flex", alignItems: "center", gap: 12, padding: "10px 12px", borderRadius: 9, cursor: "pointer",
                background: idx === i ? T.accent + "22" : "transparent", color: idx === i ? T.accent : T.text,
              }}>
              <span style={{ width: 18, textAlign: "center", color: idx === i ? T.accent : T.muted }}>{it.icon}</span>
              <span style={{ flex: 1, fontSize: 13, fontWeight: 600 }}>{it.label}</span>
              <span style={{ fontSize: 11, color: T.muted }}>{it.hint}</span>
            </div>
          ))}
        </div>
        <div style={{ display: "flex", gap: 14, padding: "8px 14px", borderTop: `0.6px solid ${T.border2}`, fontSize: 11, color: T.muted }}>
          <span>↑↓ move</span><span>↵ open</span><span>esc close</span>
        </div>
      </div>
    </div>
  );
}
