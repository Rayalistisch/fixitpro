import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createHmac } from "crypto";
import { buildOfferPdf, buildOfferQuoteEmail } from "@/app/lib/offer-pdf";
import { getShopSettings } from "@/app/lib/shopify";
import { sendShopMail } from "@/app/lib/mailer";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function safe(v: any) {
  return String(v ?? "").replace(/[<>]/g, "");
}

function getSupabaseAdmin() {
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || "";
  if (!url) throw new Error("Missing env: SUPABASE_URL");
  return createClient(url, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
}

function makeToken(id: string): string {
  const secret = process.env.OFFER_SECRET || process.env.AUTH_SECRET || "gsm-offer-fallback";
  return createHmac("sha256", secret).update(id).digest("hex");
}

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const id = String(body?.id || "").trim();
    if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });

    const url = new URL(req.url);
    const shopDomain = url.searchParams.get("shop") ?? "";
    if (!shopDomain) return NextResponse.json({ error: "shop param ontbreekt" }, { status: 401 });

    const settings = await getShopSettings(shopDomain).catch(() => ({} as import("@/app/lib/shopify").ShopSettings));

    const supabase = getSupabaseAdmin();

    const { data, error } = await supabase
      .from("repair_requests")
      .update({ status: "awaiting_approval" })
      .eq("id", id)
      .eq("shop_domain", shopDomain)
      .select("id, status, customer_name, customer_email, customer_phone, brand, model, color, issue, quality, price_text, preferred_date, preferred_time")
      .single();

    if (error) return NextResponse.json({ error: safe(error.message) }, { status: 500 });

    try {
      const customer_email = safe(data?.customer_email).trim();
      if (!customer_email) {
        return NextResponse.json({ ok: true, data, mail_sent: false, stage: "no_customer_email" });
      }

      const { data: catalogItem } = await supabase
        .from("repair_catalog")
        .select("show_quality")
        .ilike("brand", data.brand ?? "")
        .ilike("model", data.model ?? "")
        .ilike("color", data.color ?? "")
        .ilike("repair_type", data.issue ?? "")
        .maybeSingle();
      const showQuality = catalogItem?.show_quality === true;

      const origin = new URL(req.url).origin;
      const token = makeToken(id);
      const acceptUrl = `${origin}/api/offer-confirm?id=${encodeURIComponent(id)}&token=${token}&action=accept`;
      const rejectUrl = `${origin}/api/offer-confirm?id=${encodeURIComponent(id)}&token=${token}&action=reject`;

      const html = buildOfferQuoteEmail({
        id:             data.id,
        customer_name:  safe(data.customer_name),
        brand:          data.brand,
        model:          data.model,
        color:          data.color,
        issue:          data.issue,
        quality:        showQuality ? data.quality : undefined,
        price_text:     data.price_text,
        preferred_date: data.preferred_date,
        preferred_time: data.preferred_time,
        acceptUrl,
        rejectUrl,
      }, settings);

      const pdf = await buildOfferPdf({
        id:             data.id,
        customer_name:  data.customer_name,
        customer_email: data.customer_email,
        customer_phone: data.customer_phone,
        brand:          data.brand,
        model:          data.model,
        color:          data.color,
        issue:          data.issue,
        quality:        showQuality ? data.quality : undefined,
        price_text:     data.price_text,
        preferred_date: data.preferred_date,
        preferred_time: data.preferred_time,
      }, settings);

      const companyName = settings.company_name || "Fixora Pro";
      const subject = `Offerte reparatie – ${companyName}`;

      await sendShopMail(settings, {
        to: customer_email,
        subject,
        html,
        attachments: [{ filename: `Offerte-${data.id}.pdf`, contentType: "application/pdf", data: pdf }],
      });

      return NextResponse.json({ ok: true, data, mail_sent: true });
    } catch (mailErr: any) {
      console.error("Offer mail/pdf error:", mailErr);
      return NextResponse.json({ ok: true, data, mail_sent: false, mail_error: safe(mailErr?.message) });
    }
  } catch (err: any) {
    console.error("Offer route error:", err);
    return NextResponse.json({ error: "Server error", detail: safe(err?.message) }, { status: 500 });
  }
}
