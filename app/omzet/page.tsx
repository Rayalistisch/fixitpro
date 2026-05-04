"use client";

import { useEffect, useMemo, useState, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import DashboardShell from "../components/DashboardShell";

function parsePrice(text: string): number | null {
  if (!text) return null;
  const n = parseFloat(text.replace(/[€\s]/g, "").replace(",", "."));
  return isNaN(n) ? null : n;
}

function eur(n: number) {
  return new Intl.NumberFormat("nl-NL", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 0,
  }).format(n);
}

type GroupRow = { label: string; total: number; count: number };

function groupBy(rows: any[], key: string): GroupRow[] {
  const map = new Map<string, GroupRow>();
  for (const r of rows) {
    const price = parsePrice(r.price_text);
    if (price === null) continue;
    const label = (r[key] as string) || "Onbekend";
    const cur = map.get(label) ?? { label, total: 0, count: 0 };
    map.set(label, { label, total: cur.total + price, count: cur.count + 1 });
  }
  return [...map.values()].sort((a, b) => b.total - a.total);
}

function groupByMonth(rows: any[]): GroupRow[] {
  const map = new Map<string, GroupRow & { key: string }>();
  for (const r of rows) {
    const price = parsePrice(r.price_text);
    if (price === null) continue;
    const d = new Date(r.created_at);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    const label = d.toLocaleDateString("nl-NL", { month: "short", year: "numeric" });
    const cur = map.get(key) ?? { key, label, total: 0, count: 0 };
    map.set(key, { ...cur, total: cur.total + price, count: cur.count + 1 });
  }
  return [...map.values()]
    .sort((a, b) => a.key.localeCompare(b.key))
    .slice(-12);
}

const GRADIENTS = {
  blue:   "linear-gradient(90deg, #3B82F6 0%, #93C5FD 100%)",
  purple: "linear-gradient(90deg, #8B5CF6 0%, #C4B5FD 100%)",
  green:  "linear-gradient(90deg, #10B981 0%, #6EE7B7 100%)",
};

const SHADOWS = {
  blue:   "0 2px 8px rgba(59,130,246,0.35)",
  purple: "0 2px 8px rgba(139,92,246,0.35)",
  green:  "0 2px 8px rgba(16,185,129,0.35)",
};

function Bars({
  data, limit = 8, variant = "blue", grandTotal,
}: {
  data: GroupRow[];
  limit?: number;
  variant?: keyof typeof GRADIENTS;
  grandTotal?: number;
}) {
  const items = data.slice(0, limit);
  const max = items[0]?.total || 1;
  const total = grandTotal ?? items.reduce((s, i) => s + i.total, 0);

  if (items.length === 0) return <div className="oEmpty">Geen data beschikbaar</div>;

  return (
    <div className="oBars">
      {items.map((item, i) => {
        const pct = total > 0 ? Math.round((item.total / total) * 100) : 0;
        const fillW = `${(item.total / max) * 100}%`;
        return (
          <div key={item.label} className="oBarRow">
            <span className="oRank">{i + 1}</span>
            <div className="oBarLabel" title={item.label}>{item.label}</div>
            <div className="oBarTrack">
              <div
                className="oBarFill"
                style={{
                  width: fillW,
                  background: GRADIENTS[variant],
                  boxShadow: SHADOWS[variant],
                }}
              />
            </div>
            <div className="oBarMeta">
              <span className="oBarValue">{eur(item.total)}</span>
              <span className="oBarPct">{pct}%</span>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function KpiCard({
  label, value, sub, variant,
}: {
  label: string;
  value: string;
  sub: string;
  variant: "blue" | "purple" | "green";
}) {
  const colors = {
    blue:   { from: "#3B82F6", to: "#2563EB", text: "#1D4ED8" },
    purple: { from: "#8B5CF6", to: "#7C3AED", text: "#6D28D9" },
    green:  { from: "#10B981", to: "#059669", text: "#065F46" },
  }[variant];

  return (
    <div className="oKpi" style={{ "--accent-from": colors.from, "--accent-to": colors.to } as any}>
      <div className="oKpiLabel">{label}</div>
      <div className="oKpiValue" style={{ color: colors.text }}>{value}</div>
      <div className="oKpiSub">{sub}</div>
    </div>
  );
}

function OmzetPageInner() {
  const searchParams = useSearchParams();
  const shop = searchParams.get("shop") ?? "";

  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState("");

  useEffect(() => {
    const q = shop ? `?status=approved&shop=${encodeURIComponent(shop)}` : "?status=approved";
    fetch(`/api/requests${q}`)
      .then((r) => r.json())
      .then((data) => {
        if (!Array.isArray(data)) { setFetchError("Fout bij laden."); setLoading(false); return; }
        setRows(data);
        setLoading(false);
      })
      .catch(() => { setFetchError("Netwerkfout bij laden."); setLoading(false); });
  }, [shop]);

  const withPrice = useMemo(() => rows.filter((r) => parsePrice(r.price_text) !== null), [rows]);
  const totalOmzet = useMemo(() => withPrice.reduce((s, r) => s + (parsePrice(r.price_text) ?? 0), 0), [withPrice]);
  const gemiddeld = withPrice.length ? totalOmzet / withPrice.length : 0;

  const byBrand = useMemo(() => groupBy(withPrice, "brand"), [withPrice]);
  const byIssue = useMemo(() => groupBy(withPrice, "issue"), [withPrice]);
  const byMonth = useMemo(() => groupByMonth(withPrice), [withPrice]);

  return (
    <DashboardShell>
      <style>{css}</style>

      <header className="oHeader">
        <div className="oTitle">Omzet</div>
        {loading && <span className="oStatusText">Laden…</span>}
        {fetchError && <span className="oStatusText" style={{ color: "#EF4444" }}>{fetchError}</span>}
      </header>

      <main className="oMain">
        <div className="oKpiGrid">
          <KpiCard
            label="Totale omzet"
            value={loading ? "–" : eur(totalOmzet)}
            sub={`${withPrice.length} reparaties met prijs`}
            variant="blue"
          />
          <KpiCard
            label="Afgeronde reparaties"
            value={loading ? "–" : String(rows.length)}
            sub={`${rows.length - withPrice.length} zonder prijs`}
            variant="purple"
          />
          <KpiCard
            label="Gemiddelde prijs"
            value={loading ? "–" : withPrice.length ? eur(gemiddeld) : "–"}
            sub="per reparatie"
            variant="green"
          />
        </div>

        <div className="oCard">
          <div className="oCardTitle oCardTitleBlue">Omzet per maand</div>
          <Bars data={byMonth} limit={12} variant="blue" grandTotal={totalOmzet} />
        </div>

        <div className="oTwoCol">
          <div className="oCard">
            <div className="oCardTitle oCardTitlePurple">Per merk</div>
            <Bars data={byBrand} variant="purple" grandTotal={totalOmzet} />
          </div>
          <div className="oCard">
            <div className="oCardTitle oCardTitleGreen">Per reparatietype</div>
            <Bars data={byIssue} variant="green" grandTotal={totalOmzet} />
          </div>
        </div>
      </main>
    </DashboardShell>
  );
}

export default function OmzetPage() {
  return (
    <Suspense fallback={null}>
      <OmzetPageInner />
    </Suspense>
  );
}

const css = `
* { box-sizing: border-box; margin: 0; padding: 0; }
body { background: #F8FAFC; }

.oHeader {
  position: sticky;
  top: 0;
  z-index: 50;
  background: rgba(255,255,255,0.82);
  backdrop-filter: blur(16px) saturate(180%);
  -webkit-backdrop-filter: blur(16px) saturate(180%);
  border-bottom: 1px solid #E2E8F0;
  padding: 16px 24px;
  display: flex;
  align-items: center;
  gap: 12px;
}

.oTitle {
  font-size: 17px;
  font-weight: 700;
  color: #0F172A;
  letter-spacing: -0.02em;
}

.oStatusText { font-size: 13px; color: #94A3B8; }

.oMain {
  max-width: 1100px;
  margin: 0 auto;
  padding: 28px 24px;
  display: flex;
  flex-direction: column;
  gap: 20px;
}

/* ── KPI grid ── */
.oKpiGrid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 16px;
}

.oKpi {
  background: #fff;
  border: 1px solid #E2E8F0;
  border-radius: 16px;
  padding: 22px 24px 20px;
  position: relative;
  overflow: hidden;
  box-shadow: 0 1px 4px rgba(0,0,0,0.04);
  transition: box-shadow 0.2s ease, transform 0.2s ease;
}

.oKpi:hover {
  box-shadow: 0 4px 16px rgba(0,0,0,0.08);
  transform: translateY(-1px);
}

.oKpi::before {
  content: '';
  position: absolute;
  top: 0; left: 0; right: 0;
  height: 3px;
  background: linear-gradient(90deg, var(--accent-from), var(--accent-to));
}

.oKpiLabel {
  font-size: 11px;
  font-weight: 700;
  color: #94A3B8;
  text-transform: uppercase;
  letter-spacing: 0.07em;
  margin-bottom: 12px;
}

.oKpiValue {
  font-size: 32px;
  font-weight: 800;
  letter-spacing: -0.04em;
  line-height: 1;
  margin-bottom: 6px;
}

.oKpiSub {
  font-size: 12px;
  color: #94A3B8;
  font-weight: 500;
}

/* ── Cards ── */
.oCard {
  background: #fff;
  border: 1px solid #E2E8F0;
  border-radius: 16px;
  padding: 22px 24px;
  box-shadow: 0 1px 4px rgba(0,0,0,0.04);
}

.oCardTitle {
  font-size: 13px;
  font-weight: 700;
  color: #0F172A;
  letter-spacing: -0.01em;
  margin-bottom: 18px;
  padding-left: 10px;
  border-left: 3px solid transparent;
}

.oCardTitleBlue   { border-color: #3B82F6; }
.oCardTitlePurple { border-color: #8B5CF6; }
.oCardTitleGreen  { border-color: #10B981; }

.oTwoCol {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 20px;
}

/* ── Bars ── */
.oBars {
  display: flex;
  flex-direction: column;
  gap: 11px;
}

.oBarRow {
  display: grid;
  grid-template-columns: 24px 140px 1fr 160px;
  align-items: center;
  gap: 12px;
}

.oRank {
  font-size: 11px;
  font-weight: 700;
  color: #CBD5E1;
  text-align: right;
  font-variant-numeric: tabular-nums;
}

.oBarLabel {
  font-size: 13px;
  font-weight: 500;
  color: #334155;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.oBarTrack {
  height: 10px;
  background: #F1F5F9;
  border-radius: 6px;
  overflow: hidden;
}

.oBarFill {
  height: 100%;
  border-radius: 6px;
  transition: width 0.6s cubic-bezier(0.4, 0, 0.2, 1);
}

.oBarMeta {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 8px;
}

.oBarValue {
  font-size: 13px;
  font-weight: 700;
  color: #0F172A;
  font-variant-numeric: tabular-nums;
}

.oBarPct {
  font-size: 11px;
  font-weight: 600;
  color: #94A3B8;
  min-width: 32px;
  text-align: right;
  font-variant-numeric: tabular-nums;
}

.oEmpty {
  font-size: 13px;
  color: #94A3B8;
  padding: 24px 0;
  text-align: center;
}

@media (max-width: 900px) {
  .oTwoCol { grid-template-columns: 1fr; }
}

@media (max-width: 640px) {
  .oKpiGrid { grid-template-columns: 1fr; }
  .oMain { padding: 16px; }
  .oBarRow { grid-template-columns: 20px 80px 1fr 110px; gap: 8px; }
  .oKpiValue { font-size: 26px; }
}
`;
