import { NextResponse } from "next/server";
import { getShopFromDomain, sanitizeShopDomain, updateShopSubscription } from "@/app/lib/shopify";
import { getAppSubscription } from "@/app/lib/billing";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const rawShop = url.searchParams.get("shop") ?? "";
  const host = url.searchParams.get("host") ?? "";
  const chargeId = url.searchParams.get("charge_id") ?? "";
  const shop = sanitizeShopDomain(rawShop);

  const appUrl = process.env.APP_URL!;

  if (!shop) {
    return NextResponse.redirect(`${appUrl}/billing?error=invalid_shop`);
  }

  const shopRow = await getShopFromDomain(shop);
  if (!shopRow) {
    return NextResponse.redirect(`${appUrl}/billing?error=shop_not_found`);
  }

  if (!chargeId) {
    return NextResponse.redirect(`${appUrl}/billing?shop=${shop}&host=${host}&error=no_charge`);
  }

  try {
    const { status, currentPeriodEnd } = await getAppSubscription(
      shop,
      shopRow.access_token,
      chargeId
    );

    if (status === "ACTIVE" || status === "TRIALING") {
      await updateShopSubscription(shop, {
        subscription_status: status,
        subscription_id: chargeId,
        trial_ends_at: currentPeriodEnd,
      });

      // Nieuwe shop → onboarding, bestaande → dashboard
      const isNew = !shopRow.settings_json?.company_name;
      const destination = isNew ? "onboarding" : "";
      return NextResponse.redirect(`${appUrl}/${destination}?shop=${shop}&host=${host}`);
    }

    // Declined of iets anders
    await updateShopSubscription(shop, {
      subscription_status: status,
    });
    return NextResponse.redirect(`${appUrl}/billing?shop=${shop}&host=${host}&declined=1`);
  } catch (err: any) {
    console.error("billing/callback fout:", err);
    return NextResponse.redirect(`${appUrl}/billing?shop=${shop}&host=${host}&error=verify_failed`);
  }
}
