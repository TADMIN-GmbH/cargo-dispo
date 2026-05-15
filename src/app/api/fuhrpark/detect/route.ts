import { NextRequest, NextResponse } from "next/server";

/**
 * POST /api/fuhrpark/detect
 * Accepts a CSV file, reads the headers and returns the detected type.
 * Types: "kraftstoff" | "maut" | "unknown"
 */
export async function POST(req: NextRequest) {
  const formData = await req.formData();
  const file = formData.get("file") as File | null;

  if (!file) {
    return NextResponse.json({ error: "No file" }, { status: 400 });
  }

  // Read first line only (headers)
  const text = await file.text();
  const firstLine = text.split("\n")[0] ?? "";
  const headers = firstLine.split(";").map((h) => h.trim().toLowerCase());

  // DKV / UTA fuel CSV signature
  if (
    headers.includes("cardlicensetag") ||
    headers.includes("productname") ||
    headers.includes("invoiceid")
  ) {
    return NextResponse.json({ type: "kraftstoff", confidence: "high" });
  }

  // Toll Collect Maut CSV signature
  if (
    headers.includes("fahrzeugkennzeichen") ||
    headers.includes("achsklasse") ||
    headers.includes("mautbetrag") ||
    headers.includes("streckenabschnitt") ||
    headers.includes("benutzungszeitpunkt")
  ) {
    return NextResponse.json({ type: "maut", confidence: "high" });
  }

  return NextResponse.json({ type: "unknown", confidence: "none", headers });
}
