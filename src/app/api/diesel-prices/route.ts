import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// GET: list all diesel prices, newest first
export async function GET() {
  const { data, error } = await supabase
    .from("diesel_prices")
    .select("*")
    .order("month", { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data ?? []);
}

// POST: manual entry of a diesel price
export async function POST(req: Request) {
  const body = await req.json();
  const { month, price_brutto } = body;
  if (!month || !price_brutto) {
    return NextResponse.json({ error: "month and price_brutto required" }, { status: 400 });
  }
  const price_netto = Math.round((price_brutto / 1.19) * 10000) / 10000;
  const { data, error } = await supabase
    .from("diesel_prices")
    .upsert({ month, price_brutto, price_netto, fetched_at: new Date().toISOString() }, { onConflict: "month" })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}
