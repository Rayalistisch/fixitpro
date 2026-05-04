import nodemailer from "nodemailer";
import type { ShopSettings } from "./shopify";

export type MailAttachment = {
  filename: string;
  contentType: string;
  data: Buffer;
};

export type MailOptions = {
  to: string;
  cc?: string;
  replyTo?: string;
  subject: string;
  html: string;
  attachments?: MailAttachment[];
};

function detectSmtp(email: string): { host: string; port: number; secure: boolean } {
  const domain = email.split("@")[1]?.toLowerCase() ?? "";
  if (domain === "gmail.com") return { host: "smtp.gmail.com", port: 587, secure: false };
  if (["outlook.com", "hotmail.com", "live.com", "live.nl"].includes(domain))
    return { host: "smtp-mail.outlook.com", port: 587, secure: false };
  if (domain === "yahoo.com") return { host: "smtp.mail.yahoo.com", port: 465, secure: true };
  return { host: `smtp.${domain}`, port: 587, secure: false };
}

export function getSmtpProvider(email: string): string {
  const domain = email.split("@")[1]?.toLowerCase() ?? "";
  if (domain === "gmail.com") return "Gmail";
  if (["outlook.com", "hotmail.com", "live.com", "live.nl"].includes(domain)) return "Outlook / Hotmail";
  if (domain === "yahoo.com") return "Yahoo";
  return domain;
}

async function sendViaMailgun(
  from: string,
  options: MailOptions & { replyTo?: string }
) {
  const apiKey = process.env.MAILGUN_API_KEY;
  const domain = process.env.MAILGUN_DOMAIN;
  const region = (process.env.MAILGUN_REGION || "eu") as "eu" | "us";
  if (!apiKey || !domain) throw new Error("Mailgun niet geconfigureerd (MAILGUN_API_KEY / MAILGUN_DOMAIN ontbreekt)");

  const baseUrl = region === "eu" ? "https://api.eu.mailgun.net" : "https://api.mailgun.net";
  const form = new FormData();
  form.append("from", from);
  form.append("to", options.to);
  if (options.cc) form.append("cc", options.cc);
  if (options.replyTo) form.append("h:Reply-To", options.replyTo);
  form.append("subject", options.subject);
  form.append("html", options.html);
  if (options.attachments?.length) {
    for (const a of options.attachments) {
      form.append("attachment", new Blob([new Uint8Array(a.data)], { type: a.contentType }), a.filename);
    }
  }
  const auth = Buffer.from(`api:${apiKey}`).toString("base64");
  const res = await fetch(`${baseUrl}/v3/${domain}/messages`, {
    method: "POST",
    headers: { Authorization: `Basic ${auth}` },
    body: form as any,
  });
  if (!res.ok) throw new Error(`Mailgun fout ${res.status}: ${await res.text()}`);
}

async function sendViaSmtp(
  from: string,
  host: string,
  port: number,
  secure: boolean,
  user: string,
  pass: string,
  options: MailOptions
) {
  const transport = nodemailer.createTransport({
    host, port, secure,
    auth: { user, pass },
    tls: { rejectUnauthorized: false },
  });
  await transport.sendMail({
    from,
    to: options.to,
    cc: options.cc,
    replyTo: options.replyTo,
    subject: options.subject,
    html: options.html,
    attachments: options.attachments?.map(a => ({
      filename: a.filename,
      content: a.data,
      contentType: a.contentType,
    })),
  });
}

function applyDebug(options: MailOptions): MailOptions {
  const debugTo = (process.env.MAIL_DEBUG_TO || "").trim();
  if (!debugTo) return options;
  return {
    ...options,
    to: debugTo,
    cc: undefined,
    subject: `[DEBUG] ${options.subject}`,
  };
}

/**
 * Send mail using the shop's configured method.
 * Falls back to Mailgun env vars if no SMTP is configured.
 */
export async function sendShopMail(settings: ShopSettings, options: MailOptions): Promise<void> {
  const effective = applyDebug(options);

  const useSmtp =
    settings.mail_mode === "smtp" &&
    !!settings.smtp_email &&
    !!settings.smtp_password;

  if (useSmtp) {
    const auto = detectSmtp(settings.smtp_email!);
    const host = settings.smtp_host || auto.host;
    const port = settings.smtp_port ?? auto.port;
    const secure = settings.smtp_secure ?? auto.secure;
    const name = settings.company_name || "Fixora Pro";
    const from = `${name} <${settings.smtp_email}>`;
    await sendViaSmtp(from, host, port, secure, settings.smtp_email!, settings.smtp_password!, effective);
  } else {
    const domain = process.env.MAILGUN_DOMAIN || "";
    const from = (process.env.MAIL_FROM || `Fixora Pro <postmaster@${domain}>`).trim();
    const replyTo = settings.email || effective.replyTo;
    await sendViaMailgun(from, { ...effective, replyTo });
  }
}

/**
 * Send mail using only env-var Mailgun config (for public/system routes).
 */
export async function sendSystemMail(options: MailOptions): Promise<void> {
  const effective = applyDebug(options);
  const domain = process.env.MAILGUN_DOMAIN || "";
  const from = (process.env.MAIL_FROM || `Fixora Pro <postmaster@${domain}>`).trim();
  await sendViaMailgun(from, effective);
}
