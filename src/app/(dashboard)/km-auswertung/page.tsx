import { createClient } from "@supabase/supabase-js";
import { KmAuswertungView } from "@/components/km-auswertung/km-auswertung-view";

const adminSupabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export default async function KmAuswertungPage() {
  const { data: customers } = await adminSupabase
    .from("customers")
    .select("id, company_name, km_billing_type")
    .order("company_name");

  return <KmAuswertungView customers={customers ?? []} />;
}
