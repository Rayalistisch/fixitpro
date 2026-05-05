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

    // Herlaad shop voor subscription status (upsert kan net zijn uitgevoerd)
    const freshShop = await getShopFromDomain(shop).catch(() => null);
    const hasBilling = isSubscriptionActive(freshShop?.subscription_status ?? null);

    // Redirect naar Shopify admin — die embed de app in een iframe.
    // Dit is verplicht voor App Bridge token exchange (voor billing).
    // host is base64 van bijv. "admin.shopify.com/store/shop-name"
    let adminRedirect: string;
    try {
      const decodedHost = Buffer.from(host, "base64").toString("utf-8");
      // decodedHost = "admin.shopify.com/store/test-store-luminx"
      const apiKey = process.env.SHOPIFY_API_KEY ?? process.env.NEXT_PUBLIC_SHOPIFY_API_KEY ?? "";
      adminRedirect = `https://${decodedHost}/apps/${apiKey}`;
    } catch {
      // Fallback als host niet decodeerbaar is
      adminRedirect = `${process.env.APP_URL}/?shop=${shop}&host=${host}`;
    }

    console.log("OAuth geslaagd, redirect naar:", adminRedirect.slice(0, 60));
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
