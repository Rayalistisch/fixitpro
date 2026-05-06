import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import {
  verifyProxySignature,
  getShopFromDomain,
} from "@/app/lib/shopify";

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

// ── Mailgun helper (gedeeld met create-request) ──────────────────────────────
async function sendMailgun({
  apiKey, domain, region, from, to, subject, html,
}: {
  apiKey: string; domain: string; region: string;
  from: string; to: string; subject: string; html: string;
}) {
  const base = region === "eu"
    ? "https://api.eu.mailgun.net"
    : "https://api.mailgun.net";
  const form = new URLSearchParams({ from, to, subject, html });
  const auth = Buffer.from(`api:${apiKey}`).toString("base64");
  const res = await fetch(`${base}/v3/${domain}/messages`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${auth}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: form.toString(),
  });
  if (!res.ok) throw new Error(`Mailgun ${res.status}: ${await res.text()}`);
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

  // RPC calls (voor de widget typeahead)
  if (rpcName) {
    // Ondersteunde RPC's met shop-filtering
    const ALLOWED_RPCS: Record<string, Record<string, unknown>> = {
      get_brands: { p_shop_domain: shopDomain },
      get_models: { p_brand: brand, p_shop_domain: shopDomain },
      get_colors: { p_brand: brand, p_model: model, p_shop_domain: shopDomain },
      get_repair_types: { p_brand: brand, p_model: model, p_color: color, p_shop_domain: shopDomain },
      get_qualities_prices: { p_brand: brand, p_model: model, p_color: color, p_repair_type: repairType, p_shop_domain: shopDomain },
    };
    if (!ALLOWED_RPCS[rpcName]) {
      return NextResponse.json({ error: "Onbekende RPC" }, { status: 400 });
    }
    const { data, error } = await sb.rpc(rpcName, ALLOWED_RPCS[rpcName]);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json(data ?? []);
  }

  if (brandsOnly) {
    // Probeer eerst de globale RPC (DISTINCT, geen row-limiet)
    const { data: rpcData, error: rpcError } = await sb.rpc("get_brands", {});
    if (!rpcError && rpcData) {
      const brands = rpcData
        .map((r: unknown) => (typeof r === "string" ? r : (r as { brand: string }).brand))
        .filter(Boolean)
        .sort();
      return NextResponse.json(brands);
    }
    // Fallback: directe query op eigen rijen, dan op globaal
    const { data: ownData } = await sb
      .from("repair_catalog")
      .select("brand")
      .eq("shop_domain", shopDomain)
      .order("brand");
    const ownBrands = [...new Set((ownData ?? []).map((r: { brand: string }) => r.brand))];
    if (ownBrands.length > 0) return NextResponse.json(ownBrands);
    const { data: allData, error: allErr } = await sb
      .from("repair_catalog").select("brand").order("brand").limit(5000);
    if (allErr) return NextResponse.json({ error: allErr.message }, { status: 500 });
    return NextResponse.json([...new Set((allData ?? []).map((r: { brand: string }) => r.brand))]);
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

  // E-mail via shop-specifieke instellingen
  const MAILGUN_API_KEY = process.env.MAILGUN_API_KEY!;
  const MAILGUN_DOMAIN = process.env.MAILGUN_DOMAIN!;
  const MAILGUN_REGION = process.env.MAILGUN_REGION ?? "eu";
  const companyName = settings.company_name ?? "GSM Reparatie";
  const MAIL_FROM = settings.email
    ? `${companyName} <${settings.email}>`
    : (process.env.MAIL_FROM ?? `${companyName} <noreply@${MAILGUN_DOMAIN}>`);
  const NOTIFY_EMAIL = settings.notify_email ?? process.env.NOTIFY_EMAIL ?? "";
  const DEBUG_TO = process.env.MAIL_DEBUG_TO ?? "";

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
    await sendMailgun({
      apiKey: MAILGUN_API_KEY, domain: MAILGUN_DOMAIN, region: MAILGUN_REGION,
      from: MAIL_FROM, to: DEBUG_TO || customer_email,
      subject: DEBUG_TO ? `[DEBUG] ${subject}` : subject, html,
    });

    if (NOTIFY_EMAIL) {
      await sendMailgun({
        apiKey: MAILGUN_API_KEY, domain: MAILGUN_DOMAIN, region: MAILGUN_REGION,
        from: MAIL_FROM, to: DEBUG_TO || NOTIFY_EMAIL,
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
