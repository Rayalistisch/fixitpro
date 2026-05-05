import { NextResponse } from "next/server";
import { requireShopSession } from "@/app/lib/shopify";
import { isSubscriptionActive, PLAN } from "@/app/lib/billing";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    const shop = await requireShopSession(req);
    const active = isSubscriptionActive(shop.subscription_status);
    return NextResponse.json({
      status: shop.subscription_status ?? "none",
      active,
      trial_ends_at: shop.trial_ends_at,
      plan: PLAN.name,
      amount: PLAN.amount,
      currency: PLAN.currencyCode,
      trial_days: PLAN.trialDays,
    });
  } catch (err) {
    if (err instanceof Response) return err;
    return NextResponse.json({ error: "Server fout" }, { status: 500 });
  }
}
