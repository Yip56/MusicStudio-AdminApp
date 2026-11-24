import { useState, useMemo, useEffect, useRef } from "react";
import { Card, Btn, Badge, Modal, Inp, ShakeBox, Checkbox } from "../components/UI.jsx";
import { useShakeError } from "../hooks/useShakeError.js";
import * as XLSX from "xlsx";
import { MAX_IMAGES, PRODUCT_SHEET_HEADERS, categoriesOf, planProductImport } from "../domain/products.js";

const blank = () => ({ name: "", description: "", category: "", price: "", stock: "", status: "in_stock", published: true });
const money = p => (p === null || p === undefined ? "No price" : `RM ${Number(p).toFixed(2)}`);

export default function ProductsView({ products = [], actions, T, isMobile, setDirty }) {
  const [pageError, setPageError, pageShake] = useShakeError();
  const [modal,  setModal]  = useState(null);          // null | "add" | product
  const [form,   setForm]   = useState(blank());
  const [images, setImages] = useState([]);            // [{ url, path } | { file, preview }]
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState("");
  const [filter, setFilter] = useState("all");
  const [catFilter, setCatFilter] = useState("all");
  const [plan, setPlan] = useState(null);              // import preview: planProductImport result
  const [importing, setImporting] = useState(false);
  const importRef = useRef(null);
  const fileRef = useRef(null);

  const categories = useMemo(() => categoriesOf(products), [products]);
  const shown = useMemo(() => products
    .filter(p => catFilter === "all" || (p.category ?? "").trim() === catFilter)
    .filter(p => filter === "all" || (filter === "hidden" ? !p.published : filter === "sold_out" ? p.status === "sold_out" : p.published))
    .sort((a, b) => (a.category ?? "").localeCompare(b.category ?? "") || a.name.localeCompare(b.name)),
  [products, filter, catFilter]);

  // Revoke preview URLs of photos picked but never saved
  useEffect(() => () => images.forEach(i => i.preview && URL.revokeObjectURL(i.preview)), []); // eslint-disable-line react-hooks/exhaustive-deps

  const set = (k, v) => { setDirty?.(true); setForm(f => ({ ...f, [k]: v })); };

  function openAdd() { setPageError(null); setForm(blank()); setImages([]); setModal("add"); }
  function openEdit(p) {
    setPageError(null);
    setForm({ name: p.name, description: p.description ?? "", category: p.category ?? "", price: p.price ?? "", stock: p.stock ?? "", status: p.status, published: !!p.published });
    setImages((p.images ?? []).map(i => ({ url: i.url, path: i.path })));
    setModal(p);
  }
  function close() {
    images.forEach(i => i.preview && URL.revokeObjectURL(i.preview));
    setModal(null); setDirty?.(false);
  }

  function addFiles(fileList) {
    const picked = [...fileList].map(file => ({ file, preview: URL.createObjectURL(file) }));
    setDirty?.(true);
    setImages(prev => [...prev, ...picked].slice(0, MAX_IMAGES));
    if (fileRef.current) fileRef.current.value = "";
  }
  const dropImage = i => { setDirty?.(true); setImages(prev => prev.filter((_, j) => j !== i)); };
  const makeCover = i => { setDirty?.(true); setImages(prev => [prev[i], ...prev.filter((_, j) => j !== i)]); };

  async function save() {
    setSaving(true);
    try {
      await actions.saveProduct(modal === "add" ? null : modal.id, form, images, setStatus);
      close();
    } catch (e) { setPageError(e.message); }
    finally { setSaving(false); setStatus(""); }
  }
  async function remove(p) {
    if (!confirm(`Remove "${p.name}" and its photos? This cannot be undone.`)) return;
    try { await actions.removeProduct(p.id); } catch (e) { setPageError(e.message); }
  }
  async function togglePublished(p) {
    try {
      await actions.saveProduct(p.id, { ...p, published: !p.published }, (p.images ?? []).map(i => ({ url: i.url, path: i.path })));
    } catch (e) { setPageError(e.message); }
  }

  const modalView = modal && (
    <Modal T={T} title={modal === "add" ? "Add Product" : "Edit Product"} onClose={close} width={560}>
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        {pageError && <ShakeBox shake={pageShake} style={{ fontSize: 12, color: "#FF5A65" }}>{pageError}</ShakeBox>}

        <Inp T={T} label="Product name" value={form.name} onChange={e => set("name", e.target.value)} />

        <div style={{ display: "flex", flexDirection: isMobile ? "column" : "row", gap: 10 }}>
          <Inp T={T} label="Category" list="product-categories" value={form.category} onChange={e => set("category", e.target.value)} placeholder="e.g. Ukuleles" />
          <datalist id="product-categories">{categories.map(c => <option key={c} value={c} />)}</datalist>
          <Inp T={T} label="Price (RM)" type="number" min="0" step="0.01" value={form.price} onChange={e => set("price", e.target.value)} placeholder="Blank = ask for price" />
        </div>

        <div>
          <Inp T={T} label="Stock amount" type="number" inputMode="numeric" min="0" step="1" value={form.stock} onChange={e => set("stock", e.target.value)} placeholder="e.g. 12" />
          <div style={{ fontSize: 11, color: T.muted, marginTop: 4 }}>Shows as sold out on the website when this reaches 0. Leave blank if you do not track quantity.</div>
        </div>

        <label style={{ display: "flex", flexDirection: "column", gap: 5 }}>
          <span style={{ fontSize: 11, color: T.muted, textTransform: "uppercase", letterSpacing: "0.06em" }}>Description</span>
          <textarea value={form.description} onChange={e => set("description", e.target.value)} rows={4}
            style={{ background: T.input, border: `0.6px solid ${T.border2}`, borderRadius: 4, color: T.text, padding: "9px 14px", fontSize: 12, outline: "none", fontFamily: "inherit", resize: "vertical" }} />
        </label>

        <div>
          <div style={{ fontSize: 11, color: T.muted, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 6 }}>
            Photos ({images.length}/{MAX_IMAGES}) — the first one is the cover
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(88px, 1fr))", gap: 8 }}>
            {images.map((img, i) => (
              <div key={img.path ?? img.preview} style={{ position: "relative" }}>
                <img src={img.url ?? img.preview} alt="" style={{ width: "100%", aspectRatio: "1", objectFit: "cover", borderRadius: 6, border: `1px solid ${i === 0 ? "#CB3CFF" : T.border2}`, display: "block" }} />
                <div style={{ display: "flex", gap: 4, marginTop: 4 }}>
                  {i > 0 && <Btn T={T} variant="ghost" style={{ padding: "2px 6px", fontSize: 10, flex: 1 }} onClick={() => makeCover(i)}>Cover</Btn>}
                  <Btn T={T} variant="danger" style={{ padding: "2px 6px", fontSize: 10, flex: 1 }} onClick={() => dropImage(i)}>Remove</Btn>
                </div>
              </div>
            ))}
            {images.length < MAX_IMAGES && (
              <button type="button" onClick={() => fileRef.current?.click()}
                style={{ aspectRatio: "1", border: `1px dashed ${T.border2}`, borderRadius: 6, background: "transparent", color: T.muted, fontSize: 12, cursor: "pointer", fontFamily: "inherit" }}>
                + Add photos
              </button>
            )}
          </div>
          <input ref={fileRef} type="file" accept="image/*" multiple hidden onChange={e => addFiles(e.target.files)} />
        </div>

        <Checkbox T={T} label="Show on the website" checked={form.published} onChange={() => set("published", !form.published)} />

        <div style={{ display: "flex", justifyContent: "flex-end", flexWrap: "wrap", gap: 9, marginTop: 4 }}>
          <Btn T={T} variant="ghost" onClick={close} disabled={saving}>Cancel</Btn>
          <Btn T={T} onClick={save} disabled={saving}>{saving ? (status || "Saving…") : modal === "add" ? "Add Product" : "Save"}</Btn>
        </div>
      </div>
    </Modal>
  );

  // ── Excel template / import ────────────────────────────────────────────────
  // The template lists the current products, so it doubles as an export you can edit and re-import.
  function downloadTemplate() {
    const rows = products.length
      ? [...products].sort((a, b) => (a.category ?? "").localeCompare(b.category ?? "") || a.name.localeCompare(b.name))
          .map(p => [p.name, p.category ?? "", p.price ?? "", p.stock ?? "", p.description ?? "", p.published ? "Yes" : "No"])
      : [["Soprano Ukulele", "Ukuleles", 89.5, 12, "Beginner friendly", "Yes"]];
    const ws = XLSX.utils.aoa_to_sheet([PRODUCT_SHEET_HEADERS, ...rows]);
    ws["!cols"] = [{ wch: 28 }, { wch: 18 }, { wch: 12 }, { wch: 8 }, { wch: 40 }, { wch: 11 }];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Products");
    XLSX.writeFile(wb, "Ark-Music-Products.xlsx");
  }

  function handleImportFile(e) {
    const file = e.target.files[0];
    if (!file) return;
    setPageError(null);
    const reader = new FileReader();
    reader.onerror = () => { setPageError("Could not read that file."); e.target.value = ""; };
    reader.onload = evt => {
      try {
        const wb = XLSX.read(evt.target.result, { type: "array" });
        const ws = wb.Sheets[wb.SheetNames[0]];
        const rows = ws ? XLSX.utils.sheet_to_json(ws, { header: 1, defval: "" }) : [];
        const result = planProductImport(rows, products);
        if (result.error) setPageError(result.error);
        else if (!result.items.length) setPageError("No products found in that file.");
        else setPlan(result);
      } catch { setPageError("That does not look like an Excel file."); }
      e.target.value = "";
    };
    reader.readAsArrayBuffer(file);
  }

  async function confirmImport() {
    setImporting(true);
    try { await actions.importProducts(plan.items); setPlan(null); }
    catch (e) { setPageError(e.message); }
    finally { setImporting(false); }
  }

  const planErrors = plan ? plan.items.flatMap(i => i.errors) : [];
  const planCreates = plan ? plan.items.filter(i => i.action === "create").length : 0;
  const importModal = plan && (
    <Modal T={T} title="Import products" onClose={() => !importing && setPlan(null)} width={620}>
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <div style={{ fontSize: 13, color: T.text }}>
          <b>{planCreates}</b> new · <b>{plan.items.length - planCreates}</b> updated
        </div>
        {plan.newCategories.length > 0 && (
          <div style={{ fontSize: 12, color: T.textSub }}>
            New categories that will be created: <b style={{ color: T.text }}>{plan.newCategories.join(", ")}</b>
          </div>
        )}
        {planErrors.length > 0 && (
          <div style={{ fontSize: 12, color: "#FF5A65", display: "flex", flexDirection: "column", gap: 3 }}>
            <b>Fix these in the file, then import again:</b>
            {planErrors.slice(0, 8).map((m, i) => <span key={i}>{m}</span>)}
            {planErrors.length > 8 && <span>…and {planErrors.length - 8} more.</span>}
          </div>
        )}
        <div style={{ maxHeight: 280, overflowY: "auto", border: `0.6px solid ${T.border2}`, borderRadius: 6 }}>
          {plan.items.map(it => (
            <div key={it.line} style={{ display: "flex", gap: 8, alignItems: "baseline", padding: "7px 10px", borderBottom: `0.6px solid ${T.border}`, fontSize: 12, flexWrap: "wrap" }}>
              <span style={{ fontSize: 10, fontWeight: 700, color: it.action === "create" ? "#14CA74" : "#00C2FF", width: 46 }}>{it.action === "create" ? "NEW" : "UPDATE"}</span>
              <span style={{ color: T.text, fontWeight: 600, flex: 1, minWidth: 120 }}>{it.data.name || "(no name)"}</span>
              <span style={{ color: T.muted }}>
                {it.data.category || "No category"} · {money(it.data.price === "" ? null : Number(it.data.price))} · Stock {it.data.stock === "" ? "—" : it.data.stock}
              </span>
            </div>
          ))}
        </div>
        <div style={{ display: "flex", justifyContent: "flex-end", flexWrap: "wrap", gap: 9 }}>
          <Btn T={T} variant="ghost" onClick={() => setPlan(null)} disabled={importing}>Cancel</Btn>
          <Btn T={T} onClick={confirmImport} disabled={importing || planErrors.length > 0}>{importing ? "Importing…" : `Import ${plan.items.length} products`}</Btn>
        </div>
      </div>
    </Modal>
  );

  const FILTERS = [["all", "All"], ["published", "On website"], ["hidden", "Hidden"], ["sold_out", "Sold out"]];

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14, gap: 10, flexWrap: "wrap" }}>
        <h2 style={{ fontSize: isMobile ? 18 : 24, fontWeight: 700, color: T.text, fontFamily: "'Red Hat Display', 'Plus Jakarta Sans', sans-serif" }}>Products</h2>
        <div style={{ display: "flex", gap: 7, alignItems: "center", flexWrap: "wrap" }}>
          {FILTERS.map(([k, l]) => (
            <Btn key={k} T={T} variant={filter === k ? "active" : "ghost"} style={{ padding: "6px 13px", fontSize: 12 }} onClick={() => setFilter(k)}>{l}</Btn>
          ))}
          <Btn T={T} onClick={openAdd} style={{ marginLeft: 6, background: "#CB3CFF", color: "#fff", padding: "8px 16px", fontSize: 12 }}>+ Add Product</Btn>
        </div>
      </div>
      <p style={{ fontSize: 12, color: T.muted, marginBottom: 14 }}>
        Products marked “On website” appear on the public Products page. Buyers contact the studio to purchase.
      </p>

      <div style={{ display: "flex", gap: 8, marginBottom: 14, alignItems: "center", flexWrap: "wrap" }}>
        <span style={{ fontSize: 11, color: T.muted, marginRight: 4 }}>Excel:</span>
        <Btn T={T} variant="ghost" style={{ fontSize: 12, padding: "6px 12px", color: T.text }} onClick={downloadTemplate}>Download Template</Btn>
        <Btn T={T} variant="ghost" style={{ fontSize: 12, padding: "6px 12px", color: T.text }} onClick={() => importRef.current?.click()}>Import Excel</Btn>
        <input ref={importRef} type="file" accept=".xlsx,.xls" style={{ display: "none" }} onChange={handleImportFile} />
      </div>

      {categories.length > 0 && (
        <div style={{ display: "flex", gap: 7, marginBottom: 14, flexWrap: "wrap" }}>
          {["all", ...categories].map(c => (
            <Btn key={c} T={T} variant={catFilter === c ? "active" : "ghost"} style={{ padding: "5px 12px", fontSize: 11 }} onClick={() => setCatFilter(c)}>{c === "all" ? "All categories" : c}</Btn>
          ))}
        </div>
      )}

      {pageError && !modal && <ShakeBox shake={pageShake} style={{ fontSize: 12, color: "#FF5A65", marginBottom: 10 }}>{pageError}</ShakeBox>}

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))", gap: 12 }}>
        {shown.map(p => (
          <Card key={p.id} T={T} style={{ padding: 0, overflow: "hidden", borderRadius: 12 }}>
            {p.images?.[0]
              ? <img src={p.images[0].url} alt="" style={{ width: "100%", aspectRatio: "4 / 3", objectFit: "cover", display: "block", opacity: p.published ? 1 : 0.5 }} />
              : <div style={{ aspectRatio: "4 / 3", display: "flex", alignItems: "center", justifyContent: "center", color: T.muted, fontSize: 12, background: T.input }}>No photo</div>}
            <div style={{ padding: "12px 14px" }}>
              <div style={{ fontSize: 14, fontWeight: 700, color: T.text }}>{p.name}</div>
              <div style={{ fontSize: 11, color: T.muted, margin: "2px 0 8px" }}>{p.category || "No category"} · {money(p.price)}{typeof p.stock === "number" ? ` · ${p.stock} in stock` : ""}</div>
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 10 }}>
                {p.published ? <Badge label="On website" color="#4ade80" bg="#052e16" /> : <Badge label="Hidden" color="#9ca3af" bg="#1f2937" />}
                {p.status === "sold_out" && <Badge label="Sold out" color="#fbbf24" bg="#451a03" />}
              </div>
              <div style={{ display: "flex", gap: 5 }}>
                <Btn T={T} variant="ghost" style={{ padding: "3px 9px", fontSize: 11 }} onClick={() => openEdit(p)}>Edit</Btn>
                <Btn T={T} variant="ghost" style={{ padding: "3px 9px", fontSize: 11 }} onClick={() => togglePublished(p)}>{p.published ? "Hide" : "Show"}</Btn>
                <Btn T={T} variant="danger" style={{ padding: "3px 9px", fontSize: 11 }} onClick={() => remove(p)}>✕</Btn>
              </div>
            </div>
          </Card>
        ))}
      </div>
      {shown.length === 0 && (
        <p style={{ color: T.muted, fontSize: 13, textAlign: "center", paddingTop: 24 }}>
          {products.length === 0 ? "No products yet. Add your first one." : "No products match this filter."}
        </p>
      )}

      {modalView}
      {importModal}
    </div>
  );
}
