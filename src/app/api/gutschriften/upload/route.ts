import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import OpenAI from "openai";
import { execSync } from "child_process";
import { writeFileSync, readFileSync, readdirSync, mkdirSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import { randomUUID } from "crypto";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

export async function POST(req: NextRequest) {
  let tmpDir: string | null = null;

  try {
    const formData = await req.formData();
    const file = formData.get("file") as File;
    if (!file) return NextResponse.json({ error: "No file" }, { status: 400 });

    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);

    // Save to tmp
    tmpDir = join(tmpdir(), randomUUID());
    mkdirSync(tmpDir);
    const pdfPath = join(tmpDir, "input.pdf");
    writeFileSync(pdfPath, buffer);

    // Render pages as PNG
    const pngPrefix = join(tmpDir, "page");
    execSync(`/opt/homebrew/bin/pdftoppm -r 150 -png "${pdfPath}" "${pngPrefix}"`);

    // Find generated page files
    const pages = readdirSync(tmpDir)
      .filter((f: string) => f.startsWith("page") && f.endsWith(".png"))
      .sort();

    if (pages.length === 0) {
      return NextResponse.json({ error: "Failed to render PDF pages" }, { status: 500 });
    }

    // Build OpenAI message with all page images
    const imageContents = pages.map((p: string) => ({
      type: "image_url" as const,
      image_url: {
        url: `data:image/png;base64,${readFileSync(join(tmpDir!, p)).toString("base64")}`,
        detail: "high" as const,
      },
    }));

    const response = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [
        {
          role: "user",
          content: [
            ...imageContents,
            {
              type: "text",
              text: `Extract data from this Gutschrift (credit note). Return ONLY valid JSON:
{
  "gutschrift_nr": "string or null",
  "document_date": "YYYY-MM-DD or null",
  "absender": "company name or null",
  "netto_gesamt": number or null,
  "mwst": number or null,
  "brutto_gesamt": number or null,
  "positionen": [
    {
      "bel_datum": "YYYY-MM-DD or null",
      "kennzeichen": "license plate from Tour field e.g. HAM-CK 508, or null",
      "tour_nr": "tour number e.g. 10545296, or null",
      "auftrag_nr": "string or null",
      "kg": number or null,
      "netto_betrag": total net EUR for this position as number or null
    }
  ]
}
Convert German dates DD.MM.YYYY to YYYY-MM-DD.
Convert German numbers 1.234,56 to 1234.56.
Kennzeichen is after the tour number in the Tour column.
netto_betrag per position = sum of Fracht + Dieselzuschlag - abs(Mautzuschlag) (Mautzuschlag appears negative).`,
            },
          ],
        },
      ],
      max_tokens: 2000,
    });

    const raw = response.choices[0].message.content ?? "";
    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error("No JSON in OpenAI response");
    const extracted = JSON.parse(jsonMatch[0]);

    // Upload PDF to Supabase Storage
    const storagePath = `${randomUUID()}/${file.name}`;
    const { error: uploadError } = await supabase.storage
      .from("gutschriften")
      .upload(storagePath, buffer, { contentType: "application/pdf" });

    if (uploadError) {
      console.error("Storage upload error:", uploadError);
    }

    // Save to DB
    const { data: gutschrift, error } = await supabase
      .from("gutschriften")
      .insert({
        gutschrift_nr: extracted.gutschrift_nr,
        document_date: extracted.document_date,
        absender: extracted.absender,
        file_path: storagePath,
        file_name: file.name,
        netto_gesamt: extracted.netto_gesamt,
        mwst: extracted.mwst,
        brutto_gesamt: extracted.brutto_gesamt,
        extracted_by_ai: true,
      })
      .select()
      .single();

    if (error || !gutschrift) {
      return NextResponse.json({ error: error?.message ?? "DB insert failed" }, { status: 500 });
    }

    if (extracted.positionen?.length > 0) {
      await supabase.from("gutschrift_positionen").insert(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        extracted.positionen.map((p: any) => ({
          gutschrift_id: gutschrift.id,
          bel_datum: p.bel_datum,
          kennzeichen: p.kennzeichen,
          tour_nr: p.tour_nr,
          auftrag_nr: p.auftrag_nr,
          kg: p.kg,
          netto_betrag: p.netto_betrag,
        }))
      );
    }

    return NextResponse.json({ success: true, gutschrift_id: gutschrift.id });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  } finally {
    // Cleanup tmp files
    if (tmpDir) {
      try { execSync(`rm -rf "${tmpDir}"`); } catch { /* ignore */ }
    }
  }
}
