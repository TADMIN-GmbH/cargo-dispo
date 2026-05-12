import { createClient } from "@/lib/supabase/server";
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

  const { data: teamMembers } = await supabase
    .from("profiles")
    .select("id, full_name, role, created_at")
    .order("created_at");

  const { data: invites } = await supabase
    .from("invites")
    .select("*")
    .eq("accepted", false)
    .order("created_at", { ascending: false });

  return (
    <TeamManager
      teamMembers={teamMembers ?? []}
      pendingInvites={invites ?? []}
      currentUserId={user.id}
    />
  );
}
