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

  let shopDomain: string;
  try {
    const payload = JSON.parse(body);
    shopDomain = payload.myshopify_domain ?? payload.domain ?? "";
  } catch {
    return NextResponse.json({ error: "Ongeldig JSON" }, { status: 400 });
  }

  if (!shopDomain) {
    return NextResponse.json({ error: "shop_domain ontbreekt" }, { status: 400 });
  }

  const sb = getSupabase();
  const { error } = await sb
    .from("shops")
    .update({ uninstalled_at: new Date().toISOString() })
    .eq("shop_domain", shopDomain);

  if (error) {
    console.error("app/uninstalled DB fout:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  console.log("App verwijderd:", shopDomain);
  return NextResponse.json({ ok: true });
}
