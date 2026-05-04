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

  if (!shop || !code || !state) {
    return NextResponse.json(
      { error: "Ontbrekende OAuth parameters" },
      { status: 400 }
    );
  }

  // Verifieer state nonce
  const cookieStore = await cookies();
  const savedState = cookieStore.get("shopify_oauth_state")?.value;
  if (!savedState || savedState !== state) {
    return NextResponse.json(
      { error: "Ongeldige OAuth state" },
      { status: 403 }
    );
  }

  // Verifieer Shopify HMAC
  if (!verifyOAuthHmac(params)) {
    return NextResponse.json(
      { error: "Ongeldige HMAC handtekening" },
      { status: 403 }
    );
  }

  // Wissel code voor access token
  const { access_token, scope } = await exchangeCodeForToken(shop, code);

  // Sla shop op in DB — upsertShop returnt de bestaande row als die al bestaat
  const existingShop = await getShopFromDomain(shop);
  await upsertShop(shop, access_token, scope);

  // Nieuwe shop (geen settings) → onboarding, bestaande shop → dashboard
  const isNew = !existingShop || !existingShop.settings_json?.company_name;
  const destination = isNew ? "onboarding" : "";
  const host = params.get("host") ?? "";

  const response = NextResponse.redirect(
    `${process.env.APP_URL}/${destination}?shop=${shop}&host=${host}`
  );
  response.cookies.set("shopify_oauth_state", "", { maxAge: 0, path: "/" });

  return response;
}
