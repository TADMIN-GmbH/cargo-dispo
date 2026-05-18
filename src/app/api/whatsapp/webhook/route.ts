import { NextRequest } from "next/server";
import twilio from "twilio";
import OpenAI from "openai";
import { createServerClient } from "@supabase/ssr";
import {
  getRollkarteConfirmationMessage,
  getRollkarteConfirmedMessage,
  getRollkarteThankYouMessage,
} from "@/lib/rollkarte-messages";
import {
  getPending,
  savePending,
  clearPending,
  handleClarification,
  startClarification,
} from "@/lib/whatsapp-clarification";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY! });

function makeSupabase() {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    key,
    { cookies: { getAll: () => [], setAll: () => {} } }
  );
}

// Normalize a phone number and return all plausible variants for DB matching
function phoneVariants(phone: string): { e164: string; local: string; all: string[] } {
  const digits = phone.replace(/\D/g, "");
  let e164: string;
  let local: string;

  if (digits.startsWith("49") && digits.length > 10) {
    e164 = `+${digits}`;
    local = `0${digits.slice(2)}`;
  } else if (digits.startsWith("0")) {
    e164 = `+49${digits.slice(1)}`;
    local = digits;
  } else {
    e164 = `+49${digits}`;
    local = `0${digits}`;
  }

  // All variants a user might have stored: with/without +, with/without leading 0
  const all = Array.from(new Set([
    e164,                          // +491732431822
    local,                         // 01732431822
    digits,                        // 491732431822
    `+${digits}`,                  // +491732431822 (same as e164 if already +49)
    e164.replace("+49", "0049"),   // 00491732431822
  ]));

  return { e164, local, all };
}

/**
 * Try to extract a rollkarte number/text from a natural-language message.
 * - If prefix given: look for prefix followed by digits (e.g. "26-" → "26-8365401")
 * - After keywords like "Nummer", "Nr.", "Rollkarte"
 * - Any standalone number sequence with at least 3 digits total
 * - If acceptsText: return the full cleaned message
 */
function extractRollkarte(
  text: string,
  prefix?: string | null,
  acceptsText?: boolean | null
): string | null {
  // Prefix match: "26-" prefix → look for "26-8365401" or "26 8365401"
  if (prefix) {
    const esc = prefix.replace(/[-/\\^$*+?.()|[\]{}]/g, "\\$&");
    const m = text.match(new RegExp(`${esc}[\\s-]*(\\d+)`, "i"));
    if (m) return `${prefix}${m[1]}`;
  }

  // After keyword "Nummer", "Nr.", "Rollkarte" (with optional prefix)
  const kwMatch = text.match(
    /(?:rollkarten?(?:nummer)?|nummer|nr\.?)[:\s]+([0-9][0-9\-\/\.]*\d)/i
  );
  if (kwMatch) return kwMatch[1].trim();

  // Whole message is just a number (digits, dashes, dots, slashes allowed)
  const pureNum = text.match(/^\s*([0-9][0-9\-\/\.]{1,20}\d)\s*$/);
  if (pureNum) return pureNum[1].trim();

  // Any prominent number sequence embedded in text (≥3 total digits)
  const embedded = text.match(/\b([0-9][0-9\-\/\.]{1,20}\d)\b/);
  if (embedded && embedded[1].replace(/\D/g, "").length >= 3) {
    return embedded[1];
  }

  // If customer accepts text (Ortsname etc.): return full trimmed message
  if (acceptsText) {
    return text.trim().substring(0, 200);
  }

  return null;
}

/** Check whether the sender is an admin with a registered WhatsApp number */
async function isAdminSender(
  supabase: ReturnType<typeof makeSupabase>,
  senderPhone: string
): Promise<boolean> {
  const { all } = phoneVariants(senderPhone);
  const { data } = await supabase
    .from("profiles")
    .select("id")
    .or(all.map((v) => `whatsapp_phone.eq.${v}`).join(","))
    .eq("role", "admin")
    .maybeSingle();
  return !!data;
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

  // --- Transcription ---
  let transcript = bodyText;
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
      await sendReply(
        from,
        "❌ Sprachnachricht konnte nicht transkribiert werden. Bitte versuche es erneut oder schreibe als Text."
      );
      return new Response("<Response/>", { status: 200, headers: { "Content-Type": "text/xml" } });
    }
  }

  if (!transcript) {
    await sendReply(from, "Bitte sende eine Sprachnachricht oder Textnachricht.");
    return new Response("<Response/>", { status: 200, headers: { "Content-Type": "text/xml" } });
  }

  // Twilio Sandbox sends a bare "OK" as an automatic acknowledgment after
  // every incoming message. Silently drop it here before any processing so
  // it never interferes with the rollkarte confirmation flow.
  if (/^ok$/i.test(transcript.trim())) {
    return new Response("<Response/>", { status: 200, headers: { "Content-Type": "text/xml" } });
  }

  // =========================================================
  // STEP 1: Check if sender is a known driver with a tour today
  // =========================================================
  const senderPhone = from.replace(/^whatsapp:/, "");
  const { e164: senderE164, local: senderLocal, all: senderAll } = phoneVariants(senderPhone);
  const today = new Date().toISOString().split("T")[0];

  const { data: driver } = await supabase
    .from("drivers")
    .select("id, first_name, last_name")
    .or(senderAll.map((v) => `phone.eq.${v}`).join(","))
    .maybeSingle();

  if (driver) {
    // ── Join-Code erkennen (Twilio Sandbox: "join <keyword>") ────────────
    if (/^join\s+\S+/i.test(bodyText.trim())) {
      await supabase
        .from("drivers")
        .update({ whatsapp_joined_at: new Date().toISOString() })
        .eq("id", driver.id);
      await sendReply(
        from,
        `✅ Hallo ${driver.first_name}! Du bist jetzt mit WhatsApp verbunden und erhältst täglich deine Rollkarten-Anfrage.`
      );
      return new Response("<Response/>", { status: 200, headers: { "Content-Type": "text/xml" } });
    }

    // Compute affirmative/negative at driver level so they're available
    // in ALL branches below — including the outer fallback after driverTours check.
    // NOTE: emoji above U+FFFF need the `u` flag — separate regex for safety.
    // "ok" intentionally excluded: WhatsApp auto-replies send "OK" automatically
    // after every incoming message, which would falsely confirm rollkarte numbers.
    const trimmedMsg = transcript.trim();
    const isAffirmative =
      /^(ja\b|yes\b|richtig|korrekt|stimmt|genau|jo\b|yep|jep|passt|super|alles\s*klar)/i.test(trimmedMsg) ||
      /^[\u{1F44D}\u{2705}\u{2713}\u{1F64C}\u{1F44C}]/u.test(trimmedMsg); // 👍 ✅ ✓ 🙌 👌
    const isNegative = /^(nein\b|no\b|falsch|nö\b|nicht\b|wrong)/i.test(trimmedMsg);

    const { data: driverTours } = await supabase
      .from("tours")
      .select(
        `id, rollkarte_status, customer:customers(company_name, rollkarte_prefix, rollkarte_accepts_text)`
      )
      .eq("tour_date", today)
      .eq("driver_id", driver.id)
      .in("rollkarte_status", ["pending", "requested", "confirming"]);

    if (driverTours && driverTours.length > 0) {
      // --- Handle confirmation flow ---
      const confirmingTour = driverTours.find((t: any) => t.rollkarte_status === "confirming");
      if (confirmingTour) {
        const isYes = isAffirmative;
        const isNo  = isNegative;

        if (isYes) {
          await supabase
            .from("tours")
            .update({
              rollkarte_status: "received",
              rollkarte_answered_at: new Date().toISOString(),
            })
            .eq("id", (confirmingTour as any).id);
          await sendReply(from, getRollkarteConfirmedMessage(driver.first_name));
        } else if (isNo) {
          await supabase
            .from("tours")
            .update({ rollkarte_status: "requested", rollkarte_number: null })
            .eq("id", (confirmingTour as any).id);
          await sendReply(
            from,
            `Kein Problem, ${driver.first_name}! Schick mir einfach die richtige Nummer.`
          );
        } else {
          // Treat as a new number attempt for the confirming tour
          const customer = (confirmingTour as any).customer;
          const extracted = extractRollkarte(
            transcript,
            customer?.rollkarte_prefix,
            customer?.rollkarte_accepts_text
          );
          if (extracted) {
            await supabase
              .from("tours")
              .update({
                rollkarte_number: extracted,
                rollkarte_source: "whatsapp",
                rollkarte_updated_by: `${driver.first_name} ${driver.last_name}`,
              })
              .eq("id", (confirmingTour as any).id);
            await sendReply(from, getRollkarteConfirmationMessage(driver.first_name, extracted));
          } else {
            await sendReply(
              from,
              `Ich konnte keine Nummer erkennen, ${driver.first_name}. Antworte mit *JA* um die bisherige Nummer zu bestätigen, oder schick einfach die richtige Nummer.`
            );
          }
        }
        return new Response("<Response/>", { status: 200, headers: { "Content-Type": "text/xml" } });
      }

      // --- Extract rollkarte from natural-language reply ---
      // Pick the first tour (handle multiple tours below)
      const activeTours = driverTours.filter((t: any) => t.rollkarte_status !== "confirming");
      const tour = activeTours[0] as any;
      const customer = tour.customer;
      const extracted = extractRollkarte(
        transcript,
        customer?.rollkarte_prefix,
        customer?.rollkarte_accepts_text
      );

      if (extracted) {
        const updatePayload: Record<string, unknown> = {
          rollkarte_number: extracted,
          rollkarte_status: activeTours.length === 1 ? "confirming" : "received",
          rollkarte_source: "whatsapp",
          rollkarte_updated_by: `${driver.first_name} ${driver.last_name}`,
        };

        if (activeTours.length === 1) {
          // Single tour → ask for confirmation
          await supabase.from("tours").update(updatePayload).eq("id", tour.id);
          await sendReply(from, getRollkarteConfirmationMessage(driver.first_name, extracted));
        } else {
          // Multiple tours → save on all without individual confirmation, notify
          for (const t of activeTours) {
            await supabase
              .from("tours")
              .update({
                rollkarte_number: extracted,
                rollkarte_status: "received",
                rollkarte_answered_at: new Date().toISOString(),
                rollkarte_source: "whatsapp",
                rollkarte_updated_by: `${driver.first_name} ${driver.last_name} (mehrdeutig)`,
              })
              .eq("id", (t as any).id);
          }
          await sendReply(
            from,
            `${getRollkarteThankYouMessage(driver.first_name, extracted)}\n\n⚠️ Du hast heute ${activeTours.length} Touren — Nummer ${extracted} wurde bei allen eingetragen. Bitte im Portal prüfen.`
          );
        }
      } else {
        await sendReply(
          from,
          `Ich konnte keine Rollkartennummer in deiner Nachricht finden, ${driver.first_name}.\n\nBitte schick die Nummer direkt, z.B.:\n*26-8365401*`
        );
      }
      return new Response("<Response/>", { status: 200, headers: { "Content-Type": "text/xml" } });
    }

    // Driver found but NO pending/requested/confirming tours.
    // Could be: tour already confirmed (e.g. by an auto-reply "OK"), or driver
    // is replying after we already processed the confirmation on a retry.
    // Check whether an affirmative arrived for a recently-received tour.
    if (isAffirmative) {
      const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();
      const { data: recentlyReceived } = await supabase
        .from("tours")
        .select("id")
        .eq("tour_date", today)
        .eq("driver_id", driver.id)
        .eq("rollkarte_status", "received")
        .eq("rollkarte_source", "whatsapp")
        .gte("rollkarte_answered_at", fiveMinutesAgo)
        .maybeSingle();
      if (recentlyReceived) {
        await sendReply(from, getRollkarteConfirmedMessage(driver.first_name));
        return new Response("<Response/>", { status: 200, headers: { "Content-Type": "text/xml" } });
      }
    }
    // Fall through to admin check (driver may also have admin role)
  }

  // =========================================================
  // STEP 2: Check if sender is an authorized admin
  // =========================================================
  const senderIsAdmin = await isAdminSender(supabase, senderPhone);
  if (!senderIsAdmin) {
    // Unknown or non-admin number → polite rejection
    await sendReply(
      from,
      `Hallo! 👋\n\nDiese Nummer ist nicht als Administrator registriert und kann keine Befehle erteilen.\n\nFalls du ein Fahrer bist, antworte bitte nur auf die Rollkarten-Anfrage von uns.\n\nBei Fragen melde dich im Portal.`
    );
    await supabase.from("whatsapp_logs").insert({
      sender_number: from,
      transcript,
      parsed_action: { action: "rejected_non_admin" },
      success: false,
      error_message: "Non-admin sender",
    });
    return new Response("<Response/>", { status: 200, headers: { "Content-Type": "text/xml" } });
  }

  // =========================================================
  // STEP 2b: Check for in-progress clarification dialog (expires after 30 min)
  // =========================================================
  const pendingCmd = await getPending(supabase, senderPhone);
  if (pendingCmd && new Date(pendingCmd.expires_at) > new Date()) {
    let clarResult: Awaited<ReturnType<typeof handleClarification>>;
    try {
      clarResult = await handleClarification(supabase, senderPhone, transcript, pendingCmd);
    } catch (err) {
      console.error("Clarification error:", err);
      await clearPending(supabase, senderPhone);
      await sendReply(
        from,
        "❌ Beim Klärungsdialog ist ein Fehler aufgetreten. Bitte starte deinen Befehl erneut."
      );
      return new Response("<Response/>", { status: 200, headers: { "Content-Type": "text/xml" } });
    }

    if (!clarResult.done) {
      // Already saved inside handleClarification — just send the reply
      await sendReply(from, clarResult.reply);
      return new Response("<Response/>", { status: 200, headers: { "Content-Type": "text/xml" } });
    }

    // All fields resolved — execute the command
    await clearPending(supabase, senderPhone);
    await executeResolvedCommand(supabase, clarResult.action, clarResult.resolved, from, transcript);
    return new Response("<Response/>", { status: 200, headers: { "Content-Type": "text/xml" } });
  }

  // =========================================================
  // STEP 3: Copy-tours command (regex-first, reliable)
  // =========================================================
  const copyMatch = /(?:übernimm?|kopier|nehm?)\s+(?:(?:alle|die|meine|seine|ihre)\s+)?touren?\s+/i.test(
    transcript
  );
  if (copyMatch) {
    const nowDate = new Date();

    const monate: Record<string, number> = {
      januar: 0, februar: 1, märz: 2, april: 3, mai: 4, juni: 5,
      juli: 6, august: 7, september: 8, oktober: 9, november: 10, dezember: 11,
    };
    const weekdays: Record<string, number> = {
      sonntag: 0, montag: 1, dienstag: 2, mittwoch: 3, donnerstag: 4, freitag: 5, samstag: 6,
    };

    function resolveDate(token: string, preferFuture = false): string {
      let t = token.toLowerCase().replace(/\.$/, "").trim();
      t = t.replace(/^(?:montag|dienstag|mittwoch|donnerstag|freitag|samstag|sonntag),?\s*/i, "");
      t = t.replace(/^den\s+/, "");

      if (t === "heute")      return nowDate.toISOString().split("T")[0];
      if (t === "gestern")    return new Date(Date.now() - 86400000).toISOString().split("T")[0];
      if (t === "morgen")     return new Date(Date.now() + 86400000).toISOString().split("T")[0];
      if (t === "übermorgen") return new Date(Date.now() + 2 * 86400000).toISOString().split("T")[0];

      if (weekdays[t] !== undefined) {
        const targetDay = weekdays[t];
        const d = new Date(nowDate);
        const diff = (targetDay - d.getDay() + 7) % 7;
        if (preferFuture) {
          d.setDate(d.getDate() + (diff === 0 ? 7 : diff));
        } else {
          d.setDate(d.getDate() - ((d.getDay() - targetDay + 7) % 7 || 7));
        }
        return d.toISOString().split("T")[0];
      }

      const longMatch = t.match(/(\d{1,2})\.?\s+([a-zäöü]+)\s*(\d{4})?/);
      if (longMatch) {
        const day = parseInt(longMatch[1], 10);
        const mon = monate[longMatch[2]];
        const year = longMatch[3] ? parseInt(longMatch[3], 10) : nowDate.getFullYear();
        if (mon !== undefined) return new Date(year, mon, day).toISOString().split("T")[0];
      }

      const numMatch = t.match(/^(\d{1,2})\.(\d{1,2})\.?(\d{4})?$/);
      if (numMatch) {
        const day = parseInt(numMatch[1], 10);
        const mon = parseInt(numMatch[2], 10) - 1;
        const year = numMatch[3] ? parseInt(numMatch[3], 10) : nowDate.getFullYear();
        return new Date(year, mon, day).toISOString().split("T")[0];
      }

      return "";
    }

    const fullMatch = transcript.match(
      /touren?\s+(?:von(?:\s+letztem?n?)?\s+|vom\s+)(.+?)(?:\s+für\s+(?:den\s+)?(.+))?$/i
    );

    let sourceDate = "";
    let targetDate = nowDate.toISOString().split("T")[0];

    if (fullMatch) {
      sourceDate = resolveDate(fullMatch[1].trim(), false);
      if (fullMatch[2]) targetDate = resolveDate(fullMatch[2].trim(), true);
    }

    if (!sourceDate) {
      await sendReply(
        from,
        `❓ Datum nicht erkannt. Beispiele:\n` +
        `• "Übernimm Touren von gestern"\n` +
        `• "Übernimm Touren vom Freitag"\n` +
        `• "Übernimm Touren von heute für Montag den 18. Mai 2026"\n` +
        `• "Übernimm Touren vom 12.05. für den 18.05."`
      );
      return new Response("<Response/>", { status: 200, headers: { "Content-Type": "text/xml" } });
    }

    const { data: sourceTours, error: fetchError } = await supabase
      .from("tours")
      .select("driver_id, vehicle_id, customer_id, pickup_address, delivery_address, notes")
      .eq("tour_date", sourceDate)
      .neq("status", "cancelled");

    if (fetchError) {
      await sendReply(from, `❌ Datenbankfehler: ${fetchError.message}`);
      return new Response("<Response/>", { status: 200, headers: { "Content-Type": "text/xml" } });
    }

    if (!sourceTours || sourceTours.length === 0) {
      const [sy, sm, sd] = sourceDate.split("-");
      await sendReply(
        from,
        `⚠️ Keine Touren für ${sd}.${sm}.${sy} gefunden — vielleicht war das ein freier Tag?`
      );
      return new Response("<Response/>", { status: 200, headers: { "Content-Type": "text/xml" } });
    }

    const newTours = sourceTours.map((t) => ({
      ...t,
      tour_date: targetDate,
      status: "planned",
      rollkarte_status: "pending",
      notes: t.notes ? `${t.notes} | Kopie von ${sourceDate}` : `Kopie von ${sourceDate}`,
    }));

    const { error: insertError } = await supabase.from("tours").insert(newTours);
    const [sy, sm, sd] = sourceDate.split("-");
    const [ty, tm, td] = targetDate.split("-");

    if (!insertError) {
      await supabase.from("whatsapp_logs").insert({
        sender_number: from,
        transcript,
        parsed_action: { action: "copy_tours", sourceDate, targetDate },
        success: true,
      });
      await sendReply(
        from,
        `✅ ${newTours.length} Tour${newTours.length !== 1 ? "en" : ""} vom ${sd}.${sm}.${sy} für ${td}.${tm}.${ty} übernommen.\n\nBitte im Portal unter Touren prüfen.`
      );
    } else {
      await sendReply(from, `❌ Fehler beim Kopieren der Touren: ${insertError.message}`);
    }
    return new Response("<Response/>", { status: 200, headers: { "Content-Type": "text/xml" } });
  }

  // =========================================================
  // STEP 4: GPT command processing (create tour/vehicle/driver/customer)
  // =========================================================
  const { data: drivers } = await supabase.from("drivers").select("id, first_name, last_name");
  const { data: vehicles } = await supabase.from("vehicles").select("id, license_plate, type");
  const { data: customers } = await supabase.from("customers").select("id, company_name");

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
- "übernimm/kopiere Touren von gestern" → copy_yesterday_tours, confidence=0.95
- "fährt morgen/heute/am [Datum] zu/für/nach" → create_tour
- "lege Kennzeichen ... an" / "neues Fahrzeug" → create_vehicle
- "neuer Fahrer" / "lege Fahrer an" → create_driver
- "neuer Kunde" / "lege Kunde an" → create_customer
- Bei create_tour: confidence >= 0.5 wenn Fahrer ODER Kunde erkennbar
- Kennzeichen-Format flexibel: "SO TC 4444" = "SO-TC 4444"
- Bei "Neuer Kunde [Firmenname]" → action=create_customer, new_company_name=[Firmenname], confidence=0.9
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

  if (parsed && parsed.action !== "unknown" && (parsed.confidence ?? 0) >= 0.5) {
    // Route admin actions through clarification dialog
    const clarifiableActions = ["create_tour", "copy_tours", "create_driver", "create_vehicle"];
    if (clarifiableActions.includes(parsed.action)) {
      let clarResult: Awaited<ReturnType<typeof startClarification>>;
      try {
        clarResult = await startClarification(supabase, senderPhone, parsed, transcript);
      } catch (err) {
        console.error("startClarification error:", err);
        clarResult = null;
      }

      if (clarResult && !clarResult.done) {
        await supabase.from("whatsapp_logs").insert({
          sender_number: from,
          transcript,
          parsed_action: { ...parsed, clarification: "started" },
          success: false,
        });
        await sendReply(from, clarResult.reply);
        return new Response("<Response/>", { status: 200, headers: { "Content-Type": "text/xml" } });
      }

      // All resolved immediately (perfect match on first try)
      const resolvedData = clarResult?.resolved ?? {};
      await executeResolvedCommand(supabase, parsed.action, resolvedData, from, transcript);
      return new Response("<Response/>", { status: 200, headers: { "Content-Type": "text/xml" } });
    }

    // Non-clarifiable actions (copy_yesterday_tours, create_customer) — execute directly
    let replyMessage = `📝 Transkription: "${transcript}"\n\n`;
    let success = false;

    if (parsed.action === "copy_yesterday_tours") {
      const yesterday = new Date(Date.now() - 86400000).toISOString().split("T")[0];
      const { data: yesterdayTours } = await supabase
        .from("tours")
        .select("driver_id, vehicle_id, customer_id, pickup_address, delivery_address, notes")
        .eq("tour_date", yesterday)
        .neq("status", "cancelled");

      if (!yesterdayTours || yesterdayTours.length === 0) {
        replyMessage += `⚠️ Keine Touren von gestern (${yesterday}) gefunden.`;
      } else {
        const newTours = yesterdayTours.map((t: any) => ({
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
    } else if (parsed.action === "create_customer") {
      const company = parsed.new_company_name;
      if (!company) {
        replyMessage += `❌ Firmenname nicht erkannt. Beispiel: "Neuer Kunde Müller GmbH, Ansprechpartner Thomas Müller"`;
      } else {
        const { error } = await supabase.from("customers").insert({
          company_name: company,
          contact_person: parsed.new_contact_name || null,
        });
        if (!error) {
          success = true;
          replyMessage += `✅ Kunde angelegt:\n🏢 ${company}${parsed.new_contact_name ? `\n👤 ${parsed.new_contact_name}` : ""}`;
        } else {
          replyMessage += `❌ Fehler: ${error.message}`;
        }
      }
    }

    await supabase.from("whatsapp_logs").insert({
      sender_number: from,
      transcript,
      parsed_action: parsed,
      success,
    });
    await sendReply(from, replyMessage);
  } else {
    await supabase.from("whatsapp_logs").insert({
      sender_number: from,
      transcript,
      parsed_action: parsed,
      success: false,
    });
    await sendReply(
      from,
      `📝 Transkription: "${transcript}"\n\n❓ Befehl nicht erkannt.\n\nBeispiele:\n• "Kopp fährt morgen mit S.O TC 4444 für Ottensmann"\n• "Neues Fahrzeug HH-CK 010, Sprinter"\n• "Neuer Fahrer Max Müller, 0170 1234567"\n• "Neuer Kunde Spedition GmbH"`
    );
  }

  return new Response("<Response/>", { status: 200, headers: { "Content-Type": "text/xml" } });
}

// ---------------------------------------------------------------------------
// executeResolvedCommand — runs the actual DB operation after all fields resolved
// ---------------------------------------------------------------------------
async function executeResolvedCommand(
  supabase: ReturnType<typeof makeSupabase>,
  action: string,
  resolved: Record<string, any>,
  from: string,
  transcript: string
) {
  const today = new Date().toISOString().split("T")[0];
  let replyMessage = "";
  let success = false;

  if (action === "create_tour") {
    const tourPayload: any = {
      tour_date: resolved.tour_date ?? today,
      status: "planned",
      rollkarte_status: "pending",
      notes: resolved.notes
        ? `${resolved.notes} | WhatsApp: ${transcript}`
        : `WhatsApp: ${transcript}`,
    };
    if (resolved.driver?.id) tourPayload.driver_id = resolved.driver.id;
    if (resolved.vehicle?.id) tourPayload.vehicle_id = resolved.vehicle.id;
    if (resolved.customer?.id) tourPayload.customer_id = resolved.customer.id;

    const { error } = await supabase.from("tours").insert(tourPayload);
    if (!error) {
      success = true;
      replyMessage = `✅ Tour angelegt für ${resolved.tour_date ?? "heute"}:\n`;
      if (resolved.driver) {
        replyMessage += `👤 Fahrer: ${resolved.driver.first_name} ${resolved.driver.last_name}\n`;
      }
      if (resolved.vehicle) {
        replyMessage += `🚛 Fahrzeug: ${resolved.vehicle.license_plate}\n`;
      }
      if (resolved.customer) {
        replyMessage += `🏢 Kunde: ${resolved.customer.company_name}\n`;
      }
      if (resolved.flags?.length) {
        replyMessage += `\n⚠️ Hinweise:\n${resolved.flags.map((f: string) => `• ${f}`).join("\n")}`;
      }
      replyMessage += "\nBitte im Portal prüfen.";
    } else {
      replyMessage = `❌ Fehler beim Anlegen der Tour: ${error.message}`;
    }
  } else if (action === "copy_tours") {
    const sourceDate = resolved.source_date;
    const targetDate = resolved.target_date;
    const [sy, sm, sd] = sourceDate.split("-");
    const [ty, tm, td] = targetDate.split("-");

    const { data: sourceTours, error: fetchErr } = await supabase
      .from("tours")
      .select("driver_id, vehicle_id, customer_id, pickup_address, delivery_address, notes")
      .eq("tour_date", sourceDate)
      .neq("status", "cancelled");

    if (fetchErr) {
      replyMessage = `❌ Datenbankfehler: ${fetchErr.message}`;
    } else if (!sourceTours || sourceTours.length === 0) {
      replyMessage = `⚠️ Keine Touren für ${sd}.${sm}.${sy} gefunden — vielleicht war das ein freier Tag?`;
    } else {
      const newTours = sourceTours.map((t: any) => ({
        ...t,
        tour_date: targetDate,
        status: "planned",
        rollkarte_status: "pending",
        notes: t.notes ? `${t.notes} | Kopie von ${sourceDate}` : `Kopie von ${sourceDate}`,
      }));
      const { error: insertErr } = await supabase.from("tours").insert(newTours);
      if (!insertErr) {
        success = true;
        replyMessage = `✅ ${newTours.length} Tour${newTours.length !== 1 ? "en" : ""} vom ${sd}.${sm}.${sy} für ${td}.${tm}.${ty} übernommen.\n\nBitte im Portal unter Touren prüfen.`;
      } else {
        replyMessage = `❌ Fehler beim Kopieren der Touren: ${insertErr.message}`;
      }
    }
  } else if (action === "create_driver") {
    const firstName = resolved.new_first_name;
    const lastName = resolved.new_last_name;
    if (!firstName || !lastName) {
      replyMessage = `❌ Vor- und Nachname fehlen. Bitte starte den Befehl erneut.`;
    } else {
      const { error } = await supabase.from("drivers").insert({
        first_name: firstName,
        last_name: lastName,
        phone: resolved.new_phone || null,
        status: "available",
      });
      if (!error) {
        success = true;
        replyMessage = `✅ Fahrer angelegt:\n👤 ${firstName} ${lastName}${resolved.new_phone ? `\n📞 ${resolved.new_phone}` : ""}`;
      } else {
        replyMessage = `❌ Fehler: ${error.message}`;
      }
    }
  } else if (action === "create_vehicle") {
    const plate = resolved.new_license_plate;
    const type = resolved.new_vehicle_type ?? "Unbekannt";
    if (!plate) {
      replyMessage = `❌ Kennzeichen fehlt. Bitte starte den Befehl erneut.`;
    } else {
      const { error } = await supabase.from("vehicles").insert({
        license_plate: plate.toUpperCase(),
        type,
        status: "available",
      });
      if (!error) {
        success = true;
        replyMessage = `✅ Fahrzeug angelegt:\n🚛 Kennzeichen: ${plate.toUpperCase()}\n📋 Typ: ${type}`;
      } else {
        replyMessage = `❌ Fehler: ${error.message}`;
      }
    }
  } else {
    replyMessage = `❌ Unbekannte Aktion: ${action}`;
  }

  await supabase.from("whatsapp_logs").insert({
    sender_number: from,
    transcript,
    parsed_action: { action, resolved },
    success,
  });

  await sendReply(from, replyMessage);
}

async function sendReply(to: string, message: string) {
  const client = twilio(process.env.TWILIO_ACCOUNT_SID!, process.env.TWILIO_AUTH_TOKEN!);
  await client.messages.create({
    from: `whatsapp:${process.env.TWILIO_WHATSAPP_FROM}`,
    to,
    body: message,
  });
}
