import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import Anthropic from "@anthropic-ai/sdk";
import { randomUUID } from "crypto";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const EXTRACTION_PROMPT = `Extrahiere alle Daten aus dieser Gutschrift (Kreditnote). Erkenne zuerst den Abrechnungstyp:

- "per_period": Fahrzeuge werden mit Tagessatz über einen Zeitraum abgerechnet (z.B. "HAM-CK 523 - 8 Tage à € 495,00")
- "per_tour": Klassische Einzelpositionen mit Datum pro Zeile/Zeilen

Antworte NUR mit validem JSON ohne Markdown-Codeblöcke:
{
  "billing_type": "per_tour oder per_period",
  "gutschrift_nr": "Gutschrift-Nummer als String oder null",
  "document_date": "YYYY-MM-DD oder null",
  "absender": "Name des ausstellenden Unternehmens oder null",
  "period_from": "YYYY-MM-DD oder null — nur bei per_period, Beginn des Abrechnungszeitraums",
  "period_to": "YYYY-MM-DD oder null — nur bei per_period, Ende des Abrechnungszeitraums",
  "netto_gesamt": Gesamtnettobetrag als Zahl oder null,
  "mwst": MwSt-Betrag als Zahl oder null,
  "brutto_gesamt": Gesamtbruttobetrag als Zahl oder null,
  "diesel_pct": Dieselzuschlag in Prozent als Zahl oder null,
  "diesel_amount": Dieselzuschlag als absoluter Betrag (Netto) als Zahl oder null,
  "vehicle_entries": [
    {
      "license_plate": "Kennzeichen normalisiert mit Leerzeichen statt Bindestrich, z.B. HAM CK 523",
      "days_claimed": Anzahl Tage als ganze Zahl,
      "daily_rate": Tagessatz als Zahl,
      "netto_subtotal": Teilsumme (Tage × Tagessatz) als Zahl
    }
  ],
  "positionen": [
    {
      "bel_datum": "YYYY-MM-DD oder null",
      "kennzeichen": "Fahrzeugreferenz oder null — siehe Regeln unten",
      "tour_nr": "Tour-/Auftrags-/SF-Nummer als String oder null",
      "auftrag_nr": "Auftragsnummer oder null",
      "kg": Kilogramm als Zahl oder null,
      "netto_betrag": Gesamtnettobetrag dieser Position als Zahl oder null
    }
  ]
}

Regeln:
- Bei per_period: vehicle_entries befüllen, positionen = []
- Bei per_tour: positionen befüllen, vehicle_entries = []
- Deutsche Datumsangaben DD.MM.YYYY → YYYY-MM-DD umrechnen
- Deutsche Zahlen 1.234,56 → 1234.56 umrechnen
- Kennzeichen bei per_period: Bindestrich durch Leerzeichen ersetzen (HAM-CK 523 → HAM CK 523)
- netto_gesamt = Summe Fahrzeug-Teilsummen + Dieselzuschlag (OHNE MwSt)
- diesel_amount = absoluter Netto-Betrag des Dieselzuschlags
- Kennzeichen bei per_tour: kann als Spalte, LKW-Nummer oder Abschnittsüberschrift erscheinen
- Alle Positionen aus ALLEN Seiten erfassen — keine auslassen`;

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const file = formData.get("file") as File;
    if (!file) return NextResponse.json({ error: "Keine Datei übermittelt" }, { status: 400 });
    if (!file.name.toLowerCase().endsWith(".pdf")) {
      return NextResponse.json({ error: "Nur PDF-Dateien erlaubt" }, { status: 400 });
    }

    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);
    const pdfBase64 = buffer.toString("base64");

    const message = await anthropic.messages.create({
      model: "claude-opus-4-5",
      max_tokens: 4096,
      messages: [
        {
          role: "user",
          content: [
            {
              type: "document",
              source: { type: "base64", media_type: "application/pdf", data: pdfBase64 },
            },
            { type: "text", text: EXTRACTION_PROMPT },
          ],
        },
      ],
    });

    const raw = message.content[0].type === "text" ? message.content[0].text : "";
    const cleaned = raw.replace(/^```(?:json)?\n?/m, "").replace(/\n?```$/m, "").trim();
    const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error("Kein JSON in der AI-Antwort gefunden");
    const extracted = JSON.parse(jsonMatch[0]);

    // Upload PDF to Supabase Storage
    const storagePath = `${randomUUID()}/${file.name}`;
    const { error: uploadError } = await supabase.storage
      .from("gutschriften")
      .upload(storagePath, buffer, { contentType: "application/pdf" });
    if (uploadError) console.error("Storage upload error:", uploadError);

    const billingType: string = extracted.billing_type ?? "per_tour";

    // Save gutschrift header
    const { data: gutschrift, error: dbError } = await supabase
      .from("gutschriften")
      .insert({
        gutschrift_nr: extracted.gutschrift_nr ?? null,
        document_date: extracted.document_date ?? null,
        absender: extracted.absender ?? null,
        file_path: storagePath,
        file_name: file.name,
        netto_gesamt: extracted.netto_gesamt ?? null,
        mwst: extracted.mwst ?? null,
        brutto_gesamt: extracted.brutto_gesamt ?? null,
        extracted_by_ai: true,
        billing_type: billingType,
        period_from: extracted.period_from ?? null,
        period_to: extracted.period_to ?? null,
        reconciliation_status: billingType === "per_period" ? "pending" : "none",
      })
      .select()
      .single();

    if (dbError || !gutschrift) {
      return NextResponse.json({ error: dbError?.message ?? "DB-Fehler" }, { status: 500 });
    }

    let positionenCount = 0;
    let vehicleEntriesCount = 0;

    if (billingType === "per_period" && Array.isArray(extracted.vehicle_entries) && extracted.vehicle_entries.length > 0) {
      // Allocate diesel proportionally by days
      const totalDays = extracted.vehicle_entries.reduce(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (s: number, e: any) => s + (e.days_claimed ?? 0),
        0
      );
      const dieselTotal: number = extracted.diesel_amount ?? 0;

      const { error: veError } = await supabase.from("gutschrift_vehicle_entries").insert(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        extracted.vehicle_entries.map((e: any) => ({
          gutschrift_id: gutschrift.id,
          license_plate: e.license_plate,
          period_from: extracted.period_from ?? null,
          period_to: extracted.period_to ?? null,
          days_claimed: e.days_claimed ?? null,
          daily_rate: e.daily_rate ?? null,
          netto_subtotal: e.netto_subtotal ?? null,
          diesel_pct: extracted.diesel_pct ?? null,
          diesel_amount:
            totalDays > 0
              ? Math.round(dieselTotal * ((e.days_claimed ?? 0) / totalDays) * 100) / 100
              : null,
        }))
      );
      if (veError) console.error("Vehicle entries insert error:", veError);
      vehicleEntriesCount = extracted.vehicle_entries.length;
    } else if (Array.isArray(extracted.positionen) && extracted.positionen.length > 0) {
      await supabase.from("gutschrift_positionen").insert(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        extracted.positionen.map((p: any) => ({
          gutschrift_id: gutschrift.id,
          bel_datum: p.bel_datum ?? null,
          kennzeichen: p.kennzeichen ?? null,
          tour_nr: p.tour_nr ?? null,
          auftrag_nr: p.auftrag_nr ?? null,
          kg: p.kg ?? null,
          netto_betrag: p.netto_betrag ?? null,
        }))
      );
      positionenCount = extracted.positionen.length;
    }

    return NextResponse.json({
      success: true,
      gutschrift_id: gutschrift.id,
      billing_type: billingType,
      positionen_count: positionenCount,
      vehicle_entries_count: vehicleEntriesCount,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unbekannter Fehler";
    console.error("Gutschrift upload error:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
