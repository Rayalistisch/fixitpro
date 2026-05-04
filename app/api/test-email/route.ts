import { NextResponse } from "next/server";
import { requireShopSession } from "@/app/lib/shopify";
import { sendShopMail } from "@/app/lib/mailer";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const shop = await requireShopSession(req);
    const settings = shop.settings_json;

    const to = settings.email || settings.notify_email;
    if (!to) {
      return NextResponse.json(
        { error: "Geen e-mailadres gevonden in instellingen." },
        { status: 400 }
      );
    }

    const companyName = settings.company_name || "Fixora Pro";

    await sendShopMail(settings, {
      to,
      subject: `Testmail van ${companyName}`,
      html: `
        <div style="font-family:sans-serif;max-width:520px;margin:0 auto;padding:32px 16px;">
          <h2 style="color:#0f172a;margin:0 0 12px;">Testmail gelukt!</h2>
          <p style="color:#374151;margin:0 0 8px;">
            Als je deze mail ontvangt, werkt je e-mailconfiguratie correct.
          </p>
          <p style="color:#64748b;font-size:13px;margin:24px 0 0;">
            Verstuurd door ${companyName} via Fixora Pro.
          </p>
        </div>
      `,
    });

    return NextResponse.json({ ok: true, to });
  } catch (err: any) {
    if (err instanceof Response) return err;
    console.error("test-email error:", err);
    return NextResponse.json(
      { error: err?.message || "Versturen mislukt" },
      { status: 500 }
    );
  }
}
