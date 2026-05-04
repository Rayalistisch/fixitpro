"use client";
import { useState, Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";

type Settings = {
  company_name: string;
  address_line1: string;
  address_line2: string;
  phone: string;
  email: string;
  notify_email: string;
  logo_url: string;
  kvk: string;
  btw: string;
  iban: string;
  bic: string;
};

const EMPTY: Settings = {
  company_name: "", address_line1: "", address_line2: "",
  phone: "", email: "", notify_email: "",
  logo_url: "", kvk: "", btw: "", iban: "", bic: "",
};

function OnboardingContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const shop = searchParams.get("shop") ?? "";
  const host = searchParams.get("host") ?? "";

  const [step, setStep] = useState(1);
  const [settings, setSettings] = useState<Settings>(EMPTY);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  function set(key: keyof Settings, value: string) {
    setSettings(s => ({ ...s, [key]: value }));
  }

  async function saveAndContinue() {
    if (!settings.company_name.trim()) {
      setError("Vul minimaal een bedrijfsnaam in.");
      return;
    }
    setError("");
    setSaving(true);
    try {
      const res = await fetch(`/api/settings?shop=${shop}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(settings),
      });
      if (!res.ok) throw new Error("Opslaan mislukt");
      setStep(2);
    } catch {
      setError("Opslaan mislukt. Probeer opnieuw.");
    } finally {
      setSaving(false);
    }
  }

  function goToDashboard() {
    router.push(`/?shop=${shop}&host=${host}`);
  }

  const inputStyle: React.CSSProperties = {
    width: "100%", padding: "11px 14px", borderRadius: 12,
    border: "1px solid #d1d5db", fontSize: 15, outline: "none",
    boxSizing: "border-box", background: "#fff",
  };

  const labelStyle: React.CSSProperties = {
    display: "block", fontWeight: 700, marginBottom: 6,
    color: "#374151", fontSize: 14,
  };

  return (
    <div style={{
      minHeight: "100vh", background: "#f8fafc",
      display: "flex", alignItems: "center", justifyContent: "center",
      padding: 16,
    }}>
      <div style={{ maxWidth: 560, width: "100%" }}>

        {/* Header */}
        <div style={{ textAlign: "center", marginBottom: 32 }}>
          <div style={{
            width: 56, height: 56, borderRadius: 16,
            background: "linear-gradient(135deg, #0c86ad, #0a6d8e)",
            display: "flex", alignItems: "center", justifyContent: "center",
            margin: "0 auto 16px", fontSize: 26,
          }}>🔧</div>
          <h1 style={{ fontSize: 26, fontWeight: 900, color: "#0f172a", margin: "0 0 8px" }}>
            Welkom bij Fixora Pro
          </h1>
          <p style={{ color: "#64748b", fontSize: 15, margin: 0 }}>
            Laten we je account in 2 stappen instellen.
          </p>
        </div>

        {/* Stap indicator */}
        <div style={{
          display: "flex", alignItems: "center", justifyContent: "center",
          gap: 8, marginBottom: 28,
        }}>
          {[1, 2].map(n => (
            <div key={n} style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <div style={{
                width: 32, height: 32, borderRadius: "50%",
                background: step >= n ? "#0c86ad" : "#e2e8f0",
                color: step >= n ? "#fff" : "#94a3b8",
                display: "flex", alignItems: "center", justifyContent: "center",
                fontWeight: 800, fontSize: 14, transition: "all .2s",
              }}>{step > n ? "✓" : n}</div>
              <span style={{ fontSize: 13, fontWeight: 700, color: step >= n ? "#0f172a" : "#94a3b8" }}>
                {n === 1 ? "Bedrijfsgegevens" : "Widget installeren"}
              </span>
              {n < 2 && <div style={{ width: 32, height: 2, background: step > n ? "#0c86ad" : "#e2e8f0" }} />}
            </div>
          ))}
        </div>

        {/* Stap 1: Bedrijfsgegevens */}
        {step === 1 && (
          <div style={{ background: "#fff", borderRadius: 20, border: "1px solid #e2e8f0", padding: 28 }}>
            <h2 style={{ fontSize: 18, fontWeight: 800, color: "#0f172a", margin: "0 0 20px" }}>
              Jouw bedrijfsgegevens
            </h2>
            <p style={{ color: "#64748b", fontSize: 14, margin: "0 0 20px" }}>
              Deze gegevens verschijnen op PDF-offertes en in e-mails naar klanten.
            </p>

            <div style={{ marginBottom: 14 }}>
              <label style={labelStyle}>Bedrijfsnaam <span style={{ color: "#ef4444" }}>*</span></label>
              <input style={inputStyle} placeholder="GSM Reparatie Enschede"
                value={settings.company_name} onChange={e => set("company_name", e.target.value)} />
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 14 }}>
              <div>
                <label style={labelStyle}>Telefoon</label>
                <input style={inputStyle} placeholder="053-1234567"
                  value={settings.phone} onChange={e => set("phone", e.target.value)} />
              </div>
              <div>
                <label style={labelStyle}>E-mailadres</label>
                <input style={inputStyle} type="email" placeholder="info@jouwbedrijf.nl"
                  value={settings.email} onChange={e => set("email", e.target.value)} />
              </div>
            </div>

            <div style={{ marginBottom: 14 }}>
              <label style={labelStyle}>Straat + huisnummer</label>
              <input style={inputStyle} placeholder="Voorbeeldstraat 1"
                value={settings.address_line1} onChange={e => set("address_line1", e.target.value)} />
            </div>

            <div style={{ marginBottom: 14 }}>
              <label style={labelStyle}>Postcode + plaats</label>
              <input style={inputStyle} placeholder="1234 AB Amsterdam"
                value={settings.address_line2} onChange={e => set("address_line2", e.target.value)} />
            </div>

            <div style={{ marginBottom: 14 }}>
              <label style={labelStyle}>Notificatie e-mail</label>
              <input style={inputStyle} type="email" placeholder="info@jouwbedrijf.nl"
                value={settings.notify_email} onChange={e => set("notify_email", e.target.value)} />
              <p style={{ fontSize: 12, color: "#94a3b8", margin: "6px 0 0" }}>
                Hier ontvang je een melding bij elke nieuwe reparatie-aanvraag.
              </p>
            </div>

            <hr style={{ border: "none", borderTop: "1px solid #f1f5f9", margin: "20px 0" }} />

            <p style={{ fontSize: 13, fontWeight: 700, color: "#64748b", margin: "0 0 12px" }}>
              Optioneel — voor PDF-footer
            </p>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 14 }}>
              <div>
                <label style={labelStyle}>KVK-nummer</label>
                <input style={inputStyle} placeholder="12345678"
                  value={settings.kvk} onChange={e => set("kvk", e.target.value)} />
              </div>
              <div>
                <label style={labelStyle}>BTW-nummer</label>
                <input style={inputStyle} placeholder="NL123456789B01"
                  value={settings.btw} onChange={e => set("btw", e.target.value)} />
              </div>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 20 }}>
              <div>
                <label style={labelStyle}>IBAN</label>
                <input style={inputStyle} placeholder="NL00 BANK 0000 0000 00"
                  value={settings.iban} onChange={e => set("iban", e.target.value)} />
              </div>
              <div>
                <label style={labelStyle}>BIC</label>
                <input style={inputStyle} placeholder="RABONL2U"
                  value={settings.bic} onChange={e => set("bic", e.target.value)} />
              </div>
            </div>

            {error && (
              <div style={{ background: "#fef2f2", border: "1px solid #fecaca", borderRadius: 10, padding: "10px 14px", color: "#b91c1c", marginBottom: 16, fontSize: 14 }}>
                {error}
              </div>
            )}

            <button onClick={saveAndContinue} disabled={saving} style={{
              width: "100%", background: "#0c86ad", color: "#fff", border: "none",
              borderRadius: 999, padding: "14px 0", fontWeight: 800, fontSize: 16,
              cursor: saving ? "not-allowed" : "pointer", opacity: saving ? 0.7 : 1,
            }}>
              {saving ? "Opslaan…" : "Opslaan en verder →"}
            </button>
          </div>
        )}

        {/* Stap 2: Widget installeren */}
        {step === 2 && (
          <div style={{ background: "#fff", borderRadius: 20, border: "1px solid #e2e8f0", padding: 28 }}>
            <h2 style={{ fontSize: 18, fontWeight: 800, color: "#0f172a", margin: "0 0 8px" }}>
              Widget installeren op je shop
            </h2>
            <p style={{ color: "#64748b", fontSize: 14, margin: "0 0 24px" }}>
              Voeg het reparatieformulier toe aan je Shopify webshop via de Theme Editor.
            </p>

            {[
              { n: 1, title: "Open de Theme Editor", desc: `Ga in Shopify naar Online Store → Themes → Customize.` },
              { n: 2, title: "Voeg een sectie toe", desc: `Klik op "Add section" op de pagina waar je het formulier wilt plaatsen.` },
              { n: 3, title: "Zoek Fixora Pro", desc: `Zoek naar "Fixora Pro Reparatieformulier" en voeg het toe.` },
              { n: 4, title: "Sla op", desc: `Klik op "Save" — het formulier staat nu live op je shop.` },
            ].map(({ n, title, desc }) => (
              <div key={n} style={{ display: "flex", gap: 14, marginBottom: 18 }}>
                <div style={{
                  width: 32, height: 32, borderRadius: "50%", flexShrink: 0,
                  background: "#0c86ad", color: "#fff",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  fontWeight: 800, fontSize: 14,
                }}>{n}</div>
                <div>
                  <div style={{ fontWeight: 700, color: "#0f172a", fontSize: 15 }}>{title}</div>
                  <div style={{ color: "#64748b", fontSize: 14, marginTop: 2 }}>{desc}</div>
                </div>
              </div>
            ))}

            <div style={{ background: "#f0f9ff", border: "1px solid #bae6fd", borderRadius: 12, padding: "12px 16px", marginBottom: 24 }}>
              <p style={{ margin: 0, fontSize: 13, color: "#0369a1", fontWeight: 600 }}>
                De widget haalt automatisch jouw catalogus op en stuurt aanvragen direct naar jouw dashboard.
              </p>
            </div>

            <button onClick={goToDashboard} style={{
              width: "100%", background: "#0c86ad", color: "#fff", border: "none",
              borderRadius: 999, padding: "14px 0", fontWeight: 800, fontSize: 16, cursor: "pointer",
            }}>
              Naar mijn dashboard →
            </button>
          </div>
        )}

        <p style={{ textAlign: "center", marginTop: 16, fontSize: 13, color: "#94a3b8" }}>
          Je kunt instellingen later altijd aanpassen via het dashboard.
        </p>
      </div>
    </div>
  );
}

export default function OnboardingPage() {
  return (
    <Suspense fallback={<div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", color: "#64748b" }}>Laden…</div>}>
      <OnboardingContent />
    </Suspense>
  );
}
