"use client";
import { useEffect, useState, useCallback, Suspense } from "react";
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

function InstellingenContent() {
  const searchParams = useSearchParams();
  const shop = searchParams.get("shop") ?? "";

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

  return (
    <DashboardShell>
      <div style={{ maxWidth: 640, margin: "0 auto", padding: "32px 16px" }}>
        <h1 style={{ fontSize: 24, fontWeight: 800, color: "#111827", marginBottom: 8 }}>Instellingen</h1>
        <p style={{ color: "#6b7280", marginBottom: 32, fontSize: 15 }}>
          Bedrijfsgegevens voor PDF offertes en e-mails.
        </p>

        {loading ? (
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
              <h2 style={{ fontSize: 16, fontWeight: 700, color: "#111827", marginBottom: 20 }}>Notificaties</h2>
              {field("notify_email", "Interne notificatie e-mail", "info@jouwbedrijf.nl", "email")}
              <p style={{ fontSize: 13, color: "#9ca3af", marginTop: -8 }}>
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
