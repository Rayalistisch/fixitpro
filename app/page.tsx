"use client";

import { useContext, useEffect, useMemo, useState } from "react";
import DashboardShell, { ShopContext } from "./components/DashboardShell";

type Row = any;

function fmtNL(d?: string) {
  if (!d) return "";
  try {
    return new Date(d).toLocaleString("nl-NL");
  } catch {
    return d;
  }
}

function cx(...parts: Array<string | false | undefined | null>) {
  return parts.filter(Boolean).join(" ");
}

/** Heuristiek: herken "nieuw" vs "gebruikt" */
function getNewness(row: any): "new" | "used" | "unknown" {
  const hay = [row.condition, row.quality, row.warranty, row.notes, row.issue]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  if (hay.includes("nieuw") || hay.includes("nieuw in doos") || hay.includes("sealed") || hay.includes("ongebruikt") || hay.includes("new"))
    return "new";

  if (hay.includes("gebruikt") || hay.includes("tweedehands") || hay.includes("refurb") || hay.includes("refurbished") || hay.includes("used") || hay.includes("b-grade") || hay.includes("c-grade"))
    return "used";

  return "unknown";
}


type Draft = {
  price_text: string;
  preferred_date: string;
  preferred_time: string;
  notes: string;
  save_to_catalog: boolean;
};

/* SVG icon components */
const IconClock = () => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>
  </svg>
);
const IconCheck = () => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/>
  </svg>
);
const IconX = () => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/>
  </svg>
);
const IconList = () => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/>
    <line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/>
  </svg>
);
const IconSearch = () => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
  </svg>
);

const filterConfig = [
  { key: "pending" as const,            label: "Openstaand",    shortLabel: "Openstaand",    Icon: IconClock },
  { key: "awaiting_approval" as const,  label: "Wacht op klant", shortLabel: "Wacht op klant", Icon: IconClock },
  { key: "approved" as const,           label: "Goedgekeurd",   shortLabel: "Goedgekeurd",   Icon: IconCheck },
  { key: "rejected" as const,           label: "Afgewezen",     shortLabel: "Afgewezen",     Icon: IconX },
  { key: "all" as const,                label: "Alles",         shortLabel: "Alles",         Icon: IconList },
];

const AVATAR_COLORS = ["#3B82F6","#8B5CF6","#EC4899","#F59E0B","#10B981","#EF4444","#6366F1","#0EA5E9"];
function getAvatarColor(name: string) {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = name.charCodeAt(i) + ((h << 5) - h);
  return AVATAR_COLORS[Math.abs(h) % AVATAR_COLORS.length];
}
function getInitials(name: string) {
  const p = name.trim().split(/\s+/).filter(Boolean);
  if (p.length >= 2) return (p[0][0] + p[p.length - 1][0]).toUpperCase();
  return name.slice(0, 2).toUpperCase() || "?";
}

export default function AdminPage() {
  const { companyName } = useContext(ShopContext);
  const [rows, setRows] = useState<Row[]>([]);
  const [filter, setFilter] = useState<"pending" | "awaiting_approval" | "approved" | "rejected" | "all">("pending");
  const [status, setStatus] = useState("Laden…");
  const [query, setQuery] = useState("");
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [mobileSearch, setMobileSearch] = useState(false);

  // edit state
  const [editId, setEditId] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft>({
    price_text: "",
    preferred_date: "",
    preferred_time: "",
    notes: "",
    save_to_catalog: false,
  });

  const visibleRows = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return rows;

    return rows.filter((r) => {
      const hay = [
        r.customer_name,
        r.customer_email,
        r.customer_phone,
        r.brand,
        r.model,
        r.color,
        r.issue,
        r.price_text,
        r.preferred_date,
        r.preferred_time,
        r.status,
        r.condition,
        r.quality,
        r.warranty,
        r.notes,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();

      return hay.includes(q);
    });
  }, [rows, query]);

  async function load(silent = false) {
    if (!silent) setStatus("Aanvragen laden…");

    try {
      const params = filter !== "all" ? `?status=${filter}` : "";
      const res = await fetch(`/api/requests${params}`);
      const data = await res.json();

      if (!res.ok) {
        console.error(data);
        setRows([]);
        setStatus("Fout bij ophalen.");
        return;
      }

      setRows(data || []);
      setStatus(silent ? `Live (${(data || []).length})` : `Aanvragen geladen (${(data || []).length}).`);
    } catch (e) {
      console.error(e);
      setRows([]);
      setStatus("Netwerkfout bij ophalen.");
    }
  }

  async function approve(id: string) {
    if (!confirm("Weet je zeker dat je deze aanvraag wilt goedkeuren?")) return;

    setBusyId(id);
    setStatus("Goedkeuren…");

    try {
      const res = await fetch("/api/approve", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      });

      const j = await res.json().catch(() => ({}));
      if (!res.ok) {
        console.error(j);
        setStatus("Fout bij goedkeuren.");
        setBusyId(null);
        return;
      }

      setStatus("Goedgekeurd.");
      setBusyId(null);
      if (editId === id) cancelEdit();
      load(true);
    } catch (e) {
      console.error(e);
      setStatus("Netwerkfout bij goedkeuren.");
      setBusyId(null);
    }
  }

  async function reject(id: string) {
    const reason = prompt("Waarom afwijzen? (optioneel)\nTip: zet ook een alternatief tijdstip/datum in de reden.");
    if (reason === null) return;
    if (!confirm("Weet je zeker dat je deze aanvraag wilt afwijzen?")) return;

    setBusyId(id);
    setStatus("Afwijzen…");

    try {
      const res = await fetch("/api/reject", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, reason: (reason || "").trim() }),
      });

      const j = await res.json().catch(() => ({}));
      if (!res.ok || !j?.ok) {
        console.error(j);
        setStatus("Fout bij afwijzen.");
        setBusyId(null);
        return;
      }

      setStatus("Afgewezen.");
      setBusyId(null);
      if (editId === id) cancelEdit();
      load(true);
    } catch (e) {
      console.error(e);
      setStatus("Netwerkfout bij afwijzen.");
      setBusyId(null);
    }
  }

  async function sendOffer(id: string) {
    if (!confirm("Offerte versturen ter goedkeuring door de klant?")) return;
    setBusyId(id);
    setStatus("Offerte versturen…");
    try {
      const res = await fetch("/api/offer", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) { setStatus("Fout bij versturen offerte."); setBusyId(null); return; }
      setStatus(j.mail_sent ? "Offerte verstuurd — wacht op klant." : `Mail niet verstuurd: ${j.mail_error || j.stage || "onbekende fout"}`);
      setBusyId(null);
      load(true);
    } catch {
      setStatus("Netwerkfout bij versturen offerte.");
      setBusyId(null);
    }
  }

  function startEdit(r: any) {
    setEditId(r.id);
    setDraft({
      price_text: r.price_text || "",
      preferred_date: r.preferred_date || "",
      preferred_time: r.preferred_time || "",
      notes: r.notes || "",
      save_to_catalog: false,
    });
    setStatus("Bewerken… (pas prijs/datum/tijd/notitie aan en klik Opslaan)");
  }

  function cancelEdit() {
    setEditId(null);
    setDraft({ price_text: "", preferred_date: "", preferred_time: "", notes: "", save_to_catalog: false });
    setStatus("Bewerken geannuleerd.");
  }

  async function saveEdit(id: string) {
    setBusyId(id);
    setStatus("Opslaan…");

    try {
      const res = await fetch("/api/update-request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, patch: draft }),
      });

      const j = await res.json().catch(() => ({}));
      if (!res.ok || !j?.ok) {
        console.error(j);
        setStatus("Fout bij opslaan.");
        setBusyId(null);
        return;
      }

      if (draft.save_to_catalog && draft.price_text) {
        const row = rows.find((r: any) => r.id === id);
        if (row) {
          const priceNum = parseFloat(
            draft.price_text.replace(/[€\s]/g, "").replace(",", ".")
          );
          if (!isNaN(priceNum) && row.brand && row.model) {
            try {
              const catRes = await fetch(
                `/api/catalog?brand=${encodeURIComponent(row.brand)}&model=${encodeURIComponent(row.model)}`
              );
              if (catRes.ok) {
                const catalog: any[] = await catRes.json();
                const match = catalog.find(
                  (c) =>
                    c.color?.toLowerCase() === (row.color || "").toLowerCase() &&
                    c.repair_type?.toLowerCase() === (row.issue || "").toLowerCase()
                );
                if (match) {
                  await fetch("/api/catalog", {
                    method: "PATCH",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ id: match.id, price: priceNum }),
                  });
                  setStatus("Opgeslagen + prijs bijgewerkt in catalogus.");
                } else {
                  setStatus("Opgeslagen. (Geen matching catalogusitem gevonden om prijs bij te werken.)");
                }
              }
            } catch {
              setStatus("Opgeslagen, maar fout bij bijwerken catalogus.");
            }
          } else {
            setStatus("Opgeslagen. (Prijs is geen geldig getal, niet opgeslagen in catalogus.)");
          }
        } else {
          setStatus("Opgeslagen.");
        }
      } else {
        setStatus("Opgeslagen.");
      }

      setBusyId(null);
      setEditId(null);
      setDraft({ price_text: "", preferred_date: "", preferred_time: "", notes: "", save_to_catalog: false });
      load(true);
    } catch (e) {
      console.error(e);
      setStatus("Netwerkfout bij opslaan.");
      setBusyId(null);
    }
  }

  useEffect(() => {
    load(false);

    if (!autoRefresh) return;
    const t = setInterval(() => {
      if (document.visibilityState === "visible") load(true);
    }, 10000);

    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filter, autoRefresh]);

  return (
    <DashboardShell>
      <style>{styles}</style>

      {/* ====== MOBILE HEADER ====== */}
      <header className="mobileHeader">
        <div className="mhLeft">
          <div className="mhLogo" aria-hidden="true">
            <img src="/favicon.ico" alt="" style={{ width: "100%", height: "100%", objectFit: "cover", borderRadius: "8px" }} />
          </div>
          <span className="mhTitle">{companyName || "FixIt Pro"}</span>
        </div>
        <div className="mhRight">
          <span className="mhStatus">
            <span className="statusDot" />
            {rows.length}
          </span>
          <a href="/catalogus" className="mhBtn" aria-label="Catalogus" style={{ textDecoration: "none", fontSize: "18px" }}>📋</a>
          <button className="mhBtn" onClick={() => setMobileSearch(!mobileSearch)} aria-label="Zoeken">
            <IconSearch />
          </button>
          <button className="mhBtn" onClick={() => load(false)} aria-label="Vernieuwen">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/>
            </svg>
          </button>
        </div>
      </header>

      {/* ====== MOBILE SEARCH BAR (toggle) ====== */}
      {mobileSearch && (
        <div className="mobileSearchBar">
          <div className="mobileSearchInner">
            <svg className="searchIcon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
            </svg>
            <input
              className="mobileSearchInput"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Zoek op naam, toestel, mail…"
              autoFocus
            />
            {query ? (
              <button className="clearBtn" onClick={() => setQuery("")} aria-label="Wis">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                </svg>
              </button>
            ) : (
              <button className="clearBtn" onClick={() => setMobileSearch(false)} aria-label="Sluiten">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                </svg>
              </button>
            )}
          </div>
        </div>
      )}

      {/* ====== MOBILE FILTER TABS ====== */}
      <div className="mobileFilterBar">
        {filterConfig.map(({ key, shortLabel }) => (
          <button
            key={key}
            className={cx("mobileFilterTab", filter === key && "mobileFilterTabActive")}
            onClick={() => setFilter(key)}
          >
            {shortLabel}
          </button>
        ))}
      </div>

      {/* ====== DESKTOP HEADER ====== */}
      <header className="topbar">
        <div className="topbarInner">
          <div className="pageTitle">Aanvragen</div>

          <div className="topRight">
            <span className="statusChip" title="Status">
              <span className="statusDot" />
              {status}
            </span>
            <button className="btn btnIcon" onClick={() => load(false)} title="Vernieuwen">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/>
              </svg>
            </button>
          </div>
        </div>

        <div className="controls">
          <nav className="tabs" role="tablist" aria-label="Filters">
            {filterConfig.map(({ key, label }) => (
              <button
                key={key}
                className={cx("tab", filter === key && "tabActive")}
                onClick={() => setFilter(key)}
                role="tab"
                aria-selected={filter === key}
              >
                {label}
              </button>
            ))}
          </nav>

          <div className="rightControls">
            <label className="toggle">
              <input type="checkbox" checked={autoRefresh} onChange={(e) => setAutoRefresh(e.target.checked)} />
              <span className="toggleTrack"><span className="toggleThumb" /></span>
              <span className="toggleLabel">Auto</span>
            </label>

            <div className="searchWrap">
              <svg className="searchIcon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
              </svg>
              <input
                className="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Zoeken…"
              />
              {query ? (
                <button className="clearBtn" onClick={() => setQuery("")} aria-label="Wis zoekterm">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                  </svg>
                </button>
              ) : null}
            </div>
          </div>
        </div>
      </header>

      {/* ====== MAIN CONTENT ====== */}
      <main className="content">
        <div className="metaRow">
          <span className="metaCount">{visibleRows.length}</span>
          <span className="metaLabel">van {rows.length} aanvragen</span>
        </div>

        {/* Table header — desktop only */}
        {visibleRows.length > 0 && (
          <div className="tableHead">
            <div className="thCell thKlant">Klant</div>
            <div className="thCell thApparaat">Apparaat</div>
            <div className="thCell thReparatie">Reparatie</div>
            <div className="thCell thDatum">Datum</div>
            <div className="thCell thPrijs">Prijs</div>
            <div className="thCell thStatus">Status</div>
            <div />
          </div>
        )}

        <section className="list">
          {visibleRows.length === 0 ? (
            <div className="emptyCard">
              <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{opacity: 0.25}}>
                <rect x="3" y="3" width="18" height="18" rx="2" ry="2"/>
                <line x1="3" y1="9" x2="21" y2="9"/>
                <line x1="9" y1="21" x2="9" y2="9"/>
              </svg>
              <span>Geen aanvragen gevonden</span>
            </div>
          ) : (
            visibleRows.map((r: any) => {
              const toestel = [r.brand || "", r.model || ""].filter(Boolean).join(" ").trim();
              const contact = `${r.customer_email || ""}${r.customer_phone ? ` · ${r.customer_phone}` : ""}`;
              const voorkeur = `${r.preferred_date || ""}${r.preferred_time ? ` om ${r.preferred_time}` : ""}`.trim();

              const statusBadge =
                r.status === "approved"
                  ? { cls: "badge badgeOk",      label: "Goedgekeurd" }
                  : r.status === "rejected"
                  ? { cls: "badge badgeBad",     label: "Afgewezen" }
                  : r.status === "awaiting_approval"
                  ? { cls: "badge badgeWaiting", label: "Wacht op klant" }
                  : { cls: "badge badgeWarn",    label: "Openstaand" };

              const qualityBadge = r.quality === "Officieel"
                ? { cls: "badge badgeQualOfficieel", label: "Officieel" }
                : r.quality === "Compatible"
                ? { cls: "badge badgeQualCompatible", label: "Compatible" }
                : null;

              const isEditing = editId === r.id;
              const avatarBg = getAvatarColor(r.customer_name || "");
              const initials = getInitials(r.customer_name || "?");

              return (
                <details key={r.id} className={cx("card", isEditing && "cardEditing")}>
                  <summary className="cardSum">

                    {/* ── Data rij ── */}
                    <div className="rowData">
                      <div className="rowKlant">
                        <div className="rowAvatar" style={{ background: avatarBg }}>{initials}</div>
                        <div className="rowKlantText">
                          <div className="rowName">{r.customer_name || "Aanvraag"}</div>
                          <div className="rowContact">{contact || "–"}</div>
                        </div>
                      </div>

                      <div className="rowCol colApparaat">
                        {toestel ? <div className="rowMain">{toestel}</div> : <span className="rowEmpty">–</span>}
                        {r.color ? <div className="rowSub">{r.color}</div> : null}
                      </div>

                      <div className="rowCol colReparatie">
                        {r.issue ? <div className="rowMain">{r.issue}</div> : <span className="rowEmpty">–</span>}
                        {qualityBadge ? <span className={qualityBadge.cls} style={{marginTop:3}}>{qualityBadge.label}</span> : null}
                      </div>

                      <div className="rowCol colDatum">
                        {r.preferred_date
                          ? <><div className="rowMain">{r.preferred_date}</div>{r.preferred_time ? <div className="rowSub">{r.preferred_time}</div> : null}</>
                          : <span className="rowEmpty">–</span>}
                      </div>

                      <div className="rowCol colPrijs">
                        {r.price_text ? <span className="rowPrice">{r.price_text}</span> : <span className="rowEmpty">–</span>}
                      </div>

                      <div className="rowCol colStatus">
                        <span className={statusBadge.cls}>{statusBadge.label}</span>
                        {isEditing ? <span className="badge badgeEdit" style={{marginTop:3}}>Bewerken</span> : null}
                      </div>

                      <span className="chev" aria-hidden="true">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                          <polyline points="6 9 12 15 18 9"/>
                        </svg>
                      </span>
                    </div>

                    {/* ── Mobiele meta (enkel mobiel) ── */}
                    <div className="mobileMeta">
                      {[toestel, r.color, r.issue].filter(Boolean).join(" · ")}
                      {qualityBadge ? <span className={cx(qualityBadge.cls, "mobileQual")}>{qualityBadge.label}</span> : null}
                      {r.price_text ? <span className="mobilePrijs">{r.price_text}</span> : null}
                      <span className={cx(statusBadge.cls, "mobileStatus")}>{statusBadge.label}</span>
                    </div>

                    {/* ── Actie-balk (onder data) ── */}
                    <div className="rowActBar">
                      {isEditing ? (
                        <>
                          <button className="btn btnGhost btnSm" onClick={(e) => { e.preventDefault(); cancelEdit(); }} disabled={busyId === r.id}>
                            Annuleren
                          </button>
                          <button className="btn btnPrimary btnSm" onClick={(e) => { e.preventDefault(); saveEdit(r.id); }} disabled={busyId === r.id}>
                            {busyId === r.id ? "Bezig…" : "Opslaan"}
                          </button>
                        </>
                      ) : (
                        <>
                          <button
                            className="btn btnGhost btnSm"
                            onClick={(e) => {
                              e.preventDefault();
                              if (editId) cancelEdit();
                              startEdit(r);
                              const det = (e.currentTarget as HTMLElement).closest("details");
                              if (det) det.open = true;
                            }}
                          >
                            Bewerken
                          </button>
                          {(r.status === "pending" || r.status === "awaiting_approval") && (
                            <>
                              <span className="actDivider" />
                              <button className="btn btnDanger btnSm" onClick={(e) => { e.preventDefault(); reject(r.id); }} disabled={busyId === r.id}>
                                {busyId === r.id ? "…" : "Afwijzen"}
                              </button>
                              {r.status === "pending" && (
                                <button className="btn btnSecondary btnSm" onClick={(e) => { e.preventDefault(); sendOffer(r.id); }} disabled={busyId === r.id}>
                                  {busyId === r.id ? "…" : "Stuur Offerte"}
                                </button>
                              )}
                              <button className="btn btnPrimary btnSm" onClick={(e) => { e.preventDefault(); approve(r.id); }} disabled={busyId === r.id}>
                                {busyId === r.id ? "…" : "Goedkeuren"}
                              </button>
                            </>
                          )}
                        </>
                      )}
                    </div>
                  </summary>

                  <div className="cardBody">
                    <div className="detailGrid">
                      <div className="detailItem">
                        <div className="detailLabel">Contact</div>
                        <div className="detailValue">{contact || "-"}</div>
                      </div>

                      <div className="detailItem">
                        <div className="detailLabel">Voorkeursdatum</div>
                        <div className="detailValue mono">{voorkeur || "-"}</div>
                      </div>

                      <div className="detailItem">
                        <div className="detailLabel">Datum aanpassen</div>
                        {isEditing ? (
                          <input className="input" value={draft.preferred_date} onChange={(e) => setDraft((d) => ({ ...d, preferred_date: e.target.value }))} placeholder="YYYY-MM-DD" />
                        ) : (
                          <div className="detailValue mono">{r.preferred_date || "-"}</div>
                        )}
                      </div>

                      <div className="detailItem">
                        <div className="detailLabel">Tijd aanpassen</div>
                        {isEditing ? (
                          <input className="input" value={draft.preferred_time} onChange={(e) => setDraft((d) => ({ ...d, preferred_time: e.target.value }))} placeholder="bijv. 14:30" />
                        ) : (
                          <div className="detailValue mono">{r.preferred_time || "-"}</div>
                        )}
                      </div>

                      <div className="detailItem">
                        <div className="detailLabel">Richtprijs</div>
                        {isEditing ? (
                          <>
                            <input className="input" value={draft.price_text} onChange={(e) => setDraft((d) => ({ ...d, price_text: e.target.value }))} placeholder="Bijv. €79 of Op aanvraag" />
                            <label style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 6, fontSize: 13, color: "#64748B", cursor: "pointer" }}>
                              <input type="checkbox" checked={draft.save_to_catalog} onChange={(e) => setDraft((d) => ({ ...d, save_to_catalog: e.target.checked }))} />
                              Ook opslaan in catalogus (zichtbaar op de site)
                            </label>
                          </>
                        ) : (
                          <div className="detailValue mono">{r.price_text || "-"}</div>
                        )}
                      </div>

                      <div className="detailItem">
                        <div className="detailLabel">Kwaliteit</div>
                        <div className="detailValue">{r.quality || "-"}</div>
                      </div>

                      <div className="detailItem detailFull">
                        <div className="detailLabel">Notities (intern)</div>
                        {isEditing ? (
                          <textarea className="textarea" value={draft.notes} onChange={(e) => setDraft((d) => ({ ...d, notes: e.target.value }))} placeholder="Bijv. alternatief tijdstip: 15:30 / klant gebeld / prijs besproken…" />
                        ) : (
                          <div className="detailValue pre">{r.notes || "-"}</div>
                        )}
                      </div>
                    </div>
                  </div>
                </details>
              );
            })
          )}
        </section>
      </main>

    </DashboardShell>
  );
}

const styles = `
/* ========== RESET & BASE ========== */
*{ box-sizing:border-box; margin:0; padding:0; }
html{
  height:100%;
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
}
body{
  height:100%;
  background: #F8FAFC;
  color: #0F172A;
  font-size: 14px;
  line-height: 1.5;
  overscroll-behavior-y: contain;
}

/* ========== MOBILE HEADER ========== */
.mobileHeader{
  display: none;
  position: sticky;
  top: 0;
  z-index: 50;
  background: rgba(255,255,255,0.88);
  backdrop-filter: blur(20px) saturate(180%);
  -webkit-backdrop-filter: blur(20px) saturate(180%);
  border-bottom: 1px solid rgba(0,0,0,0.06);
  padding: 10px 16px;
  padding-top: calc(10px + env(safe-area-inset-top, 0px));
  align-items: center;
  justify-content: space-between;
}
.mhLeft{ display: flex; align-items: center; gap: 10px; }
.mhLogo{
  width: 32px; height: 32px;
  border-radius: 8px;
  overflow: hidden;
  flex-shrink: 0;
}
.mhTitle{ font-weight: 700; font-size: 17px; letter-spacing: -0.02em; }
.mhRight{ display: flex; align-items: center; gap: 4px; }
.mhStatus{
  display: flex; align-items: center; gap: 5px;
  font-size: 13px; font-weight: 600; color: #64748B;
  padding: 4px 10px;
  background: #F1F5F9;
  border-radius: 20px;
  margin-right: 4px;
}
.mhBtn{
  width: 38px; height: 38px;
  display: flex; align-items: center; justify-content: center;
  border: none; background: transparent;
  border-radius: 10px;
  cursor: pointer;
  color: #3B82F6;
  transition: background 0.15s ease;
  padding: 0;
}
.mhBtn:active{ background: rgba(59,130,246,0.08); }

/* ========== MOBILE SEARCH BAR ========== */
.mobileSearchBar{
  display: none;
  position: sticky;
  top: 52px;
  z-index: 49;
  background: rgba(255,255,255,0.92);
  backdrop-filter: blur(20px);
  -webkit-backdrop-filter: blur(20px);
  padding: 0 16px 10px;
  border-bottom: 1px solid rgba(0,0,0,0.04);
}
.mobileSearchInner{
  position: relative;
  display: flex;
  align-items: center;
}
.mobileSearchInput{
  width: 100%;
  padding: 10px 38px 10px 36px;
  border-radius: 12px;
  border: none;
  background: #F1F5F9;
  font-size: 15px;
  color: #0F172A;
  outline: none;
}
.mobileSearchInput:focus{ background: #EEF2F7; }
.mobileSearchInput::placeholder{ color: #94A3B8; }

/* ========== DESKTOP TOPBAR ========== */
.topbar{
  position: sticky;
  top: 0;
  z-index: 50;
  background: rgba(255,255,255,0.82);
  backdrop-filter: blur(16px) saturate(180%);
  -webkit-backdrop-filter: blur(16px) saturate(180%);
  border-bottom: 1px solid #E2E8F0;
}

.topbarInner{
  max-width: 1200px;
  margin: 0 auto;
  padding: 12px 20px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
}

/* ========== PAGE TITLE ========== */
.pageTitle{
  font-size: 17px;
  font-weight: 700;
  color: #0F172A;
  letter-spacing: -0.02em;
}

/* ========== TOP RIGHT ========== */
.topRight{
  display: flex;
  align-items: center;
  gap: 8px;
}

.statusChip{
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 6px 12px;
  border-radius: 8px;
  font-size: 12px;
  font-weight: 500;
  color: #64748B;
  background: #F1F5F9;
}
.statusDot{
  width: 6px; height: 6px;
  border-radius: 50%;
  background: #22C55E;
  flex-shrink: 0;
}

.btnIcon{
  width: 36px; height: 36px;
  display: flex; align-items: center; justify-content: center;
  border: 1px solid #E2E8F0;
  border-radius: 10px;
  background: #fff;
  cursor: pointer;
  color: #64748B;
  transition: all 0.15s ease;
  padding: 0;
}
.btnIcon:hover{
  background: #F8FAFC;
  color: #0F172A;
  border-color: #CBD5E1;
}

/* ========== CONTROLS ========== */
.controls{
  max-width: 1200px;
  margin: 0 auto;
  padding: 0 20px 12px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  flex-wrap: wrap;
}

/* ========== TABS (desktop) ========== */
.tabs{
  display: flex;
  gap: 2px;
  background: #F1F5F9;
  padding: 3px;
  border-radius: 10px;
}
.tab{
  border: 0;
  background: transparent;
  padding: 7px 14px;
  border-radius: 8px;
  cursor: pointer;
  font-weight: 600;
  font-size: 13px;
  color: #64748B;
  white-space: nowrap;
  transition: all 0.15s ease;
}
.tab:hover{ color: #334155; }
.tabActive{
  background: #fff;
  color: #0F172A;
  box-shadow: 0 1px 3px rgba(0,0,0,0.08), 0 1px 2px rgba(0,0,0,0.04);
}

/* ========== RIGHT CONTROLS ========== */
.rightControls{
  display: flex;
  align-items: center;
  gap: 10px;
  flex: 1;
  justify-content: flex-end;
  min-width: 200px;
}

/* ========== TOGGLE ========== */
.toggle{
  display: flex;
  align-items: center;
  gap: 8px;
  cursor: pointer;
  user-select: none;
}
.toggle input{ position: absolute; opacity: 0; width: 0; height: 0; }
.toggleTrack{
  width: 36px; height: 20px;
  background: #CBD5E1;
  border-radius: 10px;
  position: relative;
  transition: background 0.2s ease;
  flex-shrink: 0;
}
.toggle input:checked + .toggleTrack{ background: #3B82F6; }
.toggleThumb{
  position: absolute;
  top: 2px; left: 2px;
  width: 16px; height: 16px;
  background: #fff;
  border-radius: 50%;
  transition: transform 0.2s ease;
  box-shadow: 0 1px 3px rgba(0,0,0,0.15);
}
.toggle input:checked + .toggleTrack .toggleThumb{ transform: translateX(16px); }
.toggleLabel{
  font-size: 13px;
  font-weight: 500;
  color: #64748B;
  white-space: nowrap;
}

/* ========== SEARCH (desktop) ========== */
.searchWrap{
  position: relative;
  flex: 1;
  min-width: 180px;
  max-width: 320px;
}
.searchIcon{
  position: absolute;
  left: 10px;
  top: 50%;
  transform: translateY(-50%);
  color: #94A3B8;
  pointer-events: none;
}
.search{
  width: 100%;
  padding: 8px 36px 8px 34px;
  border-radius: 10px;
  border: 1px solid #E2E8F0;
  background: #fff;
  color: #0F172A;
  font-size: 13px;
  outline: none;
  transition: all 0.15s ease;
}
.search:focus{
  border-color: #93C5FD;
  box-shadow: 0 0 0 3px rgba(59,130,246,0.12);
}
.search::placeholder{ color: #94A3B8; }
.clearBtn{
  position: absolute;
  right: 6px;
  top: 50%;
  transform: translateY(-50%);
  width: 24px; height: 24px;
  border-radius: 6px;
  border: none;
  background: #F1F5F9;
  cursor: pointer;
  display: flex; align-items: center; justify-content: center;
  color: #64748B;
  transition: all 0.15s ease;
  padding: 0;
}
.clearBtn:hover{ background: #E2E8F0; color: #334155; }

/* ========== CONTENT ========== */
.content{
  max-width: 1400px;
  margin: 0 auto;
  padding: 20px 24px;
}

.metaRow{
  display: flex;
  align-items: baseline;
  gap: 6px;
  margin-bottom: 12px;
}
.metaCount{
  font-size: 22px;
  font-weight: 700;
  color: #0F172A;
  letter-spacing: -0.02em;
  line-height: 1;
}
.metaLabel{
  font-size: 14px;
  color: #94A3B8;
  font-weight: 500;
}

/* ========== SHARED GRID ========== */
.tableHead,
.rowData{
  display: grid;
  grid-template-columns: 20fr 13fr 13fr 10fr 8fr 14fr 20px;
  gap: 10px;
  align-items: center;
}

/* ========== TABLE HEADER ========== */
.tableHead{
  padding: 0 16px 8px;
  border-bottom: 1px solid #f1f5f9;
  margin-bottom: 4px;
}
.thCell{
  font-size: 11px;
  font-weight: 700;
  color: #94A3B8;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  white-space: nowrap;
}

/* ========== LIST ========== */
.list{
  display: flex;
  flex-direction: column;
  gap: 4px;
}

/* ========== CARD ========== */
.card{
  border: 1px solid #E2E8F0;
  background: #fff;
  border-radius: 10px;
  overflow: hidden;
  transition: border-color 0.15s ease, box-shadow 0.15s ease;
}
.card:hover{ border-color: #CBD5E1; box-shadow: 0 1px 4px rgba(0,0,0,0.05); }
.card[open]{ box-shadow: 0 3px 10px rgba(0,0,0,0.07); border-color: #CBD5E1; }

.cardEditing{
  border-color: #A78BFA;
  box-shadow: 0 0 0 3px rgba(139,92,246,0.08);
}

/* ========== CARD SUMMARY ========== */
.cardSum{
  list-style: none;
  cursor: pointer;
  transition: background 0.1s ease;
}
.cardSum:hover{ background: #FAFCFF; }
.cardSum::-webkit-details-marker{ display:none; }

.rowData{
  padding: 12px 16px 6px;
}

.rowActBar{
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 4px 16px 10px 60px;
  border-top: 1px solid #f8fafc;
  justify-content: flex-end;
}

/* ========== ROW CELLS ========== */
.rowKlant{
  display: flex;
  align-items: center;
  gap: 10px;
  min-width: 0;
  overflow: hidden;
}
.rowAvatar{
  width: 34px;
  height: 34px;
  border-radius: 50%;
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #fff;
  font-weight: 700;
  font-size: 12px;
  letter-spacing: 0.02em;
}
.rowKlantText{ min-width: 0; }
.rowName{
  font-weight: 600;
  font-size: 13px;
  color: #0F172A;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.rowContact{
  font-size: 11px;
  color: #94A3B8;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  margin-top: 1px;
}

.rowCol{
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
  overflow: hidden;
}
.rowMain{
  font-size: 13px;
  font-weight: 500;
  color: #334155;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.rowSub{
  font-size: 11px;
  color: #94A3B8;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.rowPrice{
  font-size: 13px;
  font-weight: 700;
  color: #0F172A;
}
.rowEmpty{
  font-size: 13px;
  color: #CBD5E1;
}

.btnSm{
  padding: 5px 12px;
  font-size: 12px;
}
.actDivider{
  width: 1px;
  height: 18px;
  background: #E2E8F0;
  flex-shrink: 0;
}

.chev{
  color: #CBD5E1;
  display: flex;
  align-items: center;
  justify-content: flex-end;
  transition: transform 0.2s ease;
}
details[open] .chev{ transform: rotate(180deg); }

/* Mobiele meta-rij: verborgen op desktop */
.mobileMeta{ display: none; }

/* ========== BADGES ========== */
.badge{
  display: inline-flex;
  align-items: center;
  padding: 2px 8px;
  border-radius: 6px;
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.01em;
  white-space: nowrap;
}
.badgeOk{ background: #F0FDF4; color: #166534; }
.badgeWarn{ background: #FFFBEB; color: #92400E; }
.badgeBad{ background: #FEF2F2; color: #991B1B; }
.badgeNew{ background: #EFF6FF; color: #1E40AF; }
.badgeUsed{ background: #F0F9FF; color: #0C4A6E; }
.badgeEdit{ background: #F5F3FF; color: #5B21B6; }
.badgeQualOfficieel{ background: #EFF6FF; color: #1D4ED8; }
.badgeQualCompatible{ background: #F0FDF4; color: #166534; }
.badgeWaiting{ background: #FFF7ED; color: #92400E; }
.metaTimeRight{ font-size: 12px; color: #94A3B8; white-space: nowrap; text-align: right; }

/* ========== CHIPS ========== */
.chipDone{
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 6px 12px;
  border-radius: 8px;
  font-size: 12px;
  font-weight: 600;
  background: #F0FDF4;
  color: #166534;
}
.chipRejected{
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 6px 12px;
  border-radius: 8px;
  font-size: 12px;
  font-weight: 600;
  background: #FEF2F2;
  color: #991B1B;
}

/* ========== BUTTONS ========== */
.btn{
  display: inline-flex;
  align-items: center;
  gap: 6px;
  border: none;
  padding: 7px 14px;
  border-radius: 8px;
  cursor: pointer;
  font-weight: 600;
  font-size: 13px;
  transition: all 0.15s ease;
  white-space: nowrap;
}
.btn:disabled{ opacity: 0.5; cursor: not-allowed; }
.btn:active{ transform: scale(0.97); }

.btnGhost{
  background: transparent;
  color: #64748B;
  border: 1px solid #E2E8F0;
}
.btnGhost:hover{ background: #F8FAFC; color: #334155; border-color: #CBD5E1; }

.btnPrimary{ background: #3B82F6; color: #fff; }
.btnPrimary:hover{ background: #2563EB; }

.btnDanger{ background: #FEF2F2; color: #DC2626; }
.btnDanger:hover{ background: #FEE2E2; color: #B91C1C; }

.btnSecondary{ background: #F1F5F9; color: #334155; border: 1px solid #E2E8F0; }
.btnSecondary:hover{ background: #E2E8F0; color: #0F172A; }

/* ========== CARD BODY ========== */
.cardBody{
  border-top: 1px solid #F1F5F9;
  padding: 16px;
  background: #FAFBFC;
}
.detailGrid{
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 8px;
}
.detailItem{
  background: #fff;
  border: 1px solid #F1F5F9;
  border-radius: 10px;
  padding: 10px 12px;
}
.detailFull{ grid-column: 1 / -1; }
.detailLabel{
  font-size: 11px;
  font-weight: 600;
  color: #94A3B8;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  margin-bottom: 4px;
}
.detailValue{
  font-size: 13px;
  color: #334155;
  font-weight: 500;
  word-break: break-word;
}
.mono{ font-variant-numeric: tabular-nums; }
.pre{ white-space: pre-wrap; }

/* ========== INPUTS ========== */
.input, .textarea{
  width: 100%;
  border: 1px solid #E2E8F0;
  border-radius: 8px;
  padding: 8px 10px;
  font-size: 13px;
  font-weight: 500;
  color: #0F172A;
  background: #fff;
  outline: none;
  transition: all 0.15s ease;
  font-family: inherit;
}
.textarea{ min-height: 80px; resize: vertical; }
.input:focus, .textarea:focus{
  border-color: #93C5FD;
  box-shadow: 0 0 0 3px rgba(59,130,246,0.12);
}

/* ========== EMPTY STATE ========== */
.emptyCard{
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
  padding: 64px 24px;
  border: 1px dashed #E2E8F0;
  border-radius: 12px;
  color: #94A3B8;
  font-size: 15px;
  font-weight: 500;
}

/* ========== MOBILE FILTER TABS ========== */
.mobileFilterBar{
  display: none;
  overflow-x: auto;
  -webkit-overflow-scrolling: touch;
  scrollbar-width: none;
  gap: 6px;
  padding: 0 12px;
  margin-top: 20px;
  margin-bottom: 20px;
}
.mobileFilterBar::-webkit-scrollbar{ display: none; }
.mobileFilterTab{
  flex-shrink: 0;
  border: 1px solid #E2E8F0;
  background: #F8FAFC;
  color: #64748B;
  padding: 7px 16px;
  border-radius: 13px;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  white-space: nowrap;
  transition: all 0.12s;
  -webkit-tap-highlight-color: transparent;
}
.mobileFilterTabActive{
  background: #2563EB;
  border-color: #2563EB;
  color: #fff;
}

/* ========== RESPONSIVE: tablet ========== */
@media (max-width: 1100px){
  .detailGrid{ grid-template-columns: 1fr; }
  .tableHead,
  .rowData{
    grid-template-columns: 22fr 15fr 15fr 16fr 20px;
  }
  .colDatum, .colPrijs, .thDatum, .thPrijs{ display: none; }
}

/* ========== RESPONSIVE: mobile ========== */
@media (max-width: 720px){
  /* Toon mobiele header, verberg desktop topbar */
  .mobileHeader{ display: flex; }
  .mobileSearchBar{ display: block; }
  .topbar{ display: none; }
  .mobileFilterBar{ display: flex; }

  .content{
    padding: 12px 12px;
    padding-bottom: calc(80px + env(safe-area-inset-bottom, 0px));
  }
  .mobileSearchBar{
    top: calc(52px + env(safe-area-inset-top, 0px));
  }

  .metaCount{ font-size: 20px; }
  .tableHead{ display: none; }
  .card{ border-radius: 12px; }

  /* Data-rij op mobiel: verticaal */
  .rowData{
    display: flex;
    flex-direction: column;
    padding: 12px 14px 4px;
  }
  .rowKlant{ width: 100%; margin-bottom: 6px; }
  .rowCol{ display: none; }
  .chev{ display: none; }

  /* Mobiele meta */
  .mobileMeta{
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 6px;
    font-size: 12px;
    color: #64748B;
    font-weight: 500;
    padding-left: 44px;
    margin-bottom: 6px;
  }
  .mobileQual, .mobileStatus{ margin-left: 2px; }
  .mobilePrijs{ font-weight: 700; color: #0F172A; }

  /* Actie-balk op mobiel */
  .rowActBar{
    padding: 8px 14px 12px;
    flex-wrap: wrap;
    border-top: 1px solid #f1f5f9;
  }
  .actDivider{ display: none; }
  .rowActBar .btn{
    flex: 1;
    justify-content: center;
    padding: 10px 8px;
    border-radius: 10px;
    font-size: 13px;
  }

  .cardBody{ padding: 12px 14px; }
  .input, .textarea{
    font-size: 16px;
    padding: 10px 12px;
    border-radius: 10px;
  }
}
`;
