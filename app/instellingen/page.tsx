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
  mail_mode?: "mailgun" | "smtp";
  smtp_email?: string;
  smtp_password?: string;
  smtp_host?: string;
};

function detectProvider(email: string): string {
  const domain = email.split("@")[1]?.toLowerCase() ?? "";
  if (domain === "gmail.com") return "Gmail";
  if (["outlook.com", "hotmail.com", "live.com", "live.nl"].includes(domain)) return "Outlook / Hotmail";
  if (domain === "yahoo.com") return "Yahoo";
  return "";
}

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

function InstellingenContent() {
  const searchParams = useSearchParams();
  const shop = searchParams.get("shop") ?? "";
  const [tab, setTab] = useState<"bedrijf" | "email" | "installatie">("bedrijf");

  const [settings, setSettings] = useState<Settings>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");

  // E-mail tab state
  const [mailMode, setMailMode] = useState<"mailgun" | "smtp">("mailgun");
  const [smtpEmail, setSmtpEmail] = useState("");
  const [smtpPassword, setSmtpPassword] = useState("");
  const [smtpHost, setSmtpHost] = useState("");
  const [testingSend, setTestingSend] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; msg: string } | null>(null);
  const [mailSaving, setMailSaving] = useState(false);
  const [mailSaved, setMailSaved] = useState(false);
  const [mailError, setMailError] = useState("");

  const load = useCallback(async () => {
    if (!shop) return;
    try {
      const res = await fetch(`/api/settings?shop=${shop}`);
      if (res.ok) {
        const d: Settings = await res.json();
        setSettings(d);
        setMailMode(d.mail_mode === "smtp" ? "smtp" : "mailgun");
        setSmtpEmail(d.smtp_email ?? "");
        setSmtpPassword(d.smtp_password ?? "");
        setSmtpHost(d.smtp_host ?? "");
      }
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

  async function handleSaveEmail() {
    if (mailMode === "smtp" && (!smtpEmail || !smtpPassword)) {
      setMailError("Vul je e-mailadres en app-wachtwoord in.");
      return;
    }
    setMailSaving(true);
    setMailError("");
    setMailSaved(false);
    try {
      const patch: Partial<Settings> = {
        mail_mode: mailMode,
        smtp_email: mailMode === "smtp" ? smtpEmail : undefined,
        smtp_password: mailMode === "smtp" ? smtpPassword : undefined,
        smtp_host: mailMode === "smtp" && smtpHost ? smtpHost : undefined,
      };
      const res = await fetch(`/api/settings?shop=${shop}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });
      if (res.ok) {
        setMailSaved(true);
        setTimeout(() => setMailSaved(false), 3000);
      } else {
        setMailError("Opslaan mislukt.");
      }
    } catch {
      setMailError("Netwerkfout.");
    } finally {
      setMailSaving(false);
    }
  }

  async function handleTestEmail() {
    setTestingSend(true);
    setTestResult(null);
    try {
      // Save first so the test uses the current config
      const patch: Partial<Settings> = {
        mail_mode: mailMode,
        smtp_email: mailMode === "smtp" ? smtpEmail : undefined,
        smtp_password: mailMode === "smtp" ? smtpPassword : undefined,
        smtp_host: mailMode === "smtp" && smtpHost ? smtpHost : undefined,
      };
      await fetch(`/api/settings?shop=${shop}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });

      const res = await fetch(`/api/test-email?shop=${shop}`, { method: "POST" });
      const json = await res.json();
      if (res.ok) {
        setTestResult({ ok: true, msg: `Testmail verstuurd naar ${json.to}` });
      } else {
        setTestResult({ ok: false, msg: json.error || "Versturen mislukt" });
      }
    } catch (e: any) {
      setTestResult({ ok: false, msg: e?.message || "Netwerkfout" });
    } finally {
      setTestingSend(false);
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
          value={(settings[key] as string) ?? ""}
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

  const tabs: { key: "bedrijf" | "email" | "installatie"; label: string }[] = [
    { key: "bedrijf", label: "Bedrijfsgegevens" },
    { key: "email", label: "E-mail" },
    { key: "installatie", label: "Installatie widget" },
  ];

  const provider = smtpEmail ? detectProvider(smtpEmail) : "";

  const optionCard = (
    mode: "mailgun" | "smtp",
    title: string,
    subtitle: string,
    children?: React.ReactNode
  ) => {
    const active = mailMode === mode;
    return (
      <div
        onClick={() => setMailMode(mode)}
        style={{
          background: "#fff",
          border: active ? "2px solid #0c86ad" : "1px solid #e5e7eb",
          borderRadius: 16,
          padding: 20,
          marginBottom: 16,
          cursor: "pointer",
          transition: "border-color .12s",
        }}
      >
        <div style={{ display: "flex", alignItems: "flex-start", gap: 14 }}>
          <div style={{
            width: 20, height: 20, borderRadius: "50%", flexShrink: 0, marginTop: 2,
            border: `2px solid ${active ? "#0c86ad" : "#d1d5db"}`,
            background: active ? "#0c86ad" : "#fff",
            display: "flex", alignItems: "center", justifyContent: "center",
          }}>
            {active && <div style={{ width: 8, height: 8, borderRadius: "50%", background: "#fff" }} />}
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 700, color: "#0f172a", fontSize: 15 }}>{title}</div>
            <div style={{ fontSize: 13, color: "#6b7280", marginTop: 3 }}>{subtitle}</div>
            {active && children && (
              <div
                onClick={e => e.stopPropagation()}
                style={{ marginTop: 20, borderTop: "1px solid #f1f5f9", paddingTop: 20 }}
              >
                {children}
              </div>
            )}
          </div>
        </div>
      </div>
    );
  };

  return (
    <DashboardShell>
      <div style={{ maxWidth: 720, margin: "0 auto", padding: "32px 16px" }}>
        <h1 style={{ fontSize: 24, fontWeight: 800, color: "#111827", marginBottom: 20 }}>Instellingen</h1>

        {/* Tabs */}
        <div style={{ display: "flex", gap: 4, marginBottom: 28, background: "#f1f5f9", borderRadius: 12, padding: 4, width: "fit-content" }}>
          {tabs.map(t => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              style={{
                padding: "8px 20px", borderRadius: 10, border: "none", cursor: "pointer",
                fontWeight: 700, fontSize: 14,
                background: tab === t.key ? "#fff" : "transparent",
                color: tab === t.key ? "#0c86ad" : "#64748b",
                boxShadow: tab === t.key ? "0 1px 4px rgba(0,0,0,.08)" : "none",
                transition: "all .12s",
              }}
            >
              {t.label}
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

        {/* ── TAB: E-mail ── */}
        {tab === "email" && (
          loading ? <p style={{ color: "#6b7280" }}>Laden…</p> : (
            <div>
              {optionCard(
                "mailgun",
                "Via Fixora Pro (standaard)",
                "Geen setup vereist. Klanten ontvangen de mail van Fixora Pro. Antwoorden gaan automatisch naar jouw e-mailadres."
              )}

              {optionCard(
                "smtp",
                "Via eigen e-mailadres",
                "Klanten zien jouw eigen adres als afzender.",
                <>
                  <div style={{ marginBottom: 14 }}>
                    <label style={{ display: "block", fontWeight: 700, marginBottom: 6, color: "#374151", fontSize: 14 }}>
                      E-mailadres
                    </label>
                    <input
                      type="email"
                      value={smtpEmail}
                      onChange={e => { setSmtpEmail(e.target.value); setTestResult(null); }}
                      placeholder="info@jouwbedrijf.nl"
                      style={{ width: "100%", padding: "10px 12px", borderRadius: 10, border: "1px solid #d1d5db", fontSize: 15, outline: "none", boxSizing: "border-box" }}
                    />
                    {provider && (
                      <div style={{ marginTop: 6, fontSize: 12, color: "#0c86ad", fontWeight: 600 }}>
                        {provider} gedetecteerd
                      </div>
                    )}
                  </div>

                  <div style={{ marginBottom: 16 }}>
                    <label style={{ display: "block", fontWeight: 700, marginBottom: 6, color: "#374151", fontSize: 14 }}>
                      {provider === "Gmail" ? "App-wachtwoord" : "Wachtwoord"}
                    </label>
                    <input
                      type="password"
                      value={smtpPassword}
                      onChange={e => { setSmtpPassword(e.target.value); setTestResult(null); }}
                      placeholder="••••••••••••••••"
                      style={{ width: "100%", padding: "10px 12px", borderRadius: 10, border: "1px solid #d1d5db", fontSize: 15, outline: "none", boxSizing: "border-box" }}
                    />
                    <p style={{ fontSize: 12, color: "#9ca3af", margin: "6px 0 0" }}>
                      {provider === "Gmail" &&
                        "Gebruik een app-wachtwoord, niet je inlogwachtwoord. Aanmaken via Google-account → Beveiliging → App-wachtwoorden."}
                      {provider === "Outlook / Hotmail" &&
                        "Gebruik je gewone wachtwoord. Heb je tweestapsverificatie aan? Maak dan een app-wachtwoord aan via je Microsoft-account."}
                      {!provider &&
                        "Vul het wachtwoord van je e-mailaccount in. Bij eigen domeinen (bijv. via Hostnet of TransIP) is dit je normale wachtwoord."}
                    </p>
                  </div>

                  {!provider && (
                    <div style={{ marginBottom: 20 }}>
                      <label style={{ display: "block", fontWeight: 700, marginBottom: 6, color: "#374151", fontSize: 14 }}>
                        SMTP-server <span style={{ fontWeight: 400, color: "#9ca3af" }}>(optioneel)</span>
                      </label>
                      <input
                        type="text"
                        value={smtpHost}
                        onChange={e => { setSmtpHost(e.target.value); setTestResult(null); }}
                        placeholder="bijv. mail.hostnet.nl of smtp.transip.nl"
                        style={{ width: "100%", padding: "10px 12px", borderRadius: 10, border: "1px solid #d1d5db", fontSize: 15, outline: "none", boxSizing: "border-box" }}
                      />
                      <p style={{ fontSize: 12, color: "#9ca3af", margin: "6px 0 0" }}>
                        Laat leeg om automatisch te proberen. Vul in als de testmail mislukt.
                        Je vindt dit in het hostingpaneel van je provider.
                      </p>
                    </div>
                  )}

                  <button
                    onClick={handleTestEmail}
                    disabled={testingSend || !smtpEmail || !smtpPassword}
                    style={{
                      background: testingSend ? "#e2e8f0" : "#f1f5f9",
                      color: "#374151", border: "1px solid #d1d5db",
                      borderRadius: 999, padding: "9px 20px", fontWeight: 700,
                      fontSize: 14, cursor: (testingSend || !smtpEmail || !smtpPassword) ? "not-allowed" : "pointer",
                    }}
                  >
                    {testingSend ? "Versturen…" : "Stuur testmail"}
                  </button>

                  {testResult && (
                    <div style={{
                      marginTop: 10, padding: "8px 12px", borderRadius: 8, fontSize: 13,
                      background: testResult.ok ? "#f0fdf4" : "#fef2f2",
                      border: `1px solid ${testResult.ok ? "#bbf7d0" : "#fecaca"}`,
                      color: testResult.ok ? "#15803d" : "#b91c1c",
                    }}>
                      {testResult.msg}
                    </div>
                  )}
                </>
              )}

              {mailError && (
                <div style={{ background: "#fef2f2", border: "1px solid #fecaca", borderRadius: 10, padding: "10px 14px", color: "#b91c1c", marginBottom: 16, fontSize: 14 }}>
                  {mailError}
                </div>
              )}
              {mailSaved && (
                <div style={{ background: "#f0fdf4", border: "1px solid #bbf7d0", borderRadius: 10, padding: "10px 14px", color: "#15803d", marginBottom: 16, fontSize: 14 }}>
                  E-mailinstellingen opgeslagen.
                </div>
              )}

              <button
                onClick={handleSaveEmail}
                disabled={mailSaving}
                style={{
                  background: "#0c86ad", color: "#fff", border: "none",
                  borderRadius: 999, padding: "12px 28px", fontWeight: 800,
                  fontSize: 15, cursor: mailSaving ? "not-allowed" : "pointer",
                  opacity: mailSaving ? 0.7 : 1,
                }}
              >
                {mailSaving ? "Opslaan…" : "Opslaan"}
              </button>
            </div>
          )
        )}

        {/* ── TAB: Installatie widget ── */}
        {tab === "installatie" && (
          <div>
            <div style={{ background: "#f0fdf4", border: "1px solid #bbf7d0", borderRadius: 16, padding: 20, marginBottom: 28 }}>
              <p style={{ fontWeight: 700, color: "#15803d", marginBottom: 4 }}>De widget staat al klaar — je hoeft niets te installeren.</p>
              <p style={{ color: "#166534", fontSize: 14 }}>
                De app is door de developer geconfigureerd. Jij voegt de widget alleen toe aan je thema.
              </p>
            </div>

            <div style={{ background: "#fff", border: "1px solid #e5e7eb", borderRadius: 16, padding: 24, marginBottom: 20 }}>
              <h2 style={{ fontSize: 16, fontWeight: 700, color: "#111827", marginBottom: 24 }}>Widget toevoegen aan je webshop</h2>
              <Step n={1} title={<>Ga in je Shopify dashboard naar <strong>Online winkel → Thema&apos;s → Aanpassen</strong></>} />
              <Step n={2} title={<>Navigeer naar de pagina waar je de widget wilt plaatsen (bijv. een losse pagina &quot;Reparatie&quot;)</>} />
              <Step n={3} title={<>Klik op <strong>Sectie toevoegen</strong> en zoek naar <strong>&quot;Reparatie Widget&quot;</strong></>} />
              <Step n={4} title={<>Sla op — de widget laadt automatisch jouw prijscatalogus</>} />
            </div>

            <div style={{ background: "#fff", border: "1px solid #e5e7eb", borderRadius: 16, padding: 24 }}>
              <h2 style={{ fontSize: 16, fontWeight: 700, color: "#111827", marginBottom: 12 }}>Prijscatalogus beheren</h2>
              <p style={{ fontSize: 14, color: "#374151", marginBottom: 16 }}>
                De widget toont alleen merken en modellen die in jouw catalogus staan.
                Voeg apparaten en reparatietypes toe via de <strong>Catalogus</strong> pagina in dit admin.
              </p>
              <a
                href={`/catalogus${shop ? `?shop=${shop}` : ""}`}
                style={{
                  display: "inline-flex", alignItems: "center", gap: 8,
                  background: "#0c86ad", color: "#fff", textDecoration: "none",
                  borderRadius: 999, padding: "10px 22px", fontWeight: 700, fontSize: 14,
                }}
              >
                Naar catalogus →
              </a>
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
