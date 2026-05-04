"use client";
import React, { useEffect, useState, useCallback, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import DashboardShell from "@/app/components/DashboardShell";

type Settings = {
  company_name?: string;
  company_tagline?: string;
  address_line1?: string;
  address_line2?: string;
  phone?: string;
  email?: string;
  website?: string;
  kvk?: string;
  btw?: string;
  iban?: string;
  bic?: string;
  logo_url?: string;
  notify_email?: string;
};

function Step({ n, title, done }: { n: number; title: React.ReactNode; done?: boolean }) {
  return (
    <div style={{ display: "flex", alignItems: "flex-start", gap: 14, marginBottom: 24 }}>
      <div style={{
        width: 32, height: 32, borderRadius: "50%", flexShrink: 0,
        background: done ? "#16a34a" : "#0c86ad",
        color: "#fff", display: "flex", alignItems: "center", justifyContent: "center",
        fontWeight: 800, fontSize: 14,
      }}>
        {done ? "✓" : n}
      </div>
      <div>{title}</div>
    </div>
  );
}

function Code({ children }: { children: string }) {
  return (
    <code style={{
      display: "block", background: "#f1f5f9", borderRadius: 10,
      padding: "12px 16px", fontSize: 13, fontFamily: "monospace",
      color: "#0f172a", whiteSpace: "pre-wrap", wordBreak: "break-all",
      border: "1px solid #e2e8f0", marginTop: 8, marginBottom: 16,
    }}>
      {children}
    </code>
  );
}

function InstellingenContent() {
  const searchParams = useSearchParams();
  const shop = searchParams.get("shop") ?? "";
  const [tab, setTab] = useState<"bedrijf" | "installatie">("bedrijf");

  const [settings, setSettings] = useState<Settings>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    if (!shop) return;
    try {
      const res = await fetch(`/api/settings?shop=${shop}`);
      if (res.ok) setSettings(await res.json());
    } finally {
      setLoading(false);
    }
  }, [shop]);

  useEffect(() => { load(); }, [load]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError("");
    setSaved(false);
    try {
      const res = await fetch(`/api/settings?shop=${shop}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(settings),
      });
      if (res.ok) {
        setSaved(true);
        setTimeout(() => setSaved(false), 3000);
      } else {
        setError("Opslaan mislukt. Probeer opnieuw.");
      }
    } catch {
      setError("Netwerkfout. Probeer opnieuw.");
    } finally {
      setSaving(false);
    }
  }

  function field(key: keyof Settings, label: string, placeholder = "", type = "text") {
    return (
      <div style={{ marginBottom: 16 }}>
        <label style={{ display: "block", fontWeight: 700, marginBottom: 6, color: "#374151", fontSize: 14 }}>
          {label}
        </label>
        <input
          type={type}
          value={settings[key] ?? ""}
          onChange={e => setSettings(s => ({ ...s, [key]: e.target.value }))}
          placeholder={placeholder}
          style={{
            width: "100%", padding: "10px 12px", borderRadius: 10,
            border: "1px solid #d1d5db", fontSize: 15, outline: "none",
            boxSizing: "border-box",
          }}
        />
      </div>
    );
  }

  const proxyBase = "https://fixitpro-one.vercel.app/api/proxy";

  return (
    <DashboardShell>
      <div style={{ maxWidth: 720, margin: "0 auto", padding: "32px 16px" }}>
        <h1 style={{ fontSize: 24, fontWeight: 800, color: "#111827", marginBottom: 20 }}>Instellingen</h1>

        {/* Tabs */}
        <div style={{ display: "flex", gap: 4, marginBottom: 28, background: "#f1f5f9", borderRadius: 12, padding: 4, width: "fit-content" }}>
          {(["bedrijf", "installatie"] as const).map(t => (
            <button
              key={t}
              onClick={() => setTab(t)}
              style={{
                padding: "8px 20px", borderRadius: 10, border: "none", cursor: "pointer",
                fontWeight: 700, fontSize: 14,
                background: tab === t ? "#fff" : "transparent",
                color: tab === t ? "#0c86ad" : "#64748b",
                boxShadow: tab === t ? "0 1px 4px rgba(0,0,0,.08)" : "none",
                transition: "all .12s",
              }}
            >
              {t === "bedrijf" ? "Bedrijfsgegevens" : "Installatie widget"}
            </button>
          ))}
        </div>

        {/* ── TAB: Bedrijfsgegevens ── */}
        {tab === "bedrijf" && (
          loading ? (
            <p style={{ color: "#6b7280" }}>Laden…</p>
          ) : (
            <form onSubmit={handleSubmit}>
              <div style={{ background: "#fff", border: "1px solid #e5e7eb", borderRadius: 16, padding: 24, marginBottom: 20 }}>
                <h2 style={{ fontSize: 16, fontWeight: 700, color: "#111827", marginBottom: 20 }}>Bedrijfsgegevens</h2>
                {field("company_name", "Bedrijfsnaam", "GSM Reparatie Enschede")}
                {field("company_tagline", "Tagline", "Full Service Telecom")}
                {field("address_line1", "Straat + huisnummer", "Floresstraat 16A")}
                {field("address_line2", "Postcode + plaats", "7512 ZR Enschede")}
                {field("phone", "Telefoon", "053-4363949")}
                {field("email", "E-mailadres", "info@jouwbedrijf.nl", "email")}
                {field("website", "Website", "www.jouwbedrijf.nl")}
              </div>

              <div style={{ background: "#fff", border: "1px solid #e5e7eb", borderRadius: 16, padding: 24, marginBottom: 20 }}>
                <h2 style={{ fontSize: 16, fontWeight: 700, color: "#111827", marginBottom: 20 }}>Financieel (voor PDF)</h2>
                {field("kvk", "KVK-nummer", "12345678")}
                {field("btw", "BTW-nummer", "NL123456789B01")}
                {field("iban", "IBAN", "NL00 BANK 0000 0000 00")}
                {field("bic", "BIC", "RABONL2U")}
              </div>

              <div style={{ background: "#fff", border: "1px solid #e5e7eb", borderRadius: 16, padding: 24, marginBottom: 24 }}>
                <h2 style={{ fontSize: 16, fontWeight: 700, color: "#111827", marginBottom: 20 }}>Notificaties & logo</h2>
                {field("notify_email", "Interne notificatie e-mail", "info@jouwbedrijf.nl", "email")}
                <p style={{ fontSize: 13, color: "#9ca3af", marginTop: -8, marginBottom: 16 }}>
                  Hier ontvang je een melding bij elke nieuwe aanvraag.
                </p>
                {field("logo_url", "Logo URL", "https://jouwbedrijf.nl/logo.png", "url")}
                <p style={{ fontSize: 13, color: "#9ca3af", marginTop: -8 }}>
                  Directe link naar je logo (wordt gebruikt in PDF en e-mails).
                </p>
              </div>

              {error && (
                <div style={{ background: "#fef2f2", border: "1px solid #fecaca", borderRadius: 10, padding: "10px 14px", color: "#b91c1c", marginBottom: 16, fontSize: 14 }}>
                  {error}
                </div>
              )}
              {saved && (
                <div style={{ background: "#f0fdf4", border: "1px solid #bbf7d0", borderRadius: 10, padding: "10px 14px", color: "#15803d", marginBottom: 16, fontSize: 14 }}>
                  Instellingen opgeslagen.
                </div>
              )}

              <button
                type="submit"
                disabled={saving}
                style={{
                  background: "#0c86ad", color: "#fff", border: "none",
                  borderRadius: 999, padding: "12px 28px", fontWeight: 800,
                  fontSize: 15, cursor: saving ? "not-allowed" : "pointer",
                  opacity: saving ? 0.7 : 1,
                }}
              >
                {saving ? "Opslaan…" : "Opslaan"}
              </button>
            </form>
          )
        )}

        {/* ── TAB: Installatie widget ── */}
        {tab === "installatie" && (
          <div>
            <div style={{ background: "#eff6ff", border: "1px solid #bfdbfe", borderRadius: 16, padding: 20, marginBottom: 24 }}>
              <p style={{ fontWeight: 700, color: "#1d4ed8", marginBottom: 4 }}>De reparatie-widget is een Shopify Theme App Extension.</p>
              <p style={{ color: "#1e40af", fontSize: 14 }}>
                Volg de stappen hieronder om de widget op je webshop te plaatsen.
              </p>
            </div>

            <div style={{ background: "#fff", border: "1px solid #e5e7eb", borderRadius: 16, padding: 24, marginBottom: 20 }}>
              <h2 style={{ fontSize: 16, fontWeight: 700, color: "#111827", marginBottom: 24 }}>Stap 1 — App Proxy instellen</h2>
              <p style={{ fontSize: 14, color: "#374151", marginBottom: 16 }}>
                Ga naar <strong>Shopify Partners Dashboard → FixIt Pro → Configuratie → App proxy</strong> en vul in:
              </p>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
                <tbody>
                  {[
                    ["Prefix", "apps"],
                    ["Subpath", "reparatie"],
                    ["Proxy URL", proxyBase],
                  ].map(([k, v]) => (
                    <tr key={k} style={{ borderBottom: "1px solid #f1f5f9" }}>
                      <td style={{ padding: "10px 0", fontWeight: 700, color: "#374151", width: 120 }}>{k}</td>
                      <td style={{ padding: "10px 0", fontFamily: "monospace", color: "#0c86ad" }}>{v}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div style={{ background: "#fff", border: "1px solid #e5e7eb", borderRadius: 16, padding: 24, marginBottom: 20 }}>
              <h2 style={{ fontSize: 16, fontWeight: 700, color: "#111827", marginBottom: 24 }}>Stap 2 — Widget toevoegen aan je thema</h2>
              <Step n={1} title={<>Ga in je Shopify dashboard naar <strong>Online Store → Themes → Customize</strong></>} />
              <Step n={2} title={<>Klik op <strong>Add section</strong> (of voeg een blok toe aan een bestaande sectie)</>} />
              <Step n={3} title={<>Zoek naar <strong>&quot;Reparatie Widget&quot;</strong> en voeg hem toe</>} />
              <Step n={4} title={<>Sla op en publiceer je thema</>} />
              <div style={{ background: "#f0fdf4", border: "1px solid #bbf7d0", borderRadius: 10, padding: "12px 16px", fontSize: 14, color: "#166534" }}>
                De widget laadt automatisch jouw catalogus via de App Proxy — er zijn geen API-sleutels nodig in het thema.
              </div>
            </div>

            <div style={{ background: "#fff", border: "1px solid #e5e7eb", borderRadius: 16, padding: 24, marginBottom: 20 }}>
              <h2 style={{ fontSize: 16, fontWeight: 700, color: "#111827", marginBottom: 16 }}>Stap 3 — Catalogus importeren</h2>
              <p style={{ fontSize: 14, color: "#374151", marginBottom: 12 }}>
                Heb je een bestaande prijscatalogus als SQL-bestand? Importeer die met dit script:
              </p>
              <Code>{`node scripts/import-catalog.mjs ${shop || "jouw-shop.myshopify.com"}`}</Code>
              <p style={{ fontSize: 13, color: "#6b7280" }}>
                Of voeg handmatig artikelen toe via de <strong>Catalogus</strong> pagina in dit admin.
              </p>
            </div>

            <div style={{ background: "#fff", border: "1px solid #e5e7eb", borderRadius: 16, padding: 24, marginBottom: 20 }}>
              <h2 style={{ fontSize: 16, fontWeight: 700, color: "#111827", marginBottom: 16 }}>Proxy endpoints</h2>
              <p style={{ fontSize: 14, color: "#374151", marginBottom: 12 }}>
                De widget communiceert via deze publieke endpoints (geen auth vereist vanuit de storefront):
              </p>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                <thead>
                  <tr style={{ borderBottom: "2px solid #f1f5f9" }}>
                    <th style={{ textAlign: "left", padding: "8px 0", color: "#6b7280", fontWeight: 700 }}>Endpoint</th>
                    <th style={{ textAlign: "left", padding: "8px 0", color: "#6b7280", fontWeight: 700 }}>Functie</th>
                  </tr>
                </thead>
                <tbody>
                  {[
                    ["/apps/reparatie/catalog?brands=1", "Alle merken"],
                    ["/apps/reparatie/catalog?models=1&brand=Apple", "Modellen per merk"],
                    ["/apps/reparatie/catalog?rpc=get_colors&...", "Kleuren per model"],
                    ["/apps/reparatie/catalog?rpc=get_repair_types&...", "Reparatietypes"],
                    ["/apps/reparatie/catalog?rpc=get_qualities_prices&...", "Kwaliteit + prijs"],
                    ["/apps/reparatie/create-request (POST)", "Aanvraag indienen"],
                  ].map(([ep, fn]) => (
                    <tr key={ep} style={{ borderBottom: "1px solid #f8fafc" }}>
                      <td style={{ padding: "8px 0", fontFamily: "monospace", fontSize: 12, color: "#0c86ad" }}>{ep}</td>
                      <td style={{ padding: "8px 0", color: "#374151" }}>{fn}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div style={{ background: "#fff", border: "1px solid #e5e7eb", borderRadius: 16, padding: 24 }}>
              <h2 style={{ fontSize: 16, fontWeight: 700, color: "#111827", marginBottom: 16 }}>GDPR webhooks (verplicht voor App Store)</h2>
              <p style={{ fontSize: 14, color: "#374151", marginBottom: 12 }}>
                Ga in het Partners Dashboard naar <strong>FixIt Pro → Configuratie → Privacy compliance</strong> en stel in:
              </p>
              {[
                ["Customer data request URL", `https://fixitpro-one.vercel.app/api/webhooks/gdpr`],
                ["Customer redact URL", `https://fixitpro-one.vercel.app/api/webhooks/gdpr`],
                ["Shop redact URL", `https://fixitpro-one.vercel.app/api/webhooks/gdpr`],
              ].map(([label, url]) => (
                <div key={label} style={{ marginBottom: 12 }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: "#374151", marginBottom: 4 }}>{label}</div>
                  <code style={{ fontSize: 12, color: "#0c86ad", fontFamily: "monospace" }}>{url}</code>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </DashboardShell>
  );
}

export default function InstellingenPage() {
  return (
    <Suspense fallback={<div style={{ padding: 32, color: "#64748b" }}>Laden…</div>}>
      <InstellingenContent />
    </Suspense>
  );
}
