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
      diesel_base_price: body.diesel_base_price ?? 1.04,
      diesel_factor: body.diesel_factor ?? 20,
      valid_from: body.valid_from,
      notes: body.notes ?? null,
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
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
