import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function getAdmin() {
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || "";
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
  if (!url || !key) throw new Error("Missing Supabase env vars");
  return createClient(url, key, { auth: { persistSession: false } });
}

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const status = searchParams.get("status");
    const shop = searchParams.get("shop") ?? "";
    const countOnly = searchParams.get("count") === "1";

    const sb = getAdmin();

    // Badge count voor DashboardShell
    if (countOnly) {
      let q = sb
        .from("repair_requests")
        .select("id", { count: "exact", head: true });
      if (shop) q = q.eq("shop_domain", shop);
      if (status && status !== "all") q = q.eq("status", status);
      const { count, error } = await q;
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      return NextResponse.json({ count: count ?? 0 });
    }

    let q = sb
      .from("repair_requests")
      .select(
        "id, created_at, customer_name, customer_email, customer_phone, brand, model, color, issue, price_text, preferred_date, preferred_time, status, condition, quality, warranty, notes"
      )
      .order("created_at", { ascending: false });

    if (shop) q = q.eq("shop_domain", shop);
    if (status && status !== "all") q = q.eq("status", status);

    const { data, error } = await q;
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    return NextResponse.json(data ?? []);
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
