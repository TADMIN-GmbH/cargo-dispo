import { createClient } from "@/lib/supabase/server";
import { DriverList } from "@/components/drivers/driver-list";

export default async function DriversPage() {
  const supabase = await createClient();

  const [{ data: drivers }, { data: vehicles }] = await Promise.all([
    supabase
      .from("drivers")
      .select("*, current_vehicle:current_vehicle_id(id, license_plate, type)")
      .order("last_name"),
    supabase
      .from("vehicles")
      .select("id, license_plate, type, status")
      .eq("status", "available")
      .order("license_plate"),
  ]);

  return <DriverList initialDrivers={drivers ?? []} availableVehicles={(vehicles ?? []) as { id: string; license_plate: string; type: string; status: string }[]} />;
}
