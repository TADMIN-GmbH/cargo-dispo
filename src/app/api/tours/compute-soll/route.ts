/**
 * POST /api/tours/compute-soll
 * Computes soll_netto for all tours since a given date (default 2026-01-01)
 * and writes it back to the tours table.
 *
 * Also callable with a single tour_id to update one tour.
 */
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

function refMonth(tourDate: string, lagMonths: number): string {
  const d = new Date(tourDate);
  d.setMonth(d.getMonth() - lagMonths);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const since: string = body.since ?? "2026-01-01";
  const tourId: string | null = body.tour_id ?? null;

  // Load en2x prices
  const { data: en2xRows } = await supabase.from("diesel_prices").select("month, price_brutto");
  const en2xMap = new Map<string, number>((en2xRows ?? []).map((r) => [r.month, r.price_brutto]));

  // Load BGL prices
  const { data: bglRows } = await supabase.from("bgl_diesel_prices").select("month, price_netto");
  const bglMap = new Map<string, number>((bglRows ?? []).map((r) => [r.month, r.price_netto]));

  // Load BGL floater step table
  const { data: bglSteps } = await supabase
    .from("bgl_floater_steps")
    .select("price_from, price_to, surcharge_pct")
    .order("price_from");
  const steps: { price_from: number; price_to: number; surcharge_pct: number }[] = bglSteps ?? [];

  function bglSurchargePct(price: number): number | null {
    const s = steps.find((x) => price >= x.price_from && price <= x.price_to);
    return s ? s.surcharge_pct : null;
  }

  // Load all pricing models, grouped by customer
  const { data: allModels } = await supabase
    .from("customer_pricing_models")
    .select(
      "customer_id, vehicle_type, km_class, daily_rate_netto, maut_flat, accessory_flat, diesel_base_price, diesel_factor, diesel_source, diesel_lag_months, floater_type, valid_from"
    )
    .order("valid_from", { ascending: false });

  type PricingModel = NonNullable<typeof allModels>[0];

  function getModel(
    customerId: string,
    vehicleType: string,
    kmClass: string | null,
    tourDate: string
  ): PricingModel | null {
    return (
      (allModels ?? []).find(
        (m) =>
          m.customer_id === customerId &&
          m.vehicle_type === vehicleType &&
          (vehicleType !== "SZM" || m.km_class === kmClass || m.km_class === null) &&
          m.valid_from <= tourDate
      ) ?? null
    );
  }

  function computeSoll(
    customerId: string,
    vehicleType: string,
    kmClass: string | null,
    tourDate: string
  ): number | null {
    const pm = getModel(customerId, vehicleType, kmClass, tourDate);
    if (!pm) return null;

    const lag = pm.diesel_lag_months ?? 2;
    const ref = refMonth(tourDate, lag);

    let surchargePct: number;
    if (pm.floater_type === "table") {
      const bglPrice = bglMap.get(ref);
      if (bglPrice === undefined) return null;
      const pct = bglSurchargePct(bglPrice);
      if (pct === null) return null;
      surchargePct = pct;
    } else {
      const en2xBrutto = en2xMap.get(ref);
      if (en2xBrutto === undefined) return null;
      surchargePct =
        ((en2xBrutto / 1.19 - pm.diesel_base_price) / pm.diesel_base_price) * pm.diesel_factor;
    }

    const dieselAmt = pm.daily_rate_netto * (surchargePct / 100);
    return (
      Math.round(
        (pm.daily_rate_netto + (pm.maut_flat ?? 0) + (pm.accessory_flat ?? 0) + dieselAmt) * 100
      ) / 100
    );
  }

  let updated = 0;
  let skipped = 0;
  let total = 0;

  if (tourId) {
    // Single-tour update
    const { data: tours } = await supabase
      .from("tours")
      .select("id, tour_date, customer_id, vehicle_id, vehicle:vehicles(type, km_class)")
      .eq("id", tourId);
    for (const tour of tours ?? []) {
      const vehicle = Array.isArray(tour.vehicle) ? tour.vehicle[0] : tour.vehicle;
      if (!vehicle?.type || !tour.customer_id) { skipped++; continue; }
      const soll = computeSoll(tour.customer_id, vehicle.type, vehicle.km_class ?? null, tour.tour_date);
      if (soll === null) { skipped++; continue; }
      await supabase.from("tours").update({ soll_netto: soll }).eq("id", tour.id);
      updated++;
    }
    total = (tours ?? []).length;
  } else {
    // Paginated full backfill
    const PAGE = 500;
    let offset = 0;
    let fetchedCount = 0;
    do {
      const { data: tours, error: toursError } = await supabase
        .from("tours")
        .select("id, tour_date, customer_id, vehicle_id, vehicle:vehicles(type, km_class)")
        .not("customer_id", "is", null)
        .not("vehicle_id", "is", null)
        .gte("tour_date", since)
        .order("tour_date")
        .range(offset, offset + PAGE - 1);

      if (toursError) return NextResponse.json({ error: toursError.message }, { status: 500 });
      fetchedCount = (tours ?? []).length;
      total += fetchedCount;

      for (const tour of tours ?? []) {
        const vehicle = Array.isArray(tour.vehicle) ? tour.vehicle[0] : tour.vehicle;
        if (!vehicle?.type || !tour.customer_id) { skipped++; continue; }
        const soll = computeSoll(tour.customer_id, vehicle.type, vehicle.km_class ?? null, tour.tour_date);
        if (soll === null) { skipped++; continue; }
        await supabase.from("tours").update({ soll_netto: soll }).eq("id", tour.id);
        updated++;
      }
      offset += PAGE;
    } while (fetchedCount === PAGE);
  }

  return NextResponse.json({ success: true, updated, skipped, total });
}
