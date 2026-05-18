import { createClient } from "@supabase/supabase-js";
import { ReparaturenView } from "@/components/reparaturen/reparaturen-view";

export default async function ReparaturenPage() {
  const adminSupabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
  const { data: invoices } = await adminSupabase
    .from("repair_invoices")
    .select(`
      *,
      vehicle:vehicles(license_plate, type)
    `)
    .order("created_at", { ascending: false });

  return <ReparaturenView invoices={invoices ?? []} />;
}
