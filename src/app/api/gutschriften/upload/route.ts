import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import Anthropic from "@anthropic-ai/sdk";
import { randomUUID } from "crypto";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const EXTRACTION_PROMPT = `Extrahiere alle Daten aus dieser Gutschrift (Kreditnote). Antworte NUR mit validem JSON, ohne Markdown-Codeblöcke:
{
  "gutschrift_nr": "Gutschrift-Nummer als String oder null",
  "document_date": "Datum der Gutschrift als YYYY-MM-DD oder null",
  "absender": "Name des ausstellenden Unternehmens oder null",
  "netto_gesamt": Gesamtnettobetrag als Zahl oder null,
  "mwst": MwSt-Betrag als Zahl oder null,
  "brutto_gesamt": Gesamtbruttobetrag (Endbetrag) als Zahl oder null,
  "positionen": [
    {
      "bel_datum": "Belegdatum als YYYY-MM-DD oder null",
      "kennzeichen": "Kennzeichen aus dem Tour-/SF-Feld, z.B. HAM-CK 508 (kommt nach der Nummer), oder null",
      "tour_nr": "Tour-Nummer oder SF-NR. z.B. 10545296 oder 400027695, oder null",
      "auftrag_nr": "Auftragsnummer oder null",
      "kg": Kilogramm als Zahl oder null,
      "netto_betrag": Gesamtnettobetrag dieser Position (Summe aller Unterzeilen: Fracht + Dieselzuschlag - Mautzuschlag) als Zahl oder null
    }
  ]
}

Regeln:
- Deutsche Datumsangaben DD.MM.YYYY → YYYY-MM-DD umrechnen
- Deutsche Zahlen mit Tausenderpunkt und Komma (1.234,56) → 1234.56
- Die Spalte für die Tour-/Auftragsnummer kann verschiedene Bezeichnungen haben: "Tour", "Tour-Nr.", "SF-NR.", "Auftrag", "Beleg", "Lieferschein" o.ä. — immer die enthaltene Nummer in tour_nr übernehmen
- Das Kennzeichen (Fahrzeugkennzeichen) steht oft im selben Feld wie die Tour-/SF-Nummer, NACH der Nummer, z.B. "10545296 HAM-CK 508" → tour_nr = "10545296", kennzeichen = "HAM-CK 508". Falls das Kennzeichen in einer eigenen Spalte steht, ebenfalls erfassen.
- netto_betrag je Position = Fracht + Dieselzuschlag - |Mautzuschlag| (Mautzuschlag ist oft negativ)
- Alle Positionen aus allen Seiten erfassen`;

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

    // Send PDF directly to Claude (supports PDF natively)
    const message = await anthropic.messages.create({
      model: "claude-opus-4-5",
      max_tokens: 4096,
      messages: [
        {
          role: "user",
          content: [
            {
              type: "document",
              source: {
                type: "base64",
                media_type: "application/pdf",
                data: pdfBase64,
              },
            },
            {
              type: "text",
              text: EXTRACTION_PROMPT,
            },
          ],
        },
      ],
    });

    const raw = message.content[0].type === "text" ? message.content[0].text : "";
    // Strip markdown code fences if present
    const cleaned = raw.replace(/^```(?:json)?\n?/m, "").replace(/\n?```$/m, "").trim();
    const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error("Kein JSON in der AI-Antwort gefunden");
    const extracted = JSON.parse(jsonMatch[0]);

    // Upload PDF to Supabase Storage
    const storagePath = `${randomUUID()}/${file.name}`;
    const { error: uploadError } = await supabase.storage
      .from("gutschriften")
      .upload(storagePath, buffer, { contentType: "application/pdf" });

    if (uploadError) {
      console.error("Storage upload error:", uploadError);
    }

    // Save gutschrift header to DB
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
      })
      .select()
      .single();

    if (dbError || !gutschrift) {
      return NextResponse.json({ error: dbError?.message ?? "DB-Fehler" }, { status: 500 });
    }

    // Save line items
    if (Array.isArray(extracted.positionen) && extracted.positionen.length > 0) {
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
    }

    return NextResponse.json({
      success: true,
      gutschrift_id: gutschrift.id,
      positionen_count: extracted.positionen?.length ?? 0,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unbekannter Fehler";
    console.error("Gutschrift upload error:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
