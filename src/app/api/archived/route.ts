import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// GET /api/archived?table=drivers|customers|vehicles
// Returns all rows where archived_at IS NOT NULL (bypasses RLS via service role)
export async function GET(req: NextRequest) {
  const table = req.nextUrl.searchParams.get("table");
  if (!["drivers", "customers", "vehicles"].includes(table ?? "")) {
    return NextResponse.json({ error: "Invalid table" }, { status: 400 });
  }

  let query = supabase.from(table as "drivers" | "customers" | "vehicles").select("*").not("archived_at", "is", null);

  if (table === "drivers") {
    query = supabase.from("drivers").select("*, current_vehicle:vehicles(id,license_plate)").not("archived_at", "is", null).order("last_name");
  } else if (table === "customers") {
    query = supabase.from("customers").select("*").not("archived_at", "is", null).order("company_name");
  } else if (table === "vehicles") {
    query = supabase.from("vehicles").select("*").not("archived_at", "is", null).order("license_plate");
  }

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data ?? []);
}

// PATCH /api/archived — restore a record (set archived_at = null)
export async function PATCH(req: NextRequest) {
  const { table, id } = await req.json();
  if (!["drivers", "customers", "vehicles"].includes(table ?? "")) {
    return NextResponse.json({ error: "Invalid table" }, { status: 400 });
  }

  const { error } = await supabase.from(table).update({ archived_at: null }).eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}
