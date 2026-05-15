import { createClient } from "@supabase/supabase-js";
import { ReparaturenView } from "@/components/fuhrpark/reparaturen-view";

const adminSupabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

export default async function ReparaturenPage() {
  const { data: rawInvoices } = await adminSupabase
    .from("repair_invoices")
    .select(`*, vehicle:vehicles(license_plate, type)`)
    .order("invoice_date", { ascending: false });

  // Supabase returns joined relations as arrays — normalize to single object
  const invoices = (rawInvoices ?? []).map((r: any) => ({
    ...r,
    vehicle: Array.isArray(r.vehicle) ? (r.vehicle[0] ?? null) : r.vehicle,
  }));

  return <ReparaturenView invoices={invoices} />;
}
