import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { verifyWebhookHmac } from "@/app/lib/shopify";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function getSupabase() {
  return createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  );
}

export async function POST(req: Request) {
  const { valid, body } = await verifyWebhookHmac(req);
  if (!valid) {
    return NextResponse.json({ error: "Ongeldige HMAC" }, { status: 401 });
  }

  let payload: any;
  try {
    payload = JSON.parse(body);
  } catch {
    return NextResponse.json({ error: "Ongeldig JSON" }, { status: 400 });
  }

  const shopDomain = req.headers.get("X-Shopify-Shop-Domain") ?? "";
  const status = (payload.status ?? "").toUpperCase();
  const subscriptionId = payload.admin_graphql_api_id ?? null;

  if (!shopDomain) {
    return NextResponse.json({ error: "shop_domain ontbreekt" }, { status: 400 });
  }

  const sb = getSupabase();
  const { error } = await sb
    .from("shops")
    .update({
      subscription_status: status,
      subscription_id: subscriptionId,
    })
    .eq("shop_domain", shopDomain);

  if (error) {
    console.error("app-subscriptions-update DB fout:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  console.log(`Abonnement ${shopDomain}: ${status}`);
  return NextResponse.json({ ok: true });
}
