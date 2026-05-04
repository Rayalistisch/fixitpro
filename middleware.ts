import { NextRequest, NextResponse } from "next/server";

// Routes die altijd publiek zijn
const PUBLIC_PATHS = [
  "/api/create-request",
  "/api/catalog",
  "/api/offer-confirm",
  "/api/auth/shopify",
  "/api/auth/callback",
  "/api/auth/pin",
  "/api/proxy",
  "/api/webhooks",
  "/offer-confirm",
  "/login",
];

function isPublic(pathname: string): boolean {
  return PUBLIC_PATHS.some((p) => pathname.startsWith(p));
}

export function middleware(req: NextRequest) {
  if (req.method === "OPTIONS") return NextResponse.next();

  const pathname = req.nextUrl.pathname;
  if (isPublic(pathname)) return NextResponse.next();

  // Multi-tenant modus: shop param aanwezig → doorlaten
  // Validatie van de shop gebeurt in de route handlers zelf
  if (process.env.SHOPIFY_API_SECRET) {
    const shopDomain = req.nextUrl.searchParams.get("shop");
    if (!shopDomain && pathname.startsWith("/api/")) {
      return NextResponse.json({ error: "shop param ontbreekt" }, { status: 401 });
    }
    return NextResponse.next();
  }

  // Legacy PIN modus
  if (process.env.ADMIN_PIN) {
    const cookie = req.cookies.get("gsm_pin_auth")?.value;
    if (cookie === process.env.AUTH_SECRET) return NextResponse.next();
    const login = new URL("/login", req.url);
    login.searchParams.set("from", pathname);
    return NextResponse.redirect(login);
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
