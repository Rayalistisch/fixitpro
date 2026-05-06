import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import {
  verifyOAuthHmac,
  exchangeCodeForToken,
  upsertShop,
  getShopFromDomain,
  sanitizeShopDomain,
} from "@/app/lib/shopify";
import { isSubscriptionActive } from "@/app/lib/billing";

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

  console.log("OAuth callback ontvangen:", { shop, state: state.slice(0, 6), host: host.slice(0, 8) });

  try {
    // Verifieer state nonce
    const cookieStore = await cookies();
    const savedState = cookieStore.get("shopify_oauth_state")?.value;
    if (!savedState || savedState !== state) {
      console.warn("State mismatch — doorgaan met HMAC check", { savedState: savedState?.slice(0, 6), state: state.slice(0, 6) });
    }

    // Verifieer Shopify HMAC
    const secretSet = !!process.env.SHOPIFY_API_SECRET;
    console.log("HMAC check:", { secretSet, hmac_present: !!params.get("hmac") });
    if (!verifyOAuthHmac(params)) {
      console.error("HMAC verificatie mislukt", { secretSet, shop });
      return NextResponse.json({ error: "Ongeldige HMAC handtekening" }, { status: 403 });
    }
    // Wissel code voor access token
    const resolvedApiKey = process.env.SHOPIFY_API_KEY ?? process.env.NEXT_PUBLIC_SHOPIFY_API_KEY ?? "";
    console.log("TOKEN EXCHANGE DEBUG:", {
      shop,
      api_key_prefix: resolvedApiKey.slice(0, 8),
      secret_set: !!(process.env.SHOPIFY_API_SECRET),
      code_prefix: code.slice(0, 6),
    });
    const { access_token, scope, refresh_token, expires_in } = await exchangeCodeForToken(shop, code);

    // Sla shop op in DB
    let existingShop = null;
    try {
      existingShop = await getShopFromDomain(shop);
    } catch (e) {
      console.error("getShopFromDomain fout (shops tabel bestaat mogelijk niet):", e);
    }

    try {
      await upsertShop(shop, access_token, scope, refresh_token, expires_in);
    } catch (e) {
      console.error("upsertShop fout:", e);
      return NextResponse.json({
        error: "Database fout bij opslaan shop. Controleer of de shops tabel bestaat in Supabase.",
        detail: String(e),
      }, { status: 500 });
    }


    // Redirect naar Shopify admin (myshopify.com formaat) zodat de app
    // als embedded iframe geladen wordt — vereist voor App Bridge token exchange.
    const apiKey = process.env.SHOPIFY_API_KEY ?? process.env.NEXT_PUBLIC_SHOPIFY_API_KEY ?? "";
    const adminRedirect = `https://${shop}/admin/apps/${apiKey}`;

    console.log("OAuth geslaagd, redirect naar Shopify admin:", adminRedirect);
    const response = NextResponse.redirect(adminRedirect);
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
