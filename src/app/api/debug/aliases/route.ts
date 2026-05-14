import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET() {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("customer_vehicle_aliases")
    .select("alias, vehicle:vehicles(license_plate), customer:customers(company_name)");

  return NextResponse.json({ data, error });
}
