import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { updateShopSettings } from "@/app/lib/shopify";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const BUCKET = "logos";
const MAX_SIZE = 2 * 1024 * 1024; // 2 MB

function getSupabase() {
  return createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  );
}

export async function POST(req: Request) {
  const shopDomain = new URL(req.url).searchParams.get("shop") ?? "";
  if (!shopDomain) return NextResponse.json({ error: "shop param ontbreekt" }, { status: 401 });

  let formData: FormData;
  try {
    formData = await req.formData();
  } catch {
    return NextResponse.json({ error: "Ongeldig formulier" }, { status: 400 });
  }

  const file = formData.get("logo") as File | null;
  if (!file || file.size === 0) return NextResponse.json({ error: "Geen bestand ontvangen" }, { status: 400 });

  const allowed: Record<string, string> = {
    "image/jpeg": "jpg",
    "image/jpg":  "jpg",
    "image/png":  "png",
    "image/webp": "webp",
  };
  const ext = allowed[file.type];
  if (!ext) return NextResponse.json({ error: "Alleen JPEG, PNG of WebP toegestaan" }, { status: 400 });
  if (file.size > MAX_SIZE) return NextResponse.json({ error: "Bestand te groot (max 2 MB)" }, { status: 400 });

  const sb = getSupabase();

  // Maak bucket aan als die nog niet bestaat (publiek leesbaar)
  await sb.storage.createBucket(BUCKET, { public: true }).catch(() => {});

  const path = `${shopDomain}/logo.${ext}`;
  const buffer = Buffer.from(await file.arrayBuffer());

  const { error: uploadError } = await sb.storage
    .from(BUCKET)
    .upload(path, buffer, { contentType: file.type, upsert: true });

  if (uploadError) return NextResponse.json({ error: uploadError.message }, { status: 500 });

  const { data: { publicUrl } } = sb.storage.from(BUCKET).getPublicUrl(path);

  // Sla de URL direct op in shop settings
  await updateShopSettings(shopDomain, { logo_url: publicUrl });

  return NextResponse.json({ url: publicUrl });
}
