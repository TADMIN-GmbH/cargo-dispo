import { createClient } from "@/lib/supabase/server";
import { CustomerList } from "@/components/customers/customer-list";

export default async function CustomersPage() {
  const supabase = await createClient();
  const { data: customers } = await supabase.from("customers").select("*").order("company_name");
  return <CustomerList initialCustomers={customers ?? []} />;
}
