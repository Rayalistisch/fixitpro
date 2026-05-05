import { NextResponse } from "next/server";
import {
  getShopFromDomain,
  getValidAccessToken,
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

  // Haal een geldig (en eventueel gerefreshed) access token op
  let accessToken: string;
  try {
    accessToken = await getValidAccessToken(shop);
  } catch (e: any) {
    console.error("getValidAccessToken mislukt:", e?.message);
    return NextResponse.json({ error: `Token fout: ${e?.message}` }, { status: 500 });
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
