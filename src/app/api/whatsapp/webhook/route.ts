import { NextRequest } from "next/server";
import twilio from "twilio";
import OpenAI from "openai";
import { createServerClient } from "@supabase/ssr";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY! });

function makeSupabase() {
  // Use service role key if available (bypasses RLS), fall back to anon key
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    key,
    { cookies: { getAll: () => [], setAll: () => {} } }
  );
}

export async function POST(request: NextRequest) {
  const formData = await request.formData();

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

  const supabase = makeSupabase();

  let transcript = bodyText;

  if (mediaUrl && mediaType.startsWith("audio/")) {
    try {
      const audioRes = await fetch(mediaUrl, {
        headers: {
          Authorization:
            "Basic " +
            Buffer.from(`${process.env.TWILIO_ACCOUNT_SID}:${process.env.TWILIO_AUTH_TOKEN}`).toString("base64"),
        },
      });
      if (!audioRes.ok) throw new Error(`Audio download failed: ${audioRes.status}`);
      const audioBuffer = await audioRes.arrayBuffer();
      const ext = mediaType.includes("ogg") ? "ogg" : mediaType.includes("mp4") ? "mp4" : "ogg";
      const audioFile = new File([audioBuffer], `voice.${ext}`, { type: mediaType });

      const transcription = await openai.audio.transcriptions.create({
        file: audioFile,
        model: "whisper-1",
        language: "de",
      });
      transcript = transcription.text;
    } catch (err) {
      console.error("Transcription error:", err);
      await sendReply(from, "❌ Sprachnachricht konnte nicht transkribiert werden. Bitte versuche es erneut oder schreibe den Befehl als Text.");
      return new Response("OK", { status: 200 });
    }
  }

  if (!transcript) {
    await sendReply(from, "Bitte sende eine Sprachnachricht oder Textnachricht.");
    return new Response("OK", { status: 200 });
  }

  // Copy tours from a given date → today
  const copyMatch = transcript.match(
    /(?:übernimm?|kopier|nehm?)\s+(?:alle\s+)?touren?\s+(?:von(?:\s+letztem?n?)?\s+|vom\s+)(gestern|montag|dienstag|mittwoch|donnerstag|freitag|samstag|sonntag|\d{1,2}\.\d{1,2}\.(?:\d{4})?)/i
  );
  if (copyMatch) {
    const todayDate = new Date();
    const today = todayDate.toISOString().split("T")[0];
    const token = copyMatch[1].toLowerCase().trim();

    // Resolve the token to a YYYY-MM-DD string
    let sourceDate = "";
    if (token === "gestern") {
      sourceDate = new Date(Date.now() - 86400000).toISOString().split("T")[0];
    } else if (/^\d{1,2}\.\d{1,2}\./.test(token)) {
      // DD.MM. or DD.MM.YYYY
      const parts = token.split(".");
      const day   = parseInt(parts[0], 10);
      const month = parseInt(parts[1], 10) - 1;
      const year  = parts[2] ? parseInt(parts[2], 10) : todayDate.getFullYear();
      const d = new Date(year, month, day);
      sourceDate = d.toISOString().split("T")[0];
    } else {
      // Weekday → most recent past occurrence
      const weekdays: Record<string, number> = { sonntag:0, montag:1, dienstag:2, mittwoch:3, donnerstag:4, freitag:5, samstag:6 };
      const targetDay = weekdays[token];
      if (targetDay !== undefined) {
        const d = new Date(todayDate);
        d.setDate(d.getDate() - ((d.getDay() - targetDay + 7) % 7 || 7));
        sourceDate = d.toISOString().split("T")[0];
      }
    }

    if (!sourceDate) {
      await sendReply(from, `❓ Datum nicht erkannt. Beispiele:\n• "Übernimm Touren von gestern"\n• "Übernimm Touren vom Freitag"\n• "Übernimm Touren vom 09.05."`);
      return new Response("OK", { status: 200 });
    }

    const { data: sourceTours, error: fetchError } = await supabase
      .from("tours")
      .select("driver_id, vehicle_id, customer_id, pickup_address, delivery_address, notes")
      .eq("tour_date", sourceDate)
      .neq("status", "cancelled");

    if (fetchError) {
      await sendReply(from, `❌ Datenbankfehler: ${fetchError.message}`);
      return new Response("OK", { status: 200 });
    }

    if (!sourceTours || sourceTours.length === 0) {
      // Format date nicely for display
      const [y, m, d] = sourceDate.split("-");
      await sendReply(from, `⚠️ Keine Touren für ${d}.${m}.${y} gefunden — vielleicht war das ein freier Tag?`);
      return new Response("OK", { status: 200 });
    }

    const newTours = sourceTours.map((t) => ({
      ...t,
      tour_date: today,
      status: "planned",
      rollkarte_status: "pending",
      notes: t.notes ? `${t.notes} | Kopie von ${sourceDate}` : `Kopie von ${sourceDate}`,
    }));

    const { error: insertError } = await supabase.from("tours").insert(newTours);

    const [sy, sm, sd] = sourceDate.split("-");
    const [ty, tm, td] = today.split("-");

    if (!insertError) {
      await supabase.from("whatsapp_logs").insert({ sender_number: from, transcript, parsed_action: { action: "copy_tours", sourceDate, today }, success: true });
      await sendReply(from,
        `✅ ${newTours.length} Tour${newTours.length !== 1 ? "en" : ""} vom ${sd}.${sm}.${sy} für heute (${td}.${tm}.${ty}) übernommen.\n\nBitte im Portal unter Touren prüfen.`
      );
    } else {
      await sendReply(from, `❌ Fehler beim Kopieren der Touren: ${insertError.message}`);
    }
    return new Response("OK", { status: 200 });
  }

  // Rollkarte reply detection: "Rollkarte 12345" or just a number after a rollkarte request
  const rollkarteMatch = transcript.match(/^(?:rollkarte[:\s]+)?(\d{3,10})\s*$/i);
  if (rollkarteMatch) {
    const rollkarteNumber = rollkarteMatch[1];
    const today = new Date().toISOString().split("T")[0];

    // Find the driver by phone number
    const senderPhone = from.replace(/^whatsapp:/, "");
    const { data: driver } = await supabase
      .from("drivers")
      .select("id, first_name, last_name")
      .eq("phone", senderPhone)
      .maybeSingle();

    if (driver) {
      // Find tours today for this driver that are in requested/pending status
      const { data: pendingTours } = await supabase
        .from("tours")
        .select("id, customer:customers(company_name)")
        .eq("tour_date", today)
        .eq("driver_id", driver.id)
        .in("rollkarte_status", ["pending", "requested"]);

      if (pendingTours && pendingTours.length === 1) {
        const tour = pendingTours[0] as any;
        await supabase.from("tours").update({
          rollkarte_number: rollkarteNumber,
          rollkarte_status: "received",
          rollkarte_answered_at: new Date().toISOString(),
          rollkarte_source: "whatsapp",
          rollkarte_updated_by: `${driver.first_name} ${driver.last_name}`,
        }).eq("id", tour.id);

        await sendReply(from, `✅ Rollkartennummer ${rollkarteNumber} für ${tour.customer?.company_name ?? "deine Tour"} gespeichert. Danke!`);
        return new Response("OK", { status: 200 });
      } else if (pendingTours && pendingTours.length > 1) {
        // Ambiguous: multiple tours → store number on all, flag for manual review
        for (const tour of pendingTours) {
          await supabase.from("tours").update({
            rollkarte_number: rollkarteNumber,
            rollkarte_status: "received",
            rollkarte_answered_at: new Date().toISOString(),
            rollkarte_source: "whatsapp",
            rollkarte_updated_by: `${driver.first_name} ${driver.last_name} (mehrdeutig)`,
          }).eq("id", (tour as any).id);
        }
        await sendReply(from, `⚠️ Du hast heute ${pendingTours.length} Touren. Rollkartennummer ${rollkarteNumber} wurde bei allen eingetragen — bitte im Portal prüfen.`);
        return new Response("OK", { status: 200 });
      }
    }
    // If no driver found or no pending tours, fall through to normal GPT processing
  }

  const { data: drivers } = await supabase.from("drivers").select("id, first_name, last_name");
  const { data: vehicles } = await supabase.from("vehicles").select("id, license_plate, type");
  const { data: customers } = await supabase.from("customers").select("id, company_name");

  const today = new Date().toISOString().split("T")[0];
  const tomorrow = new Date(Date.now() + 86400000).toISOString().split("T")[0];

  const systemPrompt = `Du bist ein Dispatcher-Assistent für das Speditionsunternehmen Cargo Köhler.

Analysiere den Befehl und gib IMMER nur JSON zurück:

{
  "action": "create_tour" | "copy_yesterday_tours" | "create_vehicle" | "create_driver" | "create_customer" | "unknown",
  "confidence": 0.0-1.0,
  "tour_date": "YYYY-MM-DD",
  "driver_name": "Name des Fahrers (Vor- oder Nachname)",
  "license_plate": "Kennzeichen wenn explizit genannt",
  "vehicle_type": "Fahrzeugtyp wenn genannt (z.B. Sprinter, LKW 7.5t, OTC 44)",
  "customer_name": "Kundenname",
  "notes": "Zusätzliche Infos",
  "new_license_plate": "Kennzeichen für neues Fahrzeug",
  "new_vehicle_type": "Typ für neues Fahrzeug",
  "new_first_name": "Vorname für neuen Fahrer",
  "new_last_name": "Nachname für neuen Fahrer",
  "new_phone": "Telefon für neuen Fahrer",
  "new_company_name": "Firmenname für neuen Kunden",
  "new_contact_name": "Ansprechpartner für neuen Kunden"
}

Heute: ${today}, Morgen: ${tomorrow}
Bekannte Fahrer: ${drivers?.map((d: any) => `${d.first_name} ${d.last_name}`).join(", ") || "noch keine"}
Bekannte Kennzeichen: ${vehicles?.map((v: any) => `${v.license_plate} (${v.type})`).join(", ") || "noch keine"}
Bekannte Kunden: ${customers?.map((c: any) => c.company_name).join(", ") || "noch keine"}

Regeln:
- "übernimm/kopiere Touren von gestern" / "gleiche Touren wie gestern" / "Touren von gestern für heute" → copy_yesterday_tours, confidence=0.95
- "fährt morgen/heute/am [Datum] zu/für/nach" → create_tour (auch wenn Fahrer/Fahrzeug/Kunde nicht in der DB)
- "lege Kennzeichen ... an" / "neues Fahrzeug" / "füge Fahrzeug hinzu" → create_vehicle
- "neuer Fahrer" / "lege Fahrer an" → create_driver
- "neuer Kunde" / "lege Kunde an" / "füge Kunde hinzu" → create_customer
- Bei create_tour: confidence >= 0.5 wenn Fahrer ODER Kunde erkennbar
- Kennzeichen-Format flexibel erkennen: "SO TC 4444" = "SO-TC 4444"
- WICHTIG: Ignoriere Meta-Anweisungen wie "bitte ziehe Stammdaten", "suche im Internet", "ergänze automatisch" — extrahiere nur die Kerndaten (z.B. Firmenname) und setze action trotzdem korrekt
- Bei "Neuer Kunde [Firmenname], ..." → action=create_customer, new_company_name=[Firmenname], confidence=0.9
- Antworte NUR mit dem JSON-Objekt, keine Erklärung`;

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

  let replyMessage = `📝 Transkription: "${transcript}"\n\n`;
  let success = false;

  if (parsed && parsed.action !== "unknown" && (parsed.confidence ?? 0) >= 0.5) {
    // Fuzzy matching helpers
    const findDriver = (name: string) =>
      drivers?.find((d: any) =>
        `${d.first_name} ${d.last_name}`.toLowerCase().includes(name.toLowerCase()) ||
        d.last_name.toLowerCase().includes(name.toLowerCase()) ||
        d.first_name.toLowerCase().includes(name.toLowerCase())
      );
    const findVehicle = (plate: string) =>
      vehicles?.find((v: any) =>
        v.license_plate.toLowerCase().replace(/[\s-]/g, "") ===
        plate.toLowerCase().replace(/[\s-]/g, "")
      );
    const findCustomer = (name: string) =>
      customers?.find((c: any) =>
        c.company_name.toLowerCase().includes(name.toLowerCase()) ||
        name.toLowerCase().includes(c.company_name.toLowerCase().split(" ")[0])
      );

    if (parsed.action === "create_tour") {
      const driver = parsed.driver_name ? findDriver(parsed.driver_name) : null;
      const vehicle = parsed.license_plate ? findVehicle(parsed.license_plate) : null;
      const customer = parsed.customer_name ? findCustomer(parsed.customer_name) : null;

      const tourPayload: any = {
        tour_date: parsed.tour_date ?? today,
        status: "planned",
        notes: parsed.notes
          ? `${parsed.notes} | WhatsApp: ${transcript}`
          : `WhatsApp: ${transcript}`,
      };
      if (driver) tourPayload.driver_id = driver.id;
      if (vehicle) tourPayload.vehicle_id = vehicle.id;
      if (customer) tourPayload.customer_id = customer.id;

      const { error } = await supabase.from("tours").insert(tourPayload);
      if (!error) {
        success = true;
        replyMessage += `✅ Tour angelegt für ${parsed.tour_date ?? "heute"}:\n`;
        replyMessage += driver
          ? `👤 Fahrer: ${driver.first_name} ${driver.last_name}\n`
          : parsed.driver_name ? `⚠️ Fahrer "${parsed.driver_name}" nicht in DB — bitte manuell zuweisen\n` : "";
        replyMessage += vehicle
          ? `🚛 Fahrzeug: ${vehicle.license_plate}\n`
          : parsed.vehicle_type ? `🚛 Fahrzeugtyp: ${parsed.vehicle_type} (nicht in DB)\n`
          : parsed.license_plate ? `⚠️ Kennzeichen "${parsed.license_plate}" nicht gefunden\n` : "";
        replyMessage += customer
          ? `🏢 Kunde: ${customer.company_name}\n`
          : parsed.customer_name ? `⚠️ Kunde "${parsed.customer_name}" nicht in DB — bitte manuell zuweisen\n` : "";
      } else {
        replyMessage += `❌ Fehler beim Anlegen der Tour: ${error.message}`;
      }
    } else if (parsed.action === "copy_yesterday_tours") {
      const yesterday = new Date(Date.now() - 86400000).toISOString().split("T")[0];

      const { data: yesterdayTours } = await supabase
        .from("tours")
        .select("driver_id, vehicle_id, customer_id, pickup_address, delivery_address, notes")
        .eq("tour_date", yesterday)
        .neq("status", "cancelled");

      if (!yesterdayTours || yesterdayTours.length === 0) {
        replyMessage += `⚠️ Keine Touren von gestern (${yesterday}) gefunden.`;
      } else {
        const newTours = yesterdayTours.map((t) => ({
          ...t,
          tour_date: today,
          status: "planned",
          rollkarte_status: "pending",
          notes: t.notes ? `${t.notes} | Kopie von ${yesterday}` : `Kopie von ${yesterday}`,
        }));

        const { error } = await supabase.from("tours").insert(newTours);
        if (!error) {
          success = true;
          replyMessage += `✅ ${newTours.length} Tour${newTours.length > 1 ? "en" : ""} von gestern (${yesterday}) für heute übernommen.`;
        } else {
          replyMessage += `❌ Fehler beim Kopieren der Touren: ${error.message}`;
        }
      }
    } else if (parsed.action === "create_vehicle") {
      const plate = parsed.new_license_plate || parsed.license_plate;
      const type = parsed.new_vehicle_type || parsed.vehicle_type || "Unbekannt";
      if (!plate) {
        replyMessage += "❌ Kennzeichen nicht erkannt. Beispiel: \"Lege Kennzeichen HH-CK 010 als LKW an\"";
      } else {
        const { error } = await supabase.from("vehicles").insert({
          license_plate: plate.toUpperCase(),
          type,
          status: "available",
        });
        if (!error) {
          success = true;
          replyMessage += `✅ Fahrzeug angelegt:\n🚛 Kennzeichen: ${plate.toUpperCase()}\n📋 Typ: ${type}`;
        } else {
          replyMessage += `❌ Fehler: ${error.message}`;
        }
      }
    } else if (parsed.action === "create_driver") {
      const firstName = parsed.new_first_name;
      const lastName = parsed.new_last_name;
      if (!firstName || !lastName) {
        replyMessage += "❌ Vor- und Nachname nicht erkannt. Beispiel: \"Neuer Fahrer Max Mustermann, Telefon 0170 1234567\"";
      } else {
        const { error } = await supabase.from("drivers").insert({
          first_name: firstName,
          last_name: lastName,
          phone: parsed.new_phone || null,
          status: "available",
        });
        if (!error) {
          success = true;
          replyMessage += `✅ Fahrer angelegt:\n👤 ${firstName} ${lastName}${parsed.new_phone ? `\n📞 ${parsed.new_phone}` : ""}`;
        } else {
          replyMessage += `❌ Fehler: ${error.message}`;
        }
      }
    } else if (parsed.action === "create_customer") {
      const company = parsed.new_company_name;
      if (!company) {
        replyMessage += "❌ Firmenname nicht erkannt. Beispiel: \"Neuer Kunde Müller GmbH, Ansprechpartner Thomas Müller\"";
      } else {
        const { error } = await supabase.from("customers").insert({
          company_name: company,
          contact_name: parsed.new_contact_name || null,
        });
        if (!error) {
          success = true;
          replyMessage += `✅ Kunde angelegt:\n🏢 ${company}${parsed.new_contact_name ? `\n👤 ${parsed.new_contact_name}` : ""}`;
        } else {
          replyMessage += `❌ Fehler: ${error.message}`;
        }
      }
    }
  } else {
    replyMessage += `❓ Befehl nicht erkannt.\n\nBeispiele:\n• "Kopp fährt morgen mit S.O TC 4444 für Ottensmann"\n• "Neues Fahrzeug HH-CK 010, Sprinter"\n• "Neuer Fahrer Max Müller, 0170 1234567"\n• "Neuer Kunde Spedition GmbH"`;
  }

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
