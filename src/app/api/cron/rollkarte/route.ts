import { NextRequest } from "next/server";
import twilio from "twilio";
import { createAdminClient } from "@/lib/supabase/admin";

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return new Response("Unauthorized", { status: 401 });
  }

  const supabase = createAdminClient();
  const today = new Date().toISOString().split("T")[0];

  // Tours today with an opted-in driver, phone present, no rollkarte yet
  const { data: tours, error } = await supabase
    .from("tours")
    .select("id, driver:drivers(id, first_name, last_name, phone, rollkarte_whatsapp_enabled), customer:customers(company_name)")
    .eq("tour_date", today)
    .in("status", ["planned", "active"])
    .eq("rollkarte_status", "pending")
    .not("driver_id", "is", null);

  if (error) {
    console.error("Rollkarte cron query error:", error);
    return Response.json({ error: error.message }, { status: 500 });
  }

  const client = twilio(process.env.TWILIO_ACCOUNT_SID!, process.env.TWILIO_AUTH_TOKEN!);
  const results: { tour_id: string; driver: string; sent: boolean; error?: string }[] = [];

  for (const tour of (tours ?? []) as any[]) {
    const driver = tour.driver;
    if (!driver?.phone || !driver?.rollkarte_whatsapp_enabled) continue;

    const customerName = tour.customer?.company_name ?? "unbekannter Kunde";
    const message =
      `🚛 Cargo Köhler – Rollkartennummer benötigt\n\n` +
      `Hallo ${driver.first_name}, für deine heutige Tour (${customerName}) wird die Rollkartennummer gebraucht.\n\n` +
      `Bitte antworte mit der Nummer, z.B.:\nRollkarte 12345`;

    try {
      await client.messages.create({
        from: `whatsapp:${process.env.TWILIO_WHATSAPP_FROM}`,
        to: `whatsapp:${driver.phone}`,
        body: message,
      });

      await supabase
        .from("tours")
        .update({
          rollkarte_status: "requested",
          rollkarte_requested_at: new Date().toISOString(),
        })
        .eq("id", tour.id);

      results.push({ tour_id: tour.id, driver: `${driver.first_name} ${driver.last_name}`, sent: true });
    } catch (err: any) {
      console.error(`Failed to send to driver ${driver.id}:`, err);
      results.push({ tour_id: tour.id, driver: `${driver.first_name} ${driver.last_name}`, sent: false, error: err.message });
    }
  }

  return Response.json({ date: today, processed: results.length, results });
}
