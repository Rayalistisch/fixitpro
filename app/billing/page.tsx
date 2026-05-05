"use client";
import { Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";
import { PLAN } from "@/app/lib/billing";
import { redirectToBilling } from "@/app/lib/billing-redirect";

const FEATURES = [
  "Onbeperkt reparatie-aanvragen ontvangen",
  "PDF-offertes met klantgoedkeuring per mail",
  "Eigen e-mailadres als afzender",
  "Prijscatalogus per merk, model en kleur",
  "Planning- en omzetoverzicht",
  "Ingebouwd in je Shopify admin",
];

function BillingContent() {
  const searchParams = useSearchParams();
  const shop = searchParams.get("shop") ?? "";
  const host = searchParams.get("host") ?? "";
  const declined = searchParams.get("declined") === "1";
  const errorParam = searchParams.get("error") ?? "";

  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState(
    declined ? "Je hebt het abonnement niet goedgekeurd. Probeer opnieuw." :
    errorParam ? `Fout: ${decodeURIComponent(errorParam)}` : ""
  );

  async function handleSubscribe() {
    if (!shop) { setErr("Shop niet gevonden. Herinstalleer de app."); return; }
    setLoading(true);
    setErr("");
    try {
      // Haal session token op via App Bridge voor token exchange
      let sessionToken = "";
      try {
        const apiKey = process.env.NEXT_PUBLIC_SHOPIFY_API_KEY ?? "";
        if (apiKey && host) {
          const { default: createApp } = await import("@shopify/app-bridge");
          const { getSessionToken } = await import("@shopify/app-bridge/utilities");
          const app = createApp({ apiKey, host, forceRedirect: false });
          sessionToken = await getSessionToken(app);
        }
      } catch { /* niet in embedded context */ }

      const params = new URLSearchParams({ shop, host });
      if (sessionToken) params.set("session_token", sessionToken);

      const res = await fetch(`/api/billing/subscribe?${params}`);
      const data = await res.json();
      if (!res.ok || !data.confirmationUrl) {
        setErr(data.error || "Billing aanmaken mislukt.");
        return;
      }
      await redirectToBilling(data.confirmationUrl, host);
    } catch (e: any) {
      setErr(e?.message || "Netwerkfout. Probeer opnieuw.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{
      minHeight: "100vh", background: "#f8fafc",
      display: "flex", alignItems: "center", justifyContent: "center",
      padding: 16,
    }}>
      <div style={{ maxWidth: 480, width: "100%" }}>

        <div style={{ textAlign: "center", marginBottom: 32 }}>
          <div style={{
            width: 56, height: 56, borderRadius: 16,
            background: "linear-gradient(135deg, #0c86ad, #0a6d8e)",
            display: "flex", alignItems: "center", justifyContent: "center",
            margin: "0 auto 16px", fontSize: 26,
          }}>🔧</div>
          <h1 style={{ fontSize: 26, fontWeight: 900, color: "#0f172a", margin: "0 0 8px" }}>
            Fixora Pro
          </h1>
          <p style={{ color: "#64748b", fontSize: 15, margin: 0 }}>
            Start vandaag met {PLAN.trialDays} dagen gratis uitproberen.
          </p>
        </div>

        <div style={{
          background: "#fff", borderRadius: 20,
          border: "2px solid #0c86ad", padding: 28, marginBottom: 16,
        }}>
          <div style={{ display: "flex", alignItems: "flex-end", gap: 4, marginBottom: 4 }}>
            <span style={{ fontSize: 40, fontWeight: 900, color: "#0f172a", lineHeight: 1 }}>
              €{PLAN.amount}
            </span>
            <span style={{ fontSize: 15, color: "#64748b", marginBottom: 6 }}>/maand</span>
          </div>
          <p style={{ fontSize: 13, color: "#94a3b8", margin: "0 0 24px" }}>
            Na {PLAN.trialDays} dagen gratis — automatisch via Shopify afgerekend
          </p>

          <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
            {FEATURES.map(f => (
              <li key={f} style={{ display: "flex", alignItems: "flex-start", gap: 10, marginBottom: 12 }}>
                <span style={{ color: "#0c86ad", fontWeight: 800, fontSize: 16, lineHeight: 1.3 }}>✓</span>
                <span style={{ fontSize: 14, color: "#374151" }}>{f}</span>
              </li>
            ))}
          </ul>

          {err && (
            <div style={{
              background: "#fef2f2", border: "1px solid #fecaca",
              borderRadius: 10, padding: "10px 14px", color: "#b91c1c",
              marginTop: 20, marginBottom: 4, fontSize: 14,
            }}>
              {err}
            </div>
          )}

          <button
            onClick={handleSubscribe}
            disabled={loading}
            style={{
              display: "block", width: "100%",
              background: loading ? "#94a3b8" : "#0c86ad",
              color: "#fff", border: "none", borderRadius: 999,
              padding: "15px 0", fontWeight: 800, fontSize: 16,
              cursor: loading ? "not-allowed" : "pointer",
              marginTop: 24,
            }}
          >
            {loading ? "Bezig…" : `${PLAN.trialDays} dagen gratis starten →`}
          </button>

          <p style={{ textAlign: "center", fontSize: 12, color: "#94a3b8", margin: "12px 0 0" }}>
            Geen creditcard vereist voor de proefperiode. Annuleer wanneer je wilt.
          </p>
        </div>

        <p style={{ textAlign: "center", fontSize: 12, color: "#94a3b8" }}>
          Facturatie verloopt via Shopify — veilig en vertrouwd.
        </p>
      </div>
    </div>
  );
}

export default function BillingPage() {
  return (
    <Suspense fallback={
      <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", color: "#64748b" }}>
        Laden…
      </div>
    }>
      <BillingContent />
    </Suspense>
  );
}
