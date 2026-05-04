"use client";

import { useEffect, useState, useCallback, useMemo, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import DashboardShell from "../components/DashboardShell";

type Row = {
  id: string;
  brand: string;
  model: string;
  color: string;
  repair_type: string;
  quality: string;
  price: number | null;
  show_quality: boolean;
};

const REGULAR_REPAIR_TYPES = [
  "Schermmodule", "Glas (Touchscreen)", "Display (LCD)", "Batterij", "Achterpaneel", "Behuizing",
  "Camera achterzijde", "Camera voorzijde", "Cameraglas", "Luidspreker", "Oplaadpoort",
];
const SERVICE_REPAIR_TYPES = ["Onderzoeken", "Reinigen", "Softwarereset", "Overige"];
const REGULAR_QUALITIES = ["Officieel", "Compatible"];

type RepairSelection = { repair_type: string; qualities: string[]; prices: Record<string, string> };
type DeviceForm = { brand: string; model: string; colors: string[]; repairs: RepairSelection[] };
const EMPTY_DEVICE_FORM: DeviceForm = { brand: "", model: "", colors: [], repairs: [] };

function buildRows(form: DeviceForm) {
  const out: { brand: string; model: string; color: string; repair_type: string; quality: string; price: number | null }[] = [];
  for (const color of form.colors) {
    for (const repair of form.repairs) {
      for (const quality of repair.qualities) {
        const priceStr = (repair.prices[quality] || "").trim().replace(",", ".");
        const price = priceStr !== "" ? Number(priceStr) || null : null;
        out.push({ brand: form.brand.trim(), model: form.model.trim(), color: color.trim(), repair_type: repair.repair_type, quality, price });
      }
    }
  }
  return out;
}

function validateDeviceForm(form: DeviceForm): string | null {
  if (!form.brand.trim()) return "Vul een merk in.";
  if (!form.model.trim()) return "Vul een model in.";
  if (form.colors.length === 0) return "Voeg minimaal één kleur toe.";
  if (form.repairs.length === 0) return "Selecteer minimaal één reparatietype.";
  for (const r of form.repairs) {
    if (r.qualities.length === 0) return `Selecteer minimaal één kwaliteit voor "${r.repair_type}".`;
  }
  return null;
}

function fmtPrice(p: number | null) {
  return p == null
    ? <span style={{ color: "#94a3b8" }}>Op aanvraag</span>
    : `€ ${p.toFixed(2).replace(".", ",")}`;
}

type ModelGroup = { model: string; rows: Row[] };

function groupByModel(rows: Row[]): ModelGroup[] {
  const map = new Map<string, Row[]>();
  for (const r of rows) {
    if (!map.has(r.model)) map.set(r.model, []);
    map.get(r.model)!.push(r);
  }
  return [...map.entries()]
    .map(([model, rows]) => ({ model, rows }))
    .sort((a, b) => a.model.localeCompare(b.model, "nl"));
}

// ── RepairTable ───────────────────────────────────────────────────────────────

const thS: React.CSSProperties = { padding: "8px 12px", textAlign: "left", fontWeight: 700, color: "#475569", whiteSpace: "nowrap", borderBottom: "1px solid #e2e8f0" };
const tdS: React.CSSProperties = { padding: "8px 12px", verticalAlign: "middle" };

function RepairTable({ rows, editId, editPrice, busyId, onEditStart, onPriceChange, onSave, onCancelEdit, onShowQuality, onDelete }: {
  rows: Row[]; editId: string | null; editPrice: string; busyId: string | null;
  onEditStart: (r: Row) => void; onPriceChange: (v: string) => void; onSave: (id: string) => void;
  onCancelEdit: () => void; onShowQuality: (id: string, v: boolean) => void; onDelete: (id: string, label: string) => void;
}) {
  return (
    <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
      <thead>
        <tr style={{ background: "#f8fafc" }}>
          <th style={thS}>Kleur</th><th style={thS}>Reparatietype</th><th style={thS}>Kwaliteit</th>
          <th style={thS}>Prijs</th><th style={{ ...thS, textAlign: "center" }}>Toon kwaliteit</th><th style={thS}>Acties</th>
        </tr>
      </thead>
      <tbody>
        {rows.map(r => (
          <tr key={r.id} style={{ borderBottom: "1px solid #f1f5f9" }}>
            <td style={tdS}>{r.color}</td>
            <td style={tdS}>{r.repair_type}</td>
            <td style={tdS}>{r.quality}</td>
            <td style={tdS}>
              {editId === r.id
                ? <input type="number" step="0.01" min="0" autoFocus
                    style={{ width: 90, padding: "4px 8px", border: "1px solid #93c5fd", borderRadius: 6, fontSize: 13 }}
                    value={editPrice} onChange={e => onPriceChange(e.target.value)}
                    onKeyDown={e => { if (e.key === "Enter") onSave(r.id); if (e.key === "Escape") onCancelEdit(); }} />
                : <span style={{ cursor: "pointer" }} onClick={() => onEditStart(r)}>{fmtPrice(r.price)}</span>}
            </td>
            <td style={{ ...tdS, textAlign: "center" }}>
              <input type="checkbox" checked={!!r.show_quality} disabled={busyId === r.id}
                onChange={e => onShowQuality(r.id, e.target.checked)}
                style={{ width: 15, height: 15, cursor: "pointer", accentColor: "#0c86ad" }} />
            </td>
            <td style={tdS}>
              <div style={{ display: "flex", gap: 6 }}>
                {editId === r.id ? (
                  <><button className="cbtn cbtn-primary" disabled={!!busyId} onClick={() => onSave(r.id)}>{busyId === r.id ? "…" : "Opslaan"}</button>
                    <button className="cbtn cbtn-ghost" onClick={onCancelEdit}>Annuleren</button></>
                ) : (
                  <><button className="cbtn cbtn-ghost" onClick={() => onEditStart(r)}>Prijs</button>
                    <button className="cbtn cbtn-danger" disabled={busyId === r.id}
                      onClick={() => onDelete(r.id, `${r.brand} ${r.model} – ${r.repair_type}`)}>
                      {busyId === r.id ? "…" : "✕"}</button></>
                )}
              </div>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

// ── RepairFormSection ─────────────────────────────────────────────────────────

function RepairFormSection({ repairs, onToggle, onToggleQ, onSetPrice }: {
  repairs: RepairSelection[];
  onToggle: (rt: string, svc: boolean) => void;
  onToggleQ: (rt: string, q: string) => void;
  onSetPrice: (rt: string, q: string, p: string) => void;
}) {
  return (
    <div className="repair-list">
      <div className="repair-group-label">Reguliere reparaties</div>
      {REGULAR_REPAIR_TYPES.map(rt => {
        const sel = repairs.find(r => r.repair_type === rt);
        return (
          <div key={rt} className="repair-item">
            <label className="repair-item-header">
              <input type="checkbox" checked={!!sel} onChange={() => onToggle(rt, false)} />{rt}
            </label>
            {sel && (
              <div className="quality-row">
                {REGULAR_QUALITIES.map(q => (
                  <div key={q} className="quality-check-row">
                    <label className="quality-check">
                      <input type="checkbox" checked={sel.qualities.includes(q)} onChange={() => onToggleQ(rt, q)} />{q}
                    </label>
                    {sel.qualities.includes(q) && (
                      <input type="number" step="0.01" min="0" className="quality-price-input"
                        placeholder="Op aanvraag" value={sel.prices[q] || ""}
                        onChange={e => onSetPrice(rt, q, e.target.value)} />
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        );
      })}
      <div className="repair-group-label">Servicereparaties</div>
      {SERVICE_REPAIR_TYPES.map(rt => {
        const sel = repairs.find(r => r.repair_type === rt);
        return (
          <div key={rt} className="repair-item">
            <label className="repair-item-header">
              <input type="checkbox" checked={!!sel} onChange={() => onToggle(rt, true)} />{rt}
              <span style={{ fontSize: 11, color: "#94a3b8", fontWeight: 400 }}>(Standaard)</span>
            </label>
          </div>
        );
      })}
    </div>
  );
}

// ── Main ──────────────────────────────────────────────────────────────────────

function CatalogusPageInner() {
  const searchParams = useSearchParams();
  const shop = searchParams.get("shop") ?? "";
  const shopQ = shop ? `&shop=${encodeURIComponent(shop)}` : "";

  const [brands, setBrands] = useState<string[]>([]);
  const [status, setStatus] = useState("Laden…");
  const [search, setSearch] = useState("");

  // Per-brand loaded rows: brand → Row[]
  const [brandRows, setBrandRows] = useState<Record<string, Row[]>>({});
  const [loadingBrands, setLoadingBrands] = useState<Set<string>>(new Set());
  const [openBrands, setOpenBrands] = useState<Set<string>>(new Set());
  const [openModels, setOpenModels] = useState<Set<string>>(new Set());

  // Search result rows (flat, all brands)
  const [searchRows, setSearchRows] = useState<Row[] | null>(null);
  const [searchLoading, setSearchLoading] = useState(false);

  // Edit state
  const [editId, setEditId] = useState<string | null>(null);
  const [editPrice, setEditPrice] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);

  // Add device form
  const [showDeviceAdd, setShowDeviceAdd] = useState(false);
  const [deviceForm, setDeviceForm] = useState<DeviceForm>(EMPTY_DEVICE_FORM);
  const [deviceBusy, setDeviceBusy] = useState(false);
  const [colorInput, setColorInput] = useState("");

  // Add repair form
  const [showAdd, setShowAdd] = useState(false);
  const [addBrand, setAddBrand] = useState("");
  const [addModel, setAddModel] = useState("");
  const [addModels, setAddModels] = useState<string[]>([]);
  const [addExistingColors, setAddExistingColors] = useState<string[]>([]);
  const [addColors, setAddColors] = useState<string[]>([]);
  const [addColorInput, setAddColorInput] = useState("");
  const [addRepairs, setAddRepairs] = useState<RepairSelection[]>([]);
  const [addModelOpen, setAddModelOpen] = useState(false);
  const [addBusy, setAddBusy] = useState(false);

  // Load brand list
  useEffect(() => {
    setStatus("Laden…");
    fetch(`/api/catalog?brands=1${shopQ}`)
      .then(r => r.json())
      .then(data => {
        if (Array.isArray(data)) {
          const list = data.map((d: any) => typeof d === "string" ? d : d.brand).filter(Boolean);
          setBrands(list);
          setStatus(`${list.length} merken`);
        }
      })
      .catch(() => setStatus("Fout bij laden."));
  }, [shopQ]);

  // Load rows for a single brand (lazy)
  const loadBrand = useCallback(async (brand: string) => {
    if (brandRows[brand] || loadingBrands.has(brand)) return;
    setLoadingBrands(s => new Set(s).add(brand));
    try {
      const res = await fetch(`/api/catalog?brand=${encodeURIComponent(brand)}${shopQ}`);
      const data = await res.json();
      if (Array.isArray(data)) {
        setBrandRows(prev => ({ ...prev, [brand]: data }));
      }
    } finally {
      setLoadingBrands(s => { const n = new Set(s); n.delete(brand); return n; });
    }
  }, [brandRows, loadingBrands, shopQ]);

  // Reload a brand after mutation
  const reloadBrand = useCallback(async (brand: string) => {
    setLoadingBrands(s => new Set(s).add(brand));
    try {
      const res = await fetch(`/api/catalog?brand=${encodeURIComponent(brand)}${shopQ}`);
      const data = await res.json();
      if (Array.isArray(data)) setBrandRows(prev => ({ ...prev, [brand]: data }));
    } finally {
      setLoadingBrands(s => { const n = new Set(s); n.delete(brand); return n; });
    }
  }, [shopQ]);

  // Toggle brand open
  function toggleBrand(brand: string) {
    setOpenBrands(s => {
      const n = new Set(s);
      if (n.has(brand)) { n.delete(brand); return n; }
      n.add(brand);
      loadBrand(brand);
      return n;
    });
  }

  function toggleModel(key: string) {
    setOpenModels(s => { const n = new Set(s); n.has(key) ? n.delete(key) : n.add(key); return n; });
  }

  // Search — loads all matching rows server-side
  useEffect(() => {
    if (!search.trim()) { setSearchRows(null); return; }
    setSearchLoading(true);
    const q = search.trim();
    fetch(`/api/catalog?q=${encodeURIComponent(q)}${shopQ}`)
      .then(r => r.json())
      .then(data => {
        if (Array.isArray(data)) setSearchRows(data);
        setSearchLoading(false);
      })
      .catch(() => setSearchLoading(false));
  }, [search, shopQ]);

  // Search tree: group results by brand → model
  const searchTree = useMemo(() => {
    if (!searchRows) return null;
    const brandMap = new Map<string, Map<string, Row[]>>();
    for (const r of searchRows) {
      if (!brandMap.has(r.brand)) brandMap.set(r.brand, new Map());
      const mm = brandMap.get(r.brand)!;
      if (!mm.has(r.model)) mm.set(r.model, []);
      mm.get(r.model)!.push(r);
    }
    return [...brandMap.entries()].map(([brand, mm]) => ({
      brand,
      models: [...mm.entries()].map(([model, rows]) => ({ model, rows })).sort((a, b) => a.model.localeCompare(b.model, "nl")),
    })).sort((a, b) => a.brand.localeCompare(b.brand, "nl"));
  }, [searchRows]);

  // ── Mutations ──

  async function savePrice(id: string, brand: string) {
    setBusyId(id);
    const res = await fetch(`/api/catalog?${shopQ.slice(1)}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, price: editPrice }),
    });
    setBusyId(null);
    if (res.ok) { setEditId(null); reloadBrand(brand); if (searchRows) triggerSearch(); }
    else setStatus("Fout bij opslaan.");
  }

  async function saveShowQuality(id: string, value: boolean, brand: string) {
    setBrandRows(prev => ({
      ...prev,
      [brand]: (prev[brand] || []).map(r => r.id === id ? { ...r, show_quality: value } : r),
    }));
    if (searchRows) setSearchRows(prev => prev ? prev.map(r => r.id === id ? { ...r, show_quality: value } : r) : prev);
    const res = await fetch(`/api/catalog?${shopQ.slice(1)}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, show_quality: value }),
    });
    if (!res.ok) {
      setBrandRows(prev => ({ ...prev, [brand]: (prev[brand] || []).map(r => r.id === id ? { ...r, show_quality: !value } : r) }));
      setStatus("Fout bij opslaan.");
    }
  }

  async function deleteRow(id: string, label: string, brand: string) {
    if (!confirm(`Verwijder "${label}"?`)) return;
    setBusyId(id);
    const res = await fetch(`/api/catalog?${shopQ.slice(1)}`, {
      method: "DELETE", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    });
    setBusyId(null);
    if (res.ok) { reloadBrand(brand); if (searchRows) triggerSearch(); }
    else setStatus("Fout bij verwijderen.");
  }

  function triggerSearch() {
    if (!search.trim()) return;
    fetch(`/api/catalog?q=${encodeURIComponent(search.trim())}${shopQ}`)
      .then(r => r.json()).then(data => { if (Array.isArray(data)) setSearchRows(data); }).catch(() => {});
  }

  // ── Add repair form ──
  useEffect(() => {
    if (!addBrand) { setAddModels([]); setAddModel(""); setAddExistingColors([]); setAddColors([]); return; }
    fetch(`/api/catalog?models=1&brand=${encodeURIComponent(addBrand)}${shopQ}`)
      .then(r => r.json()).then(data => { if (Array.isArray(data)) setAddModels(data); }).catch(() => {});
    setAddModel(""); setAddExistingColors([]); setAddColors([]);
  }, [addBrand, shopQ]);

  useEffect(() => {
    if (!addBrand || !addModel) { setAddExistingColors([]); return; }
    fetch(`/api/catalog?brand=${encodeURIComponent(addBrand)}&model=${encodeURIComponent(addModel)}${shopQ}`)
      .then(r => r.json()).then(data => {
        if (!Array.isArray(data)) return;
        setAddExistingColors([...new Set(data.map((r: Row) => r.color))].sort());
      }).catch(() => {});
    setAddColors([]);
  }, [addBrand, addModel, shopQ]);

  function resetAddForm() {
    setAddBrand(""); setAddModel(""); setAddModels([]); setAddExistingColors([]);
    setAddColors([]); setAddColorInput(""); setAddRepairs([]);
  }

  const filteredAddModels = addModel.trim() === "" ? addModels
    : addModels.filter(m => m.toLowerCase().includes(addModel.toLowerCase().trim()));

  function toggleAddRepair(rt: string, svc: boolean) {
    setAddRepairs(rs => {
      const ex = rs.find(r => r.repair_type === rt);
      if (ex) return rs.filter(r => r.repair_type !== rt);
      return [...rs, { repair_type: rt, qualities: svc ? ["Standaard"] : [], prices: {} }];
    });
  }
  function toggleAddQuality(rt: string, q: string) {
    setAddRepairs(rs => rs.map(r => {
      if (r.repair_type !== rt) return r;
      const has = r.qualities.includes(q); const p = { ...r.prices }; if (has) delete p[q];
      return { ...r, qualities: has ? r.qualities.filter(x => x !== q) : [...r.qualities, q], prices: p };
    }));
  }
  function setAddRepairPrice(rt: string, q: string, p: string) {
    setAddRepairs(rs => rs.map(r => r.repair_type !== rt ? r : { ...r, prices: { ...r.prices, [q]: p } }));
  }
  function addAddColor() {
    const v = addColorInput.trim(); if (!v || addColors.includes(v)) return;
    setAddColors(cs => [...cs, v]); setAddColorInput("");
  }
  function toggleExistingColor(c: string) {
    setAddColors(cs => cs.includes(c) ? cs.filter(x => x !== c) : [...cs, c]);
  }

  async function submitAddRepairs() {
    const form: DeviceForm = { brand: addBrand, model: addModel, colors: addColors, repairs: addRepairs };
    const err = validateDeviceForm(form);
    if (err) { setStatus(err); return; }
    setAddBusy(true);
    const res = await fetch(`/api/catalog?${shopQ.slice(1)}`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(buildRows(form)),
    });
    setAddBusy(false);
    if (res.ok) {
      setShowAdd(false); resetAddForm();
      if (!brands.includes(addBrand)) setBrands(b => [...b, addBrand].sort());
      reloadBrand(addBrand);
      setOpenBrands(s => new Set(s).add(addBrand));
    } else {
      const j = await res.json().catch(() => ({})); setStatus(j.error || "Fout bij toevoegen.");
    }
  }

  // ── Add device form ──
  function toggleRepair(rt: string, svc: boolean) {
    setDeviceForm(f => {
      const ex = f.repairs.find(r => r.repair_type === rt);
      if (ex) return { ...f, repairs: f.repairs.filter(r => r.repair_type !== rt) };
      return { ...f, repairs: [...f.repairs, { repair_type: rt, qualities: svc ? ["Standaard"] : [], prices: {} }] };
    });
  }
  function toggleQuality(rt: string, q: string) {
    setDeviceForm(f => ({
      ...f, repairs: f.repairs.map(r => {
        if (r.repair_type !== rt) return r;
        const has = r.qualities.includes(q); const p = { ...r.prices }; if (has) delete p[q];
        return { ...r, qualities: has ? r.qualities.filter(x => x !== q) : [...r.qualities, q], prices: p };
      }),
    }));
  }
  function setQualityPrice(rt: string, q: string, p: string) {
    setDeviceForm(f => ({ ...f, repairs: f.repairs.map(r => r.repair_type !== rt ? r : { ...r, prices: { ...r.prices, [q]: p } }) }));
  }
  function addColor() {
    const v = colorInput.trim(); if (!v || deviceForm.colors.includes(v)) return;
    setDeviceForm(f => ({ ...f, colors: [...f.colors, v] })); setColorInput("");
  }

  async function addDevice() {
    const err = validateDeviceForm(deviceForm);
    if (err) { setStatus(err); return; }
    setDeviceBusy(true);
    const res = await fetch(`/api/catalog?${shopQ.slice(1)}`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(buildRows(deviceForm)),
    });
    setDeviceBusy(false);
    if (res.ok) {
      const brand = deviceForm.brand.trim();
      setShowDeviceAdd(false); setDeviceForm(EMPTY_DEVICE_FORM); setColorInput("");
      if (!brands.includes(brand)) setBrands(b => [...b, brand].sort());
      reloadBrand(brand);
      setOpenBrands(s => new Set(s).add(brand));
    } else {
      const j = await res.json().catch(() => ({})); setStatus(j.error || "Fout bij toevoegen.");
    }
  }

  // ── Tree render helper ────────────────────────────────────────────────────

  function renderModels(brandName: string, models: { model: string; rows: Row[] }[]) {
    return models.map(mg => {
      const key = `${brandName}|||${mg.model}`;
      const open = openModels.has(key);
      return (
        <div key={mg.model} className="tree-model">
          <button className="tree-model-row" onClick={() => toggleModel(key)}>
            <span className="tree-chevron tree-chevron-sm">{open ? "▾" : "▸"}</span>
            <span className="tree-model-name">{mg.model}</span>
            <span className="tree-badge tree-badge-sm">{mg.rows.length} reparaties</span>
          </button>
          {open && (
            <div className="tree-table-wrap">
              <RepairTable rows={mg.rows} editId={editId} editPrice={editPrice} busyId={busyId}
                onEditStart={r => { setEditId(r.id); setEditPrice(r.price != null ? String(r.price) : ""); }}
                onPriceChange={setEditPrice}
                onSave={id => savePrice(id, brandName)}
                onCancelEdit={() => setEditId(null)}
                onShowQuality={(id, v) => saveShowQuality(id, v, brandName)}
                onDelete={(id, label) => deleteRow(id, label, brandName)} />
            </div>
          )}
        </div>
      );
    });
  }

  // ── Render ────────────────────────────────────────────────────────────────

  const addForm: DeviceForm = { brand: addBrand, model: addModel, colors: addColors, repairs: addRepairs };
  const addRowCount = buildRows(addForm).length;

  return (
    <DashboardShell>
      <style>{css}</style>
      <div className="cat-wrap">

        {/* Header */}
        <div className="cat-header">
          <div>
            <h1 className="cat-title">Reparatie catalogus</h1>
            <div className="cat-status">{status}</div>
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button className="cbtn cbtn-green" onClick={() => { setShowDeviceAdd(v => !v); if (showAdd) { setShowAdd(false); resetAddForm(); } }}>
              {showDeviceAdd ? "✕ Annuleren" : "+ Apparaat"}
            </button>
            <button className="cbtn cbtn-ghost" style={{ borderColor: "#16a34a", color: "#16a34a" }}
              onClick={() => { setShowAdd(v => !v); if (showDeviceAdd) { setShowDeviceAdd(false); setDeviceForm(EMPTY_DEVICE_FORM); setColorInput(""); } }}>
              {showAdd ? "✕ Annuleren" : "+ Reparatie"}
            </button>
          </div>
        </div>

        {/* Add device form */}
        {showDeviceAdd && (
          <div className="device-form">
            <h3>Nieuw apparaat toevoegen</h3>
            <div className="device-section">
              <div className="device-top-grid">
                <label className="device-field-label">Merk *
                  <input list="brand-suggestions" value={deviceForm.brand}
                    onChange={e => setDeviceForm(f => ({ ...f, brand: e.target.value }))} placeholder="bijv. Apple" />
                  <datalist id="brand-suggestions">{brands.map(b => <option key={b} value={b} />)}</datalist>
                </label>
                <label className="device-field-label">Model *
                  <input value={deviceForm.model} onChange={e => setDeviceForm(f => ({ ...f, model: e.target.value }))} placeholder="bijv. iPad 12 (2026)" />
                </label>
              </div>
            </div>
            <div className="device-section">
              <div className="device-section-title">Kleuren *</div>
              <div className="color-tags">
                {deviceForm.colors.map(c => <span key={c} className="color-tag">{c}<button onClick={() => setDeviceForm(f => ({ ...f, colors: f.colors.filter(x => x !== c) }))}>×</button></span>)}
              </div>
              <div className="color-add-row">
                <input value={colorInput} onChange={e => setColorInput(e.target.value)} placeholder="bijv. Spacegrijs"
                  onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); addColor(); } }} />
                <button className="cbtn cbtn-ghost" onClick={addColor}>+ Kleur</button>
              </div>
            </div>
            <div className="device-section">
              <div className="device-section-title">Reparaties *</div>
              <RepairFormSection repairs={deviceForm.repairs} onToggle={toggleRepair} onToggleQ={toggleQuality} onSetPrice={setQualityPrice} />
            </div>
            {buildRows(deviceForm).length > 0 && <div className="device-preview">{buildRows(deviceForm).length} rijen worden aangemaakt</div>}
            <div className="add-actions">
              <button className="cbtn cbtn-green" disabled={deviceBusy} onClick={addDevice}>{deviceBusy ? "Opslaan…" : `Opslaan (${buildRows(deviceForm).length} rijen)`}</button>
              <button className="cbtn cbtn-ghost" onClick={() => { setShowDeviceAdd(false); setDeviceForm(EMPTY_DEVICE_FORM); setColorInput(""); }}>Annuleren</button>
            </div>
          </div>
        )}

        {/* Add repair form */}
        {showAdd && (
          <div className="add-form">
            <h3>Reparaties toevoegen aan bestaand apparaat</h3>
            <div className="device-section">
              <div className="device-top-grid">
                <label className="device-field-label">Merk *
                  <select className="device-select" value={addBrand} onChange={e => setAddBrand(e.target.value)}>
                    <option value="">— Kies merk —</option>
                    {brands.map(b => <option key={b} value={b}>{b}</option>)}
                  </select>
                </label>
                <label className="device-field-label" style={{ position: "relative" }}>Model *
                  <input value={addModel}
                    onChange={e => { setAddModel(e.target.value); setAddModelOpen(true); }}
                    onFocus={() => setAddModelOpen(true)} onBlur={() => setTimeout(() => setAddModelOpen(false), 150)}
                    placeholder={addBrand ? "Typ om te zoeken…" : "Kies eerst een merk"} disabled={!addBrand} autoComplete="off" />
                  {addModelOpen && addBrand && filteredAddModels.length > 0 && (
                    <div className="model-dropdown">
                      {filteredAddModels.map(m => <div key={m} className="model-option" onMouseDown={() => { setAddModel(m); setAddModelOpen(false); }}>{m}</div>)}
                    </div>
                  )}
                </label>
              </div>
            </div>
            <div className="device-section">
              <div className="device-section-title">Kleuren *</div>
              {addExistingColors.length > 0 && (
                <div style={{ marginBottom: 8 }}>
                  <div style={{ fontSize: 11, color: "#94a3b8", fontWeight: 600, marginBottom: 5 }}>Bestaande kleuren — klik om te selecteren</div>
                  <div className="color-tags">
                    {addExistingColors.map(c => (
                      <span key={c} className="color-tag" onClick={() => toggleExistingColor(c)}
                        style={addColors.includes(c) ? { background: "#dcfce7", borderColor: "#16a34a", color: "#166534", cursor: "pointer" } : { cursor: "pointer" }}>
                        {addColors.includes(c) ? "✓ " : ""}{c}
                      </span>
                    ))}
                  </div>
                </div>
              )}
              <div className="color-tags">
                {addColors.filter(c => !addExistingColors.includes(c)).map(c => (
                  <span key={c} className="color-tag">{c}<button onClick={() => setAddColors(cs => cs.filter(x => x !== c))}>×</button></span>
                ))}
              </div>
              <div className="color-add-row">
                <input value={addColorInput} onChange={e => setAddColorInput(e.target.value)} placeholder="Nieuwe kleur toevoegen…"
                  onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); addAddColor(); } }} />
                <button className="cbtn cbtn-ghost" onClick={addAddColor}>+ Kleur</button>
              </div>
            </div>
            <div className="device-section">
              <div className="device-section-title">Reparaties *</div>
              <RepairFormSection repairs={addRepairs} onToggle={toggleAddRepair} onToggleQ={toggleAddQuality} onSetPrice={setAddRepairPrice} />
            </div>
            {addRowCount > 0 && <div className="device-preview">{addRowCount} rijen worden aangemaakt</div>}
            <div className="add-actions">
              <button className="cbtn cbtn-primary" disabled={addBusy} onClick={submitAddRepairs}>{addBusy ? "Opslaan…" : `Opslaan (${addRowCount} rijen)`}</button>
              <button className="cbtn cbtn-ghost" onClick={() => { setShowAdd(false); resetAddForm(); }}>Annuleren</button>
            </div>
          </div>
        )}

        {/* Search bar */}
        <div className="cat-controls">
          <div style={{ position: "relative", flex: 1, maxWidth: 360 }}>
            <input className="cat-search" placeholder="Zoek op merk, model of reparatie…" value={search}
              onChange={e => setSearch(e.target.value)} style={{ width: "100%", paddingLeft: 36 }} />
            <span style={{ position: "absolute", left: 11, top: "50%", transform: "translateY(-50%)", color: "#94a3b8", fontSize: 15 }}>🔍</span>
            {search && <button onClick={() => setSearch("")} style={{ position: "absolute", right: 10, top: "50%", transform: "translateY(-50%)", background: "none", border: "none", cursor: "pointer", color: "#94a3b8", fontSize: 16 }}>×</button>}
          </div>
          {openBrands.size > 0 && !search && (
            <button className="cbtn cbtn-ghost" onClick={() => { setOpenBrands(new Set()); setOpenModels(new Set()); }}>Alles inklappen</button>
          )}
        </div>

        {/* Tree — search mode */}
        {search ? (
          searchLoading ? (
            <div style={{ textAlign: "center", padding: "40px 0", color: "#94a3b8" }}>Zoeken…</div>
          ) : searchTree && searchTree.length === 0 ? (
            <div style={{ textAlign: "center", padding: "40px 0", color: "#94a3b8" }}>Geen resultaten voor &quot;{search}&quot;.</div>
          ) : (
            <div className="tree">
              {(searchTree || []).map(brand => (
                <div key={brand.brand} className="tree-brand">
                  <div className="tree-brand-row" style={{ cursor: "default" }}>
                    <span className="tree-brand-name">{brand.brand}</span>
                    <span className="tree-badge">{brand.models.length} modellen</span>
                    <span className="tree-badge tree-badge-muted">{brand.models.reduce((s, m) => s + m.rows.length, 0)} reparaties</span>
                  </div>
                  <div className="tree-models">
                    {renderModels(brand.brand, brand.models)}
                  </div>
                </div>
              ))}
            </div>
          )
        ) : (
          /* Tree — browse mode (lazy per brand) */
          <div className="tree">
            {brands.map(brand => {
              const isOpen = openBrands.has(brand);
              const isLoading = loadingBrands.has(brand);
              const rows = brandRows[brand] || [];
              const models = isOpen && !isLoading ? groupByModel(rows) : [];
              const modelCount = isOpen && !isLoading ? models.length : null;
              const repairCount = isOpen && !isLoading ? rows.length : null;

              return (
                <div key={brand} className="tree-brand">
                  <button className="tree-brand-row" onClick={() => toggleBrand(brand)}>
                    <span className="tree-chevron">{isOpen ? "▾" : "▸"}</span>
                    <span className="tree-brand-name">{brand}</span>
                    {isLoading && <span style={{ fontSize: 12, color: "#94a3b8" }}>Laden…</span>}
                    {modelCount !== null && <span className="tree-badge">{modelCount} modellen</span>}
                    {repairCount !== null && <span className="tree-badge tree-badge-muted">{repairCount} reparaties</span>}
                  </button>
                  {isOpen && !isLoading && (
                    <div className="tree-models">
                      {models.length === 0
                        ? <div style={{ padding: "12px 32px", fontSize: 13, color: "#94a3b8" }}>Geen reparaties gevonden.</div>
                        : renderModels(brand, models)}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </DashboardShell>
  );
}

export default function CatalogusPage() {
  return (
    <Suspense fallback={null}>
      <CatalogusPageInner />
    </Suspense>
  );
}

const css = `
.cat-wrap { max-width: 1200px; margin: 0 auto; padding: 24px 16px; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; color: #0f172a; }
.cat-header { display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 12px; margin-bottom: 20px; }
.cat-title { font-size: 22px; font-weight: 800; margin: 0; }
.cat-status { font-size: 13px; color: #64748b; margin-top: 4px; }
.cat-controls { display: flex; gap: 8px; flex-wrap: wrap; align-items: center; margin-bottom: 16px; }
.cat-search { padding: 8px 10px 8px 36px; border: 1px solid #e2e8f0; border-radius: 8px; font-size: 13px; background: #fff; color: #0f172a; }

.cbtn { appearance: none; border: 0; border-radius: 8px; padding: 7px 14px; font-size: 13px; font-weight: 600; cursor: pointer; transition: opacity .15s; }
.cbtn:disabled { opacity: .5; cursor: not-allowed; }
.cbtn-primary { background: #3b82f6; color: #fff; }
.cbtn-ghost { background: transparent; border: 1px solid #e2e8f0; color: #475569; }
.cbtn-danger { background: #fee2e2; color: #b91c1c; border: none; }
.cbtn-green { background: #16a34a; color: #fff; border: none; }

.tree { display: flex; flex-direction: column; gap: 6px; }
.tree-brand { border: 1px solid #e2e8f0; border-radius: 14px; overflow: hidden; background: #fff; box-shadow: 0 1px 4px rgba(0,0,0,.04); }
.tree-brand-row { width: 100%; display: flex; align-items: center; gap: 10px; padding: 14px 16px; background: none; border: none; cursor: pointer; text-align: left; transition: background .12s; }
.tree-brand-row:hover { background: #f8fafc; }
.tree-chevron { font-size: 12px; color: #94a3b8; width: 14px; flex-shrink: 0; }
.tree-chevron-sm { font-size: 11px; }
.tree-brand-name { font-weight: 800; font-size: 15px; color: #0f172a; flex: 1; }
.tree-badge { font-size: 11px; font-weight: 600; background: #eff6ff; color: #1d4ed8; border-radius: 20px; padding: 2px 10px; }
.tree-badge-muted { background: #f1f5f9; color: #64748b; }
.tree-badge-sm { font-size: 11px; font-weight: 600; background: #f0fdf4; color: #15803d; border-radius: 20px; padding: 2px 8px; }
.tree-models { border-top: 1px solid #f1f5f9; }
.tree-model { border-bottom: 1px solid #f1f5f9; }
.tree-model:last-child { border-bottom: none; }
.tree-model-row { width: 100%; display: flex; align-items: center; gap: 8px; padding: 10px 16px 10px 32px; background: #fafbfc; border: none; cursor: pointer; text-align: left; transition: background .12s; }
.tree-model-row:hover { background: #f0f9ff; }
.tree-model-name { font-weight: 600; font-size: 14px; color: #334155; flex: 1; }
.tree-table-wrap { overflow-x: auto; padding-left: 32px; border-top: 1px solid #f1f5f9; background: #fff; }

.add-form { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 12px; padding: 20px; margin-bottom: 20px; }
.add-form h3 { margin: 0 0 14px; font-size: 15px; font-weight: 700; }
.device-form { background: #f0fdf4; border: 1px solid #bbf7d0; border-radius: 12px; padding: 20px; margin-bottom: 20px; }
.device-form h3 { margin: 0 0 14px; font-size: 15px; font-weight: 700; color: #166534; }
.device-section { margin-bottom: 16px; }
.device-section-title { font-size: 12px; font-weight: 700; color: #475569; text-transform: uppercase; letter-spacing: .05em; margin-bottom: 8px; }
.device-top-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
.device-field-label { display: flex; flex-direction: column; gap: 4px; font-size: 12px; font-weight: 600; color: #475569; position: relative; }
.device-field-label input, .device-field-label select, .device-select { padding: 7px 9px; border: 1px solid #e2e8f0; border-radius: 7px; font-size: 13px; background: #fff; color: #0f172a; width: 100%; box-sizing: border-box; }
.device-field-label input:focus, .device-field-label select:focus { outline: none; border-color: #93c5fd; box-shadow: 0 0 0 3px rgba(59,130,246,.12); }
.device-select:disabled { opacity: .5; cursor: not-allowed; }
.color-tags { display: flex; flex-wrap: wrap; gap: 6px; margin-bottom: 8px; }
.color-tag { display: inline-flex; align-items: center; gap: 4px; background: #fff; border: 1px solid #d1d5db; border-radius: 20px; padding: 3px 10px; font-size: 12px; font-weight: 600; color: #374151; }
.color-tag button { background: none; border: none; cursor: pointer; color: #9ca3af; font-size: 14px; line-height: 1; padding: 0 0 0 2px; }
.color-tag button:hover { color: #ef4444; }
.color-add-row { display: flex; gap: 6px; align-items: center; }
.color-add-row input { padding: 6px 9px; border: 1px solid #e2e8f0; border-radius: 7px; font-size: 13px; background: #fff; color: #0f172a; }
.repair-list { display: flex; flex-direction: column; gap: 6px; }
.repair-item { background: #fff; border: 1px solid #e2e8f0; border-radius: 8px; padding: 8px 12px; }
.repair-item-header { display: flex; align-items: center; gap: 8px; font-size: 13px; font-weight: 600; color: #0f172a; cursor: pointer; margin: 0; }
.repair-item-header input[type=checkbox] { width: 15px; height: 15px; cursor: pointer; accent-color: #16a34a; }
.quality-row { display: flex; gap: 10px; margin-top: 8px; padding-left: 23px; flex-wrap: wrap; }
.quality-check-row { display: flex; align-items: center; gap: 6px; }
.quality-check { display: flex; align-items: center; gap: 4px; font-size: 12px; color: #475569; cursor: pointer; }
.quality-check input[type=checkbox] { accent-color: #3b82f6; cursor: pointer; }
.quality-price-input { width: 100px; padding: 3px 7px; border: 1px solid #e2e8f0; border-radius: 5px; font-size: 12px; color: #0f172a; background: #fff; }
.quality-price-input:focus { outline: none; border-color: #93c5fd; box-shadow: 0 0 0 2px rgba(59,130,246,.12); }
.repair-group-label { font-size: 11px; font-weight: 700; color: #94a3b8; text-transform: uppercase; letter-spacing: .06em; margin: 10px 0 4px; padding-left: 2px; }
.device-preview { margin-top: 8px; font-size: 12px; color: #16a34a; font-weight: 600; }
.add-actions { margin-top: 14px; display: flex; gap: 8px; }
.model-dropdown { position: absolute; top: 100%; left: 0; right: 0; background: #fff; border: 1px solid #e2e8f0; border-radius: 8px; box-shadow: 0 4px 16px rgba(0,0,0,.1); max-height: 220px; overflow-y: auto; z-index: 50; margin-top: 2px; }
.model-option { padding: 8px 12px; font-size: 13px; color: #0f172a; cursor: pointer; }
.model-option:hover { background: #f0f9ff; color: #0369a1; }
`;
