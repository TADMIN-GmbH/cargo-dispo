export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export async function GET() {
  const adminSupabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
  const { data, error } = await adminSupabase
    .from("customer_vehicle_aliases")
    .select("alias, vehicle:vehicles(license_plate), customer:customers(company_name)");

  return NextResponse.json({ data, error });
}
