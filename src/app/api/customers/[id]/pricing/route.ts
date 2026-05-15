export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// GET: all pricing models for a customer, newest first
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const { data, error } = await supabase
    .from("customer_pricing_models")
    .select("*")
    .eq("customer_id", id)
    .order("vehicle_type")
    .order("valid_from", { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data ?? []);
}

// POST: create a new pricing model row
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const body = await req.json();

  const { data, error } = await supabase
    .from("customer_pricing_models")
    .insert({
      customer_id: id,
      vehicle_type: body.vehicle_type,
      km_class: body.km_class ?? null,
      daily_rate_netto: body.daily_rate_netto,
      maut_flat: body.maut_flat ?? 0,
      accessory_flat: body.accessory_flat ?? 0,
      diesel_base_price: body.diesel_base_price ?? 1.04,
      diesel_factor: body.diesel_factor ?? 20,
      diesel_source: body.diesel_source ?? "en2x",
      diesel_lag_months: body.diesel_lag_months ?? 2,
      floater_type: body.floater_type ?? "formula",
      free_km: body.free_km ?? 300,
      extra_km_rate: body.extra_km_rate ?? 0,
      valid_from: body.valid_from,
      notes: body.notes ?? null,
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Trigger targeted soll recompute for this customer + vehicle_type from valid_from
  const baseUrl = req.nextUrl.origin;
  fetch(`${baseUrl}/api/tours/compute-soll`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      customer_id: id,
      vehicle_type: body.vehicle_type,
      since: body.valid_from,
    }),
  }).catch(() => {/* silent */});

  return NextResponse.json(data);
}

// DELETE: remove a pricing model row by id (via query param)
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  await params; // customer id not needed for delete
  const rowId = req.nextUrl.searchParams.get("rowId");
  if (!rowId) return NextResponse.json({ error: "rowId required" }, { status: 400 });

  const { error } = await supabase.from("customer_pricing_models").delete().eq("id", rowId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}
