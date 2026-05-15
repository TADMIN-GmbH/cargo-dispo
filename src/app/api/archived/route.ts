export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// GET /api/archived?table=drivers|customers|vehicles
export async function GET(req: NextRequest) {
  const table = req.nextUrl.searchParams.get("table");

  if (table === "drivers") {
    const { data, error } = await supabase
      .from("drivers")
      .select("*, current_vehicle:vehicles(id,license_plate)")
      .not("archived_at", "is", null)
      .order("last_name");
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json(data ?? []);
  }

  if (table === "customers") {
    const { data, error } = await supabase
      .from("customers")
      .select("id, company_name, contact_person, city, zip, phone, email, archived_at")
      .not("archived_at", "is", null)
      .order("company_name");
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json(data ?? []);
  }

  if (table === "vehicles") {
    const { data, error } = await supabase
      .from("vehicles")
      .select("*")
      .not("archived_at", "is", null)
      .order("license_plate");
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json(data ?? []);
  }

  return NextResponse.json({ error: "Invalid table. Use: drivers, customers, vehicles" }, { status: 400 });
}

// PATCH /api/archived — restore a record (set archived_at = null)
export async function PATCH(req: NextRequest) {
  const body = await req.json();
  const { table, id } = body as { table: string; id: string };

  if (!["drivers", "customers", "vehicles"].includes(table)) {
    return NextResponse.json({ error: "Invalid table" }, { status: 400 });
  }
  if (!id) {
    return NextResponse.json({ error: "id required" }, { status: 400 });
  }

  const { error } = await supabase
    .from(table as "drivers" | "customers" | "vehicles")
    .update({ archived_at: null })
    .eq("id", id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}
