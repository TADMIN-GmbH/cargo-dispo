export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

// Normalize license plate for matching (remove spaces, dashes, uppercase)
function normalizePlate(plate: string): string {
  return plate.replace(/[\s\-]/g, "").toUpperCase();
}

// Parse German number format: "1.234,56" → 1234.56
function parseGermanNumber(val: string): number | null {
  if (!val || val.trim() === "") return null;
  const cleaned = val.replace(/\./g, "").replace(",", ".");
  const n = parseFloat(cleaned);
  return isNaN(n) ? null : n;
}

interface CsvRow {
  InvoiceId: string;
  InternalId: string;
  InvoiceDate: string;
  InvoiceDueDate: string;
  ProductName: string;
  DateTime: string;
  Date: string;
  Quantity: string;
  Price: string;
  PriceTotalNet: string;
  PriceTotalGross: string;
  PlaceOfDeliveryName: string;
  CardLicenseTag: string;
  DriverCardDriver: string;
  DriverCardLicenseTag: string;
}

function parseCsv(text: string): CsvRow[] {
  const lines = text.split("\n").filter((l) => l.trim());
  if (lines.length < 2) return [];

  const headers = lines[0].split(";").map((h) => h.trim());
  const rows: CsvRow[] = [];

  for (let i = 1; i < lines.length; i++) {
    const values = lines[i].split(";");
    const obj: Record<string, string> = {};
    headers.forEach((h, idx) => {
      obj[h] = (values[idx] ?? "").trim();
    });
    rows.push(obj as unknown as CsvRow);
  }
  return rows;
}

// Extract best license plate from row
function extractPlate(row: CsvRow): string {
  // DriverCardLicenseTag is most reliable when present
  if (row.DriverCardLicenseTag && row.DriverCardLicenseTag.trim()) {
    return row.DriverCardLicenseTag.trim();
  }
  if (row.CardLicenseTag && row.CardLicenseTag.trim()) {
    return row.CardLicenseTag.trim();
  }
  return "";
}

export async function POST(req: NextRequest) {
  const supabase = getSupabase();
  const formData = await req.formData();
  const csvFile = formData.get("csv") as File | null;
  const pdfFile = formData.get("pdf") as File | null;

  if (!csvFile) {
    return NextResponse.json({ error: "CSV required" }, { status: 400 });
  }

  const csvText = await csvFile.text();
  const rows = parseCsv(csvText);

  if (rows.length === 0) {
    return NextResponse.json({ error: "Empty or invalid CSV" }, { status: 400 });
  }

  // Extract invoice metadata from first row
  const firstRow = rows[0];
  const invoiceId = firstRow.InvoiceId ?? "";
  const internalId = firstRow.InternalId ?? "";
  const invoiceDate = firstRow.InvoiceDate ?? "";
  const invoiceDueDate = firstRow.InvoiceDueDate ?? "";

  // Check for duplicate invoice
  const { data: existing } = await supabase
    .from("fuel_invoices")
    .select("id")
    .eq("internal_id", internalId)
    .maybeSingle();

  if (existing) {
    return NextResponse.json(
      { error: `Rechnung ${internalId} bereits vorhanden` },
      { status: 409 },
    );
  }

  // Upload CSV to storage
  let csvUrl: string | null = null;
  const csvBytes = await csvFile.arrayBuffer();
  const csvPath = `fuel/${internalId}_${Date.now()}.csv`;
  const { error: csvUploadErr } = await supabase.storage
    .from("fuhrpark")
    .upload(csvPath, csvBytes, { contentType: "text/csv", upsert: false });
  if (!csvUploadErr) {
    const { data: urlData } = supabase.storage.from("fuhrpark").getPublicUrl(csvPath);
    csvUrl = urlData.publicUrl;
  }

  // Upload PDF if provided
  let pdfUrl: string | null = null;
  if (pdfFile) {
    const pdfBytes = await pdfFile.arrayBuffer();
    const pdfPath = `fuel/${internalId}_${Date.now()}.pdf`;
    const { error: pdfUploadErr } = await supabase.storage
      .from("fuhrpark")
      .upload(pdfPath, pdfBytes, { contentType: "application/pdf", upsert: false });
    if (!pdfUploadErr) {
      const { data: urlData } = supabase.storage.from("fuhrpark").getPublicUrl(pdfPath);
      pdfUrl = urlData.publicUrl;
    }
  }

  // Compute totals
  const totalNet = rows.reduce((s, r) => s + (parseGermanNumber(r.PriceTotalNet) ?? 0), 0);
  const totalGross = rows.reduce((s, r) => s + (parseGermanNumber(r.PriceTotalGross) ?? 0), 0);

  // Insert invoice record
  const { data: invoice, error: invoiceErr } = await supabase
    .from("fuel_invoices")
    .insert({
      invoice_id: invoiceId,
      internal_id: internalId,
      invoice_date: invoiceDate || null,
      invoice_due_date: invoiceDueDate || null,
      total_net: totalNet,
      total_gross: totalGross,
      pdf_url: pdfUrl,
      csv_url: csvUrl,
    })
    .select()
    .single();

  if (invoiceErr || !invoice) {
    return NextResponse.json({ error: invoiceErr?.message ?? "Insert failed" }, { status: 500 });
  }

  // Load all vehicles for plate matching
  const { data: vehicles } = await supabase
    .from("vehicles")
    .select("id, license_plate");

  const vehicleMap = new Map<string, string>();
  for (const v of vehicles ?? []) {
    vehicleMap.set(normalizePlate(v.license_plate), v.id);
  }

  // Insert transactions
  const transactions = rows.map((row) => {
    const platRaw = extractPlate(row);
    const vehicleId = platRaw ? (vehicleMap.get(normalizePlate(platRaw)) ?? null) : null;
    const driverName = row.DriverCardDriver?.trim() || null;

    return {
      fuel_invoice_id: invoice.id,
      vehicle_id: vehicleId,
      license_plate_raw: platRaw || null,
      transaction_date: row.Date || null,
      product: row.ProductName?.trim() || "Unbekannt",
      quantity_liters: parseGermanNumber(row.Quantity),
      price_per_liter: parseGermanNumber(row.Price),
      total_net: parseGermanNumber(row.PriceTotalNet),
      total_gross: parseGermanNumber(row.PriceTotalGross),
      place_of_delivery: row.PlaceOfDeliveryName?.trim() || null,
      driver_name: driverName,
    };
  });

  const { error: txErr } = await supabase.from("fuel_transactions").insert(transactions);
  if (txErr) {
    return NextResponse.json({ error: txErr.message }, { status: 500 });
  }

  const matched = transactions.filter((t) => t.vehicle_id !== null).length;
  const unmatched = transactions.filter((t) => t.vehicle_id === null).length;

  return NextResponse.json({
    success: true,
    invoice_id: invoice.id,
    internal_id: internalId,
    transactions: transactions.length,
    matched,
    unmatched,
    total_gross: totalGross,
  });
}

// GET: list fuel invoices with aggregated stats
export async function GET() {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from("fuel_invoices")
    .select("*")
    .order("invoice_date", { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}
