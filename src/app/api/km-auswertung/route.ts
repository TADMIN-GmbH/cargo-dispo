export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const customer_id = sp.get("customer_id");
  const year = parseInt(sp.get("year") ?? "");
  const month = parseInt(sp.get("month") ?? "");
  const half = parseInt(sp.get("half") ?? "");

  if (!customer_id || !year || !month || ![1, 2].includes(half)) {
    return NextResponse.json({ error: "customer_id, year, month, half (1|2) required" }, { status: 400 });
  }

  // Compute period bounds
  const period_from = half === 1
    ? new Date(year, month - 1, 1)
    : new Date(year, month - 1, 16);
  const period_to = half === 1
    ? new Date(year, month - 1, 15)
    : new Date(year, month, 0); // last day of month

  const fmt = (d: Date) => d.toISOString().slice(0, 10);

  // Fetch customer
  const { data: customer, error: custErr } = await supabase
    .from("customers")
    .select("id, company_name, km_billing_type")
    .eq("id", customer_id)
    .single();

  if (custErr || !customer) {
    return NextResponse.json({ error: "Customer not found" }, { status: 404 });
  }

  // Fetch tours in period with vehicle info
  const { data: tours, error: toursErr } = await supabase
    .from("tours")
    .select("id, vehicle_id, actual_km, tour_date")
    .eq("customer_id", customer_id)
    .not("vehicle_id", "is", null)
    .gte("tour_date", fmt(period_from))
    .lte("tour_date", fmt(period_to));

  if (toursErr) {
    return NextResponse.json({ error: toursErr.message }, { status: 500 });
  }

  const tourList = tours ?? [];

  // Get unique vehicle_ids
  const vehicleIds = [...new Set(tourList.map((t) => t.vehicle_id as string))];

  if (vehicleIds.length === 0) {
    return NextResponse.json({
      customer,
      period: { from: fmt(period_from), to: fmt(period_to) },
      km_billing_type: customer.km_billing_type,
      rows: [],
      fleet_total: null,
    });
  }

  // Fetch vehicles
  const { data: vehicles, error: vErr } = await supabase
    .from("vehicles")
    .select("id, license_plate, type, km_class")
    .in("id", vehicleIds);

  if (vErr) return NextResponse.json({ error: vErr.message }, { status: 500 });

  const vehicleMap = Object.fromEntries((vehicles ?? []).map((v) => [v.id, v]));

  // Fetch pricing models: for each vehicle, find the latest model valid on period_from
  // We fetch all relevant models and filter in JS
  const { data: pricingModels, error: pmErr } = await supabase
    .from("customer_pricing_models")
    .select("*")
    .eq("customer_id", customer_id)
    .lte("valid_from", fmt(period_from));

  if (pmErr) return NextResponse.json({ error: pmErr.message }, { status: 500 });

  const models = pricingModels ?? [];

  function findPricingModel(vehicle: { type: string; km_class: string | null }) {
    // Filter by vehicle_type and km_class, then pick latest valid_from
    const candidates = models.filter(
      (m) =>
        m.vehicle_type === vehicle.type &&
        (m.km_class === vehicle.km_class || (m.km_class === null && vehicle.km_class === null))
    );
    if (candidates.length === 0) return null;
    candidates.sort((a, b) => b.valid_from.localeCompare(a.valid_from));
    return candidates[0];
  }

  // Build rows per vehicle
  const rows = vehicleIds.map((vid) => {
    const vehicle = vehicleMap[vid];
    const vehicleTours = tourList.filter((t) => t.vehicle_id === vid);
    const tours_count = vehicleTours.length;
    const actual_km = vehicleTours.reduce((sum, t) => sum + (t.actual_km ?? 0), 0);
    const tours_without_km = vehicleTours.filter((t) => t.actual_km === null).length;

    const pricing = vehicle ? findPricingModel(vehicle) : null;

    const free_km = pricing?.free_km ?? null;
    const extra_km_rate = pricing?.extra_km_rate ?? null;
    const soll_km = free_km !== null ? free_km * tours_count : null;
    const diff_km = soll_km !== null ? actual_km - soll_km : null;
    const mehrkilometer_eur =
      diff_km !== null && extra_km_rate !== null && extra_km_rate > 0
        ? Math.max(0, diff_km) * extra_km_rate
        : null;

    return {
      vehicle_id: vid,
      license_plate: vehicle?.license_plate ?? vid,
      vehicle_type: vehicle?.type ?? null,
      km_class: vehicle?.km_class ?? null,
      tours_count,
      soll_km,
      actual_km,
      tours_without_km,
      diff_km,
      free_km,
      extra_km_rate,
      mehrkilometer_eur,
      pricing_model_found: pricing !== null,
    };
  });

  // Fleet totals (only meaningful if km_billing_type === 'fleet', but always compute)
  const rowsWithSoll = rows.filter((r) => r.soll_km !== null);
  const fleet_total =
    customer.km_billing_type === "fleet"
      ? {
          tours_count: rows.reduce((s, r) => s + r.tours_count, 0),
          soll_km: rowsWithSoll.reduce((s, r) => s + (r.soll_km ?? 0), 0),
          actual_km: rows.reduce((s, r) => s + r.actual_km, 0),
          tours_without_km: rows.reduce((s, r) => s + r.tours_without_km, 0),
          diff_km: rowsWithSoll.reduce((s, r) => s + (r.diff_km ?? 0), 0),
          mehrkilometer_eur: rows.reduce((s, r) => s + (r.mehrkilometer_eur ?? 0), 0),
        }
      : null;

  return NextResponse.json({
    customer,
    period: { from: fmt(period_from), to: fmt(period_to) },
    km_billing_type: customer.km_billing_type,
    rows,
    fleet_total,
  });
}
