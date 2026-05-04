import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { buildOfferPdf, buildOfferEmail } from "@/app/lib/offer-pdf";
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
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) throw new Error("Missing env: SUPABASE_SERVICE_ROLE_KEY");
  return createClient(url, key, { auth: { persistSession: false } });
}

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const id = String(body?.id || "").trim();
    if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });

    // Load shop settings (best-effort, falls back to Mailgun env vars)
    const url = new URL(req.url);
    const shopDomain = url.searchParams.get("shop") ?? "";
    const settings = shopDomain ? await getShopSettings(shopDomain).catch(() => ({} as import("@/app/lib/shopify").ShopSettings)) : ({} as import("@/app/lib/shopify").ShopSettings);

    const supabaseAdmin = getSupabaseAdmin();

    const { data, error } = await supabaseAdmin
      .from("repair_requests")
      .update({ status: "approved" })
      .eq("id", id)
      .select(
        "id, status, customer_name, customer_email, customer_phone, brand, model, color, issue, quality, price_text, preferred_date, preferred_time"
      )
      .single();

    if (error) {
      console.error("Approve update error:", error);
      return NextResponse.json({ error: safe(error.message) }, { status: 500 });
    }

    try {
      const customer_email = safe(data?.customer_email).trim();
      const customer_name = safe(data?.customer_name).trim();

      if (!customer_email) {
        return NextResponse.json(
          { ok: true, data, mail_sent: false, pdf_sent: false, stage: "approve_no_customer_email" },
          { status: 200 }
        );
      }

      const { data: catalogItem } = await supabaseAdmin
        .from("repair_catalog")
        .select("show_quality")
        .ilike("brand", data.brand ?? "")
        .ilike("model", data.model ?? "")
        .ilike("color", data.color ?? "")
        .ilike("repair_type", data.issue ?? "")
        .maybeSingle();
      const showQuality = catalogItem?.show_quality === true;

      const companyName = settings.company_name || "Fixora Pro";
      const subject = `Reparatie goedgekeurd + offerte – ${companyName}`;
      const logoUrl = `${new URL(req.url).origin}/favicon.ico`;

      const html = buildOfferEmail({
        customer_name,
        id:             data.id,
        logoUrl,
        brand:          data.brand,
        model:          data.model,
        color:          data.color,
        issue:          data.issue,
        quality:        showQuality ? data.quality : undefined,
        price_text:     data.price_text,
        preferred_date: data.preferred_date,
        preferred_time: data.preferred_time,
      });

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
      });

      const notifyEmail = settings.notify_email || process.env.NOTIFY_EMAIL;

      await sendShopMail(settings, {
        to: customer_email,
        cc: notifyEmail,
        subject,
        html,
        attachments: [
          { filename: `Offerte-${data.id}.pdf`, contentType: "application/pdf", data: pdf },
        ],
      });

      return NextResponse.json({ ok: true, data, mail_sent: true, pdf_sent: true }, { status: 200 });
    } catch (mailErr: any) {
      console.error("Approve mail/pdf error:", mailErr);
      return NextResponse.json(
        { ok: true, data, mail_sent: false, pdf_sent: false, mail_error: safe(mailErr?.message) },
        { status: 200 }
      );
    }
  } catch (err: any) {
    console.error("Approve route error:", err);
    return NextResponse.json({ error: "Server error", detail: safe(err?.message || err) }, { status: 500 });
  }
}
