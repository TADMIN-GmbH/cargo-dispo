/**
 * Multi-turn WhatsApp clarification flow for admin commands.
 * Handles fuzzy search, numbered option selection, status warnings,
 * and per-field progressive resolution.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type PendingCommand = {
  id: string;
  phone: string;
  action: string;
  resolved: Record<string, any>;
  pending_field: string | null;
  options: any[] | null;
  original_transcript: string | null;
  created_at: string;
  expires_at: string;
};

export type ClarificationResult =
  | { done: false; reply: string }
  | { done: true; resolved: Record<string, any>; action: string };

// ---------------------------------------------------------------------------
// Response template variants
// ---------------------------------------------------------------------------

function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

const TEMPLATES = {
  askDriver: [
    "Wen meinst du genau? 👤\n{options}\n✏️ oder schreib den vollen Namen",
    "Welchen Fahrer soll ich eintragen?\n{options}\n✏️ oder Freitext",
    "Kurze Rückfrage — welcher Fahrer?\n{options}\n✏️ Name eingeben",
    "Fast geschafft! Nur noch: welcher Fahrer?\n{options}\n✏️ oder einfach den Namen schreiben",
  ],
  askCustomer: [
    "Für welchen Kunden ist die Tour?\n{options}\n✏️ oder Firmenname eingeben",
    "Welchen Kunden meinst du?\n{options}\n✏️ oder vollständigen Namen schreiben",
    "Kurze Frage — welcher Kunde?\n{options}\n✏️ oder Namen eingeben",
    "Noch unklar: welcher Kunde?\n{options}\n✏️ Firmenname eingeben",
  ],
  askVehicle: [
    "Welches Fahrzeug soll ich eintragen? 🚛\n{options}\n✏️ oder Kennzeichen eingeben",
    "Mit welchem Fahrzeug fährt die Tour?\n{options}\n✏️ oder Kennzeichen schreiben",
    "Kurze Rückfrage — welches Kennzeichen?\n{options}\n✏️ oder direkt eingeben",
    "Noch offen: welches Fahrzeug?\n{options}\n✏️ Kennzeichen eingeben",
  ],
  askSourceDate: [
    "Von welchem Datum sollen die Touren kopiert werden?\n📅 Beispiel: gestern, Freitag, 12.05.",
    "Kurze Rückfrage: von welchem Tag soll ich kopieren?\n📅 z.B. gestern, Montag, 15.05.2026",
    "Welches Datum als Quelle? 📅\nBeispiele: gestern · letzten Freitag · 12.05.",
    "Für die Kopie brauche ich noch: von welchem Datum?\n📅 z.B. gestern oder 12.05.",
  ],
  askTargetDate: [
    "Und für welches Datum soll ich die Touren anlegen?\n📅 Beispiel: morgen, Montag, 18.05.",
    "Auf welchen Tag soll ich kopieren?\n📅 z.B. morgen, nächsten Montag, 18.05.2026",
    "Zieldatum fehlt noch: wann sollen die Touren hin?\n📅 Beispiel: morgen oder 18.05.",
    "Fast fertig! Nur noch: für welchen Tag?\n📅 z.B. morgen · Montag · 18.05.2026",
  ],
  askDriverFirstName: [
    "Wie heißt der neue Fahrer mit Vornamen?",
    "Vorname des neuen Fahrers bitte:",
    "Welchen Vornamen hat der neue Fahrer?",
    "Noch offen: Vorname des Fahrers?",
  ],
  askDriverLastName: [
    "Und der Nachname?",
    "Wie lautet der Nachname?",
    "Nachname des neuen Fahrers bitte:",
    "Noch der Nachname — wie heißt er/sie?",
  ],
  askDriverPhone: [
    "Telefonnummer des Fahrers (optional — einfach 'weiter' wenn nicht bekannt):",
    "Gibt es eine Handynummer? Falls nicht, schreib einfach 'weiter'.",
    "Telefon des Fahrers? (oder 'weiter' zum Überspringen)",
    "Handynummer bekannt? Sonst schreib 'weiter'.",
  ],
  askVehiclePlate: [
    "Wie lautet das Kennzeichen des neuen Fahrzeugs?",
    "Kennzeichen bitte — z.B. HH-CK 010:",
    "Welches Kennzeichen hat das neue Fahrzeug?",
    "Noch offen: was ist das Kennzeichen?",
  ],
  askVehicleType: [
    "Welcher Fahrzeugtyp? z.B. Sprinter, LKW 7.5t, OTC 44:",
    "Fahrzeugtyp bitte — z.B. Sprinter oder LKW 12t:",
    "Was für ein Fahrzeug ist es? (Typ/Bezeichnung):",
    "Noch der Fahrzeugtyp: z.B. Sprinter, LKW 7.5t:",
  ],
  confirmInactiveDriver: [
    "⚠️ {name} ist aktuell als '{status}' gemeldet — trotzdem für die Tour eintragen?",
    "⚠️ Hinweis: {name} hat Status '{status}'. Soll ich ihn/sie trotzdem zuweisen?",
    "⚠️ {name} ist gerade '{status}' — wirklich für diese Tour einplanen?",
    "⚠️ Kurze Warnung: {name} ist als '{status}' markiert. Trotzdem eintragen? (ja/nein)",
  ],
  confirmMaintenanceVehicle: [
    "⚠️ {plate} ist gerade in der Werkstatt — wirklich für diese Tour verwenden?",
    "⚠️ Hinweis: {plate} hat Status '{status}'. Trotzdem verwenden?",
    "⚠️ {plate} ist aktuell '{status}' — soll ich es trotzdem eintragen?",
    "⚠️ Fahrzeug {plate} ist als '{status}' markiert. Wirklich verwenden? (ja/nein)",
  ],
  confirmDriverNoVehicle: [
    "Hinweis: {name} hat kein Fahrzeug zugewiesen. Direkt ergänzen? (ja/nein)",
    "Info: {name} fehlt noch ein Fahrzeug. Soll ich eins zuweisen? (ja/nein)",
    "{name} hat kein Fahrzeug — soll ich das im Anschluss ergänzen? (ja/nein)",
    "Kein Fahrzeug bei {name} hinterlegt. Jetzt zuweisen? (ja/nein)",
  ],
  confirmCopyTours: [
    "Ich kopiere {n} Tour(en) von {from} nach {to} — passt das?",
    "Gefunden: {n} Tour(en) vom {from}. Soll ich sie für den {to} anlegen?",
    "{n} Tour(en) vom {from} bereit zum Kopieren nach {to}. Bestätigen?",
    "Alles bereit: {n} Tour(en) von {from} → {to}. Soll ich kopieren? (ja/nein)",
  ],
  noSimilarFound: [
    "Hmm, '{input}' kenne ich nicht. Kannst du den vollen Namen nochmal schreiben?",
    "'{input}' habe ich nicht gefunden. Bitte nochmal vollständig eingeben:",
    "Leider kein Treffer für '{input}'. Schreib den vollständigen Namen bitte:",
    "'{input}' ist mir unbekannt. Nochmal eingeben?",
  ],
};

// ---------------------------------------------------------------------------
// Fuzzy search helpers
// ---------------------------------------------------------------------------

export async function findSimilarDrivers(
  supabase: any,
  name: string
): Promise<Array<{ id: string; first_name: string; last_name: string; status: string; current_vehicle_id: string | null }>> {
  const n = name.trim();
  const { data } = await supabase
    .from("drivers")
    .select("id, first_name, last_name, status, current_vehicle_id")
    .or(
      `first_name.ilike.%${n}%,last_name.ilike.%${n}%`
    )
    .limit(3);
  return data ?? [];
}

export async function findSimilarCustomers(
  supabase: any,
  name: string
): Promise<Array<{ id: string; company_name: string }>> {
  const { data } = await supabase
    .from("customers")
    .select("id, company_name")
    .ilike("company_name", `%${name.trim()}%`)
    .limit(3);
  return data ?? [];
}

export async function findSimilarVehicles(
  supabase: any,
  plate: string
): Promise<Array<{ id: string; license_plate: string; type: string; status: string }>> {
  const normalized = plate.trim().replace(/[\s-]/g, "");
  const { data } = await supabase
    .from("vehicles")
    .select("id, license_plate, type, status")
    .ilike("license_plate", `%${normalized}%`)
    .limit(3);
  return data ?? [];
}

// ---------------------------------------------------------------------------
// Option formatting / parsing
// ---------------------------------------------------------------------------

const NUMBER_EMOJIS = ["1️⃣", "2️⃣", "3️⃣", "4️⃣", "5️⃣"];
const WORD_TO_INDEX: Record<string, number> = {
  eins: 0, "eins.": 0, "1": 0, "1.": 0,
  zwei: 1, "2": 1, "2.": 1,
  drei: 2, "3": 2, "3.": 2,
  vier: 3, "4": 3, "4.": 3,
  "fünf": 4, "5": 4, "5.": 4,
};

export function formatOptions(items: Array<{ label: string }>): string {
  return items
    .slice(0, 5)
    .map((item, i) => `${NUMBER_EMOJIS[i]} ${item.label}`)
    .join("\n");
}

export function parseOptionChoice(text: string, options: any[]): any | null {
  const t = text.trim().toLowerCase();
  const idx = WORD_TO_INDEX[t];
  if (idx !== undefined && idx < options.length) {
    return options[idx];
  }
  return null;
}

// ---------------------------------------------------------------------------
// Pending command CRUD
// ---------------------------------------------------------------------------

export async function getPending(
  supabase: any,
  phone: string
): Promise<PendingCommand | null> {
  const { data } = await supabase
    .from("pending_whatsapp_commands")
    .select("*")
    .eq("phone", phone)
    .maybeSingle();
  return data ?? null;
}

export async function savePending(
  supabase: any,
  phone: string,
  action: string,
  resolved: Record<string, any>,
  pendingField: string | null,
  options: any[] | null,
  transcript: string | null
): Promise<void> {
  await supabase
    .from("pending_whatsapp_commands")
    .upsert(
      {
        phone,
        action,
        resolved,
        pending_field: pendingField,
        options,
        original_transcript: transcript,
        expires_at: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
      },
      { onConflict: "phone" }
    );
}

export async function clearPending(supabase: any, phone: string): Promise<void> {
  await supabase
    .from("pending_whatsapp_commands")
    .delete()
    .eq("phone", phone);
}

// ---------------------------------------------------------------------------
// Status warning helpers
// ---------------------------------------------------------------------------

function driverStatusWarning(
  driver: { first_name: string; last_name: string; status: string }
): string | null {
  if (driver.status === "off" || driver.status === "sick") {
    const name = `${driver.first_name} ${driver.last_name}`;
    return pick(TEMPLATES.confirmInactiveDriver)
      .replace("{name}", name)
      .replace("{status}", driver.status);
  }
  return null;
}

function vehicleStatusWarning(
  vehicle: { license_plate: string; status: string }
): string | null {
  if (vehicle.status === "maintenance" || vehicle.status === "inactive") {
    return pick(TEMPLATES.confirmMaintenanceVehicle)
      .replace("{plate}", vehicle.license_plate)
      .replace("{status}", vehicle.status);
  }
  return null;
}

// ---------------------------------------------------------------------------
// Field-resolution ordering per action
// ---------------------------------------------------------------------------

// Returns the list of fields (in priority order) that need resolving for a given action.
function fieldsForAction(action: string): string[] {
  switch (action) {
    case "create_tour":
      return ["driver", "customer", "vehicle"];
    case "copy_tours":
      return ["source_date", "target_date", "confirm_copy"];
    case "create_driver":
      return ["new_first_name", "new_last_name", "new_phone"];
    case "create_vehicle":
      return ["new_license_plate", "new_vehicle_type"];
    default:
      return [];
  }
}

// Return the next unresolved field, or null if all done.
function nextPendingField(action: string, resolved: Record<string, any>): string | null {
  for (const field of fieldsForAction(action)) {
    if (resolved[field] === undefined || resolved[field] === null) {
      // Special: confirm_copy only needed once source_date & target_date are both resolved
      if (field === "confirm_copy") {
        if (resolved.source_date && resolved.target_date && !resolved.confirm_copy) {
          return "confirm_copy";
        }
        continue;
      }
      return field;
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// Build the next clarification question
// ---------------------------------------------------------------------------

async function buildQuestion(
  supabase: any,
  field: string,
  resolved: Record<string, any>,
  rawInput: string | null
): Promise<{ reply: string; options: any[] | null }> {
  switch (field) {
    case "driver": {
      if (rawInput) {
        const matches = await findSimilarDrivers(supabase, rawInput);
        if (matches.length === 0) {
          return {
            reply: pick(TEMPLATES.noSimilarFound).replace("{input}", rawInput),
            options: null,
          };
        }
        if (matches.length === 1) {
          // Auto-resolve in caller — shouldn't normally land here
          return { reply: "", options: matches };
        }
        const options = matches.map((d) => ({
          label: `${d.first_name} ${d.last_name}`,
          ...d,
        }));
        const formatted = formatOptions(options);
        return {
          reply: pick(TEMPLATES.askDriver).replace("{options}", formatted),
          options,
        };
      }
      return {
        reply: pick(TEMPLATES.askDriver).replace("{options}", "(keine Vorschläge)"),
        options: null,
      };
    }
    case "customer": {
      if (rawInput) {
        const matches = await findSimilarCustomers(supabase, rawInput);
        if (matches.length === 0) {
          return {
            reply: pick(TEMPLATES.noSimilarFound).replace("{input}", rawInput),
            options: null,
          };
        }
        const options = matches.map((c) => ({ label: c.company_name, ...c }));
        const formatted = formatOptions(options);
        return {
          reply: pick(TEMPLATES.askCustomer).replace("{options}", formatted),
          options,
        };
      }
      return {
        reply: pick(TEMPLATES.askCustomer).replace("{options}", "(keine Vorschläge)"),
        options: null,
      };
    }
    case "vehicle": {
      if (rawInput) {
        const matches = await findSimilarVehicles(supabase, rawInput);
        if (matches.length === 0) {
          return {
            reply: pick(TEMPLATES.noSimilarFound).replace("{input}", rawInput),
            options: null,
          };
        }
        const options = matches.map((v) => ({ label: `${v.license_plate} (${v.type})`, ...v }));
        const formatted = formatOptions(options);
        return {
          reply: pick(TEMPLATES.askVehicle).replace("{options}", formatted),
          options,
        };
      }
      return {
        reply: pick(TEMPLATES.askVehicle).replace("{options}", "(keine Vorschläge)"),
        options: null,
      };
    }
    case "source_date":
      return { reply: pick(TEMPLATES.askSourceDate), options: null };
    case "target_date":
      return { reply: pick(TEMPLATES.askTargetDate), options: null };
    case "new_first_name":
      return { reply: pick(TEMPLATES.askDriverFirstName), options: null };
    case "new_last_name":
      return { reply: pick(TEMPLATES.askDriverLastName), options: null };
    case "new_phone":
      return { reply: pick(TEMPLATES.askDriverPhone), options: null };
    case "new_license_plate":
      return { reply: pick(TEMPLATES.askVehiclePlate), options: null };
    case "new_vehicle_type":
      return { reply: pick(TEMPLATES.askVehicleType), options: null };
    case "confirm_copy": {
      // resolved must have source_date, target_date, and tour_count
      const n = resolved.tour_count ?? "?";
      const from = formatGermanDate(resolved.source_date);
      const to = formatGermanDate(resolved.target_date);
      return {
        reply: pick(TEMPLATES.confirmCopyTours)
          .replace("{n}", String(n))
          .replace("{from}", from)
          .replace("{to}", to),
        options: null,
      };
    }
    default:
      return { reply: `Ich brauche noch Angaben zu: ${field}`, options: null };
  }
}

function formatGermanDate(iso: string): string {
  if (!iso) return iso;
  const [y, m, d] = iso.split("-");
  return `${d}.${m}.${y}`;
}

// ---------------------------------------------------------------------------
// Date resolution (shared with webhook, duplicated here for self-containment)
// ---------------------------------------------------------------------------

const MONATE: Record<string, number> = {
  januar: 0, februar: 1, märz: 2, april: 3, mai: 4, juni: 5,
  juli: 6, august: 7, september: 8, oktober: 9, november: 10, dezember: 11,
};
const WEEKDAYS: Record<string, number> = {
  sonntag: 0, montag: 1, dienstag: 2, mittwoch: 3, donnerstag: 4, freitag: 5, samstag: 6,
};

function resolveGermanDate(token: string, preferFuture = false): string {
  const nowDate = new Date();
  let t = token.toLowerCase().replace(/\.$/, "").trim();
  t = t.replace(/^(?:montag|dienstag|mittwoch|donnerstag|freitag|samstag|sonntag),?\s*/i, "");
  t = t.replace(/^den\s+/, "");

  if (t === "heute") return nowDate.toISOString().split("T")[0];
  if (t === "gestern") return new Date(Date.now() - 86400000).toISOString().split("T")[0];
  if (t === "morgen") return new Date(Date.now() + 86400000).toISOString().split("T")[0];
  if (t === "übermorgen") return new Date(Date.now() + 2 * 86400000).toISOString().split("T")[0];

  if (WEEKDAYS[t] !== undefined) {
    const targetDay = WEEKDAYS[t];
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
    const mon = MONATE[longMatch[2]];
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

// ---------------------------------------------------------------------------
// handleClarification — processes one turn of a pending dialog
// ---------------------------------------------------------------------------

export async function handleClarification(
  supabase: any,
  phone: string,
  text: string,
  pending: PendingCommand
): Promise<ClarificationResult> {
  const { action, resolved: prevResolved, pending_field, options } = pending;
  const resolved = { ...prevResolved };
  const trimmed = text.trim();

  // Handle corrupted state
  if (!action || !pending_field) {
    return {
      done: false,
      reply: "❌ Interner Fehler beim Klärungsdialog. Bitte wiederhole deinen Befehl von vorne.",
    };
  }

  // Try to parse the user's answer for the current pending field
  let warningAppend = "";
  let nextField: string | null = null;

  switch (pending_field) {
    case "driver": {
      let chosen: any = null;
      // Number selection from offered options
      if (options && options.length > 0) {
        chosen = parseOptionChoice(trimmed, options);
      }
      // Free-text → exact match or fuzzy again
      if (!chosen) {
        const matches = await findSimilarDrivers(supabase, trimmed);
        if (matches.length === 1) {
          chosen = { ...matches[0], label: `${matches[0].first_name} ${matches[0].last_name}` };
        } else if (matches.length > 1) {
          const opts = matches.map((d) => ({
            label: `${d.first_name} ${d.last_name}`,
            ...d,
          }));
          const formatted = formatOptions(opts);
          const reply = pick(TEMPLATES.askDriver).replace("{options}", formatted);
          return { done: false, reply };
        }
      }
      if (chosen) {
        resolved.driver = chosen;
        // Status warning — if bad status, ask for confirmation
        const warn = driverStatusWarning(chosen);
        if (warn) {
          // Save with special confirm field and ask
          resolved._confirm_driver_status = false;
          warningAppend = warn;
          // Treat as next pending field = confirm_driver_status (handled below)
          nextField = "_confirm_driver_status";
          break;
        }
        // No vehicle warning (just a flag)
        if (!chosen.current_vehicle_id) {
          resolved.flags = [
            ...(resolved.flags ?? []),
            `driver_no_vehicle:${chosen.first_name} ${chosen.last_name}`,
          ];
        }
        nextField = nextPendingField(action, resolved);
      } else {
        // Still not found — ask again
        return {
          done: false,
          reply: pick(TEMPLATES.noSimilarFound).replace("{input}", trimmed),
        };
      }
      break;
    }

    case "_confirm_driver_status": {
      const isYes = /^(ja\b|yes\b|jo\b|jep|yep|richtig|korrekt|stimmt|genau|passt)/i.test(trimmed);
      if (isYes) {
        resolved._confirm_driver_status = true;
      } else {
        // Unset the driver and ask again
        delete resolved.driver;
        delete resolved._confirm_driver_status;
        return {
          done: false,
          reply: pick(TEMPLATES.askDriver).replace("{options}", "(kein Vorschlag)"),
        };
      }
      nextField = nextPendingField(action, resolved);
      break;
    }

    case "customer": {
      let chosen: any = null;
      if (options && options.length > 0) {
        chosen = parseOptionChoice(trimmed, options);
      }
      if (!chosen) {
        const matches = await findSimilarCustomers(supabase, trimmed);
        if (matches.length === 1) {
          chosen = { ...matches[0], label: matches[0].company_name };
        } else if (matches.length > 1) {
          const opts = matches.map((c) => ({ label: c.company_name, ...c }));
          const formatted = formatOptions(opts);
          return {
            done: false,
            reply: pick(TEMPLATES.askCustomer).replace("{options}", formatted),
          };
        }
      }
      if (chosen) {
        resolved.customer = chosen;
        nextField = nextPendingField(action, resolved);
      } else {
        return {
          done: false,
          reply: pick(TEMPLATES.noSimilarFound).replace("{input}", trimmed),
        };
      }
      break;
    }

    case "vehicle": {
      let chosen: any = null;
      if (options && options.length > 0) {
        chosen = parseOptionChoice(trimmed, options);
      }
      if (!chosen) {
        const matches = await findSimilarVehicles(supabase, trimmed);
        if (matches.length === 1) {
          chosen = { ...matches[0], label: `${matches[0].license_plate} (${matches[0].type})` };
        } else if (matches.length > 1) {
          const opts = matches.map((v) => ({
            label: `${v.license_plate} (${v.type})`,
            ...v,
          }));
          const formatted = formatOptions(opts);
          return {
            done: false,
            reply: pick(TEMPLATES.askVehicle).replace("{options}", formatted),
          };
        }
      }
      if (chosen) {
        resolved.vehicle = chosen;
        const warn = vehicleStatusWarning(chosen);
        if (warn) {
          resolved._confirm_vehicle_status = false;
          nextField = "_confirm_vehicle_status";
          warningAppend = warn;
          break;
        }
        nextField = nextPendingField(action, resolved);
      } else {
        return {
          done: false,
          reply: pick(TEMPLATES.noSimilarFound).replace("{input}", trimmed),
        };
      }
      break;
    }

    case "_confirm_vehicle_status": {
      const isYes = /^(ja\b|yes\b|jo\b|jep|yep|richtig|korrekt|stimmt|genau|passt)/i.test(trimmed);
      if (isYes) {
        resolved._confirm_vehicle_status = true;
      } else {
        delete resolved.vehicle;
        delete resolved._confirm_vehicle_status;
        return {
          done: false,
          reply: pick(TEMPLATES.askVehicle).replace("{options}", "(kein Vorschlag)"),
        };
      }
      nextField = nextPendingField(action, resolved);
      break;
    }

    case "source_date": {
      const date = resolveGermanDate(trimmed, false);
      if (!date) {
        return {
          done: false,
          reply:
            "❓ Datum nicht erkannt. Beispiele:\n• gestern\n• letzten Freitag\n• 12.05.\n• 12.05.2026",
        };
      }
      resolved.source_date = date;
      nextField = nextPendingField(action, resolved);
      break;
    }

    case "target_date": {
      const date = resolveGermanDate(trimmed, true);
      if (!date) {
        return {
          done: false,
          reply:
            "❓ Datum nicht erkannt. Beispiele:\n• morgen\n• nächsten Montag\n• 18.05.\n• 18.05.2026",
        };
      }
      resolved.target_date = date;
      // Now fetch tour count to show in confirm message
      const { data: sourceTours } = await supabase
        .from("tours")
        .select("id")
        .eq("tour_date", resolved.source_date)
        .neq("status", "cancelled");
      resolved.tour_count = sourceTours?.length ?? 0;
      nextField = nextPendingField(action, resolved);
      break;
    }

    case "confirm_copy": {
      const isYes = /^(ja\b|yes\b|jo\b|jep|yep|richtig|korrekt|stimmt|genau|passt)/i.test(trimmed);
      if (!isYes) {
        return {
          done: false,
          reply:
            "OK, abgebrochen. Falls du es doch machen möchtest, schick mir den Befehl einfach erneut.",
        };
      }
      resolved.confirm_copy = true;
      nextField = null; // all done
      break;
    }

    case "new_first_name":
      resolved.new_first_name = trimmed;
      nextField = nextPendingField(action, resolved);
      break;

    case "new_last_name":
      resolved.new_last_name = trimmed;
      nextField = nextPendingField(action, resolved);
      break;

    case "new_phone": {
      const skip = /^(weiter|skip|nein|nö|–|-|keine)$/i.test(trimmed);
      resolved.new_phone = skip ? null : trimmed;
      nextField = nextPendingField(action, resolved);
      break;
    }

    case "new_license_plate":
      resolved.new_license_plate = trimmed.toUpperCase();
      nextField = nextPendingField(action, resolved);
      break;

    case "new_vehicle_type":
      resolved.new_vehicle_type = trimmed;
      nextField = null; // all done
      break;

    default:
      // Unknown field — clear and abort
      return {
        done: false,
        reply:
          "❌ Unbekannter Dialog-Status. Bitte starte deinen Befehl nochmal von vorne.",
      };
  }

  // If a status warning was generated but we haven't set nextField to the confirm yet
  if (warningAppend && nextField && nextField.startsWith("_confirm_")) {
    await savePending(
      supabase,
      phone,
      action,
      resolved,
      nextField,
      null,
      pending.original_transcript
    );
    return { done: false, reply: warningAppend };
  }

  // Check if we're done
  if (!nextField) {
    return { done: true, resolved, action };
  }

  // Build the next question
  const { reply, options: newOptions } = await buildQuestion(
    supabase,
    nextField,
    resolved,
    null
  );

  await savePending(
    supabase,
    phone,
    action,
    resolved,
    nextField,
    newOptions,
    pending.original_transcript
  );

  return { done: false, reply };
}

// ---------------------------------------------------------------------------
// startClarification — called right after GPT parsing
// ---------------------------------------------------------------------------

export async function startClarification(
  supabase: any,
  phone: string,
  parsed: any,
  transcript: string
): Promise<
  | { done: false; reply: string }
  | { done: true; resolved: Record<string, any>; action: string }
  | null
> {
  const action = parsed.action as string;

  if (!["create_tour", "copy_tours", "create_driver", "create_vehicle"].includes(action)) {
    return null;
  }

  const resolved: Record<string, any> = {};

  if (action === "create_tour") {
    // Try to auto-resolve driver
    if (parsed.driver_name) {
      const matches = await findSimilarDrivers(supabase, parsed.driver_name);
      if (matches.length === 1) {
        resolved.driver = { ...matches[0], label: `${matches[0].first_name} ${matches[0].last_name}` };
      } else if (matches.length > 1) {
        const options = matches.map((d) => ({
          label: `${d.first_name} ${d.last_name}`,
          ...d,
        }));
        const formatted = formatOptions(options);
        const reply = pick(TEMPLATES.askDriver).replace("{options}", formatted);
        await savePending(supabase, phone, action, resolved, "driver", options, transcript);
        return { done: false, reply };
      }
      // else no match → ask with free text
      else {
        const reply = pick(TEMPLATES.askDriver).replace("{options}", "(keine Vorschläge)");
        await savePending(supabase, phone, action, resolved, "driver", null, transcript);
        return { done: false, reply };
      }
    }

    // Try to auto-resolve customer
    if (parsed.customer_name) {
      const matches = await findSimilarCustomers(supabase, parsed.customer_name);
      if (matches.length === 1) {
        resolved.customer = { ...matches[0], label: matches[0].company_name };
      } else if (matches.length > 1) {
        const options = matches.map((c) => ({ label: c.company_name, ...c }));
        const formatted = formatOptions(options);
        const reply = pick(TEMPLATES.askCustomer).replace("{options}", formatted);
        await savePending(supabase, phone, action, resolved, "customer", options, transcript);
        return { done: false, reply };
      } else {
        const reply = pick(TEMPLATES.askCustomer).replace("{options}", "(keine Vorschläge)");
        await savePending(supabase, phone, action, resolved, "customer", null, transcript);
        return { done: false, reply };
      }
    }

    // Try to auto-resolve vehicle
    if (parsed.license_plate) {
      const matches = await findSimilarVehicles(supabase, parsed.license_plate);
      if (matches.length === 1) {
        resolved.vehicle = { ...matches[0], label: `${matches[0].license_plate} (${matches[0].type})` };
      } else if (matches.length > 1) {
        const options = matches.map((v) => ({
          label: `${v.license_plate} (${v.type})`,
          ...v,
        }));
        const formatted = formatOptions(options);
        const reply = pick(TEMPLATES.askVehicle).replace("{options}", formatted);
        await savePending(supabase, phone, action, resolved, "vehicle", options, transcript);
        return { done: false, reply };
      }
    }

    // Pass through tour_date and notes from GPT
    if (parsed.tour_date) resolved.tour_date = parsed.tour_date;
    if (parsed.notes) resolved.notes = parsed.notes;
    if (parsed.vehicle_type) resolved.vehicle_type = parsed.vehicle_type;

    // Check for warnings on resolved driver/vehicle
    if (resolved.driver) {
      const warn = driverStatusWarning(resolved.driver);
      if (warn) {
        resolved._confirm_driver_status = false;
        await savePending(supabase, phone, action, resolved, "_confirm_driver_status", null, transcript);
        return { done: false, reply: warn };
      }
    }
    if (resolved.vehicle) {
      const warn = vehicleStatusWarning(resolved.vehicle);
      if (warn) {
        resolved._confirm_vehicle_status = false;
        await savePending(supabase, phone, action, resolved, "_confirm_vehicle_status", null, transcript);
        return { done: false, reply: warn };
      }
    }

    // All auto-resolved
    return { done: true, resolved, action };
  }

  if (action === "copy_tours") {
    // Dates may already be in parsed if the regex block handled it,
    // but startClarification is called from GPT path so we ask.
    const first = nextPendingField(action, resolved);
    if (!first) return { done: true, resolved, action };
    const { reply, options } = await buildQuestion(supabase, first, resolved, null);
    await savePending(supabase, phone, action, resolved, first, options, transcript);
    return { done: false, reply };
  }

  if (action === "create_driver") {
    if (parsed.new_first_name) resolved.new_first_name = parsed.new_first_name;
    if (parsed.new_last_name) resolved.new_last_name = parsed.new_last_name;
    if (parsed.new_phone) resolved.new_phone = parsed.new_phone;

    const first = nextPendingField(action, resolved);
    if (!first) return { done: true, resolved, action };
    const { reply, options } = await buildQuestion(supabase, first, resolved, null);
    await savePending(supabase, phone, action, resolved, first, options, transcript);
    return { done: false, reply };
  }

  if (action === "create_vehicle") {
    const plate = parsed.new_license_plate || parsed.license_plate;
    const type = parsed.new_vehicle_type || parsed.vehicle_type;
    if (plate) resolved.new_license_plate = plate.toUpperCase();
    if (type) resolved.new_vehicle_type = type;

    const first = nextPendingField(action, resolved);
    if (!first) return { done: true, resolved, action };
    const { reply, options } = await buildQuestion(supabase, first, resolved, null);
    await savePending(supabase, phone, action, resolved, first, options, transcript);
    return { done: false, reply };
  }

  return null;
}
