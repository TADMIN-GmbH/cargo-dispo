export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import Anthropic from "@anthropic-ai/sdk";
import { randomUUID } from "crypto";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const EXTRACTION_PROMPT = `Extrahiere alle Daten aus dieser Werkstattrechnungen / Reparaturrechnung.
Antworte NUR mit validem JSON ohne Markdown-Codeblöcke:
{
  "invoice_date": "YYYY-MM-DD oder null",
  "invoice_number": "Rechnungsnummer als String oder null",
  "supplier": "Name der Werkstatt/des Lieferanten oder null",
  "license_plate": "Kennzeichen des Fahrzeugs (normalisiert mit Leerzeichen: HAM CK 523) oder null",
  "km_reading": km-Stand als Integer oder null,
  "amount_netto": Nettobetrag als Zahl oder null,
  "amount_brutto": Bruttobetrag als Zahl oder null,
  "line_items": [
    {
      "description": "Beschreibung der Position",
      "category": "tire|brake|engine_oil|filter|inspection|body_repair|electrical|loading_security|accessory|tool|towing_service|tax_fee|used_part|no_wear_part|other",
      "qty": Menge als Zahl oder null,
      "unit": "Einheit (Stk, L, etc.) oder null",
      "unit_price": Einzelpreis als Zahl oder null,
      "amount": Gesamtbetrag als Zahl oder null
    }
  ]
}

Kategorisierungsregeln:
- tire: Reifen, Montage, Wuchten
- brake: Bremsen, Bremsbeläge, Bremsscheiben
- engine_oil: Motoröl, Getriebeöl, Ölwechsel
- filter: Luft-, Öl-, Kraftstoff-, Innenraumfilter
- inspection: HU, AU, SP, Inspektion, Sicherheitsprüfung
- body_repair: Karosserie, Lack, Unfall
- electrical: Batterie, Lichtmaschine, Elektrik, Anlasser
- loading_security: Zurrgurte, Spanngurte, Zurrschienen
- accessory: Zubehör wie Stützwinden, Spanngetriebe, Werkzeug-Halterungen
- tool: Werkzeug
- towing_service: Pannenhilfe, Abschleppdienst
- tax_fee: KFZ-Steuer, Gebühren
- used_part: Gebraucht-Ersatzteile
- no_wear_part: Nicht-Verschleißteil (alles was nicht zur Instandhaltung gehört)
- other: Sonstiges

Deutsche Zahlen 1.234,56 → 1234.56 umrechnen.`;

interface LineItem {
  description: string;
  category: string;
  qty: number | null;
  unit: string | null;
  unit_price: number | null;
  amount: number | null;
}

interface Anomaly {
  severity: "critical" | "warning" | "hint";
  type: string;
  message: string;
}

async function analyzeAnomalies(
  lineItems: LineItem[],
  vehicleId: string | null,
  licensePlate: string | null,
  amountBrutto: number | null
): Promise<Anomaly[]> {
  const anomalies: Anomaly[] = [];

  // Unknown plate check
  if (!vehicleId && licensePlate) {
    anomalies.push({
      severity: "hint",
      type: "unknown_plate",
      message: `Kennzeichen nicht im Fuhrpark — Transitkennzeichen oder Fremdfahrzeug?`,
    });
  }

  // High-cost check
  if (amountBrutto != null && amountBrutto > 2000) {
    anomalies.push({
      severity: "hint",
      type: "high_cost",
      message: `Hoher Rechnungsbetrag — bitte prüfen`,
    });
  }

  // No-wear-part check
  const noWearItems = lineItems.filter((li) => li.category === "no_wear_part");
  for (const item of noWearItems) {
    anomalies.push({
      severity: "hint",
      type: "no_wear_part",
      message: `Kein Verschleißteil: ${item.description}`,
    });
  }

  if (vehicleId) {
    // Oil quantity check
    const oilItems = lineItems.filter((li) => li.category === "engine_oil");
    const totalOilLiters = oilItems.reduce((sum, li) => {
      if (li.unit && li.unit.toLowerCase().includes("l") && li.qty) {
        return sum + li.qty;
      }
      return sum;
    }, 0);

    if (totalOilLiters > 0) {
      const { data: vehicle } = await supabase
        .from("vehicles")
        .select("engine_oil_capacity_liters")
        .eq("id", vehicleId)
        .single();

      if (vehicle?.engine_oil_capacity_liters) {
        const maxAllowed = vehicle.engine_oil_capacity_liters * 1.5;
        if (totalOilLiters > maxAllowed) {
          anomalies.push({
            severity: "warning",
            type: "oil_quantity",
            message: `Ölmenge (${totalOilLiters} L) übersteigt Motorkapazität (${vehicle.engine_oil_capacity_liters} L)`,
          });
        }
      }
    }

    // Repeated work check (same category within 60 days)
    const repeatableCategories = ["tire", "brake", "engine_oil", "inspection"];
    const invoiceCategories = [...new Set(lineItems.map((li) => li.category))].filter((c) =>
      repeatableCategories.includes(c)
    );

    if (invoiceCategories.length > 0) {
      const sixtyDaysAgo = new Date();
      sixtyDaysAgo.setDate(sixtyDaysAgo.getDate() - 60);
      const cutoff = sixtyDaysAgo.toISOString().split("T")[0];

      const { data: recentInvoices } = await supabase
        .from("repair_invoices")
        .select("line_items, invoice_date")
        .eq("vehicle_id", vehicleId)
        .gte("invoice_date", cutoff);

      if (recentInvoices && recentInvoices.length > 0) {
        const recentCategories = new Set<string>();
        for (const inv of recentInvoices) {
          const items: LineItem[] = Array.isArray(inv.line_items) ? inv.line_items : [];
          for (const item of items) {
            if (repeatableCategories.includes(item.category)) {
              recentCategories.add(item.category);
            }
          }
        }

        for (const cat of invoiceCategories) {
          if (recentCategories.has(cat)) {
            anomalies.push({
              severity: "warning",
              type: "repeated_work",
              message: `Gleiche Arbeit (${cat}) bereits in letzten 60 Tagen berechnet`,
            });
          }
        }
      }
    }
  }

  return anomalies;
}

function determineAiStatus(anomalies: Anomaly[]): string {
  if (anomalies.some((a) => a.severity === "critical")) return "alert";
  if (anomalies.some((a) => a.severity === "warning")) return "warning";
  if (anomalies.length > 0) return "ok";
  return "ok";
}

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

    // AI extraction
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
    const fileUuid = randomUUID();
    const storagePath = `${fileUuid}.pdf`;

    // Ensure bucket exists (ignore error if already exists)
    await supabase.storage.createBucket("repair-invoices", { public: false }).catch(() => {});

    const { error: uploadError } = await supabase.storage
      .from("repair-invoices")
      .upload(storagePath, buffer, { contentType: "application/pdf" });
    if (uploadError) console.error("Storage upload error:", uploadError);

    // Normalize license plate and match to vehicle
    const rawPlate: string | null = extracted.license_plate ?? null;
    const normalizedPlate = rawPlate
      ? rawPlate.replace(/-/g, " ").replace(/\s+/g, " ").trim().toUpperCase()
      : null;

    let vehicleId: string | null = null;
    if (normalizedPlate) {
      const { data: vehicle } = await supabase
        .from("vehicles")
        .select("id")
        .ilike("license_plate", normalizedPlate)
        .maybeSingle();
      if (vehicle) vehicleId = vehicle.id;
    }

    const lineItems: LineItem[] = Array.isArray(extracted.line_items) ? extracted.line_items : [];
    const amountBrutto: number | null = extracted.amount_brutto ?? null;

    // Run anomaly analysis
    const anomalies = await analyzeAnomalies(lineItems, vehicleId, normalizedPlate, amountBrutto);

    // Duplicate detection: same invoice_number + supplier already in DB?
    const invoiceNumber: string | null = extracted.invoice_number ?? null;
    const supplier: string | null = extracted.supplier ?? null;
    if (invoiceNumber && supplier) {
      const { data: existing } = await supabase
        .from("repair_invoices")
        .select("id, file_name, invoice_date")
        .ilike("invoice_number", invoiceNumber)
        .ilike("supplier", supplier)
        .limit(1);
      if (existing && existing.length > 0) {
        anomalies.unshift({
          severity: "critical",
          type: "duplicate",
          message: `Duplikat: Rechnung ${invoiceNumber} von ${supplier} bereits vorhanden (${existing[0].file_name ?? existing[0].id})`,
        });
      }
    }

    const aiStatus = determineAiStatus(anomalies);

    // Insert record
    const { data: record, error: dbError } = await supabase
      .from("repair_invoices")
      .insert({
        vehicle_id: vehicleId,
        license_plate: normalizedPlate,
        invoice_date: extracted.invoice_date ?? null,
        supplier: extracted.supplier ?? null,
        invoice_number: extracted.invoice_number ?? null,
        amount_netto: extracted.amount_netto ?? null,
        amount_brutto: amountBrutto,
        km_reading: extracted.km_reading ?? null,
        file_path: storagePath,
        file_name: file.name,
        line_items: lineItems,
        ai_anomalies: anomalies,
        ai_status: aiStatus,
      })
      .select()
      .single();

    if (dbError || !record) {
      return NextResponse.json({ error: dbError?.message ?? "DB-Fehler" }, { status: 500 });
    }

    return NextResponse.json({ success: true, record });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Unbekannter Fehler";
    console.error("Repair invoice upload error:", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
