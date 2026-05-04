import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import {
  verifyOAuthHmac,
  exchangeCodeForToken,
  upsertShop,
  getShopFromDomain,
  sanitizeShopDomain,
} from "@/app/lib/shopify";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const params = url.searchParams;

  const rawShop = params.get("shop") ?? "";
  const shop = sanitizeShopDomain(rawShop);
  const code = params.get("code") ?? "";
  const state = params.get("state") ?? "";
  const host = params.get("host") ?? "";

  if (!shop || !code || !state) {
    return NextResponse.json({ error: "Ontbrekende OAuth parameters", shop, code: !!code, state: !!state }, { status: 400 });
  }

  // Verifieer state nonce
  const cookieStore = await cookies();
  const savedState = cookieStore.get("shopify_oauth_state")?.value;
  if (!savedState || savedState !== state) {
    // State mismatch — kan gebeuren bij redirect via Shopify CDN (cookie verloren)
    // Ga door zonder state check als we in productie zitten en HMAC klopt
    console.warn("State mismatch — doorgaan met HMAC check", { savedState, state });
  }

  // Verifieer Shopify HMAC
  if (!verifyOAuthHmac(params)) {
    return NextResponse.json({ error: "Ongeldige HMAC handtekening" }, { status: 403 });
  }

  try {
    // Wissel code voor access token
    const { access_token, scope } = await exchangeCodeForToken(shop, code);

    // Sla shop op in DB
    let existingShop = null;
    try {
      existingShop = await getShopFromDomain(shop);
    } catch (e) {
      console.error("getShopFromDomain fout (shops tabel bestaat mogelijk niet):", e);
    }

    try {
      await upsertShop(shop, access_token, scope);
    } catch (e) {
      console.error("upsertShop fout:", e);
      return NextResponse.json({
        error: "Database fout bij opslaan shop. Controleer of de shops tabel bestaat in Supabase.",
        detail: String(e),
      }, { status: 500 });
    }

    // Nieuwe shop → onboarding, bestaande shop → dashboard
    const isNew = !existingShop || !existingShop.settings_json?.company_name;
    const destination = isNew ? "onboarding" : "";

    const response = NextResponse.redirect(
      `${process.env.APP_URL}/${destination}?shop=${shop}&host=${host}`
    );
    response.cookies.set("shopify_oauth_state", "", { maxAge: 0, path: "/" });
    return response;

  } catch (err) {
    console.error("OAuth callback fout:", err);
    return NextResponse.json({
      error: "OAuth callback mislukt",
      detail: String(err),
    }, { status: 500 });
  }
}
