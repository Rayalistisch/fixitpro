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

  // Shopify stuurt charge_id als numeriek ID, GraphQL verwacht volledige GID
  const subscriptionGid = chargeId.startsWith("gid://")
    ? chargeId
    : `gid://shopify/AppSubscription/${chargeId}`;

  // Na billing redirect altijd naar Shopify admin zodat de app embedded laadt
  const apiKey = process.env.SHOPIFY_API_KEY ?? process.env.NEXT_PUBLIC_SHOPIFY_API_KEY ?? "";
  const adminRedirect = `https://${shop}/admin/apps/${apiKey}`;

  try {
    const { status, currentPeriodEnd } = await getAppSubscription(
      shop,
      shopRow.access_token,
      subscriptionGid
    );

    if (status === "ACTIVE" || status === "TRIALING") {
      await updateShopSubscription(shop, {
        subscription_status: status,
        subscription_id: chargeId,
        trial_ends_at: currentPeriodEnd,
      });
      return NextResponse.redirect(adminRedirect);
    }

    // Declined of onbekende status
    await updateShopSubscription(shop, { subscription_status: status });
    return NextResponse.redirect(`${appUrl}/billing?shop=${shop}&host=${host}&declined=1`);

  } catch (err: any) {
    console.error("billing/callback fout:", err?.message ?? err);

    // Shopify stuurt de callback alleen als de gebruiker heeft goedgekeurd.
    // Als getAppSubscription faalt (bv. ongeldig token), vertrouw op de charge_id.
    if (chargeId) {
      console.log("Fallback: charge_id aanwezig, opslaan als TRIALING:", chargeId);
      await updateShopSubscription(shop, {
        subscription_status: "TRIALING",
        subscription_id: chargeId,
        trial_ends_at: null,
      }).catch((e) => console.error("updateShopSubscription fallback fout:", e));
      return NextResponse.redirect(adminRedirect);
    }

    return NextResponse.redirect(`${appUrl}/billing?shop=${shop}&host=${host}&error=verify_failed`);
  }
}
