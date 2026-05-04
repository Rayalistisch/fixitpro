import { NextResponse } from "next/server";
import { buildAuthUrl, sanitizeShopDomain } from "@/app/lib/shopify";
import { randomBytes } from "crypto";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const rawShop = url.searchParams.get("shop") ?? "";
  const shop = sanitizeShopDomain(rawShop);

  if (!shop) {
    return NextResponse.json(
      { error: "Ongeldig shop domein" },
      { status: 400 }
    );
  }

  const state = randomBytes(16).toString("hex");
  const authUrl = buildAuthUrl(shop, state);

  // Tijdelijk: toon de gegenereerde URL zodat we kunnen debuggen
  if (url.searchParams.get("debug") === "1") {
    return NextResponse.json({ authUrl, APP_URL: process.env.APP_URL, API_KEY: process.env.NEXT_PUBLIC_SHOPIFY_API_KEY });
  }

  const response = NextResponse.redirect(authUrl);
  response.cookies.set("shopify_oauth_state", state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 60 * 10, // 10 minuten
    path: "/",
  });

  return response;
}
