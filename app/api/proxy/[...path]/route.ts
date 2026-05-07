import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import {
  verifyProxySignature,
  getShopFromDomain,
} from "@/app/lib/shopify";
import { sendShopMail } from "@/app/lib/mailer";
import type { ShopSettings } from "@/app/lib/shopify";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function getSupabase() {
  return createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  );
}

function safe(v: unknown): string {
  return String(v ?? "").replace(/[<>]/g, "");
}


// ── Handler voor GET (catalog data) ─────────────────────────────────────────
async function handleCatalogGet(
  searchParams: URLSearchParams,
  shopDomain: string
): Promise<NextResponse> {
  const sb = getSupabase();
  const brandsOnly = searchParams.get("brands") === "1";
  const modelsOnly = searchParams.get("models") === "1";
  const brand = searchParams.get("brand") ?? "";
  const model = searchParams.get("model") ?? "";
  const color = searchParams.get("color") ?? "";
  const repairType = searchParams.get("repair_type") ?? "";
  const rpcName = searchParams.get("rpc") ?? "";

  // Direct queries voor widget typeahead — met fallback naar globale catalogus
  async function distinctWithFallback(
    column: string,
    filters: Record<string, string>
  ): Promise<string[]> {
    async function query(withShop: boolean) {
      let q = sb.from("repair_catalog").select(column);
      if (withShop) q = q.eq("shop_domain", shopDomain);
      for (const [k, v] of Object.entries(filters)) q = q.eq(k, v);
      q = q.limit(2000);
      const { data } = await q;
      return [...new Set((data ?? []).map((r: any) => r[column] as string).filter(Boolean))].sort() as string[];
    }
    const own = await query(true);
    return own.length > 0 ? own : query(false);
  }

  if (rpcName === "get_colors" && brand && model) {
    const colors = await distinctWithFallback("color", { brand, model });
    return NextResponse.json(colors.map((c) => ({ color: c })));
  }
  if (rpcName === "get_repair_types" && brand && model && color) {
    const types = await distinctWithFallback("repair_type", { brand, model, color });
    return NextResponse.json(types.map((t) => ({ repair_type: t })));
  }
  if (rpcName === "get_qualities_prices" && brand && model && color && repairType) {
    async function queryQP(withShop: boolean) {
      let q = sb.from("repair_catalog")
        .select("quality, price, show_quality")
        .eq("brand", brand).eq("model", model).eq("color", color).eq("repair_type", repairType)
        .limit(50);
      if (withShop) q = q.eq("shop_domain", shopDomain);
      const { data } = await q;
      return data ?? [];
    }
    const own = await queryQP(true);
    const rows = own.length > 0 ? own : await queryQP(false);
    return NextResponse.json(rows);
  }

  // Overige RPC-namen (get_brands, get_models) — niet meer via RPC maar afgehandeld hieronder
  if (rpcName) {
    return NextResponse.json({ error: "Onbekende RPC" }, { status: 400 });
  }

  if (brandsOnly) {
    // Probeer eerst de globale RPC (DISTINCT, geen row-limiet)
    const { data: rpcData, error: rpcError } = await sb.rpc("get_brands", {});
    if (!rpcError && Array.isArray(rpcData) && rpcData.length > 0) {
      const brands = rpcData
        .map((r: unknown) => (typeof r === "string" ? r : (r as { brand: string }).brand))
        .filter(Boolean)
        .sort();
      return NextResponse.json(brands);
    }
    // Fallback: pagineer door alle rijen (identiek aan admin-route)
    const brandSet = new Set<string>();
    for (let i = 0; i < 200; i++) {
      const { data, error } = await sb
        .from("repair_catalog")
        .select("brand")
        .range(i * 1000, i * 1000 + 999);
      if (error || !data || data.length === 0) break;
      data.forEach((r: { brand: string }) => { if (r.brand) brandSet.add(r.brand); });
      if (data.length < 1000) break;
    }
    return NextResponse.json([...brandSet].sort());
  }

  if (modelsOnly && brand) {
    const PAGE = 1000;
    const modelSet = new Set<string>();
    for (let offset = 0; offset < 100000; offset += PAGE) {
      const { data, error } = await sb
        .from("repair_catalog")
        .select("model")
        .eq("brand", brand)
        .eq("shop_domain", shopDomain)
        .range(offset, offset + PAGE - 1);
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      if (!data?.length) break;
      data.forEach((r: { model: string }) => modelSet.add(r.model));
      if (data.length < PAGE) break;
    }
    if (modelSet.size > 0) return NextResponse.json([...modelSet].sort());
    // Geen eigen data — fallback naar globale catalogus
    for (let o2 = 0; o2 < 100000; o2 += PAGE) {
      const { data: d2 } = await sb
        .from("repair_catalog")
        .select("model")
        .eq("brand", brand)
        .range(o2, o2 + PAGE - 1);
      if (!d2?.length) break;
      d2.forEach((r: { model: string }) => modelSet.add(r.model));
      if (d2.length < PAGE) break;
    }
    return NextResponse.json([...modelSet].sort());
  }

  // Algemene catalogus-query
  function buildQ(withShop: boolean) {
    let q = sb
      .from("repair_catalog")
      .select("id, brand, model, color, repair_type, quality, price, show_quality")
      .order("brand").order("model").order("color").order("repair_type").limit(500);
    if (withShop) q = q.eq("shop_domain", shopDomain);
    if (brand) q = q.eq("brand", brand);
    if (model) q = q.eq("model", model);
    return q;
  }

  const { data, error } = await buildQ(true);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (data && data.length > 0) return NextResponse.json(data);
  // Geen eigen data — fallback naar globale catalogus
  const { data: d2, error: e2 } = await buildQ(false);
  if (e2) return NextResponse.json({ error: e2.message }, { status: 500 });
  return NextResponse.json(d2 ?? []);
}

// ── Handler voor POST (aanvraag aanmaken) ────────────────────────────────────
async function handleCreateRequest(
  body: Record<string, unknown>,
  shopDomain: string
): Promise<NextResponse> {
  const sb = getSupabase();
  const shop = await getShopFromDomain(shopDomain);
  const settings = shop?.settings_json ?? {};

  const customer_email = safe(body.customer_email).trim();
  const customer_name = safe(body.customer_name).trim();

  if (!customer_email) {
    return NextResponse.json({ error: "customer_email is verplicht" }, { status: 400 });
  }

  const { data, error } = await sb
    .from("repair_requests")
    .insert({
      shop_domain: shopDomain,
      customer_name,
      customer_email,
      customer_phone: safe(body.customer_phone).trim(),
      brand: safe(body.brand).trim(),
      model: safe(body.model).trim(),
      color: safe(body.color).trim(),
      issue: safe(body.issue).trim(),
      quality: safe(body.quality).trim(),
      price_text: safe(body.price_text).trim(),
      preferred_date: safe(body.preferred_date).trim(),
      preferred_time: safe(body.preferred_time).trim(),
      notes: safe(body.notes).trim(),
      status: "pending",
    })
    .select("id")
    .single();

  if (error || !data?.id) {
    console.error("Proxy create-request DB error:", error);
    return NextResponse.json({ error: "Database fout" }, { status: 500 });
  }

  const shopSettings = (settings ?? {}) as ShopSettings;
  const companyName = shopSettings.company_name ?? "GSM Reparatie";
  const NOTIFY_EMAIL = shopSettings.notify_email ?? process.env.NOTIFY_EMAIL ?? "";

  const toestel = [safe(body.brand), safe(body.model), safe(body.color)]
    .filter(Boolean).join(" ");
  const voorkeur = [safe(body.preferred_date), safe(body.preferred_time)]
    .filter(Boolean).join(" ");

  const subject = `Bevestiging reparatie-aanvraag – ${companyName}`;
  const html = `
    <div style="font-family:Arial,sans-serif;max-width:620px;margin:0 auto;color:#111">
      <h2>Bevestiging reparatie-aanvraag</h2>
      <p>Bedankt${customer_name ? " " + customer_name : ""}! We hebben jouw aanvraag ontvangen.</p>
      <div style="padding:12px 14px;border-radius:12px;background:#f6f8fc;border:1px solid #e6ecf5">
        <div><strong>Toestel:</strong> ${toestel || "-"}</div>
        <div><strong>Reparatie:</strong> ${safe(body.issue) || "-"}</div>
        <div><strong>Richtprijs:</strong> ${safe(body.price_text) || "-"}</div>
        <div><strong>Voorkeur:</strong> ${voorkeur || "-"}</div>
      </div>
      <p>Met vriendelijke groet,<br><strong>${companyName}</strong></p>
      <p style="font-size:12px;color:#6b7280">Referentie: ${data.id}</p>
    </div>
  `;

  try {
    await sendShopMail(shopSettings, { to: customer_email, subject, html });

    if (NOTIFY_EMAIL) {
      await sendShopMail(shopSettings, {
        to: NOTIFY_EMAIL,
        subject: `Nieuwe aanvraag: ${toestel || "onbekend"} – ${customer_name || customer_email}`,
        html: `<p>Nieuwe aanvraag van ${customer_name || customer_email} (${customer_email})</p>
               <p>Toestel: ${toestel}</p><p>Reparatie: ${safe(body.issue)}</p>
               <p>Prijs: ${safe(body.price_text)}</p><p>Referentie: ${data.id}</p>`,
      });
    }
  } catch (mailErr) {
    console.error("Proxy mail error:", mailErr);
    return NextResponse.json({ ok: true, id: data.id, mail_sent: false });
  }

  return NextResponse.json({ ok: true, id: data.id, mail_sent: true });
}

// ── Route handlers ────────────────────────────────────────────────────────────
type RouteContext = { params: Promise<{ path: string[] }> };

async function getShopOrFail(
  url: URL,
  devBypass = false
): Promise<{ shopDomain: string; error?: NextResponse }> {
  const searchParams = url.searchParams;

  // In development zonder SHOPIFY_API_SECRET: sta test-shop toe via query param
  if (devBypass || !process.env.SHOPIFY_API_SECRET) {
    const shopDomain = searchParams.get("shop") ?? "dev.myshopify.com";
    return { shopDomain };
  }

  if (!verifyProxySignature(searchParams)) {
    return {
      shopDomain: "",
      error: NextResponse.json({ error: "Ongeldige proxy handtekening" }, { status: 401 }),
    };
  }

  const shopDomain = searchParams.get("shop") ?? "";
  if (!shopDomain) {
    return {
      shopDomain: "",
      error: NextResponse.json({ error: "shop param ontbreekt" }, { status: 400 }),
    };
  }

  return { shopDomain };
}

export async function GET(req: Request, context: RouteContext) {
  const { path } = await context.params;
  const url = new URL(req.url);
  const { shopDomain, error } = await getShopOrFail(url);
  if (error) return error;

  const segment = path[0] ?? "";
  if (segment === "catalog" || segment === "brands" || segment === "models" || segment === "") {
    return handleCatalogGet(url.searchParams, shopDomain);
  }

  return NextResponse.json({ error: "Onbekend pad" }, { status: 404 });
}

export async function POST(req: Request, context: RouteContext) {
  const { path } = await context.params;
  const url = new URL(req.url);
  const { shopDomain, error } = await getShopOrFail(url);
  if (error) return error;

  const segment = path[0] ?? "";
  if (segment === "create-request") {
    const body = await req.json().catch(() => ({}));
    return handleCreateRequest(body, shopDomain);
  }

  return NextResponse.json({ error: "Onbekend pad" }, { status: 404 });
}
