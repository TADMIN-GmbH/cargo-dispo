import { createClient } from "@/lib/supabase/server";
import { CustomerList } from "@/components/customers/customer-list";

export default async function CustomersPage() {
  const supabase = await createClient();
  const [{ data: customers }, { data: vehicles }] = await Promise.all([
    supabase.from("customers").select("*, vehicle_aliases:customer_vehicle_aliases(id, alias, vehicle_id, vehicle:vehicles(id, license_plate, type))").order("company_name"),
    supabase.from("vehicles").select("id, license_plate, type").order("license_plate"),
  ]);
  return <CustomerList initialCustomers={customers ?? []} vehicles={vehicles ?? []} />;
}
