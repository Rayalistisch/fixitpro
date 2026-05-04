import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import {
  verifyOAuthHmac,
  exchangeCodeForToken,
  upsertShop,
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

  // Sla shop op in DB
  await upsertShop(shop, access_token, scope);

  // Wis state cookie
  const response = NextResponse.redirect(
    `${process.env.APP_URL}/?shop=${shop}&host=${params.get("host") ?? ""}`
  );
  response.cookies.set("shopify_oauth_state", "", { maxAge: 0, path: "/" });

  return response;
}
