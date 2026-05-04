"use client";

import { useEffect, useMemo, useState, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import DashboardShell from "../components/DashboardShell";

const WEEKDAYS = ["Ma", "Di", "Wo", "Do", "Vr", "Za", "Zo"];

function toKey(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function fmtLongDate(dateStr: string) {
  try {
    return new Date(dateStr + "T00:00:00").toLocaleDateString("nl-NL", {
      weekday: "long", day: "numeric", month: "long", year: "numeric",
    });
  } catch { return dateStr; }
}

type Appointment = {
  id: string;
  customer_name?: string;
  customer_email?: string;
  customer_phone?: string;
  brand?: string;
  model?: string;
  color?: string;
  issue?: string;
  price_text?: string;
  preferred_date?: string;
  preferred_time?: string;
};

function PlanningPageInner() {
  const searchParams = useSearchParams();
  const shop = searchParams.get("shop") ?? "";

  const [rows, setRows] = useState<Appointment[]>([]);
  const [loading, setLoading] = useState(true);
  const [month, setMonth] = useState(() => {
    const d = new Date();
    d.setDate(1);
    d.setHours(0, 0, 0, 0);
    return d;
  });
  const [modal, setModal] = useState<Appointment | null>(null);

  useEffect(() => {
    const q = shop ? `?status=approved&shop=${encodeURIComponent(shop)}` : "?status=approved";
    fetch(`/api/requests${q}`)
      .then((r) => r.json())
      .then((data) => { if (Array.isArray(data)) setRows(data); setLoading(false); })
      .catch(() => setLoading(false));
  }, [shop]);

  const byDate = useMemo(() => {
    const map = new Map<string, Appointment[]>();
    for (const r of rows) {
      if (!r.preferred_date) continue;
      const key = r.preferred_date.slice(0, 10);
      const existing = map.get(key) ?? [];
      map.set(key, [...existing, r]);
    }
    // Sorteer per dag op tijd
    for (const [k, v] of map) {
      map.set(k, v.slice().sort((a, b) =>
        (a.preferred_time ?? "99:99").localeCompare(b.preferred_time ?? "99:99")
      ));
    }
    return map;
  }, [rows]);

  const calendarDays = useMemo(() => {
    const year = month.getFullYear();
    const mo   = month.getMonth();
    const firstDay = new Date(year, mo, 1);
    const lastDay  = new Date(year, mo + 1, 0);
    const startOffset = (firstDay.getDay() + 6) % 7; // Ma=0
    const total = startOffset + lastDay.getDate();
    const cells = Math.ceil(total / 7) * 7;
    const days: (Date | null)[] = [];
    for (let i = 0; i < cells; i++) {
      const dayNum = i - startOffset + 1;
      days.push(dayNum >= 1 && dayNum <= lastDay.getDate() ? new Date(year, mo, dayNum) : null);
    }
    return days;
  }, [month]);

  const todayKey = toKey(new Date());
  const monthLabel = month.toLocaleDateString("nl-NL", { month: "long", year: "numeric" });

  return (
    <DashboardShell>
      <style>{css}</style>

      <header className="plHeader">
        <div className="plTitle">Planning</div>
        {loading && <span className="plStatus">Laden…</span>}
        <div className="plMonthNav" style={{ marginLeft: "auto" }}>
          <button className="plNavBtn" onClick={() => setMonth(m => new Date(m.getFullYear(), m.getMonth() - 1, 1))}>‹</button>
          <span className="plMonthLabel">{monthLabel}</span>
          <button className="plNavBtn" onClick={() => setMonth(m => new Date(m.getFullYear(), m.getMonth() + 1, 1))}>›</button>
        </div>
      </header>

      <main className="plMain">
        <div className="plCalendar">
          {/* Weekdag headers */}
          <div className="plWeekRow">
            {WEEKDAYS.map(d => (
              <div key={d} className="plWeekHeader">{d}</div>
            ))}
          </div>

          {/* Dag-rijen */}
          {Array.from({ length: calendarDays.length / 7 }, (_, wi) => (
            <div key={wi} className="plWeekRow plWeekBodyRow">
              {calendarDays.slice(wi * 7, wi * 7 + 7).map((day, di) => {
                if (!day) return <div key={`e-${wi}-${di}`} className="plDayCell plDayCellOtherMonth" />;
                const key = toKey(day);
                const appts = byDate.get(key) ?? [];
                const isToday = key === todayKey;
                return (
                  <div key={key} className={`plDayCell${isToday ? " plDayCellToday" : ""}`}>
                    <div className={`plDayNum${isToday ? " plDayNumToday" : ""}`}>
                      {day.getDate()}
                    </div>
                    <div className="plEvents">
                      {appts.map(a => (
                        <button
                          key={a.id}
                          className="plEventChip"
                          onClick={() => setModal(a)}
                        >
                          {a.preferred_time && (
                            <span className="plEventTime">{a.preferred_time}</span>
                          )}
                          <span className="plEventName">{a.customer_name || "Klant"}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      </main>

      {/* Modal */}
      {modal && (
        <div className="plOverlay" onClick={() => setModal(null)}>
          <div className="plModal" onClick={e => e.stopPropagation()}>
            <button className="plModalClose" onClick={() => setModal(null)}>×</button>
            <div className="plModalDate">{fmtLongDate(modal.preferred_date ?? "")}</div>
            {modal.preferred_time && (
              <div className="plModalTime">{modal.preferred_time}</div>
            )}
            <div className="plModalName">{modal.customer_name || "Onbekend"}</div>
            <div className="plModalDivider" />
            <div className="plModalRows">
              {modal.brand && <ModalRow label="Merk"      value={modal.brand} />}
              {modal.model && <ModalRow label="Model"     value={modal.model} />}
              {modal.color && <ModalRow label="Kleur"     value={modal.color} />}
              {modal.issue && <ModalRow label="Reparatie" value={modal.issue} />}
              {modal.price_text && <ModalRow label="Prijs" value={modal.price_text} />}
              {modal.customer_phone && (
                <div className="plModalRow">
                  <span className="plModalLabel">Telefoon</span>
                  <a href={`tel:${modal.customer_phone}`} className="plModalPhone">
                    {modal.customer_phone}
                  </a>
                </div>
              )}
              {modal.customer_email && (
                <div className="plModalRow">
                  <span className="plModalLabel">E-mail</span>
                  <a href={`mailto:${modal.customer_email}`} className="plModalPhone">
                    {modal.customer_email}
                  </a>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </DashboardShell>
  );
}

export default function PlanningPage() {
  return (
    <Suspense fallback={null}>
      <PlanningPageInner />
    </Suspense>
  );
}

function ModalRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="plModalRow">
      <span className="plModalLabel">{label}</span>
      <span className="plModalValue">{value}</span>
    </div>
  );
}

const css = `
* { box-sizing: border-box; margin: 0; padding: 0; }

.plHeader {
  position: sticky;
  top: 0;
  z-index: 50;
  background: rgba(255,255,255,0.92);
  backdrop-filter: blur(16px) saturate(180%);
  -webkit-backdrop-filter: blur(16px) saturate(180%);
  border-bottom: 1px solid #E2E8F0;
  padding: 14px 24px;
  display: flex;
  align-items: center;
  gap: 12px;
}

.plTitle { font-size: 17px; font-weight: 700; color: #0F172A; letter-spacing: -0.02em; }
.plStatus { font-size: 13px; color: #94A3B8; }

.plMonthNav { display: flex; align-items: center; gap: 12px; }

.plNavBtn {
  width: 30px; height: 30px;
  border-radius: 8px;
  border: 1px solid #E2E8F0;
  background: #F8FAFC;
  font-size: 18px;
  color: #334155;
  cursor: pointer;
  display: flex; align-items: center; justify-content: center;
  transition: background 0.12s;
}
.plNavBtn:hover { background: #EFF6FF; color: #2563EB; border-color: #BFDBFE; }

.plMonthLabel {
  font-size: 14px; font-weight: 700; color: #0F172A;
  min-width: 160px; text-align: center; text-transform: capitalize;
}

.plMain { padding: 0; }

.plCalendar {
  border-left: 1px solid #E2E8F0;
  border-top: 1px solid #E2E8F0;
}

.plWeekRow {
  display: grid;
  grid-template-columns: repeat(7, 1fr);
}

.plWeekHeader {
  border-right: 1px solid #E2E8F0;
  border-bottom: 1px solid #E2E8F0;
  padding: 10px 0;
  text-align: center;
  font-size: 11px;
  font-weight: 700;
  color: #94A3B8;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  background: #FAFBFC;
}

.plWeekBodyRow { align-items: stretch; }

.plDayCell {
  border-right: 1px solid #E2E8F0;
  border-bottom: 1px solid #E2E8F0;
  min-height: 110px;
  padding: 6px 6px 8px;
  background: #fff;
  vertical-align: top;
}

.plDayCellOtherMonth { background: #FAFBFC; }

.plDayCellToday { background: #FAFEFF; }

.plDayNum {
  font-size: 12px;
  font-weight: 500;
  color: #94A3B8;
  margin-bottom: 4px;
  width: 24px; height: 24px;
  display: flex; align-items: center; justify-content: center;
  border-radius: 50%;
}

.plDayNumToday {
  background: #2563EB;
  color: #fff;
  font-weight: 700;
}

.plEvents {
  display: flex;
  flex-direction: column;
  gap: 3px;
}

.plEventChip {
  display: flex;
  align-items: center;
  gap: 5px;
  background: #DBEAFE;
  border: none;
  border-left: 3px solid #2563EB;
  border-radius: 4px;
  padding: 3px 6px;
  cursor: pointer;
  text-align: left;
  width: 100%;
  overflow: hidden;
  transition: background 0.12s;
}
.plEventChip:hover { background: #BFDBFE; }

.plEventTime {
  font-size: 10px;
  font-weight: 700;
  color: #1D4ED8;
  white-space: nowrap;
  font-variant-numeric: tabular-nums;
  flex-shrink: 0;
}

.plEventName {
  font-size: 11px;
  font-weight: 600;
  color: #1E3A5F;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

/* Modal overlay */
.plOverlay {
  position: fixed;
  inset: 0;
  background: rgba(15,23,42,0.35);
  z-index: 200;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 20px;
}

.plModal {
  background: #fff;
  border-radius: 18px;
  box-shadow: 0 24px 64px rgba(0,0,0,0.18);
  padding: 28px;
  width: 100%;
  max-width: 380px;
  position: relative;
}

.plModalClose {
  position: absolute;
  top: 16px; right: 16px;
  width: 28px; height: 28px;
  border-radius: 50%;
  border: none;
  background: #F1F5F9;
  color: #64748B;
  font-size: 18px;
  cursor: pointer;
  display: flex; align-items: center; justify-content: center;
  line-height: 1;
}
.plModalClose:hover { background: #E2E8F0; }

.plModalDate {
  font-size: 11px;
  font-weight: 700;
  color: #94A3B8;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  margin-bottom: 4px;
  text-transform: capitalize;
}

.plModalTime {
  font-size: 28px;
  font-weight: 800;
  color: #2563EB;
  letter-spacing: -0.04em;
  margin-bottom: 6px;
  font-variant-numeric: tabular-nums;
}

.plModalName {
  font-size: 18px;
  font-weight: 700;
  color: #0F172A;
  margin-bottom: 16px;
}

.plModalDivider {
  height: 1px;
  background: #F1F5F9;
  margin-bottom: 16px;
}

.plModalRows { display: flex; flex-direction: column; gap: 10px; }

.plModalRow { display: flex; gap: 12px; align-items: baseline; }

.plModalLabel {
  font-size: 11px;
  font-weight: 700;
  color: #94A3B8;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  min-width: 72px;
}

.plModalValue {
  font-size: 13px;
  font-weight: 500;
  color: #0F172A;
}

.plModalPhone {
  font-size: 13px;
  font-weight: 600;
  color: #2563EB;
  text-decoration: none;
}
.plModalPhone:hover { text-decoration: underline; }

@media (max-width: 640px) {
  .plDayCell { min-height: 72px; padding: 4px; }
  .plEventTime { display: none; }
  .plDayNum { font-size: 11px; }
}
`;
