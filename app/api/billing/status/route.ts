import { NextResponse } from "next/server";
import { getShopFromDomain, sanitizeShopDomain } from "@/app/lib/shopify";
import { isSubscriptionActive, PLAN } from "@/app/lib/billing";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const rawShop = url.searchParams.get("shop") ?? "";
    const shop = sanitizeShopDomain(rawShop);

    if (!shop) {
      return NextResponse.json({ error: "shop param ontbreekt" }, { status: 400 });
    }

    const shopRow = await getShopFromDomain(shop);

    if (!shopRow) {
      // Shop nooit geïnstalleerd — client moet OAuth starten
      return NextResponse.json({ shop_not_found: true, active: false }, { status: 200 });
    }

    const active = isSubscriptionActive(shopRow.subscription_status);
    return NextResponse.json({
      status: shopRow.subscription_status ?? "none",
      active,
      trial_ends_at: shopRow.trial_ends_at,
      plan: PLAN.name,
      amount: PLAN.amount,
      currency: PLAN.currencyCode,
      trial_days: PLAN.trialDays,
    });
  } catch (err) {
    console.error("billing/status fout:", err);
    return NextResponse.json({ error: "Server fout" }, { status: 500 });
  }
}
