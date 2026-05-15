import { createClient } from "@supabase/supabase-js";
import { KostenView } from "@/components/fuhrpark/kosten-view";

const adminSupabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

export default async function KostenPage() {
  const [{ data: fuelInvoices }, { data: mautInvoices }, { data: repairInvoices }] =
    await Promise.all([
      adminSupabase.from("fuel_invoices").select("*").order("invoice_date", { ascending: false }),
      adminSupabase.from("maut_invoices").select("*").order("period_from", { ascending: false }),
      adminSupabase
        .from("repair_invoices")
        .select("id, invoice_number, invoice_date, total_gross, vehicle:vehicles(license_plate, type)")
        .order("invoice_date", { ascending: false }),
    ]);

  return (
    <KostenView
      fuelInvoices={fuelInvoices ?? []}
      mautInvoices={mautInvoices ?? []}
      repairInvoices={repairInvoices ?? []}
    />
  );
}
