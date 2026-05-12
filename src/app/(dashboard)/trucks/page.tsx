import { createClient } from "@/lib/supabase/server";
import { TruckList } from "@/components/trucks/truck-list";

export default async function TrucksPage() {
  const supabase = await createClient();

  const [{ data: vehicles }, { data: drivers }] = await Promise.all([
    supabase
      .from("vehicles")
      .select("*, current_driver:current_driver_id(id, first_name, last_name)")
      .order("license_plate"),
    supabase
      .from("drivers")
      .select("id, first_name, last_name, status")
      .eq("status", "available")
      .order("last_name"),
  ]);

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", (await supabase.auth.getUser()).data.user?.id ?? "")
    .single();

  return (
    <TruckList
      initialVehicles={vehicles ?? []}
      availableDrivers={(drivers ?? []) as { id: string; first_name: string; last_name: string; status: string }[]}
      userRole={(profile?.role ?? "employee") as "admin" | "employee"}
    />
  );
}
