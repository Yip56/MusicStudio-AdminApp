import { useState, useMemo, useEffect, useRef } from "react";
import { Card, Btn, Badge, Modal, Inp, Sel, ShakeBox, Checkbox } from "../components/UI.jsx";
import { useShakeError } from "../hooks/useShakeError.js";
import { PRODUCT_STATUSES, MAX_IMAGES, categoriesOf } from "../domain/products.js";

const blank = () => ({ name: "", description: "", category: "", price: "", status: "in_stock", published: true });
const money = p => (p === null || p === undefined ? "No price" : `RM ${Number(p).toFixed(2)}`);

export default function ProductsView({ products = [], actions, T, isMobile, setDirty }) {
  const [pageError, setPageError, pageShake] = useShakeError();
  const [modal,  setModal]  = useState(null);          // null | "add" | product
  const [form,   setForm]   = useState(blank());
  const [images, setImages] = useState([]);            // [{ url, path } | { file, preview }]
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState("");
  const [filter, setFilter] = useState("all");
  const fileRef = useRef(null);

  const categories = useMemo(() => categoriesOf(products), [products]);
  const shown = useMemo(() => products
    .filter(p => filter === "all" || (filter === "hidden" ? !p.published : filter === "sold_out" ? p.status === "sold_out" : p.published))
    .sort((a, b) => (a.category ?? "").localeCompare(b.category ?? "") || a.name.localeCompare(b.name)),
  [products, filter]);

  // Revoke preview URLs of photos picked but never saved
  useEffect(() => () => images.forEach(i => i.preview && URL.revokeObjectURL(i.preview)), []); // eslint-disable-line react-hooks/exhaustive-deps

  const set = (k, v) => { setDirty?.(true); setForm(f => ({ ...f, [k]: v })); };

  function openAdd() { setPageError(null); setForm(blank()); setImages([]); setModal("add"); }
  function openEdit(p) {
    setPageError(null);
    setForm({ name: p.name, description: p.description ?? "", category: p.category ?? "", price: p.price ?? "", status: p.status, published: !!p.published });
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

        <div style={{ display: "flex", gap: 10 }}>
          <Inp T={T} label="Category" list="product-categories" value={form.category} onChange={e => set("category", e.target.value)} placeholder="e.g. Ukuleles" />
          <datalist id="product-categories">{categories.map(c => <option key={c} value={c} />)}</datalist>
          <Inp T={T} label="Price (RM)" type="number" min="0" step="0.01" value={form.price} onChange={e => set("price", e.target.value)} placeholder="Blank = ask for price" />
        </div>

        <Sel T={T} label="Stock" value={form.status} onChange={e => set("status", e.target.value)}>
          {Object.entries(PRODUCT_STATUSES).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
        </Sel>

        <label style={{ display: "flex", flexDirection: "column", gap: 5 }}>
          <span style={{ fontSize: 11, color: T.muted, textTransform: "uppercase", letterSpacing: "0.06em" }}>Description</span>
          <textarea value={form.description} onChange={e => set("description", e.target.value)} rows={4}
            style={{ background: T.input, border: `0.6px solid ${T.border2}`, borderRadius: 4, color: T.text, padding: "9px 14px", fontSize: 12, outline: "none", fontFamily: "inherit", resize: "vertical" }} />
        </label>

        <div>
          <div style={{ fontSize: 11, color: T.muted, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 6 }}>
            Photos ({images.length}/{MAX_IMAGES}) — the first one is the cover
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(96px, 1fr))", gap: 8 }}>
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

        <div style={{ display: "flex", justifyContent: "flex-end", gap: 9, marginTop: 4 }}>
          <Btn T={T} variant="ghost" onClick={close} disabled={saving}>Cancel</Btn>
          <Btn T={T} onClick={save} disabled={saving}>{saving ? (status || "Saving…") : modal === "add" ? "Add Product" : "Save"}</Btn>
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

      {pageError && !modal && <ShakeBox shake={pageShake} style={{ fontSize: 12, color: "#FF5A65", marginBottom: 10 }}>{pageError}</ShakeBox>}

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))", gap: 12 }}>
        {shown.map(p => (
          <Card key={p.id} T={T} style={{ padding: 0, overflow: "hidden", borderRadius: 12 }}>
            {p.images?.[0]
              ? <img src={p.images[0].url} alt="" style={{ width: "100%", aspectRatio: "4 / 3", objectFit: "cover", display: "block", opacity: p.published ? 1 : 0.5 }} />
              : <div style={{ aspectRatio: "4 / 3", display: "flex", alignItems: "center", justifyContent: "center", color: T.muted, fontSize: 12, background: T.input }}>No photo</div>}
            <div style={{ padding: "12px 14px" }}>
              <div style={{ fontSize: 14, fontWeight: 700, color: T.text }}>{p.name}</div>
              <div style={{ fontSize: 11, color: T.muted, margin: "2px 0 8px" }}>{p.category || "No category"} · {money(p.price)}</div>
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
    </div>
  );
}
