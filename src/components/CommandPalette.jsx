import { useState, useMemo, useRef, useEffect } from "react";
import { searchEntries } from "../domain/search.js";
import { SEARCH_ENTRIES, PAGE_META, buildLiveEntries } from "../data/searchIndex.js";

// Ctrl/⌘+K: jump to a page, a button, a table or a record — the app then highlights it.
// Everything searchable is declared in data/searchIndex.js; elements carry a matching data-search="…" attribute.
export default function CommandPalette({
  T, nav, students = [], enrolments = [], teachers = [], rooms = [], discounts = [], instruments = [],
  currentUser, onClose, onPick,
}) {
  const [q, setQ] = useState("");
  const [i, setI] = useState(0);
  const inputRef = useRef(null);
  const listRef = useRef(null);

  useEffect(() => { inputRef.current?.focus(); }, []);

  const role = currentUser.role;
  const entries = useMemo(() => {
    const navIds = nav.map(n => n.id);
    const label = Object.fromEntries(nav.map(n => [n.id, n.label]));
    const pages = nav.map(n => ({ id: `page:${n.id}`, kind: "page", page: n.id, label: n.label, icon: n.icon, keywords: PAGE_META[n.id]?.keywords ?? [], hint: "Page" }));
    const controls = SEARCH_ENTRIES
      .filter(e => navIds.includes(e.page) && (!e.roles || e.roles.includes(role)))
      .map(e => ({ ...e, kind: "control", icon: "◎", area: e.area ?? label[e.page] }));
    const live = buildLiveEntries({ students, enrolments, teachers, rooms, discounts, instruments, role, teacherId: currentUser.teacherId, navIds });
    return { pages, all: [...pages, ...controls, ...live] };
  }, [nav, students, enrolments, teachers, rooms, discounts, instruments, role, currentUser.teacherId]);

  const items = useMemo(
    () => (q.trim() ? searchEntries(entries.all, q, { limit: 12 }) : entries.pages),
    [q, entries]);

  useEffect(() => { setI(0); }, [q]);
  useEffect(() => { listRef.current?.children[i]?.scrollIntoView({ block: "nearest" }); }, [i]);

  const pick = item => { if (!item) return; onClose(); onPick(item); };
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
          placeholder="Search pages, buttons, tables, students…" aria-label="Search"
          style={{
            width: "100%", background: "transparent", border: "none", outline: "none", color: T.text,
            padding: "16px 18px", fontSize: 15, fontFamily: "inherit", borderBottom: `0.6px solid ${T.border2}`,
          }} />
        <div ref={listRef} style={{ maxHeight: "50vh", overflowY: "auto", padding: 6 }}>
          {items.length === 0 && <div style={{ padding: "18px 12px", fontSize: 13, color: T.muted, textAlign: "center" }}>Nothing matches “{q}”. Try another word — e.g. “close month”, “salary”, “receipt”.</div>}
          {items.map((it, idx) => (
            <div key={it.id} onClick={() => pick(it)} onPointerMove={() => setI(idx)}
              style={{
                display: "flex", alignItems: "center", gap: 12, padding: "9px 12px", borderRadius: 9, cursor: "pointer",
                background: idx === i ? T.accent + "22" : "transparent", color: idx === i ? T.accent : T.text,
              }}>
              <span style={{ width: 18, textAlign: "center", color: idx === i ? T.accent : T.muted }}>{it.icon}</span>
              <span style={{ flex: 1, minWidth: 0 }}>
                <span style={{ display: "block", fontSize: 13, fontWeight: 600 }}>{it.label}</span>
                {it.kind === "control" && (
                  <span style={{ display: "block", fontSize: 11, color: T.muted, marginTop: 1 }}>
                    {it.area}{it.hint ? ` · ${it.hint}` : ""}
                  </span>
                )}
              </span>
              {it.kind !== "control" && <span style={{ fontSize: 11, color: T.muted, flexShrink: 0 }}>{it.kind === "page" ? "Page" : it.hint}</span>}
            </div>
          ))}
        </div>
        <div style={{ display: "flex", gap: 14, padding: "8px 14px", borderTop: `0.6px solid ${T.border2}`, fontSize: 11, color: T.muted }}>
          <span>↑↓ move</span><span>↵ go &amp; highlight</span><span>esc close</span>
        </div>
      </div>
    </div>
  );
}
