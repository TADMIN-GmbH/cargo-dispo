export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

function makeSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

function normalizePlate(p: string) {
  return p.replace(/-/g, " ").toUpperCase().trim();
}

function normalizeCompany(s: string) {
  return s
    .toLowerCase()
    .replace(/[\s\-&.,]/g, "")
    .replace(/gmbh|cokg|co\.kg|gmbh&co|&co/g, "");
}


export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = makeSupabase();
  const { id: gutschriftId } = await params;

  // Fetch gutschrift
  const { data: gutschrift } = await supabase
    .from("gutschriften")
    .select("*")
    .eq("id", gutschriftId)
    .single();

  if (!gutschrift) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (gutschrift.billing_type !== "per_period") {
    return NextResponse.json({ error: "Not a period-based Gutschrift" }, { status: 400 });
  }

  // Fetch vehicle entries
  const { data: entries } = await supabase
    .from("gutschrift_vehicle_entries")
    .select("*")
    .eq("gutschrift_id", gutschriftId);

  if (!entries?.length) {
    return NextResponse.json({ error: "No vehicle entries found" }, { status: 400 });
  }

  // Find matching customer by normalizing absender
  const { data: customers } = await supabase.from("customers").select("id, company_name");
  const normalizedAbsender = normalizeCompany(gutschrift.absender ?? "");
  const customer = customers?.find(
    (c) => normalizeCompany(c.company_name) === normalizedAbsender
  );

  // Load en2x diesel prices (price_brutto, 2-month lag by default)
  const { data: allDieselPrices } = await supabase
    .from("diesel_prices")
    .select("month, price_brutto");
  const en2xMap = new Map<string, number>(
    (allDieselPrices ?? []).map((d) => [d.month, d.price_brutto])
  );

  // Load BGL diesel prices (price_netto per 100L, 1-month lag by default)
  const { data: allBglPrices } = await supabase
    .from("bgl_diesel_prices")
    .select("month, price_netto");
  const bglMap = new Map<string, number>(
    (allBglPrices ?? []).map((d) => [d.month, d.price_netto])
  );

  // Load BGL floater step table
  const { data: bglSteps } = await supabase
    .from("bgl_floater_steps")
    .select("price_from, price_to, surcharge_pct")
    .order("price_from");
  const bglFloaterSteps: { price_from: number; price_to: number; surcharge_pct: number }[] =
    bglSteps ?? [];

  /** Look up BGL floater surcharge % for a given price (€/100L netto). */
  function bglSurchargePct(price: number): number | null {
    const step = bglFloaterSteps.find((s) => price >= s.price_from && price <= s.price_to);
    return step ? step.surcharge_pct : null;
  }

  // Load all pricing models for this customer (if known)
  let allPricingModels: {
    vehicle_type: string;
    km_class: string | null;
    daily_rate_netto: number;
    maut_flat: number;
    accessory_flat: number;
    diesel_base_price: number;
    diesel_factor: number;
    diesel_source: string;
    diesel_lag_months: number;
    floater_type: string;
    valid_from: string;
  }[] = [];
  if (customer) {
    const { data: pm } = await supabase
      .from("customer_pricing_models")
      .select(
        "vehicle_type, km_class, daily_rate_netto, maut_flat, accessory_flat, diesel_base_price, diesel_factor, diesel_source, diesel_lag_months, floater_type, valid_from"
      )
      .eq("customer_id", customer.id)
      .order("valid_from", { ascending: false });
    allPricingModels = (pm ?? []).map((m) => ({
      ...m,
      accessory_flat: m.accessory_flat ?? 0,
      diesel_source: m.diesel_source ?? "en2x",
      diesel_lag_months: m.diesel_lag_months ?? 2,
      floater_type: m.floater_type ?? "formula",
    }));
  }

  /** Returns "YYYY-MM-01" offset by lagMonths back from tourDate. */
  function refMonth(tourDate: string, lagMonths: number): string {
    const d = new Date(tourDate);
    d.setMonth(d.getMonth() - lagMonths);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
  }

  /**
   * Find the active pricing model for a given vehicle type, km_class, and reference date.
   * "Latest valid_from <= refDate" wins.
   */
  function getActivePricingModel(vehicleType: string, kmClass: string | null, refDate: string) {
    return allPricingModels.find(
      (m) =>
        m.vehicle_type === vehicleType &&
        (vehicleType !== "SZM" || m.km_class === kmClass || m.km_class === null) &&
        m.valid_from <= refDate
    ) ?? null;
  }

  /**
   * Compute soll_netto for a single tour day.
   *
   * en2x / formula:  daily_rate × (1 + (brutto/1.19 − base) / base × factor/100) + maut + accessory
   * bgl  / table:    daily_rate × (1 + surcharge_pct/100) + maut + accessory
   */
  function computeSollNetto(
    vehicleType: string,
    kmClass: string | null,
    tourDate: string
  ): number | null {
    const pm = getActivePricingModel(vehicleType, kmClass, tourDate);
    if (!pm) return null;

    const lag = pm.diesel_lag_months ?? 2;
    const ref = refMonth(tourDate, lag);

    let dieselSurchargePct: number;

    if (pm.floater_type === "table") {
      // BGL step-table lookup; diesel_factor = % of step to apply (100=full, 80=80%)
      const bglPrice = bglMap.get(ref);
      if (bglPrice === undefined) return null;
      const pct = bglSurchargePct(bglPrice);
      if (pct === null) return null;
      const factor = pm.diesel_factor > 0 ? pm.diesel_factor : 100;
      dieselSurchargePct = pct * (factor / 100);
    } else {
      // en2x continuous formula
      const en2xBrutto = en2xMap.get(ref);
      if (en2xBrutto === undefined) return null;
      dieselSurchargePct =
        ((en2xBrutto / 1.19 - pm.diesel_base_price) / pm.diesel_base_price) * pm.diesel_factor;
    }

    const dieselAmt = pm.daily_rate_netto * (dieselSurchargePct / 100);
    return Math.round(
      (pm.daily_rate_netto + pm.maut_flat + pm.accessory_flat + dieselAmt) * 100
    ) / 100;
  }

  const results = [];
  let hasConflict = false;

  for (const entry of entries) {
    const normalizedPlate = normalizePlate(entry.license_plate);

    // Find vehicle by license plate (include type + km_class for soll calculation)
    const { data: vehicleRows } = await supabase
      .from("vehicles")
      .select("id, license_plate, type, km_class")
      .eq("license_plate", normalizedPlate);
    const vehicle = vehicleRows?.[0] as
      | { id: string; license_plate: string; type: string; km_class: string | null }
      | undefined;

    // Fetch tours for this vehicle + customer in period
    type TourRow = {
      id: string;
      tour_date: string;
      status: string;
      driver: { first_name: string; last_name: string } | null;
    };
    let tours: TourRow[] = [];

    if (vehicle && customer && entry.period_from && entry.period_to) {
      const { data: tourData } = await supabase
        .from("tours")
        .select("id, tour_date, status, driver:drivers(first_name, last_name)")
        .eq("vehicle_id", vehicle.id)
        .eq("customer_id", customer.id)
        .gte("tour_date", entry.period_from)
        .lte("tour_date", entry.period_to)
        .order("tour_date");
      // Supabase returns joined rows as arrays; normalize driver to single object
      tours = (tourData ?? []).map((t: Record<string, unknown>) => ({
        id: t.id as string,
        tour_date: t.tour_date as string,
        status: t.status as string,
        driver: Array.isArray(t.driver)
          ? (t.driver[0] ?? null)
          : (t.driver as { first_name: string; last_name: string } | null),
      }));
    }

    const daysFound = tours.length;
    const daysClaimed = entry.days_claimed ?? 0;
    const matchStatus = daysFound === daysClaimed ? "matched" : "conflict";
    if (matchStatus === "conflict") hasConflict = true;

    // Update vehicle entry with results
    await supabase
      .from("gutschrift_vehicle_entries")
      .update({ days_found: daysFound, match_status: matchStatus })
      .eq("id", entry.id);

    // Clear existing positionen for this vehicle_entry before recreating
    await supabase
      .from("gutschrift_positionen")
      .delete()
      .eq("vehicle_entry_id", entry.id);

    const dieselPerDay =
      daysClaimed > 0 ? Math.round(((entry.diesel_amount ?? 0) / daysClaimed) * 100) / 100 : 0;
    const istPerDay = Math.round(((entry.daily_rate ?? 0) + dieselPerDay) * 100) / 100;

    // Matched tours: up to daysClaimed
    const matchedTours = tours.slice(0, daysClaimed);
    if (matchedTours.length > 0) {
      await supabase.from("gutschrift_positionen").insert(
        matchedTours.map((t) => {
          const sollNetto = vehicle
            ? computeSollNetto(vehicle.type, vehicle.km_class, t.tour_date)
            : null;
          return {
            gutschrift_id: gutschriftId,
            vehicle_entry_id: entry.id,
            tour_id: t.id,
            bel_datum: t.tour_date,
            kennzeichen: normalizedPlate,
            daily_rate: entry.daily_rate,
            diesel_amount: dieselPerDay,
            netto_betrag: istPerDay,
            soll_netto: sollNetto,
            match_status: "matched",
          };
        })
      );
    }

    // Extra tours in DB not claimed in Gutschrift
    const extraTours = tours.slice(daysClaimed);
    if (extraTours.length > 0) {
      await supabase.from("gutschrift_positionen").insert(
        extraTours.map((t) => {
          const sollNetto = vehicle
            ? computeSollNetto(vehicle.type, vehicle.km_class, t.tour_date)
            : null;
          return {
            gutschrift_id: gutschriftId,
            vehicle_entry_id: entry.id,
            tour_id: t.id,
            bel_datum: t.tour_date,
            kennzeichen: normalizedPlate,
            daily_rate: entry.daily_rate,
            diesel_amount: 0,
            netto_betrag: 0,
            soll_netto: sollNetto,
            match_status: "extra_in_db",
          };
        })
      );
    }

    // Missing days: Gutschrift claims more than DB has — placeholder rows
    // Use period_from as reference date for soll (best approximation without actual tour date)
    const missingCount = Math.max(0, daysClaimed - daysFound);
    if (missingCount > 0) {
      const refDate = entry.period_from ?? new Date().toISOString().slice(0, 10);
      const sollNetto = vehicle
        ? computeSollNetto(vehicle.type, vehicle.km_class, refDate)
        : null;
      await supabase.from("gutschrift_positionen").insert(
        Array.from({ length: missingCount }, () => ({
          gutschrift_id: gutschriftId,
          vehicle_entry_id: entry.id,
          bel_datum: null as string | null,
          kennzeichen: normalizedPlate,
          daily_rate: entry.daily_rate,
          diesel_amount: dieselPerDay,
          netto_betrag: istPerDay,
          soll_netto: sollNetto,
          match_status: "missing_in_db",
        }))
      );
    }

    results.push({
      license_plate: normalizedPlate,
      vehicle_type: vehicle?.type ?? null,
      days_claimed: daysClaimed,
      days_found: daysFound,
      match_status: matchStatus,
      tours: tours.map((t) => ({
        id: t.id,
        tour_date: t.tour_date,
        driver: t.driver,
        status: t.status,
        soll_netto: vehicle
          ? computeSollNetto(vehicle.type, vehicle.km_class, t.tour_date)
          : null,
      })),
    });
  }

  // Update overall reconciliation status on the Gutschrift
  await supabase
    .from("gutschriften")
    .update({ reconciliation_status: hasConflict ? "conflict" : "ok" })
    .eq("id", gutschriftId);

  return NextResponse.json({ success: true, results });
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = makeSupabase();
  const { id: gutschriftId } = await params;

  const { data: entries } = await supabase
    .from("gutschrift_vehicle_entries")
    .select("*")
    .eq("gutschrift_id", gutschriftId)
    .order("license_plate");

  const { data: positionen } = await supabase
    .from("gutschrift_positionen")
    .select("*, tour:tours(id, tour_date, driver:drivers(first_name, last_name), status)")
    .eq("gutschrift_id", gutschriftId)
    .not("vehicle_entry_id", "is", null)
    .order("bel_datum");

  return NextResponse.json({ entries: entries ?? [], positionen: positionen ?? [] });
}
