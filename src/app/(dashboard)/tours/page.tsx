import { createClient } from "@/lib/supabase/server";
import { TourPlanner } from "@/components/tours/tour-planner";

export default async function ToursPage() {
  const supabase = await createClient();

  const [{ data: tours }, { data: drivers }, { data: vehicles }, { data: customers }] =
    await Promise.all([
      supabase
        .from("tours")
        .select("*, driver:drivers(id,first_name,last_name), vehicle:vehicles(id,license_plate,type), customer:customers(id,company_name,city)")
        .order("tour_date", { ascending: false })
        .limit(50),
      supabase.from("drivers").select("id, first_name, last_name, status").order("last_name"),
      supabase.from("vehicles").select("id, license_plate, type, status").order("license_plate"),
      supabase.from("customers").select("id, company_name, city").order("company_name"),
    ]);

  return (
    <TourPlanner
      initialTours={tours ?? []}
      drivers={drivers ?? []}
      vehicles={vehicles ?? []}
      customers={customers ?? []}
    />
  );
}
