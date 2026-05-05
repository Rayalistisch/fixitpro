"use client";
import { createContext, useContext, useEffect, useState, Suspense, useCallback } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import Link from "next/link";
import { createClient } from "@supabase/supabase-js";

export const ShopContext = createContext<{ companyName: string; shop: string }>({ companyName: "", shop: "" });

function buildClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";
  if (!url || !key) return null;
  return createClient(url, key);
}

const navItems = [
  {
    href: "/",
    label: "Aanvragen",
    exact: true,
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="4" width="18" height="18" rx="2" ry="2"/>
        <line x1="16" y1="2" x2="16" y2="6"/>
        <line x1="8" y1="2" x2="8" y2="6"/>
        <line x1="3" y1="10" x2="21" y2="10"/>
      </svg>
    ),
  },
  {
    href: "/planning",
    label: "Planning",
    exact: false,
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="4" width="18" height="18" rx="2" ry="2"/>
        <line x1="16" y1="2" x2="16" y2="6"/>
        <line x1="8" y1="2" x2="8" y2="6"/>
        <line x1="3" y1="10" x2="21" y2="10"/>
        <line x1="8" y1="14" x2="8" y2="14" strokeWidth="3" strokeLinecap="round"/>
        <line x1="12" y1="14" x2="12" y2="14" strokeWidth="3" strokeLinecap="round"/>
        <line x1="16" y1="14" x2="16" y2="14" strokeWidth="3" strokeLinecap="round"/>
      </svg>
    ),
  },
  {
    href: "/catalogus",
    label: "Catalogus",
    exact: false,
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
        <polyline points="14 2 14 8 20 8"/>
        <line x1="16" y1="13" x2="8" y2="13"/>
        <line x1="16" y1="17" x2="8" y2="17"/>
        <polyline points="10 9 9 9 8 9"/>
      </svg>
    ),
  },
  {
    href: "/omzet",
    label: "Omzet",
    exact: false,
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <line x1="18" y1="20" x2="18" y2="10"/>
        <line x1="12" y1="20" x2="12" y2="4"/>
        <line x1="6" y1="20" x2="6" y2="14"/>
      </svg>
    ),
  },
  {
    href: "/instellingen",
    label: "Instellingen",
    exact: false,
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="3"/>
        <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>
      </svg>
    ),
  },
];

const dashStyles = `
.dashWrap {
  display: flex;
  min-height: 100vh;
  min-height: 100dvh;
}

.sidebar {
  width: 240px;
  background: #fff;
  border-right: 1px solid #e2e8f0;
  position: sticky;
  top: 0;
  height: 100vh;
  height: 100dvh;
  flex-shrink: 0;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
}

.dashContent {
  flex: 1;
  min-width: 0;
}

.sidebarBrand {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 20px 16px 16px;
  border-bottom: 1px solid #f1f5f9;
  flex-shrink: 0;
}

.sidebarLogoImg {
  width: 36px;
  height: 36px;
  border-radius: 8px;
  object-fit: cover;
  flex-shrink: 0;
}

.sidebarTitle {
  font-size: 15px;
  font-weight: 700;
  color: #0f172a;
  line-height: 1.2;
}

.sidebarSub {
  font-size: 11px;
  color: #94a3b8;
  font-weight: 500;
}

.sidebarNav {
  padding: 12px 8px;
  flex: 1;
}

.sidebarSection {
  font-size: 10px;
  font-weight: 700;
  color: #94a3b8;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  padding: 8px 10px 4px;
}

.sidebarItem {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 9px 12px;
  border-radius: 10px;
  font-size: 14px;
  font-weight: 500;
  color: #64748b;
  text-decoration: none;
  transition: background 0.12s, color 0.12s;
  margin-bottom: 2px;
}

.sidebarItem:hover {
  background: #f8fafc;
  color: #0f172a;
}

.sidebarItemActive {
  background: #eff6ff;
  color: #2563eb;
  font-weight: 600;
}

.sidebarItemActive svg {
  stroke: #2563eb;
}

.navBadge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 20px;
  height: 20px;
  padding: 0 6px;
  border-radius: 10px;
  background: #EF4444;
  color: #fff;
  font-size: 11px;
  font-weight: 700;
  line-height: 1;
  flex-shrink: 0;
}


.bottomNav {
  display: none;
  position: fixed;
  bottom: 0; left: 0; right: 0;
  height: 56px;
  background: #fff;
  border-top: 1px solid #e2e8f0;
  z-index: 100;
  padding: 0 4px;
  padding-bottom: env(safe-area-inset-bottom);
  box-shadow: 0 -4px 12px rgba(0,0,0,0.06);
}

.bottomNavItem {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 3px;
  text-decoration: none;
  color: #94a3b8;
  font-size: 10px;
  font-weight: 600;
  letter-spacing: 0.02em;
  padding: 6px 0;
  position: relative;
  transition: color 0.12s;
}

.bottomNavItem svg { stroke: currentColor; }

.bottomNavItemActive { color: #2563eb; }

.bottomNavBadge {
  position: absolute;
  top: 4px;
  right: calc(50% - 20px);
  min-width: 16px;
  height: 16px;
  padding: 0 4px;
  border-radius: 8px;
  background: #EF4444;
  color: #fff;
  font-size: 9px;
  font-weight: 700;
  display: flex;
  align-items: center;
  justify-content: center;
}

@media (max-width: 768px) {
  .sidebar { display: none; }
  .dashWrap { display: block; }
  .dashContent { padding-bottom: 68px; }
  .bottomNav { display: flex; }
}
`;

function DashboardShellInner({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const shop = searchParams.get("shop") ?? "";
  const host = searchParams.get("host") ?? "";
  const shopQuery = shop ? `?shop=${shop}${host ? `&host=${host}` : ""}` : "";

  const [pendingCount, setPendingCount] = useState<number | null>(null);
  const [companyName, setCompanyName] = useState("");
  const [billingActive, setBillingActive] = useState<boolean | null>(null);

  useEffect(() => {
    if (!shop) return;
    async function fetchCount() {
      try {
        const res = await fetch(`/api/requests?count=1&status=pending&shop=${shop}`);
        if (res.ok) {
          const data = await res.json();
          setPendingCount(data.count ?? 0);
        }
      } catch { /* stil falen is ok */ }
    }
    fetchCount();
    const t = setInterval(fetchCount, 30000);
    return () => clearInterval(t);
  }, [shop]);

  useEffect(() => {
    if (!shop) return;
    fetch(`/api/settings?shop=${shop}`)
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (d?.company_name) setCompanyName(d.company_name); })
      .catch(() => {});
  }, [shop]);

  useEffect(() => {
    if (!shop) return;
    fetch(`/api/billing/status?shop=${shop}`)
      .then(r => r.json())
      .then(d => {
        if (d?.shop_not_found) {
          // Shop niet in DB — OAuth opnieuw starten
          window.location.href = `/api/auth/shopify?shop=${shop}`;
          return;
        }
        setBillingActive(d?.active ?? true);
      })
      .catch(() => { setBillingActive(true); }); // fail open
  }, [shop]);

  const [billingLoading, setBillingLoading] = useState(false);

  const handleSubscribe = useCallback(async () => {
    setBillingLoading(true);
    try {
      const { redirectToBilling } = await import("@/app/lib/billing-redirect");
      const res = await fetch(`/api/billing/subscribe?shop=${shop}&host=${encodeURIComponent(host)}`);
      const data = await res.json();
      if (data.confirmationUrl) {
        await redirectToBilling(data.confirmationUrl, host);
      }
    } finally {
      setBillingLoading(false);
    }
  }, [shop, host]);

  const displayName = companyName || "Fixora Pro";

  // Paywall: toon als billing definitief niet actief is (null = nog aan het laden)
  if (billingActive === false) {
    return (
      <div style={{
        minHeight: "100vh", background: "#f8fafc",
        display: "flex", alignItems: "center", justifyContent: "center", padding: 16,
      }}>
        <div style={{ maxWidth: 440, width: "100%", textAlign: "center" }}>
          <div style={{
            width: 56, height: 56, borderRadius: 16,
            background: "linear-gradient(135deg, #0c86ad, #0a6d8e)",
            display: "flex", alignItems: "center", justifyContent: "center",
            margin: "0 auto 20px", fontSize: 26,
          }}>🔧</div>
          <h1 style={{ fontSize: 22, fontWeight: 900, color: "#0f172a", margin: "0 0 8px" }}>
            Abonnement vereist
          </h1>
          <p style={{ color: "#64748b", fontSize: 15, margin: "0 0 28px" }}>
            Je proefperiode is verlopen of je abonnement is niet actief.
            Activeer je abonnement om verder te gaan.
          </p>
          <button
            onClick={handleSubscribe}
            disabled={billingLoading}
            style={{
              background: billingLoading ? "#94a3b8" : "#0c86ad",
              color: "#fff", border: "none", borderRadius: 999,
              padding: "14px 32px", fontWeight: 800, fontSize: 16,
              cursor: billingLoading ? "not-allowed" : "pointer",
            }}
          >
            {billingLoading ? "Bezig…" : "Abonnement activeren →"}
          </button>
          <p style={{ marginTop: 12, fontSize: 12, color: "#94a3b8" }}>
            €19/maand — facturatie via Shopify
          </p>
        </div>
      </div>
    );
  }

  return (
    <ShopContext.Provider value={{ companyName: displayName, shop }}>
    <div className="dashWrap">
      <style>{dashStyles}</style>
      <aside className="sidebar">
        <div className="sidebarBrand">
          <div>
            <div className="sidebarTitle">{displayName}</div>
            <div className="sidebarSub">Admin</div>
          </div>
        </div>

        <nav className="sidebarNav">
          <div className="sidebarSection">Menu</div>
          {navItems.map(({ href, label, icon, exact }) => {
            const active = exact ? pathname === href : pathname.startsWith(href);
            const showBadge = href === "/" && pendingCount !== null && pendingCount > 0;
            return (
              <Link
                key={href}
                href={`${href}${shopQuery}`}
                className={`sidebarItem${active ? " sidebarItemActive" : ""}`}
              >
                {icon}
                <span style={{ flex: 1 }}>{label}</span>
                {showBadge && (
                  <span className="navBadge">{pendingCount! > 99 ? "99+" : pendingCount}</span>
                )}
              </Link>
            );
          })}
        </nav>
      </aside>

      <div className="dashContent">
        {children}
      </div>

      {/* Bottom navigation — alleen zichtbaar op mobiel */}
      <nav className="bottomNav">
        {navItems.map(({ href, label, icon, exact }) => {
          const active = exact ? pathname === href : pathname.startsWith(href);
          const showBadge = href === "/" && pendingCount !== null && pendingCount > 0;
          return (
            <Link
              key={href}
              href={`${href}${shopQuery}`}
              className={`bottomNavItem${active ? " bottomNavItemActive" : ""}`}
            >
              {showBadge && (
                <span className="bottomNavBadge">{pendingCount! > 99 ? "99+" : pendingCount}</span>
              )}
              {icon}
              <span>{label}</span>
            </Link>
          );
        })}
      </nav>
    </div>
    </ShopContext.Provider>
  );
}

export default function DashboardShell({ children }: { children: React.ReactNode }) {
  return (
    <Suspense fallback={<div style={{ display: "flex", minHeight: "100vh" }}>{children}</div>}>
      <DashboardShellInner>{children}</DashboardShellInner>
    </Suspense>
  );
}
