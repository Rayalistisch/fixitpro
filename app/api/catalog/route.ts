import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function getAdmin() {
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || "";
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
  if (!url || !key) throw new Error("Missing Supabase env vars");
  return createClient(url, key, { auth: { persistSession: false } });
}

function safe(v: any) {
  return String(v ?? "").trim().replace(/[<>]/g, "");
}

// Capitalize first letter, leave rest as-is (Apple, iPhone, Samsung)
function cap(v: any) {
  const s = safe(v);
  return s ? s[0].toUpperCase() + s.slice(1) : s;
}

// GET /api/catalog?brand=Apple&model=iPhone+14
// GET /api/catalog?brands=1  → geeft alle unieke merken terug
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const brand = searchParams.get("brand") || "";
  const model = searchParams.get("model") || "";
  const search = searchParams.get("q") || "";
  const shop = searchParams.get("shop") || "";
  const brandsOnly = searchParams.get("brands") === "1";

  try {
    const sb = getAdmin();

    // Alle unieke merken — directe query met optionele shop_domain filter
    if (brandsOnly) {
      let query = sb.from("repair_catalog").select("brand");
      if (shop) query = query.eq("shop_domain", shop) as typeof query;
      const { data, error } = await query;
      if (error || (shop && (!data || data.length === 0))) {
        // Kolom bestaat niet of shop heeft nog geen eigen catalog → fallback op alle data
        const { data: allData, error: allErr } = await sb.from("repair_catalog").select("brand");
        if (allErr) return NextResponse.json({ error: allErr.message }, { status: 500 });
        const brands = [...new Set((allData ?? []).map((r: any) => r.brand).filter(Boolean))].sort();
        return NextResponse.json(brands);
      }
      const brands = [...new Set((data ?? []).map((r: any) => r.brand).filter(Boolean))].sort();
      return NextResponse.json(brands);
    }

    // Unieke modellen voor een merk — pagineer zodat we ALLE rijen krijgen
    const modelsOnly = searchParams.get("models") === "1";
    if (modelsOnly && brand) {
      const PAGE = 1000;
      let offset = 0;
      const modelSet = new Set<string>();
      while (true) {
        let q = sb.from("repair_catalog").select("model").eq("brand", brand).range(offset, offset + PAGE - 1);
        if (shop) {
          const { data, error } = await (q.eq("shop_domain", shop) as typeof q);
          if (error) {
            // shop_domain kolom bestaat niet — query zonder filter
            const { data: d2, error: e2 } = await q;
            if (e2) return NextResponse.json({ error: e2.message }, { status: 500 });
            if (!d2 || d2.length === 0) break;
            d2.forEach((r: { model: string }) => modelSet.add(r.model));
            if (d2.length < PAGE) break;
          } else {
            if (!data || data.length === 0) break;
            data.forEach((r: { model: string }) => modelSet.add(r.model));
            if (data.length < PAGE) break;
          }
        } else {
          const { data, error } = await q;
          if (error) return NextResponse.json({ error: error.message }, { status: 500 });
          if (!data || data.length === 0) break;
          data.forEach((r: { model: string }) => modelSet.add(r.model));
          if (data.length < PAGE) break;
        }
        offset += PAGE;
      }
      return NextResponse.json([...modelSet].sort());
    }

    // Pagineer zodat we altijd alle rijen ophalen, ook bij grote catalogi
    const PAGE = 1000;
    let offset = 0;
    const all: any[] = [];
    while (true) {
      let q = sb
        .from("repair_catalog")
        .select("id, brand, model, color, repair_type, quality, price, show_quality")
        .order("brand").order("model").order("color").order("repair_type").order("quality")
        .range(offset, offset + PAGE - 1);

      if (brand) q = q.eq("brand", brand);
      if (model) q = q.eq("model", model);
      if (search) q = q.or(`brand.ilike.%${search}%,model.ilike.%${search}%,repair_type.ilike.%${search}%`);

      let { data, error } = await (shop ? (q.eq("shop_domain", shop) as typeof q) : q);
      if ((error || (shop && (!data || data.length === 0))) && shop) {
        // Geen data voor deze shop → fallback op globale catalog
        ({ data, error } = await q);
      }
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      if (!data || data.length === 0) break;
      all.push(...data);
      if (data.length < PAGE) break;
      offset += PAGE;
    }
    return NextResponse.json(all);
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

function defaultShowQuality(quality: string): boolean {
  const q = quality.toLowerCase();
  return q === "officieel" || q === "origineel";
}

// Copy-on-first-write: kopieer alle globale rijen naar de shop bij eerste schrijfoperatie
async function ensureShopOwnsData(sb: ReturnType<typeof getAdmin>, shopDomain: string): Promise<void> {
  const { data: existing } = await sb
    .from("repair_catalog").select("id").eq("shop_domain", shopDomain).limit(1);
  if (existing && existing.length > 0) return;

  const { data: template } = await sb
    .from("repair_catalog")
    .select("brand, model, color, repair_type, quality, price, show_quality")
    .neq("shop_domain", shopDomain)
    .limit(2000);
  if (!template || template.length === 0) return;

  const rows = template.map((r: any) => ({ ...r, shop_domain: shopDomain }));
  const BATCH = 200;
  for (let i = 0; i < rows.length; i += BATCH) {
    await sb.from("repair_catalog").insert(rows.slice(i, i + BATCH));
  }
}

// POST /api/catalog — nieuwe reparatie toevoegen (enkelvoudig of bulk)
export async function POST(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const shop = safe(searchParams.get("shop"));
    const body = await req.json().catch(() => ({}));
    const sb = getAdmin();

    if (shop) await ensureShopOwnsData(sb, shop);

    // BULK MODE
    if (Array.isArray(body)) {
      if (body.length === 0) return NextResponse.json({ error: "Lege array meegegeven" }, { status: 400 });
      if (body.length > 500) return NextResponse.json({ error: "Maximaal 500 rijen per bulk-insert" }, { status: 400 });

      const rows = body.map((item: any) => {
        const quality = safe(item.quality) || "Officieel";
        return {
          brand: cap(item.brand), model: safe(item.model), color: cap(item.color),
          repair_type: cap(item.repair_type), quality,
          price: item.price !== undefined && item.price !== null && item.price !== ""
            ? Number(String(item.price).replace(",", ".")) || null : null,
          show_quality: item.show_quality !== undefined ? !!item.show_quality : defaultShowQuality(quality),
          ...(shop ? { shop_domain: shop } : {}),
        };
      });
      for (const row of rows) {
        if (!row.brand || !row.model || !row.color || !row.repair_type)
          return NextResponse.json({ error: "Elk item vereist brand, model, color en repair_type" }, { status: 400 });
      }
      const { error } = await sb.from("repair_catalog").insert(rows);
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      return NextResponse.json({ ok: true, count: rows.length });
    }

    // SINGLE MODE
    const quality = safe(body.quality) || "Officieel";
    const row = {
      brand: cap(body.brand), model: safe(body.model), color: cap(body.color),
      repair_type: cap(body.repair_type), quality,
      price: body.price !== "" && body.price !== null && body.price !== undefined
        ? Number(String(body.price).replace(",", ".")) || null : null,
      show_quality: body.show_quality !== undefined ? !!body.show_quality : defaultShowQuality(quality),
      ...(shop ? { shop_domain: shop } : {}),
    };
    if (!row.brand || !row.model || !row.color || !row.repair_type)
      return NextResponse.json({ error: "Merk, model, kleur en reparatietype zijn verplicht" }, { status: 400 });

    const { data, error } = await sb.from("repair_catalog").insert(row).select("id").single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true, id: data.id });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

// PATCH /api/catalog — prijs of kwaliteit aanpassen
export async function PATCH(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const shop = safe(searchParams.get("shop"));
    const body = await req.json().catch(() => ({}));
    const id = safe(body.id);
    if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });

    const patch: Record<string, any> = {};
    if (body.price !== undefined) patch.price = body.price !== "" && body.price !== null ? Number(String(body.price).replace(",", ".")) || null : null;
    if (body.quality !== undefined) patch.quality = safe(body.quality) || "Officieel";
    if (body.repair_type !== undefined) patch.repair_type = cap(body.repair_type);
    if (body.color !== undefined) patch.color = cap(body.color);
    if (body.model !== undefined) patch.model = cap(body.model);
    if (body.brand !== undefined) patch.brand = cap(body.brand);
    if (body.show_quality !== undefined) patch.show_quality = !!body.show_quality;

    const sb = getAdmin();

    if (shop) {
      // Copy-on-first-write: zorg dat de shop eigen data heeft
      await ensureShopOwnsData(sb, shop);
      // Controleer of de rij al van deze shop is
      const { data: row } = await sb.from("repair_catalog").select("shop_domain, brand").eq("id", id).maybeSingle();
      if (row && row.shop_domain !== shop) {
        // Rij hoort bij een andere shop — zoek de equivalente rij van déze shop
        const { data: ownRow } = await sb.from("repair_catalog")
          .select("id").eq("shop_domain", shop)
          .eq("brand", row.brand ?? "").limit(1).maybeSingle();
        const targetId = ownRow?.id ?? id;
        const { error } = await sb.from("repair_catalog").update(patch).eq("id", targetId).eq("shop_domain", shop);
        if (error) return NextResponse.json({ error: error.message }, { status: 500 });
        return NextResponse.json({ ok: true });
      }
      // Rij is al van deze shop — update alleen als shop_domain klopt
      const { error } = await sb.from("repair_catalog").update(patch).eq("id", id).eq("shop_domain", shop);
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      return NextResponse.json({ ok: true });
    }

    const { error } = await sb.from("repair_catalog").update(patch).eq("id", id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

// DELETE /api/catalog — reparatie verwijderen (enkelvoudig of bulk op quality)
export async function DELETE(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const shop = safe(searchParams.get("shop"));
    const body = await req.json().catch(() => ({}));
    const sb = getAdmin();

    // Bulk-delete op quality (alleen eigen rijen)
    if (!body.id && body.quality === "Pulled") {
      let q = sb.from("repair_catalog").delete().eq("quality", "Pulled");
      if (shop) q = (q as any).eq("shop_domain", shop);
      const { error } = await q;
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      return NextResponse.json({ ok: true, deleted: "Pulled" });
    }

    const id = safe(body.id);
    if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });

    if (shop) {
      await ensureShopOwnsData(sb, shop);
      // Verwijder alleen eigen rijen
      const { error } = await sb.from("repair_catalog").delete().eq("id", id).eq("shop_domain", shop);
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      return NextResponse.json({ ok: true });
    }

    const { error } = await sb.from("repair_catalog").delete().eq("id", id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
