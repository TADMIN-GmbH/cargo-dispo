import { createClient } from "@/lib/supabase/server";
import { WhatsAppDashboard } from "@/components/whatsapp/whatsapp-dashboard";

export default async function WhatsAppPage() {
  const supabase = await createClient();
  const { data: logs } = await supabase
    .from("whatsapp_logs")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(50);

  const webhookUrl = `${process.env.NEXT_PUBLIC_APP_URL}/api/whatsapp/webhook`;

  return <WhatsAppDashboard logs={logs ?? []} webhookUrl={webhookUrl} />;
}
