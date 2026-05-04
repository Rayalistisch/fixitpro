import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

// Routes die altijd publiek zijn (geen auth check)
const PUBLIC_PATHS = [
  "/api/create-request",   // Shopify widget (tijdelijk, vervangen door proxy in Fase 2)
  "/api/catalog",          // Shopify widget (tijdelijk, vervangen door proxy in Fase 2)
  "/api/offer-confirm",    // Klant accepteert/wijst af
  "/api/auth/shopify",     // OAuth start
  "/api/auth/callback",    // OAuth callback
  "/api/auth/pin",         // Tijdelijk: PIN auth (backwards compat)
  "/api/proxy",            // App Proxy (verificatie gebeurt inside de handler)
  "/api/webhooks",         // Webhooks (verificatie happens inside)
  "/offer-confirm",        // Publieke klantpagina
  "/login",                // PIN login (tijdelijk)
];

function isPublic(pathname: string): boolean {
  return PUBLIC_PATHS.some((p) => pathname.startsWith(p));
}

export async function middleware(req: NextRequest) {
  // CORS preflight altijd doorlaten
  if (req.method === "OPTIONS") return NextResponse.next();

  const pathname = req.nextUrl.pathname;

  // Publieke routes: altijd doorlaten
  if (isPublic(pathname)) return NextResponse.next();

  // ── Multi-tenant modus (SHOPIFY_API_SECRET aanwezig) ──────────────────────
  if (process.env.SHOPIFY_API_SECRET) {
    const shopDomain =
      req.nextUrl.searchParams.get("shop") ??
      req.headers.get("x-shop-domain") ??
      "";

    if (!shopDomain) {
      // Geen shop param → toon installatiepagina of redirect naar login
      if (pathname.startsWith("/api/")) {
        return NextResponse.json(
          { error: "shop param ontbreekt" },
          { status: 401 }
        );
      }
      return NextResponse.next();
    }

    // Controleer of shop geïnstalleerd is in DB
    // Gebruik service role key — dit is server-side middleware
    try {
      const sb = createClient(
        process.env.SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!
      );
      const { data } = await sb
        .from("shops")
        .select("id")
        .eq("shop_domain", shopDomain)
        .is("uninstalled_at", null)
        .maybeSingle();

      if (!data) {
        // Shop niet gevonden → start OAuth flow
        const authUrl = new URL("/api/auth/shopify", req.url);
        authUrl.searchParams.set("shop", shopDomain);
        return NextResponse.redirect(authUrl);
      }
    } catch {
      // DB fout: laat door om geen downtime te veroorzaken
      return NextResponse.next();
    }

    return NextResponse.next();
  }

  // ── Legacy PIN modus (ADMIN_PIN aanwezig, SHOPIFY_API_SECRET niet) ─────────
  if (process.env.ADMIN_PIN) {
    const cookie = req.cookies.get("gsm_pin_auth")?.value;
    if (cookie === process.env.AUTH_SECRET) return NextResponse.next();

    const login = new URL("/login", req.url);
    login.searchParams.set("from", pathname);
    return NextResponse.redirect(login);
  }

  // Geen auth geconfigureerd: doorlaten
  return NextResponse.next();
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
