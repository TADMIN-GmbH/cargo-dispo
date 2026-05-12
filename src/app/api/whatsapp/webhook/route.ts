import { NextRequest } from "next/server";
import twilio from "twilio";
import OpenAI from "openai";
import { createClient } from "@/lib/supabase/server";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY! });

export async function POST(request: NextRequest) {
  const formData = await request.formData();

  // Twilio signature validation
  const twilioSignature = request.headers.get("x-twilio-signature") ?? "";
  const url = `${process.env.NEXT_PUBLIC_APP_URL}/api/whatsapp/webhook`;
  const params: Record<string, string> = {};
  formData.forEach((value, key) => { params[key] = value.toString(); });

  const isValid = twilio.validateRequest(
    process.env.TWILIO_AUTH_TOKEN!,
    twilioSignature,
    url,
    params
  );

  if (process.env.NODE_ENV === "production" && !isValid) {
    return new Response("Unauthorized", { status: 403 });
  }

  const from = params["From"] ?? "";
  const mediaUrl = params["MediaUrl0"];
  const mediaType = params["MediaContentType0"] ?? "";
  const bodyText = params["Body"] ?? "";

  const supabase = await createClient();
  let transcript = bodyText;

  // If voice message: download + transcribe
  if (mediaUrl && mediaType.startsWith("audio/")) {
    try {
      const audioRes = await fetch(mediaUrl, {
        headers: {
          Authorization:
            "Basic " +
            Buffer.from(
              `${process.env.TWILIO_ACCOUNT_SID}:${process.env.TWILIO_AUTH_TOKEN}`
            ).toString("base64"),
        },
      });
      const audioBuffer = await audioRes.arrayBuffer();
      const audioFile = new File([audioBuffer], "voice.ogg", { type: "audio/ogg" });

      const transcription = await openai.audio.transcriptions.create({
        file: audioFile,
        model: "whisper-1",
        language: "de",
      });
      transcript = transcription.text;
    } catch (err) {
      console.error("Transcription error:", err);
      await sendReply(from, "Sprachnachricht konnte nicht transkribiert werden.");
      return new Response("OK", { status: 200 });
    }
  }

  if (!transcript) {
    await sendReply(from, "Bitte sende eine Sprachnachricht oder Textnachricht.");
    return new Response("OK", { status: 200 });
  }

  // Parse command with GPT-4
  const { data: drivers } = await supabase.from("drivers").select("id, first_name, last_name");
  const { data: vehicles } = await supabase.from("vehicles").select("id, license_plate");
  const { data: customers } = await supabase.from("customers").select("id, company_name");

  const systemPrompt = `Du bist ein Assistent für ein Speditionsunternehmen.
Analysiere den Befehl und extrahiere folgende Informationen im JSON-Format:
{
  "action": "create_tour" | "update_tour" | "update_driver_status" | "update_vehicle_status" | "unknown",
  "tour_date": "YYYY-MM-DD" (morgen = ${new Date(Date.now() + 86400000).toISOString().split("T")[0]}, heute = ${new Date().toISOString().split("T")[0]}),
  "driver_name": "Nachname oder voller Name des Fahrers",
  "license_plate": "Kennzeichen des Fahrzeugs",
  "customer_name": "Name des Kunden/Unternehmens",
  "notes": "Weitere Informationen",
  "confidence": 0.0-1.0
}

Verfügbare Fahrer: ${drivers?.map((d: any) => `${d.first_name} ${d.last_name}`).join(", ")}
Verfügbare Fahrzeuge: ${vehicles?.map((v: any) => v.license_plate).join(", ")}
Verfügbare Kunden: ${customers?.map((c: any) => c.company_name).join(", ")}

Antworte NUR mit dem JSON, nichts anderes.`;

  let parsed: any = null;
  try {
    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: transcript },
      ],
      response_format: { type: "json_object" },
    });
    parsed = JSON.parse(completion.choices[0].message.content ?? "{}");
  } catch (err) {
    console.error("GPT parse error:", err);
  }

  let replyMessage = `Transkription: "${transcript}"\n\n`;
  let success = false;

  if (parsed && parsed.action !== "unknown" && parsed.confidence > 0.6) {
    // Find matching entities
    const driver = drivers?.find((d: any) =>
      parsed.driver_name &&
      `${d.first_name} ${d.last_name}`.toLowerCase().includes(parsed.driver_name.toLowerCase())
    );
    const vehicle = vehicles?.find((v: any) =>
      parsed.license_plate &&
      v.license_plate.toLowerCase().replace(/\s/g, "") ===
        parsed.license_plate.toLowerCase().replace(/\s/g, "")
    );
    const customer = customers?.find((c: any) =>
      parsed.customer_name &&
      c.company_name.toLowerCase().includes(parsed.customer_name.toLowerCase())
    );

    if (parsed.action === "create_tour") {
      const tourPayload: any = {
        tour_date: parsed.tour_date ?? new Date().toISOString().split("T")[0],
        status: "planned",
        notes: `Erstellt via WhatsApp: ${transcript}`,
      };
      if (driver) tourPayload.driver_id = driver.id;
      if (vehicle) tourPayload.vehicle_id = vehicle.id;
      if (customer) tourPayload.customer_id = customer.id;

      const { error } = await supabase.from("tours").insert(tourPayload);
      if (!error) {
        success = true;
        replyMessage += `✅ Tour angelegt für ${parsed.tour_date ?? "heute"}:\n`;
        if (driver) replyMessage += `👤 Fahrer: ${driver.first_name} ${driver.last_name}\n`;
        if (vehicle) replyMessage += `🚛 Fahrzeug: ${vehicle.license_plate}\n`;
        if (customer) replyMessage += `🏢 Kunde: ${customer.company_name}\n`;
        if (!driver && parsed.driver_name) replyMessage += `⚠️ Fahrer "${parsed.driver_name}" nicht gefunden\n`;
        if (!vehicle && parsed.license_plate) replyMessage += `⚠️ Kennzeichen "${parsed.license_plate}" nicht gefunden\n`;
        if (!customer && parsed.customer_name) replyMessage += `⚠️ Kunde "${parsed.customer_name}" nicht gefunden\n`;
      } else {
        replyMessage += "❌ Fehler beim Anlegen der Tour.";
      }
    }
  } else {
    replyMessage += "❓ Befehl nicht erkannt. Beispiel:\n\"Fahrer Müller mit HH-XY 123 fährt morgen zu Kunde ABC GmbH\"";
  }

  // Log to DB
  await supabase.from("whatsapp_logs").insert({
    sender_number: from,
    transcript,
    parsed_action: parsed,
    success,
  });

  await sendReply(from, replyMessage);
  return new Response("OK", { status: 200 });
}

async function sendReply(to: string, message: string) {
  const client = twilio(process.env.TWILIO_ACCOUNT_SID!, process.env.TWILIO_AUTH_TOKEN!);
  await client.messages.create({
    from: `whatsapp:${process.env.TWILIO_WHATSAPP_FROM}`,
    to,
    body: message,
  });
}
