import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";

const BGL_URL =
  "https://www.bgl-ev.de/wp-content/uploads/simple-file-list/Dieselpreisinformationen/dieselpreisinfo-grossverbraucher.pdf";

/**
 * Fetches the latest BGL Großverbraucher diesel price from the BGL PDF.
 * The PDF is published around the 20th of each month and contains data
 * from the PREVIOUS month (e.g. April publication → March data).
 *
 * We store the month the data refers to (not the publication month).
 */
export async function POST() {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  try {
    const pdfBuffer = await fetch(BGL_URL, {
      headers: { "User-Agent": "Mozilla/5.0 (compatible; cargo-dispo/1.0)" },
      next: { revalidate: 0 },
    }).then((r) => r.arrayBuffer());

    // Convert PDF buffer to text for pattern matching
    const text = Buffer.from(pdfBuffer).toString("latin1");

    // Pattern 1: "Mrz 2026\t158,5\t172,25" style table rows
    // BGL PDF encodes the price table as text we can grep
    // Look for: month-year followed by index and EUR/100L price
    // e.g. "März 2026  158,5  172,25"
    const monthNames: Record<string, number> = {
      Jan: 1, Feb: 2, Mrz: 3, Mär: 3, Apr: 4, Mai: 5, Jun: 6,
      Jul: 7, Aug: 8, Sep: 9, Okt: 10, Nov: 11, Dez: 12,
    };

    // Match lines like: "Mrz 2026 158,5 172,25" — last number is EUR/100L
    const rowPattern =
      /(Jan|Feb|Mr[zä]|Apr|Mai|Jun|Jul|Aug|Sep|Okt|Nov|Dez)\s+(\d{4})\s+[\d,]+\s+([\d]+,[\d]{2})/gi;

    let latestYear = 0;
    let latestMonth = 0;
    let latestPrice: number | null = null;

    let match: RegExpExecArray | null;
    while ((match = rowPattern.exec(text)) !== null) {
      const abbr = match[1].substring(0, 3);
      const monthNum = monthNames[abbr.charAt(0).toUpperCase() + abbr.slice(1).toLowerCase()] ??
                       monthNames[abbr.toUpperCase()] ?? 0;
      const year = parseInt(match[2], 10);
      const price = parseFloat(match[3].replace(",", "."));

      if (
        monthNum > 0 &&
        price > 50 && price < 400 &&
        (year > latestYear || (year === latestYear && monthNum > latestMonth))
      ) {
        latestYear = year;
        latestMonth = monthNum;
        latestPrice = price;
      }
    }

    if (!latestPrice || latestYear === 0 || latestMonth === 0) {
      return NextResponse.json(
        { error: "BGL-Dieselpreis nicht gefunden. Bitte manuell eintragen." },
        { status: 422 }
      );
    }

    const month = `${latestYear}-${String(latestMonth).padStart(2, "0")}-01`;

    const { data, error } = await supabase
      .from("bgl_diesel_prices")
      .upsert(
        {
          month,
          price_netto: latestPrice,
          fetched_at: new Date().toISOString(),
          source_url: BGL_URL,
        },
        { onConflict: "month" }
      )
      .select()
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    return NextResponse.json({ success: true, month, price_netto: latestPrice, data });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Unbekannter Fehler";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
