import { createClient } from "@supabase/supabase-js";
import { createHmac, timingSafeEqual } from "crypto";

// ── Supabase client (service role) ──────────────────────────────────────────
function getSupabase() {
  return createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

// ── Types ────────────────────────────────────────────────────────────────────
export type ShopSettings = {
  company_name?: string;
  company_tagline?: string;
  address_line1?: string;
  address_line2?: string;
  phone?: string;
  email?: string;
  website?: string;
  kvk?: string;
  btw?: string;
  iban?: string;
  bic?: string;
  logo_url?: string;
  notify_email?: string;
  // Mail provider
  mail_mode?: "mailgun" | "smtp";
  smtp_email?: string;
  smtp_password?: string;
  smtp_host?: string;
  smtp_port?: number;
  smtp_secure?: boolean;
};

export type Shop = {
  id: string;
  shop_domain: string;
  access_token: string;
  scopes: string;
  installed_at: string;
  uninstalled_at: string | null;
  settings_json: ShopSettings;
  subscription_status: string | null;
  subscription_id: string | null;
  trial_ends_at: string | null;
};

// ── Shop DB helpers ──────────────────────────────────────────────────────────
export async function getShopFromDomain(domain: string): Promise<Shop | null> {
  const sb = getSupabase();
  const { data, error } = await sb
    .from("shops")
    .select("*")
    .eq("shop_domain", domain)
    .is("uninstalled_at", null)
    .maybeSingle();
  if (error) throw error;
  return data as Shop | null;
}

export async function upsertShop(
  domain: string,
  accessToken: string,
  scopes: string
): Promise<Shop> {
  const sb = getSupabase();
  const { data, error } = await sb
    .from("shops")
    .upsert(
      {
        shop_domain: domain,
        access_token: accessToken,
        scopes,
        uninstalled_at: null,
      },
      { onConflict: "shop_domain" }
    )
    .select()
    .single();
  if (error) throw error;
  return data as Shop;
}

export async function markShopUninstalled(domain: string): Promise<void> {
  const sb = getSupabase();
  const { error } = await sb
    .from("shops")
    .update({ uninstalled_at: new Date().toISOString() })
    .eq("shop_domain", domain);
  if (error) throw error;
}

export async function getShopSettings(domain: string): Promise<ShopSettings> {
  const shop = await getShopFromDomain(domain);
  return shop?.settings_json ?? {};
}

export async function updateShopSettings(
  domain: string,
  patch: ShopSettings
): Promise<void> {
  const sb = getSupabase();
  const { error } = await sb.rpc("merge_shop_settings", {
    p_shop_domain: domain,
    p_patch: patch,
  });
  if (error) {
    // Fallback: lees + merge + schrijf als RPC niet bestaat
    const current = await getShopSettings(domain);
    const merged = { ...current, ...patch };
    const { error: e2 } = await sb
      .from("shops")
      .update({ settings_json: merged })
      .eq("shop_domain", domain);
    if (e2) throw e2;
  }
}

// ── Shop sessie validatie (voor protected API routes) ───────────────────────
export async function requireShopSession(req: Request): Promise<Shop> {
  const url = new URL(req.url);
  const shopDomain =
    url.searchParams.get("shop") ??
    req.headers.get("x-shop-domain") ??
    "";

  if (!shopDomain) {
    throw new Response(JSON.stringify({ error: "shop param ontbreekt" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  const shop = await getShopFromDomain(shopDomain);
  if (!shop) {
    throw new Response(
      JSON.stringify({ error: "Shop niet geïnstalleerd of verwijderd" }),
      { status: 401, headers: { "Content-Type": "application/json" } }
    );
  }

  return shop;
}

// ── Shopify OAuth helpers ────────────────────────────────────────────────────
export function buildAuthUrl(shop: string, state: string): string {
  const apiKey = process.env.SHOPIFY_API_KEY ?? process.env.NEXT_PUBLIC_SHOPIFY_API_KEY ?? "";
  const scopes = process.env.SHOPIFY_SCOPES ?? "read_themes,write_themes";
  const redirectUri = `${process.env.APP_URL}/api/auth/callback`;
  return (
    `https://${shop}/admin/oauth/authorize` +
    `?client_id=${apiKey}` +
    `&scope=${encodeURIComponent(scopes)}` +
    `&redirect_uri=${encodeURIComponent(redirectUri)}` +
    `&state=${state}`
  );
}

export async function exchangeCodeForToken(
  shop: string,
  code: string
): Promise<{ access_token: string; scope: string }> {
  const res = await fetch(`https://${shop}/admin/oauth/access_token`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      client_id: process.env.SHOPIFY_API_KEY ?? process.env.NEXT_PUBLIC_SHOPIFY_API_KEY,
      client_secret: process.env.SHOPIFY_API_SECRET,
      code,
    }),
  });
  if (!res.ok) {
    throw new Error(`Token exchange mislukt: ${res.status}`);
  }
  return res.json();
}

// Verifieer Shopify OAuth HMAC (query string van callback)
export function verifyOAuthHmac(params: URLSearchParams): boolean {
  const hmac = params.get("hmac");
  if (!hmac) return false;

  const message = [...params.entries()]
    .filter(([k]) => k !== "hmac")
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${k}=${v}`)
    .join("&");

  const expected = createHmac("sha256", process.env.SHOPIFY_API_SECRET!)
    .update(message)
    .digest("hex");

  try {
    return timingSafeEqual(
      Buffer.from(expected, "hex"),
      Buffer.from(hmac, "hex")
    );
  } catch {
    return false;
  }
}

// Verifieer Shopify webhook HMAC (X-Shopify-Hmac-SHA256 header, base64)
export async function verifyWebhookHmac(req: Request): Promise<{ valid: boolean; body: string }> {
  const hmacHeader = req.headers.get("X-Shopify-Hmac-SHA256") ?? "";
  const body = await req.text();

  const expected = createHmac("sha256", process.env.SHOPIFY_API_SECRET!)
    .update(body, "utf8")
    .digest("base64");

  let valid = false;
  try {
    valid = timingSafeEqual(
      Buffer.from(expected),
      Buffer.from(hmacHeader)
    );
  } catch {
    valid = false;
  }

  return { valid, body };
}

// Verifieer App Proxy handtekening
export function verifyProxySignature(searchParams: URLSearchParams): boolean {
  const sig = searchParams.get("signature");
  if (!sig) return false;

  const message = [...searchParams.entries()]
    .filter(([k]) => k !== "signature")
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${k}=${v}`)
    .join("");

  const expected = createHmac("sha256", process.env.SHOPIFY_API_SECRET!)
    .update(message)
    .digest("hex");

  try {
    return timingSafeEqual(
      Buffer.from(expected, "hex"),
      Buffer.from(sig, "hex")
    );
  } catch {
    return false;
  }
}

export async function updateShopAccessToken(domain: string, accessToken: string): Promise<void> {
  const sb = getSupabase();
  const { error } = await sb
    .from("shops")
    .update({ access_token: accessToken })
    .eq("shop_domain", domain);
  if (error) throw error;
}

// Wissel een App Bridge session token in voor een expiring offline access token
export async function exchangeSessionToken(shop: string, sessionToken: string): Promise<string> {
  const apiKey = process.env.SHOPIFY_API_KEY ?? process.env.NEXT_PUBLIC_SHOPIFY_API_KEY ?? "";
  const apiSecret = process.env.SHOPIFY_API_SECRET ?? "";

  const res = await fetch(`https://${shop}/admin/oauth/access_token`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      client_id: apiKey,
      client_secret: apiSecret,
      subject_token: sessionToken,
      subject_token_type: "urn:ietf:params:oauth:token-type:id_token",
      grant_type: "urn:ietf:params:oauth:grant-type:token-exchange",
      requested_token_type: "urn:shopify:params:oauth:token-type:offline-access-token",
    }),
  });

  if (!res.ok) throw new Error(`Token exchange mislukt: ${res.status} ${await res.text()}`);
  const data = await res.json();
  if (!data.access_token) throw new Error("Geen access_token in token exchange response");
  return data.access_token;
}

export async function updateShopSubscription(
  domain: string,
  data: {
    subscription_status?: string | null;
    subscription_id?: string | null;
    trial_ends_at?: string | null;
  }
): Promise<void> {
  const sb = getSupabase();
  const { error } = await sb.from("shops").update(data).eq("shop_domain", domain);
  if (error) throw error;
}

// Saniteer shop domain (alleen *.myshopify.com of custom domains toegestaan)
export function sanitizeShopDomain(input: string): string | null {
  const cleaned = input.trim().toLowerCase().replace(/^https?:\/\//, "");
  if (/^[a-z0-9-]+\.myshopify\.com$/.test(cleaned)) return cleaned;
  return null;
}
