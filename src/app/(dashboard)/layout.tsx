import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { Sidebar } from "@/components/layout/sidebar";

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

  return (
    <div className="flex h-full">
      <Sidebar userRole={userRole} userName={userName} userEmail={user.email ?? ""} />
      <main className="flex-1 ml-60 transition-all duration-300 min-h-screen overflow-auto">
        {children}
      </main>
    </div>
  );
}
