import { createClient } from "@/lib/supabase/server";
import { CustomerList } from "@/components/customers/customer-list";

export default async function CustomersPage() {
  const supabase = await createClient();
  const [{ data: customers }, { data: vehicles }] = await Promise.all([
    supabase.from("customers").select("*, vehicle_aliases:customer_vehicle_aliases(id, alias, vehicle_id, vehicle:vehicles(id, license_plate, type)), locations:customer_locations(id, customer_id, name, street, zip, city, contact_person, phone, email, notes, created_at)").is("archived_at", null).order("company_name"),
    supabase.from("vehicles").select("id, license_plate, type").order("license_plate"),
  ]);
  return <CustomerList initialCustomers={customers ?? []} vehicles={vehicles ?? []} />;
}
