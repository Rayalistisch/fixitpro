import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import fs from "fs";
import path from "path";
import type { ShopSettings } from "@/app/lib/shopify";

// ── Kleuren (identiek aan website PDF) ──────────────────────
const BLUE:   [number, number, number] = [12,  100, 160];
const DARK:   [number, number, number] = [30,  35,  45];
const MUTED:  [number, number, number] = [110, 120, 135];
const LINE:   [number, number, number] = [210, 213, 216];

export type OfferInput = {
  id: string;
  customer_name?: string;
  customer_email?: string;
  customer_phone?: string;
  brand?: string;
  model?: string;
  color?: string;
  issue?: string;
  quality?: string;
  price_text?: string;
  preferred_date?: string;
  preferred_time?: string;
};

export async function buildOfferPdf(input: OfferInput, branding: ShopSettings = {}): Promise<Buffer> {
  const companyName = branding.company_name || "Fixora Pro";
  const doc    = new jsPDF({ unit: "mm", format: "a4" });
  const pageW  = doc.internal.pageSize.getWidth();
  const pageH  = doc.internal.pageSize.getHeight();
  const margin = 18;

  let y = 18;

  // ── Logo ─────────────────────────────────────────────────────
  let logoPlaced = false;
  try {
    if (branding.logo_url) {
      const res = await fetch(branding.logo_url);
      if (res.ok) {
        const buf = Buffer.from(await res.arrayBuffer());
        const isPng = branding.logo_url.toLowerCase().includes(".png");
        const ext  = isPng ? "PNG" : "JPEG";
        const mime = isPng ? "image/png" : "image/jpeg";
        doc.addImage(`data:${mime};base64,${buf.toString("base64")}`, ext, margin, y - 2, 0, 13);
        logoPlaced = true;
      }
    }
    if (!logoPlaced) {
      for (const name of ["logo.png", "logo.jpeg", "logo.jpg"]) {
        const logoPath = path.join(process.cwd(), "public", name);
        if (fs.existsSync(logoPath)) {
          const ext  = name.endsWith(".png") ? "PNG" : "JPEG";
          const mime = name.endsWith(".png") ? "image/png" : "image/jpeg";
          doc.addImage(`data:${mime};base64,${fs.readFileSync(logoPath).toString("base64")}`, ext, margin, y - 2, 0, 13);
          logoPlaced = true;
          break;
        }
      }
    }
  } catch { /* valt terug op text */ }

  if (!logoPlaced) {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(22);
    doc.setTextColor(...BLUE);
    doc.text(companyName.toUpperCase(), margin, y + 8);
  }

  if (branding.company_tagline) {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7.5);
    doc.setTextColor(...MUTED);
    doc.text(branding.company_tagline, margin, y + 16);
  }

  // ── Adresblok rechts ─────────────────────────────────────
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8.5);
  doc.setTextColor(...MUTED);
  const adresLines = [
    branding.address_line1 ? `A  ${branding.address_line1}` : null,
    branding.address_line2 ? `    ${branding.address_line2}` : null,
    branding.phone         ? `T  ${branding.phone}`          : null,
    branding.email         ? `E  ${branding.email}`          : null,
  ].filter(Boolean) as string[];
  adresLines.forEach((line, i) => {
    doc.text(line, pageW - margin, y + i * 5.5, { align: "right" });
  });

  // ── Scheidingslijn ──────────────────────────────────────
  y += 24;
  doc.setDrawColor(...LINE);
  doc.setLineWidth(0.3);
  doc.line(margin, y, pageW - margin, y);
  y += 12;

  // ── Offerte-titel + datum/ref ───────────────────────────
  doc.setFont("helvetica", "bold");
  doc.setFontSize(15);
  doc.setTextColor(...DARK);
  doc.text("Reparatie Offerte", margin, y);

  const dateStr = new Date().toLocaleDateString("nl-NL", {
    day: "2-digit", month: "long", year: "numeric",
  });
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8.5);
  doc.setTextColor(...MUTED);
  doc.text("Datum:       " + dateStr,      pageW - margin, y - 5, { align: "right" });
  doc.text("Referentie: " + (input.id || "-"), pageW - margin, y,     { align: "right" });

  y += 12;

  // ── Toestel-chip ────────────────────────────────────────
  const deviceLabel = [input.brand, input.model, input.color].filter(Boolean).join("  ·  ");
  doc.setFillColor(243, 246, 250);
  doc.roundedRect(margin, y, pageW - margin * 2, 18, 1.5, 1.5, "F");
  doc.setFont("helvetica", "normal");
  doc.setFontSize(7);
  doc.setTextColor(...MUTED);
  doc.text("TOESTEL", margin + 5, y + 6);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.setTextColor(...DARK);
  doc.text(deviceLabel || "Onbekend toestel", margin + 5, y + 13);
  y += 26;

  // ── Klantgegevens ────────────────────────────────────────
  const contactLine = [input.customer_phone, input.customer_email].filter(Boolean).join("   ·   ");
  const klantLines  = [contactLine].filter(Boolean);
  if (input.customer_name || klantLines.length) {
    const klantH = 8 + (input.customer_name ? 7 : 0) + klantLines.length * 5.5 + 4;
    doc.setFillColor(243, 246, 250);
    doc.roundedRect(margin, y, pageW - margin * 2, klantH, 1.5, 1.5, "F");
    let ky = y + 6;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7);
    doc.setTextColor(...MUTED);
    doc.text("KLANTGEGEVENS", margin + 5, ky);
    ky += 7;
    if (input.customer_name) {
      doc.setFont("helvetica", "bold");
      doc.setFontSize(10.5);
      doc.setTextColor(...DARK);
      doc.text(input.customer_name, margin + 5, ky);
      ky += 5.5;
    }
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8.5);
    doc.setTextColor(...MUTED);
    klantLines.forEach((line) => { doc.text(line, margin + 5, ky); ky += 5.5; });
    y += klantH + 8;
  }

  // ── Afgesproken datum ───────────────────────────────────
  if (input.preferred_date || input.preferred_time) {
    let afsprD: string | null = null;
    if (input.preferred_date) {
      try {
        afsprD = new Date(input.preferred_date + "T00:00:00").toLocaleDateString("nl-NL", {
          weekday: "long", day: "numeric", month: "long", year: "numeric",
        });
      } catch {
        afsprD = input.preferred_date;
      }
    }
    const afsprStr = [afsprD, input.preferred_time ? `om ${input.preferred_time}` : null]
      .filter(Boolean).join(" ");
    doc.setFillColor(235, 245, 255);
    doc.roundedRect(margin, y, pageW - margin * 2, 18, 1.5, 1.5, "F");
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7);
    doc.setTextColor(...MUTED);
    doc.text("AFGESPROKEN DATUM", margin + 5, y + 6);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.setTextColor(...BLUE);
    doc.text(afsprStr, margin + 5, y + 13);
    y += 26;
  }

  // ── Reparaties tabel ────────────────────────────────────
  const showQualCol = !!(input.quality?.trim());

  doc.setFont("helvetica", "bold");
  doc.setFontSize(7.5);
  doc.setTextColor(...MUTED);
  doc.text("REPARATIES", margin, y);
  y += 4;

  const repairRow = showQualCol
    ? [input.issue || "Reparatie", input.quality!, input.price_text || "Op aanvraag"]
    : [input.issue || "Reparatie", input.price_text || "Op aanvraag"];

  autoTable(doc, {
    startY: y,
    margin: { left: margin, right: margin },
    head: [showQualCol ? ["Omschrijving", "Kwaliteit", "Prijs"] : ["Omschrijving", "Prijs"]],
    body: [repairRow],
    headStyles: {
      fillColor: BLUE,
      textColor: 255,
      fontStyle: "bold",
      fontSize: 8.5,
      cellPadding: { top: 4, bottom: 4, left: 5, right: 5 },
    },
    bodyStyles: {
      textColor: DARK,
      fontSize: 9.5,
      cellPadding: { top: 4, bottom: 4, left: 5, right: 5 },
    },
    columnStyles: showQualCol
      ? { 2: { halign: "right", fontStyle: "bold", cellWidth: 32 } }
      : { 1: { halign: "right", fontStyle: "bold", cellWidth: 32 } },
    alternateRowStyles: { fillColor: [247, 249, 252] },
    tableLineColor: [220, 225, 232],
    tableLineWidth: 0.15,
  });

  y = (doc as any).lastAutoTable.finalY + 14;

  // ── Totaal ──────────────────────────────────────────────
  doc.setDrawColor(...LINE);
  doc.setLineWidth(0.3);
  doc.line(margin, y, pageW - margin, y);
  y += 9;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9.5);
  doc.setTextColor(...MUTED);
  doc.text("Totaal (incl. 21% btw)", margin, y);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(13);
  doc.setTextColor(...BLUE);
  doc.text(input.price_text || "Op aanvraag", pageW - margin, y, { align: "right" });

  // ── Footer ───────────────────────────────────────────────
  const footerY = pageH - 12;
  doc.setDrawColor(...LINE);
  doc.setLineWidth(0.3);
  doc.line(margin, footerY - 7, pageW - margin, footerY - 7);

  const footerParts = [
    branding.kvk  ? `kvk  ${branding.kvk}`   : null,
    branding.btw  ? `btw nr  ${branding.btw}` : null,
    branding.iban ? `iban  ${branding.iban}`  : null,
    branding.bic  ? `bic  ${branding.bic}`   : null,
  ].filter(Boolean).join("     ");

  doc.setFont("helvetica", "normal");
  doc.setFontSize(7);
  doc.setTextColor(...MUTED);
  if (footerParts) doc.text(footerParts, margin, footerY);

  const websiteLabel = branding.website || companyName;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8);
  doc.setTextColor(...BLUE);
  doc.text(websiteLabel, pageW - margin, footerY, { align: "right" });

  return Buffer.from(doc.output("arraybuffer"));
}

// ── Email helpers ────────────────────────────────────────────

function emailDetailRow(label: string, value?: string | null): string {
  if (!value) return "";
  return `
    <tr>
      <td style="padding:10px 12px 10px 0;border-bottom:1px solid #f1f5f9;width:130px;vertical-align:top">
        <span style="font-family:Helvetica,Arial,sans-serif;font-size:11px;font-weight:600;color:#94a3b8;text-transform:uppercase;letter-spacing:0.06em">${label}</span>
      </td>
      <td style="padding:10px 0 10px 0;border-bottom:1px solid #f1f5f9;vertical-align:top">
        <span style="font-family:Helvetica,Arial,sans-serif;font-size:13px;font-weight:500;color:#0f172a">${value}</span>
      </td>
    </tr>`;
}

function fmtEmailDate(date?: string | null, time?: string | null): string {
  const parts: string[] = [];
  if (date) {
    try {
      const d = new Date(date + "T00:00:00");
      parts.push(d.toLocaleDateString("nl-NL", { day: "numeric", month: "long", year: "numeric" }));
    } catch {
      parts.push(date);
    }
  }
  if (time) parts.push(`om ${time}`);
  return parts.join(" ");
}

export function buildOfferEmail(data: {
  customer_name?: string;
  id?: string;
  logoUrl?: string;
  brand?: string;
  model?: string;
  color?: string;
  issue?: string;
  quality?: string;
  price_text?: string;
  preferred_date?: string;
  preferred_time?: string;
}, branding: ShopSettings = {}): string {
  const name = data.customer_name || "klant";
  const companyName = branding.company_name || "Fixora Pro";
  const logoSrc = branding.logo_url || data.logoUrl;

  const logoHtml = logoSrc
    ? `<img src="${logoSrc}" alt="${companyName}" width="48" height="48" border="0" style="display:block;width:48px;height:48px;border-radius:10px;object-fit:cover">`
    : `<span style="font-family:Helvetica,Arial,sans-serif;font-size:22px;font-weight:700;color:#1e3a5f">${companyName}</span>`;

  const toestel = [data.brand, data.model, data.color].filter(Boolean).join(" ") || null;
  const voorkeur = fmtEmailDate(data.preferred_date, data.preferred_time) || null;

  const detailRows = [
    emailDetailRow("Merk",      data.brand),
    emailDetailRow("Model",     data.model),
    emailDetailRow("Kleur",     data.color),
    emailDetailRow("Reparatie", data.issue),
    emailDetailRow("Kwaliteit", data.quality),
    emailDetailRow("Prijs",     data.price_text),
    emailDetailRow("Voorkeur",  voorkeur),
  ].join("");

  return `
<table border="0" cellpadding="0" cellspacing="0" width="100%" style="table-layout:fixed;background-color:#f9f9f9">
  <tbody>
    <tr>
      <td style="padding-right:10px;padding-left:10px" align="center" valign="top">

        <!-- Hoofdkaart -->
        <table border="0" cellpadding="0" cellspacing="0" width="100%" style="max-width:600px">
          <tbody>
            <tr>
              <td align="center" valign="top">
                <table border="0" cellpadding="0" cellspacing="0" width="100%" style="background-color:#fff;border-color:#e5e5e5;border-style:solid;border-width:0 1px 1px 1px">
                  <tbody>
                    <!-- Blauwe accentlijn boven -->
                    <tr>
                      <td style="background-color:#3b82f6;font-size:1px;line-height:3px" height="3">&nbsp;</td>
                    </tr>
                    <!-- Logo -->
                    <tr>
                      <td style="padding-top:40px;padding-bottom:16px" align="center" valign="middle">
                        ${logoHtml}
                      </td>
                    </tr>
                    <!-- Titel -->
                    <tr>
                      <td style="padding-bottom:8px;padding-left:20px;padding-right:20px" align="center" valign="top">
                        <h2 style="color:#0f172a;font-family:Helvetica,Arial,sans-serif;font-size:26px;font-weight:600;line-height:34px;text-align:center;padding:0;margin:0">Reparatie goedgekeurd ✅</h2>
                      </td>
                    </tr>
                    <!-- Subtitel -->
                    <tr>
                      <td style="padding-bottom:20px;padding-left:20px;padding-right:20px" align="center" valign="top">
                        <h4 style="color:#64748b;font-family:Helvetica,Arial,sans-serif;font-size:15px;font-weight:400;line-height:22px;text-align:center;padding:0;margin:0">Hallo ${name}</h4>
                      </td>
                    </tr>
                    <!-- Intro tekst -->
                    <tr>
                      <td style="padding-left:40px;padding-right:40px" align="center" valign="top">
                        <p style="color:#475569;font-family:Helvetica,Arial,sans-serif;font-size:14px;font-weight:400;line-height:22px;text-align:center;padding:0;margin:0">
                          Je reparatie-aanvraag is goedgekeurd.<br>
                          In de bijlage vind je de offerte als PDF.
                        </p>
                      </td>
                    </tr>
                    <!-- Detail tabel -->
                    <tr>
                      <td style="padding:24px 60px 0" align="center" valign="top">
                        <table border="0" cellpadding="0" cellspacing="0" width="100%" style="border-top:1px solid #e2e8f0">
                          <tbody>
                            ${detailRows}
                          </tbody>
                        </table>
                      </td>
                    </tr>
                    <!-- Spacer -->
                    <tr>
                      <td style="font-size:1px;line-height:1px" height="28">&nbsp;</td>
                    </tr>
                    <!-- Ondertekening -->
                    <tr>
                      <td style="padding-bottom:40px;padding-left:60px;padding-right:60px" align="center" valign="middle">
                        <p style="color:#475569;font-family:Helvetica,Arial,sans-serif;font-size:14px;font-weight:400;line-height:22px;text-align:center;padding:0;margin:0">
                          Met vriendelijke groet,<br>
                          <strong style="color:#0f172a">${companyName}</strong>
                        </p>
                      </td>
                    </tr>
                  </tbody>
                </table>
                <!-- Spacer onder kaart -->
                <table border="0" cellpadding="0" cellspacing="0" width="100%">
                  <tbody>
                    <tr><td style="font-size:1px;line-height:1px" height="30">&nbsp;</td></tr>
                  </tbody>
                </table>
              </td>
            </tr>
          </tbody>
        </table>

        <!-- Footer -->
        <table border="0" cellpadding="0" cellspacing="0" width="100%" style="max-width:600px">
          <tbody>
            <tr>
              <td align="center" valign="top">
                <table border="0" cellpadding="0" cellspacing="0" width="100%">
                  <tbody>
                    <tr>
                      <td style="padding:10px" align="center" valign="top">
                        <p style="color:#bbb;font-family:Helvetica,Arial,sans-serif;font-size:12px;font-weight:400;line-height:20px;text-align:center;padding:0;margin:0">© ${companyName}</p>
                      </td>
                    </tr>
                    <tr>
                      <td style="padding:0 10px 20px" align="center" valign="top">
                        <p style="color:#bbb;font-family:Helvetica,Arial,sans-serif;font-size:12px;font-weight:400;line-height:20px;text-align:center;padding:0;margin:0">Referentie: ${data.id ?? "-"}</p>
                      </td>
                    </tr>
                    <tr><td style="font-size:1px;line-height:1px" height="30">&nbsp;</td></tr>
                  </tbody>
                </table>
              </td>
            </tr>
          </tbody>
        </table>

      </td>
    </tr>
  </tbody>
</table>
  `;
}

export function buildOfferQuoteEmail(data: OfferInput & {
  acceptUrl: string;
  rejectUrl: string;
}, branding: ShopSettings = {}): string {
  const name = data.customer_name || "klant";
  const companyName = branding.company_name || "Fixora Pro";

  const logoHtml = branding.logo_url
    ? `<img src="${branding.logo_url}" alt="${companyName}" width="48" height="48" border="0" style="display:block;width:48px;height:48px;border-radius:10px;object-fit:cover">`
    : `<span style="font-family:Helvetica,Arial,sans-serif;font-size:22px;font-weight:700;color:#1e3a5f">${companyName}</span>`;

  const toestel = [data.brand, data.model, data.color].filter(Boolean).join(" ") || null;
  const voorkeur = fmtEmailDate(data.preferred_date, data.preferred_time) || null;

  const detailRows = [
    emailDetailRow("Merk",      data.brand),
    emailDetailRow("Model",     data.model),
    emailDetailRow("Kleur",     data.color),
    emailDetailRow("Reparatie", data.issue),
    emailDetailRow("Kwaliteit", data.quality),
    emailDetailRow("Prijs",     data.price_text),
    emailDetailRow("Voorkeur",  voorkeur),
  ].join("");

  return `
<table border="0" cellpadding="0" cellspacing="0" width="100%" style="table-layout:fixed;background-color:#f9f9f9">
  <tbody>
    <tr>
      <td style="padding-right:10px;padding-left:10px" align="center" valign="top">

        <table border="0" cellpadding="0" cellspacing="0" width="100%" style="max-width:600px">
          <tbody>
            <tr>
              <td align="center" valign="top">
                <table border="0" cellpadding="0" cellspacing="0" width="100%" style="background-color:#fff;border-color:#e5e5e5;border-style:solid;border-width:0 1px 1px 1px">
                  <tbody>
                    <tr>
                      <td style="background-color:#f59e0b;font-size:1px;line-height:3px" height="3">&nbsp;</td>
                    </tr>
                    <tr>
                      <td style="padding-top:40px;padding-bottom:16px" align="center" valign="middle">
                        ${logoHtml}
                      </td>
                    </tr>
                    <tr>
                      <td style="padding-bottom:8px;padding-left:20px;padding-right:20px" align="center" valign="top">
                        <h2 style="color:#0f172a;font-family:Helvetica,Arial,sans-serif;font-size:26px;font-weight:600;line-height:34px;text-align:center;padding:0;margin:0">Offerte ter goedkeuring 📋</h2>
                      </td>
                    </tr>
                    <tr>
                      <td style="padding-bottom:20px;padding-left:20px;padding-right:20px" align="center" valign="top">
                        <h4 style="color:#64748b;font-family:Helvetica,Arial,sans-serif;font-size:15px;font-weight:400;line-height:22px;text-align:center;padding:0;margin:0">Hallo ${name}</h4>
                      </td>
                    </tr>
                    <tr>
                      <td style="padding-left:40px;padding-right:40px" align="center" valign="top">
                        <p style="color:#475569;font-family:Helvetica,Arial,sans-serif;font-size:14px;font-weight:400;line-height:22px;text-align:center;padding:0;margin:0">
                          Hierbij ontvangt u onze offerte voor de reparatie van uw ${toestel ? `<strong>${toestel}</strong>` : "apparaat"}.<br>
                          In de bijlage vindt u de offerte als PDF.<br>
                          Bevestig hieronder of u akkoord gaat.
                        </p>
                      </td>
                    </tr>
                    <tr>
                      <td style="padding:24px 60px 0" align="center" valign="top">
                        <table border="0" cellpadding="0" cellspacing="0" width="100%" style="border-top:1px solid #e2e8f0">
                          <tbody>
                            ${detailRows}
                          </tbody>
                        </table>
                      </td>
                    </tr>
                    <!-- CTA knoppen -->
                    <tr>
                      <td style="padding:28px 40px 8px" align="center" valign="top">
                        <table border="0" cellpadding="0" cellspacing="0">
                          <tbody>
                            <tr>
                              <td style="padding:0 8px 0 0">
                                <a href="${data.acceptUrl}" style="display:inline-block;padding:14px 32px;background:#22c55e;color:#ffffff;font-family:Helvetica,Arial,sans-serif;font-size:15px;font-weight:700;border-radius:10px;text-decoration:none;line-height:1">✓&nbsp;&nbsp;Ja, akkoord</a>
                              </td>
                              <td style="padding:0 0 0 8px">
                                <a href="${data.rejectUrl}" style="display:inline-block;padding:14px 32px;background:#f1f5f9;color:#64748b;font-family:Helvetica,Arial,sans-serif;font-size:15px;font-weight:700;border-radius:10px;text-decoration:none;line-height:1">Nee, afwijzen</a>
                              </td>
                            </tr>
                          </tbody>
                        </table>
                      </td>
                    </tr>
                    <tr>
                      <td style="font-size:1px;line-height:1px" height="28">&nbsp;</td>
                    </tr>
                    <tr>
                      <td style="padding-bottom:40px;padding-left:60px;padding-right:60px" align="center" valign="middle">
                        <p style="color:#475569;font-family:Helvetica,Arial,sans-serif;font-size:14px;font-weight:400;line-height:22px;text-align:center;padding:0;margin:0">
                          Met vriendelijke groet,<br>
                          <strong style="color:#0f172a">${companyName}</strong>
                        </p>
                      </td>
                    </tr>
                  </tbody>
                </table>
                <table border="0" cellpadding="0" cellspacing="0" width="100%">
                  <tbody>
                    <tr><td style="font-size:1px;line-height:1px" height="30">&nbsp;</td></tr>
                  </tbody>
                </table>
              </td>
            </tr>
          </tbody>
        </table>

        <table border="0" cellpadding="0" cellspacing="0" width="100%" style="max-width:600px">
          <tbody>
            <tr>
              <td align="center" valign="top">
                <table border="0" cellpadding="0" cellspacing="0" width="100%">
                  <tbody>
                    <tr>
                      <td style="padding:10px" align="center" valign="top">
                        <p style="color:#bbb;font-family:Helvetica,Arial,sans-serif;font-size:12px;font-weight:400;line-height:20px;text-align:center;padding:0;margin:0">© ${companyName}</p>
                      </td>
                    </tr>
                    <tr>
                      <td style="padding:0 10px 20px" align="center" valign="top">
                        <p style="color:#bbb;font-family:Helvetica,Arial,sans-serif;font-size:12px;font-weight:400;line-height:20px;text-align:center;padding:0;margin:0">Referentie: ${data.id ?? "-"}</p>
                      </td>
                    </tr>
                    <tr><td style="font-size:1px;line-height:1px" height="30">&nbsp;</td></tr>
                  </tbody>
                </table>
              </td>
            </tr>
          </tbody>
        </table>

      </td>
    </tr>
  </tbody>
</table>
  `;
}
