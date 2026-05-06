import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/* -------------------- helpers -------------------- */

function safe(v: any) {
  return String(v ?? "").replace(/[<>]/g, "");
}

function requireEnv(name: string) {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env: ${name}`);
  return v;
}

// Maak de admin client pas aan tijdens runtime (binnen request)
function getSupabaseAdmin() {
  const url =
    process.env.SUPABASE_URL ||
    process.env.NEXT_PUBLIC_SUPABASE_URL || // fallback als je die al had staan
    "";

  if (!url) throw new Error("Missing env: SUPABASE_URL (or NEXT_PUBLIC_SUPABASE_URL fallback)");

  const key = requireEnv("SUPABASE_SERVICE_ROLE_KEY");

  return createClient(url, key, {
    auth: { persistSession: false },
  });
}

/* -------------------- route -------------------- */

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const id = String(body?.id || "").trim();
    const patch = body?.patch && typeof body.patch === "object" ? body.patch : null;

    if (!id || !patch) {
      return NextResponse.json({ error: "Missing id/patch" }, { status: 400 });
    }

    const shopDomain = new URL(req.url).searchParams.get("shop") ?? "";
    if (!shopDomain) return NextResponse.json({ error: "shop param ontbreekt" }, { status: 401 });

    // ✅ Whitelist: alleen deze velden mogen aangepast worden vanuit admin UI
    const allowed = new Set(["price_text", "preferred_date", "preferred_time", "notes"]);

    const cleanPatch: Record<string, any> = {};
    for (const [k, v] of Object.entries(patch)) {
      if (!allowed.has(k)) continue;

      // normaliseer naar string (of null)
      if (v === null || v === undefined) cleanPatch[k] = null;
      else cleanPatch[k] = String(v);
    }

    if (Object.keys(cleanPatch).length === 0) {
      return NextResponse.json({ error: "No allowed fields" }, { status: 400 });
    }

    const supabaseAdmin = getSupabaseAdmin();

    const { data, error } = await supabaseAdmin
      .from("repair_requests")
      .update(cleanPatch)
      .eq("id", id)
      .eq("shop_domain", shopDomain)
      .select("id, price_text, preferred_date, preferred_time, notes, status")
      .single();

    if (error) {
      console.error("Update-request error:", error);
      return NextResponse.json({ error: safe(error.message) }, { status: 500 });
    }

    return NextResponse.json({ ok: true, data }, { status: 200 });
  } catch (err: any) {
    console.error("Update-request route error:", err);
    return NextResponse.json(
      { error: "Server error", detail: safe(err?.message || err) },
      { status: 500 }
    );
  }
}
