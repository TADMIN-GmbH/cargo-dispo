export const dynamic = "force-dynamic";

import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { SidebarFuhrpark } from "@/components/layout/sidebar-fuhrpark";
import { PortalProvider } from "@/lib/portal-context";

export default async function FuhrparkLayout({
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
    <PortalProvider accentColor="red" portalId="fuhrpark">
      <div className="flex h-full">
        <SidebarFuhrpark
          userRole={userRole}
          userName={userName}
          userEmail={user.email ?? ""}
        />
        <div className="flex-1 ml-60 transition-all duration-300 min-h-screen flex flex-col">
          <main className="flex-1 overflow-auto">
            {children}
          </main>
        </div>
      </div>
    </PortalProvider>
  );
}
