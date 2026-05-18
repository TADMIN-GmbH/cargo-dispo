import { createClient } from "@supabase/supabase-js";
import { FuhrparkView } from "@/components/fuhrpark/fuhrpark-view";

export default async function FuhrparkPage() {
  const adminSupabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
  const { data: fuelInvoices } = await adminSupabase
    .from("fuel_invoices")
    .select("*")
    .order("invoice_date", { ascending: false });

  const { data: mautInvoices } = await adminSupabase
    .from("maut_invoices")
    .select("*")
    .order("period_from", { ascending: false });

  return (
    <FuhrparkView
      fuelInvoices={fuelInvoices ?? []}
      mautInvoices={mautInvoices ?? []}
    />
  );
}
