export const dynamic = "force-dynamic";

import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { Sidebar } from "@/components/layout/sidebar";
import { DateSelector } from "@/components/layout/date-selector";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("full_name, role")
    .eq("id", user.id)
    .single();

  const userRole = (profile?.role ?? "employee") as "admin" | "employee";
  const userName = profile?.full_name ?? user.email ?? "Benutzer";

  const cookieStore = await cookies();
  const appDate = cookieStore.get("app_date")?.value ?? new Date().toISOString().split("T")[0];

  return (
    <div className="flex h-full">
      <Sidebar userRole={userRole} userName={userName} userEmail={user.email ?? ""} />
      <div className="flex-1 ml-60 transition-all duration-300 min-h-screen flex flex-col">
        <header className="sticky top-0 z-30 bg-white border-b border-gray-100 px-8 py-2.5 flex items-center justify-end">
          <DateSelector value={appDate} />
        </header>
        <main className="flex-1 overflow-auto">
          {children}
        </main>
      </div>
    </div>
  );
}
