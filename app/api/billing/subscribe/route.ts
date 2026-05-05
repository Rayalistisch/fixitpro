import { NextResponse } from "next/server";
import { getShopFromDomain, sanitizeShopDomain } from "@/app/lib/shopify";
import { createAppSubscription } from "@/app/lib/billing";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const rawShop = url.searchParams.get("shop") ?? "";
  const host = url.searchParams.get("host") ?? "";
  const shop = sanitizeShopDomain(rawShop);
  const appUrl = process.env.APP_URL!;

  if (!shop) {
    return NextResponse.redirect(`${appUrl}/billing?error=invalid_shop&shop=${rawShop}&host=${host}`);
  }

  const shopRow = await getShopFromDomain(shop);
  if (!shopRow) {
    return NextResponse.redirect(`${appUrl}/billing?error=shop_not_found&shop=${shop}&host=${host}`);
  }

  const returnUrl = `${appUrl}/api/billing/callback?shop=${shop}&host=${encodeURIComponent(host)}`;

  try {
    const { confirmationUrl } = await createAppSubscription(
      shop,
      shopRow.access_token,
      returnUrl
    );
    // Directe redirect naar Shopify billing consent pagina
    return NextResponse.redirect(confirmationUrl);
  } catch (err: any) {
    console.error("billing/subscribe fout:", err?.message ?? err);
    const msg = encodeURIComponent(err?.message ?? "Billing aanmaken mislukt");
    return NextResponse.redirect(`${appUrl}/billing?error=${msg}&shop=${shop}&host=${host}`);
  }
}
