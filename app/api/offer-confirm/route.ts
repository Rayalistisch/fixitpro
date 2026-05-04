import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createHmac } from "crypto";
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
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Missing Supabase env");
  return createClient(url, key, { auth: { persistSession: false } });
}

function verifyToken(id: string, token: string): boolean {
  const secret = process.env.OFFER_SECRET || process.env.AUTH_SECRET || "gsm-offer-fallback";
  const expected = createHmac("sha256", secret).update(id).digest("hex");
  return expected === token;
}

export async function GET(req: Request) {
  const { searchParams, origin } = new URL(req.url);
  const id     = searchParams.get("id")     ?? "";
  const token  = searchParams.get("token")  ?? "";
  const action = searchParams.get("action") ?? "";

  const resultUrl = (result: string) => `${origin}/offer-confirm?result=${result}`;

  if (!id || !token || !["accept", "reject"].includes(action)) {
    return NextResponse.redirect(resultUrl("invalid"));
  }

  if (!verifyToken(id, token)) {
    return NextResponse.redirect(resultUrl("invalid"));
  }

  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("repair_requests")
    .select("id, status, shop_domain, customer_name, customer_email, customer_phone, brand, model, color, issue, quality, price_text, preferred_date, preferred_time")
    .eq("id", id)
    .single();

  if (error || !data) return NextResponse.redirect(resultUrl("invalid"));

  if (data.status === "approved") return NextResponse.redirect(resultUrl("accepted"));
  if (data.status === "rejected") return NextResponse.redirect(resultUrl("rejected"));
  if (data.status !== "awaiting_approval") return NextResponse.redirect(resultUrl("invalid"));

  if (action === "reject") {
    await supabase.from("repair_requests").update({ status: "rejected" }).eq("id", id);
    return NextResponse.redirect(resultUrl("rejected"));
  }

  await supabase.from("repair_requests").update({ status: "approved" }).eq("id", id);

  try {
    if (!data.customer_email) return NextResponse.redirect(resultUrl("accepted"));

    const settings = data.shop_domain
      ? await getShopSettings(data.shop_domain).catch(() => ({} as import("@/app/lib/shopify").ShopSettings))
      : ({} as import("@/app/lib/shopify").ShopSettings);

    const { data: catalogItem } = await supabase
      .from("repair_catalog")
      .select("show_quality")
      .ilike("brand", data.brand ?? "")
      .ilike("model", data.model ?? "")
      .ilike("color", data.color ?? "")
      .ilike("repair_type", data.issue ?? "")
      .maybeSingle();
    const showQuality = catalogItem?.show_quality === true;

    const companyName = settings.company_name || "Fixora Pro";
    const subject = `Reparatie bevestigd – ${companyName}`;

    const html = buildOfferEmail({
      id:             data.id,
      customer_name:  safe(data.customer_name),
      logoUrl:        `${origin}/favicon.ico`,
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
      to:      data.customer_email,
      cc:      notifyEmail,
      subject,
      html,
      attachments: [{ filename: `Bevestiging-${data.id}.pdf`, contentType: "application/pdf", data: pdf }],
    });
  } catch (err) {
    console.error("offer-confirm confirmation mail error:", err);
  }

  return NextResponse.redirect(resultUrl("accepted"));
}
