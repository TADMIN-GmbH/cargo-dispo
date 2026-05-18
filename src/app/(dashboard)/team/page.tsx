import { createClient } from "@/lib/supabase/server";
import { createClient as createAdminClient } from "@supabase/supabase-js";
import { redirect } from "next/navigation";
import { TeamManager } from "@/components/team/team-manager";

export default async function TeamPage() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).single();
  if (profile?.role !== "admin") redirect("/");

  const adminSupabase = createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );

  const [{ data: teamMembers }, { data: invites }, { data: { users: authUsers } }] = await Promise.all([
    supabase.from("profiles").select("id, full_name, role, created_at").order("created_at"),
    supabase.from("invites").select("*").eq("accepted", false).order("created_at", { ascending: false }),
    adminSupabase.auth.admin.listUsers(),
  ]);

  // Auto-mark invites as accepted if the user already has an active session
  const activeEmails = new Set(authUsers?.map((u) => u.email) ?? []);
  const pendingInvites = (invites ?? []).filter((inv) => {
    if (activeEmails.has(inv.email)) {
      // Silently mark as accepted in background
      supabase.from("invites").update({ accepted: true }).eq("id", inv.id).then(() => {});
      return false;
    }
    return true;
  });

  return (
    <TeamManager
      teamMembers={teamMembers ?? []}
      pendingInvites={pendingInvites}
      currentUserId={user.id}
    />
  );
}
