import { NextResponse } from "next/server";
import {
  getShopFromDomain,
  sanitizeShopDomain,
  exchangeSessionToken,
  updateShopAccessToken,
} from "@/app/lib/shopify";
import { createAppSubscription } from "@/app/lib/billing";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const rawShop = url.searchParams.get("shop") ?? "";
  const host = url.searchParams.get("host") ?? "";
  const sessionToken = url.searchParams.get("session_token") ?? "";
  const shop = sanitizeShopDomain(rawShop);
  const appUrl = process.env.APP_URL!;

  if (!shop) {
    return NextResponse.json({ error: "Ongeldig shop domein" }, { status: 400 });
  }

  const shopRow = await getShopFromDomain(shop);
  if (!shopRow) {
    return NextResponse.json({ error: "Shop niet gevonden" }, { status: 404 });
  }

  // Gebruik token exchange als er een session token meegegeven is
  // zodat we altijd een expiring offline token hebben (vereist door Shopify 2025)
  let accessToken = shopRow.access_token;
  if (sessionToken) {
    try {
      accessToken = await exchangeSessionToken(shop, sessionToken);
      await updateShopAccessToken(shop, accessToken);
      console.log("Token exchange geslaagd voor", shop);
    } catch (e: any) {
      console.error("Token exchange mislukt:", e?.message);
      return NextResponse.json(
        { error: `Token exchange mislukt: ${e?.message}` },
        { status: 500 }
      );
    }
  } else {
    console.warn("Geen session token — gebruik opgeslagen token (kan non-expiring zijn):", shop);
  }

  const returnUrl = `${appUrl}/api/billing/callback?shop=${shop}&host=${encodeURIComponent(host)}`;

  try {
    const { confirmationUrl } = await createAppSubscription(shop, accessToken, returnUrl);
    return NextResponse.json({ confirmationUrl });
  } catch (err: any) {
    console.error("billing/subscribe fout:", err?.message ?? err);
    return NextResponse.json(
      { error: err?.message ?? "Billing aanmaken mislukt" },
      { status: 500 }
    );
  }
}
