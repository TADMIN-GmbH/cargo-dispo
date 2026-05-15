import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

function normalizePlate(plate: string): string {
  return plate.replace(/[\s\-]/g, "").toUpperCase();
}

function parseGermanDecimal(val: string): number | null {
  if (!val || val.trim() === "") return null;
  const cleaned = val.trim().replace(",", ".");
  const n = parseFloat(cleaned);
  return isNaN(n) ? null : n;
}

function parseGermanDate(val: string): string | null {
  // "26.03.2026" → "2026-03-26"
  const match = val.trim().match(/^(\d{2})\.(\d{2})\.(\d{4})$/);
  if (!match) return null;
  return `${match[3]}-${match[2]}-${match[1]}`;
}

export async function POST(req: NextRequest) {
  const supabase = getSupabase();
  const formData = await req.formData();
  const csvFile = formData.get("csv") as File | null;

  if (!csvFile) {
    return NextResponse.json({ error: "CSV required" }, { status: 400 });
  }

  const text = await csvFile.text();
  const lines = text.split("\n");

  if (lines.length < 2) {
    return NextResponse.json({ error: "Empty or invalid CSV" }, { status: 400 });
  }

  // Parse header row
  const headerCols = lines[0].split(";");
  const accountNumber = headerCols[0]?.trim() ?? "";

  // Parse data rows: skip header, skip rows with < 10 columns or empty booking_number
  interface MautRow {
    licensePlateRaw: string;
    date: string;
    time: string;
    bookingNumber: string;
    entryPoint: string;
    via: string;
    exitPoint: string;
    km: number | null;
    tollEur: number | null;
    cancellationFeeEur: number | null;
  }

  const rows: MautRow[] = [];
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i];
    if (!line.trim()) continue;
    const cols = line.split(";");
    if (cols.length < 10) continue;
    const bookingNumber = cols[4]?.trim() ?? "";
    if (!bookingNumber) continue;

    rows.push({
      licensePlateRaw: cols[1]?.trim() ?? "",
      date: cols[2]?.trim() ?? "",
      time: cols[3]?.trim() ?? "",
      bookingNumber,
      entryPoint: cols[6]?.trim() ?? "",
      via: cols[7]?.trim() ?? "",
      exitPoint: cols[8]?.trim() ?? "",
      km: parseGermanDecimal(cols[17] ?? ""),
      tollEur: parseGermanDecimal(cols[18] ?? ""),
      cancellationFeeEur: parseGermanDecimal(cols[19] ?? ""),
    });
  }

  if (rows.length === 0) {
    return NextResponse.json({ error: "No valid data rows found" }, { status: 400 });
  }

  // Determine period_from / period_to from min/max dates
  const parsedDates = rows
    .map((r) => parseGermanDate(r.date))
    .filter((d): d is string => d !== null)
    .sort();

  const periodFrom = parsedDates[0];
  const periodTo = parsedDates[parsedDates.length - 1];

  if (!periodFrom || !periodTo) {
    return NextResponse.json({ error: "Could not determine date range" }, { status: 400 });
  }

  const internalId = `MAUT-${accountNumber}-${periodFrom}-${periodTo}`;

  // Duplicate check
  const { data: existing } = await supabase
    .from("maut_invoices")
    .select("id")
    .eq("internal_id", internalId)
    .maybeSingle();

  if (existing) {
    return NextResponse.json({ error: "Bereits importiert", internal_id: internalId }, { status: 409 });
  }

  // Compute totals
  const totalKm = rows.reduce((s, r) => s + (r.km ?? 0), 0);
  const totalEur = rows.reduce((s, r) => s + (r.tollEur ?? 0), 0);

  // Insert invoice
  const { data: invoice, error: invoiceErr } = await supabase
    .from("maut_invoices")
    .insert({
      internal_id: internalId,
      account_number: accountNumber || null,
      period_from: periodFrom,
      period_to: periodTo,
      total_km: Math.round(totalKm * 10) / 10,
      total_eur: Math.round(totalEur * 100) / 100,
      transaction_count: rows.length,
    })
    .select()
    .single();

  if (invoiceErr || !invoice) {
    return NextResponse.json({ error: invoiceErr?.message ?? "Insert failed" }, { status: 500 });
  }

  // Load vehicles for plate matching
  const { data: vehicles } = await supabase.from("vehicles").select("id, license_plate");
  const vehicleMap = new Map<string, string>();
  for (const v of vehicles ?? []) {
    vehicleMap.set(normalizePlate(v.license_plate), v.id);
  }

  // Build transactions
  const transactions = rows.map((row) => {
    const plateNorm = normalizePlate(row.licensePlateRaw);
    const vehicleId = vehicleMap.get(plateNorm) ?? null;
    const dateStr = parseGermanDate(row.date);
    const bookedAt = dateStr ? `${dateStr}T${row.time}:00` : null;

    return {
      invoice_id: invoice.id,
      vehicle_id: vehicleId,
      license_plate_raw: row.licensePlateRaw || null,
      license_plate_normalized: plateNorm || null,
      booked_at: bookedAt,
      entry_point: row.entryPoint || null,
      via: row.via || null,
      exit_point: row.exitPoint || null,
      km: row.km,
      toll_eur: row.tollEur,
      cancellation_fee_eur: row.cancellationFeeEur ?? 0,
      booking_number: row.bookingNumber,
    };
  });

  const { error: txErr } = await supabase.from("maut_transactions").insert(transactions);
  if (txErr) {
    return NextResponse.json({ error: txErr.message }, { status: 500 });
  }

  const matched = transactions.filter((t) => t.vehicle_id !== null).length;
  const unmatched = transactions.filter((t) => t.vehicle_id === null).length;

  return NextResponse.json({
    success: true,
    internal_id: internalId,
    transactions: transactions.length,
    matched,
    unmatched,
    total_eur: Math.round(totalEur * 100) / 100,
    period_from: periodFrom,
    period_to: periodTo,
  });
}
