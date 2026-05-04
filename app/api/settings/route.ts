import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { requireShopSession, type ShopSettings } from "@/app/lib/shopify";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function getSupabase() {
  return createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  );
}

export async function GET(req: Request) {
  try {
    const shop = await requireShopSession(req);
    return NextResponse.json(shop.settings_json ?? {});
  } catch (err) {
    if (err instanceof Response) return err;
    return NextResponse.json({ error: "Server fout" }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const shop = await requireShopSession(req);
    const body: ShopSettings = await req.json().catch(() => ({}));

    // Alleen bekende velden toestaan
    const ALLOWED: (keyof ShopSettings)[] = [
      "company_name", "company_tagline", "address_line1", "address_line2",
      "phone", "email", "website", "kvk", "btw", "iban", "bic",
      "logo_url", "notify_email",
    ];

    const patch: ShopSettings = {};
    for (const key of ALLOWED) {
      if (key in body) patch[key] = body[key] as string;
    }

    const sb = getSupabase();

    // Merge patch in bestaande settings (overschrijf niet de hele kolom)
    const merged = { ...shop.settings_json, ...patch };
    const { error: mergeError } = await sb
      .from("shops")
      .update({ settings_json: merged })
      .eq("shop_domain", shop.shop_domain);

    if (mergeError) {
      return NextResponse.json({ error: mergeError.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err instanceof Response) return err;
    console.error("Settings POST error:", err);
    return NextResponse.json({ error: "Server fout" }, { status: 500 });
  }
}
