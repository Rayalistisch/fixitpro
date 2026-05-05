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
      if (error) {
        // shop_domain kolom bestaat nog niet → haal alle merken op (single-tenant fallback)
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
      if (error && shop) {
        // shop_domain kolom bestaat niet — opnieuw zonder filter
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

// POST /api/catalog — nieuwe reparatie toevoegen (enkelvoudig of bulk)
export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));

    // BULK MODE: body is een array van rijen
    if (Array.isArray(body)) {
      if (body.length === 0) {
        return NextResponse.json({ error: "Lege array meegegeven" }, { status: 400 });
      }
      if (body.length > 500) {
        return NextResponse.json({ error: "Maximaal 500 rijen per bulk-insert" }, { status: 400 });
      }

      const rows = body.map((item: any) => {
        const quality = safe(item.quality) || "Officieel";
        return {
          brand: cap(item.brand),
          model: safe(item.model),
          color: cap(item.color),
          repair_type: cap(item.repair_type),
          quality,
          price: item.price !== undefined && item.price !== null && item.price !== ""
            ? Number(String(item.price).replace(",", ".")) || null
            : null,
          show_quality: item.show_quality !== undefined ? !!item.show_quality : defaultShowQuality(quality),
        };
      });

      for (const row of rows) {
        if (!row.brand || !row.model || !row.color || !row.repair_type) {
          return NextResponse.json(
            { error: "Elk item vereist brand, model, color en repair_type" },
            { status: 400 }
          );
        }
      }

      const sb = getAdmin();
      const { error } = await sb.from("repair_catalog").insert(rows);
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      return NextResponse.json({ ok: true, count: rows.length });
    }

    // SINGLE MODE: bestaande logica
    const quality = safe(body.quality) || "Officieel";
    const row = {
      brand: cap(body.brand),
      model: safe(body.model),
      color: cap(body.color),
      repair_type: cap(body.repair_type),
      quality,
      price: body.price !== "" && body.price !== null && body.price !== undefined
        ? Number(String(body.price).replace(",", ".")) || null
        : null,
      show_quality: body.show_quality !== undefined ? !!body.show_quality : defaultShowQuality(quality),
    };

    if (!row.brand || !row.model || !row.color || !row.repair_type) {
      return NextResponse.json({ error: "Merk, model, kleur en reparatietype zijn verplicht" }, { status: 400 });
    }

    const sb = getAdmin();
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
    const body = await req.json().catch(() => ({}));
    const id = safe(body.id);
    if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });

    const patch: Record<string, any> = {};
    if (body.price !== undefined) {
      patch.price = body.price !== "" && body.price !== null
        ? Number(String(body.price).replace(",", ".")) || null
        : null;
    }
    if (body.quality !== undefined) patch.quality = safe(body.quality) || "Officieel";
    if (body.repair_type !== undefined) patch.repair_type = cap(body.repair_type);
    if (body.color !== undefined) patch.color = cap(body.color);
    if (body.model !== undefined) patch.model = cap(body.model);
    if (body.brand !== undefined) patch.brand = cap(body.brand);
    if (body.show_quality !== undefined) patch.show_quality = !!body.show_quality;

    const sb = getAdmin();
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
    const body = await req.json().catch(() => ({}));

    // Bulk-delete op quality (alleen "Pulled" toegestaan als veiligheidsmaatregel)
    if (!body.id && body.quality === "Pulled") {
      const sb = getAdmin();
      const { error } = await sb.from("repair_catalog").delete().eq("quality", "Pulled");
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      return NextResponse.json({ ok: true, deleted: "Pulled" });
    }

    const id = safe(body.id);
    if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });

    const sb = getAdmin();
    const { error } = await sb.from("repair_catalog").delete().eq("id", id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
