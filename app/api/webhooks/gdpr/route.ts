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
  const topic = req.headers.get("X-Shopify-Topic") ?? "";
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

  const shopDomain: string = payload.shop_domain ?? "";
  const sb = getSupabase();

  // Klant vraagt welke data er opgeslagen is — vereist alleen een 200 bevestiging
  if (topic === "customers/data_request") {
    console.log("GDPR data_request:", { shopDomain, email: payload.customer?.email });
    return NextResponse.json({ ok: true });
  }

  // Klant vraagt verwijdering van zijn PII
  if (topic === "customers/redact") {
    const email: string = payload.customer?.email ?? "";
    if (shopDomain && email) {
      const { error } = await sb
        .from("repair_requests")
        .update({
          customer_name: "[verwijderd]",
          customer_email: "[verwijderd]",
          customer_phone: "[verwijderd]",
        })
        .eq("shop_domain", shopDomain)
        .eq("customer_email", email);
      if (error) console.error("GDPR customers/redact DB fout:", error);
    }
    console.log("GDPR customers/redact:", { shopDomain, email });
    return NextResponse.json({ ok: true });
  }

  // Shop verwijderd (48u na uninstall) — wis alle data van deze shop
  if (topic === "shop/redact") {
    if (shopDomain) {
      await sb.from("repair_requests").delete().eq("shop_domain", shopDomain);
      await sb.from("repair_catalog").delete().eq("shop_domain", shopDomain);
      await sb.from("shops").delete().eq("shop_domain", shopDomain);
    }
    console.log("GDPR shop/redact:", shopDomain);
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ ok: true });
}
