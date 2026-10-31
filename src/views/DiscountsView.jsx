import { useState } from "react";
import { Card, Btn, Badge, Modal, Inp, Sel, THead } from "../components/UI.jsx";
import { addMonths, ymKey, formatYM, formatYMLong } from "../domain/time.js";
import { validateDiscount } from "../domain/billing.js";

const errBox = { fontSize: 12, color: "#FF5A65", background: "rgba(255,90,101,0.08)", border: "0.6px solid rgba(255,90,101,0.35)", borderRadius: 6, padding: "8px 11px", lineHeight: 1.6 };

/**
 * Discount campaigns. A discount has a name, a % or RM amount, a start month and a duration (months
 * it can be applied). Admins then apply a running discount to a student's fee from the Payroll page
 * (the "Discount" button under FEE). Applying is per student, per fee month.
 */
export default function DiscountsView({ discounts, actions, T, isMobile, setDirty }) {
  const curYM = ymKey(new Date().getFullYear(), new Date().getMonth());
  const blank = { name: "", type: "percent", value: "", startMonth: curYM, durationMonths: 1, note: "" };
  const [modal, setModal] = useState(null);   // "add" | discount
  const [form,  setForm]  = useState(blank);
  const [error, setError] = useState(null);
  const [busy,  setBusy]  = useState(false);

  const set = (k, v) => { setDirty?.(true); setForm(f => ({ ...f, [k]: v })); };
  const monthOpts = Array.from({ length: 24 }, (_, i) => addMonths(addMonths(curYM, -6), i));

  // Each student's N months start when it is first applied to them, so a discount never "ends" globally
  const status = d => curYM < d.startMonth
    ? { label: "Upcoming", color: "#9A91FB" }
    : { label: "Available", color: "#14CA74" };

  const rows = [...discounts].sort((a, b) => b.startMonth.localeCompare(a.startMonth) || a.name.localeCompare(b.name));

  async function save() {
    setError(null);
    const errs = validateDiscount(form);
    if (errs.length) { setError(errs.join(" ")); return; }
    setBusy(true);
    try {
      await actions.saveDiscount(modal === "add" ? null : modal.id, form);
      setModal(null); setDirty?.(false);
    } catch (e) { setError(e.message); }
    setBusy(false);
  }

  async function remove(d) {
    if (!confirm(`Delete "${d.name}"? Fees it was already applied to keep their discount.`)) return;
    try { await actions.deleteDiscount(d.id); } catch (e) { setError(e.message); }
  }

  const label = d => d.type === "percent" ? `${d.value}% off` : `RM ${d.value} off`;
  const runsLabel = d => `From ${formatYM(d.startMonth)} · lasts ${d.durationMonths} month${d.durationMonths === 1 ? "" : "s"} per student`;

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 18, gap: 10, flexWrap: "wrap" }}>
        <h2 style={{ fontSize: isMobile ? 18 : 24, fontWeight: 700, color: T.text, fontFamily: "'Red Hat Display', 'Plus Jakarta Sans', sans-serif" }}>Discounts</h2>
        <Btn T={T} onClick={() => { setError(null); setForm(blank); setModal("add"); }}>+ New Discount</Btn>
      </div>
      <p style={{ fontSize: 12, color: T.muted, lineHeight: 1.7, marginBottom: 16, maxWidth: 640 }}>
        Create a promotion here, then apply it to a student on the <strong style={{ color: T.text }}>Payroll</strong> page using the Discount button under their fee.
        A discount lasts for the number of months you set, counted per student from the fee month you first apply it to them. It can never take a fee below RM 0, and is frozen once the fee is collected.
      </p>
      {error && !modal && <div style={{ ...errBox, marginBottom: 14 }}>{error}</div>}

      <Card T={T} style={{ padding: 0, overflow: "hidden", border: `0.6px solid ${T.border2}`, borderRadius: 12 }}>
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <THead T={T} cols={["Name", "Discount", "Runs", "Status", "Note", ""]} />
            <tbody>
              {rows.map(d => {
                const st = status(d);
                return (
                  <tr key={d.id} style={{ borderBottom: `0.6px solid ${T.border}` }}>
                    <td style={{ padding: "11px 14px", fontSize: 12, color: T.text, fontWeight: 600 }}>{d.name}</td>
                    <td style={{ padding: "11px 14px", fontSize: 12, color: "#4ade80", fontWeight: 600 }}>{label(d)}</td>
                    <td style={{ padding: "11px 14px", fontSize: 12, color: T.muted }}>{runsLabel(d)}</td>
                    <td style={{ padding: "11px 14px" }}><Badge label={st.label} color={st.color} bg={st.color + "22"} /></td>
                    <td style={{ padding: "11px 14px", fontSize: 11, color: T.muted }}>{d.note || "—"}</td>
                    <td style={{ padding: "11px 14px" }}>
                      <div style={{ display: "flex", gap: 6 }}>
                        <Btn T={T} variant="ghost" style={{ padding: "4px 9px", fontSize: 11 }} onClick={() => { setError(null); setForm({ ...blank, ...d }); setModal(d); }}>Edit</Btn>
                        <Btn T={T} variant="danger" style={{ padding: "4px 9px", fontSize: 11 }} onClick={() => remove(d)}>Delete</Btn>
                      </div>
                    </td>
                  </tr>
                );
              })}
              {rows.length === 0 && <tr><td colSpan={6} style={{ padding: "20px 14px", textAlign: "center", color: T.muted, fontSize: 13 }}>No discounts yet.</td></tr>}
            </tbody>
          </table>
        </div>
      </Card>

      {modal && (
        <Modal T={T} title={modal === "add" ? "New Discount" : "Edit Discount"} width={460} onClose={() => { setModal(null); setDirty?.(false); }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 13 }}>
            <Inp T={T} label="Discount name" value={form.name} placeholder="e.g. Back-to-school" onChange={e => set("name", e.target.value)} />
            <div style={{ display: "flex", gap: 11 }}>
              <Sel T={T} label="Type" value={form.type} onChange={e => set("type", e.target.value)}>
                <option value="percent">Percentage (%)</option>
                <option value="amount">Fixed amount (RM)</option>
              </Sel>
              <Inp T={T} label={form.type === "percent" ? "Percent off" : "RM off"} type="number" min={0} max={form.type === "percent" ? 100 : undefined}
                value={form.value} onChange={e => set("value", e.target.value)} />
            </div>
            <div style={{ display: "flex", gap: 11 }}>
              <Sel T={T} label="Available from" value={form.startMonth} onChange={e => set("startMonth", e.target.value)}>
                {monthOpts.map(m => <option key={m} value={m}>{formatYMLong(m)}</option>)}
              </Sel>
              <Inp T={T} label="Lasts (months)" type="number" min={1} value={form.durationMonths} onChange={e => set("durationMonths", e.target.value)} />
            </div>
            <Inp T={T} label="Note (optional)" value={form.note ?? ""} onChange={e => set("note", e.target.value)} />
            <div style={{ fontSize: 11, color: T.muted }}>It can be applied to fees from {formatYM(form.startMonth)}; each student keeps it for {Math.max(1, Number(form.durationMonths) || 1)} month(s) from the month it is first applied to them. Editing a discount does not change fees it was already applied to.</div>
            {error && <div style={errBox}>{error}</div>}
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 9 }}>
              <Btn T={T} variant="ghost" onClick={() => { setModal(null); setDirty?.(false); }}>Cancel</Btn>
              <Btn T={T} disabled={busy} onClick={save}>{modal === "add" ? "Create" : "Save"}</Btn>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
