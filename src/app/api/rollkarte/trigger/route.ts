import { NextRequest } from "next/server";
import { getRollkarteRequestMessage } from "@/lib/rollkarte-messages";
import { createClient } from "@/lib/supabase/server";
import { createServerClient } from "@supabase/ssr";
import twilio from "twilio";

export async function POST(request: NextRequest) {
  // Auth: must be logged-in admin
  const supabaseUser = await createClient();
  const { data: { user } } = await supabaseUser.auth.getUser();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const { data: profile } = await supabaseUser.from("profiles").select("role").eq("id", user.id).single();
  if (profile?.role !== "admin") return Response.json({ error: "Forbidden" }, { status: 403 });

  // Admin Supabase client
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { cookies: { getAll: () => [], setAll: () => {} } }
  );

  const today = new Date().toISOString().split("T")[0];

  const { data: tours, error } = await supabase
    .from("tours")
    .select("id, driver:drivers(id, first_name, last_name, phone, rollkarte_whatsapp_enabled), customer:customers(company_name)")
    .eq("tour_date", today)
    .in("status", ["planned", "active"])
    .eq("rollkarte_status", "pending")
    .not("driver_id", "is", null);

  if (error) return Response.json({ error: error.message }, { status: 500 });

  const client = twilio(process.env.TWILIO_ACCOUNT_SID!, process.env.TWILIO_AUTH_TOKEN!);
  const results: { driver: string; phone: string; sent: boolean; sid?: string; skipped?: string; error?: string }[] = [];

  // Normalize phone to E.164 (+49...)
  function toE164(phone: string): string {
    const digits = phone.replace(/\D/g, "");
    if (digits.startsWith("49")) return `+${digits}`;
    if (digits.startsWith("0")) return `+49${digits.slice(1)}`;
    return `+${digits}`;
  }

  for (const tour of (tours ?? []) as any[]) {
    const driver = tour.driver;
    const driverName = `${driver?.first_name ?? "?"} ${driver?.last_name ?? "?"}`;

    if (!driver?.phone) {
      results.push({ driver: driverName, phone: "(keine Nummer)", sent: false, skipped: "Keine Telefonnummer hinterlegt" });
      continue;
    }
    if (!driver?.rollkarte_whatsapp_enabled) {
      results.push({ driver: driverName, phone: driver.phone, sent: false, skipped: "WhatsApp Rollkarte nicht aktiviert" });
      continue;
    }

    const phone = toE164(driver.phone);
    const customerName = tour.customer?.company_name ?? "deinen Kunden";
    const message = getRollkarteRequestMessage(driver.first_name, customerName);

    try {
      const msg = await client.messages.create({
        from: `whatsapp:${process.env.TWILIO_WHATSAPP_FROM}`,
        to: `whatsapp:${phone}`,
        body: message,
      });
      await supabase.from("tours").update({
        rollkarte_status: "requested",
        rollkarte_requested_at: new Date().toISOString(),
      }).eq("id", tour.id);
      results.push({ driver: driverName, phone, sent: true, sid: msg.sid });
    } catch (err: any) {
      results.push({ driver: driverName, phone, sent: false, error: err.message });
    }
  }

  return Response.json({ date: today, processed: results.length, results });
}
