import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
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

function buildRejectEmail({
  customer_name, brand, model, reason, companyName,
}: {
  customer_name: string; brand?: string; model?: string;
  reason?: string; companyName: string;
}) {
  const toestel = [brand, model].filter(Boolean).join(" ") || "uw toestel";
  const reasonHtml = reason
    ? `<p style="margin:16px 0 0;color:#374151;">Reden: <em>${safe(reason)}</em></p>`
    : "";
  return `<!DOCTYPE html><html><body style="font-family:sans-serif;background:#f8fafc;margin:0;padding:32px 16px;">
<div style="max-width:520px;margin:0 auto;background:#fff;border-radius:12px;padding:32px;border:1px solid #e2e8f0;">
  <h2 style="margin:0 0 8px;color:#0f172a;">Aanvraag afgewezen</h2>
  <p style="margin:0 0 16px;color:#374151;">Beste ${safe(customer_name)},</p>
  <p style="color:#374151;">Helaas kunnen wij uw reparatieaanvraag voor <strong>${safe(toestel)}</strong> op dit moment niet verwerken.</p>
  ${reasonHtml}
  <p style="margin:16px 0 0;color:#374151;">Neem gerust contact met ons op als u vragen heeft.</p>
  <p style="margin:24px 0 0;color:#94a3b8;font-size:13px;">Met vriendelijke groet,<br/>${safe(companyName)}</p>
</div></body></html>`;
}

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const id = String(body?.id || "").trim();
    const reason = String(body?.reason || "").trim();
    if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });

    const url = new URL(req.url);
    const shopDomain = url.searchParams.get("shop") ?? "";
    const settings = shopDomain ? await getShopSettings(shopDomain).catch(() => ({} as import("@/app/lib/shopify").ShopSettings)) : ({} as import("@/app/lib/shopify").ShopSettings);

    const supabaseAdmin = getSupabaseAdmin();

    const { data, error } = await supabaseAdmin
      .from("repair_requests")
      .update({ status: "rejected" })
      .eq("id", id)
      .select("id, status, customer_name, customer_email, brand, model")
      .single();

    if (error) {
      console.error("Reject update error:", error);
      return NextResponse.json({ error: safe(error.message) }, { status: 500 });
    }

    try {
      const customer_email = safe(data?.customer_email).trim();
      const customer_name = safe(data?.customer_name).trim();

      if (!customer_email) {
        return NextResponse.json({ ok: true, data, mail_sent: false }, { status: 200 });
      }

      const companyName = settings.company_name || "Fixora Pro";
      const subject = `Reparatieaanvraag afgewezen – ${companyName}`;
      const html = buildRejectEmail({ customer_name, brand: data.brand, model: data.model, reason, companyName });

      await sendShopMail(settings, { to: customer_email, subject, html });

      return NextResponse.json({ ok: true, data, mail_sent: true }, { status: 200 });
    } catch (mailErr: any) {
      console.error("Reject mail error:", mailErr);
      return NextResponse.json({ ok: true, data, mail_sent: false, mail_error: safe(mailErr?.message) }, { status: 200 });
    }
  } catch (err: any) {
    console.error("Reject route error:", err);
    return NextResponse.json({ error: "Server error", detail: safe(err?.message || err) }, { status: 500 });
  }
}
