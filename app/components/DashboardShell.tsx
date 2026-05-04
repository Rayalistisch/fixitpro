"use client";
import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import Link from "next/link";
import { createClient } from "@supabase/supabase-js";

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

export default function DashboardShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [pendingCount, setPendingCount] = useState<number | null>(null);

  useEffect(() => {
    const client = buildClient();
    if (!client) return;

    async function fetchCount() {
      const { count } = await client!
        .from("repair_requests")
        .select("id", { count: "exact", head: true })
        .eq("status", "pending");
      setPendingCount(count ?? 0);
    }

    fetchCount();
    const t = setInterval(fetchCount, 30000);
    return () => clearInterval(t);
  }, []);

  return (
    <div className="dashWrap">
      <style>{dashStyles}</style>
      <aside className="sidebar">
        <div className="sidebarBrand">
          <img src="/favicon.ico" alt="GSM Team" className="sidebarLogoImg" />
          <div>
            <div className="sidebarTitle">GSM Team</div>
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
                href={href}
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
              href={href}
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
  );
}
