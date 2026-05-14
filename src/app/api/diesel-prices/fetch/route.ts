import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const EN2X_URL = "https://en2x.de/service/statistiken/verbraucherpreise/";

// Fetches the current month's diesel price from en2x.de and stores it.
// Called by cron on 26th of month, or manually from settings.
export async function POST() {
  try {
    const html = await fetch(EN2X_URL, {
      headers: { "User-Agent": "Mozilla/5.0 (compatible; cargo-dispo/1.0)" },
      next: { revalidate: 0 },
    }).then((r) => r.text());

    // en2x.de publishes a table with fuel prices including diesel (Diesel)
    // Try multiple extraction patterns in order of specificity
    let price_brutto: number | null = null;

    // Pattern 1: look for "Diesel" followed by a German decimal price near it
    // e.g., "Diesel</td><td>1,7359" or "Diesel 1,7359"
    const patterns = [
      // Table cell after "Diesel" keyword
      /[Dd]iesel[^<]{0,50}?(\d+,\d{2,4})/,
      // "Super E10" style table: Diesel row with price
      />[Dd]iesel\s*<[^>]+>\s*(\d+[.,]\d+)/,
      // Generic: first 4-decimal price after "diesel" (case insensitive, within 200 chars)
      /diesel.{0,200}?(\d+[.,]\d{4})/i,
      // Any price that looks like a fuel price (1.xx - 2.xx EUR)
      /(?:1|2)[.,]\d{3,4}/,
    ];

    for (const pattern of patterns) {
      const match = html.match(pattern);
      if (match) {
        const raw = match[1] ?? match[0];
        // Normalize German decimal comma to dot
        const normalized = raw.replace(",", ".");
        let parsed = parseFloat(normalized);
        // en2x publishes prices per 100 Liter (e.g. 173,59 = 1,7359 €/L)
        if (parsed > 100 && parsed < 350) {
          parsed = Math.round(parsed) / 100;
        }
        if (parsed > 1.0 && parsed < 3.5) {
          price_brutto = parsed;
          break;
        }
      }
    }

    if (!price_brutto) {
      return NextResponse.json(
        { error: "Dieselpreis nicht auf en2x.de gefunden. Bitte manuell eintragen." },
        { status: 422 }
      );
    }

    const price_netto = Math.round((price_brutto / 1.19) * 10000) / 10000;

    // Store for the CURRENT month (this price will be used in 2 months for billing)
    const now = new Date();
    const month = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;

    const { data, error } = await supabase
      .from("diesel_prices")
      .upsert(
        { month, price_brutto, price_netto, fetched_at: new Date().toISOString(), source_url: EN2X_URL },
        { onConflict: "month" }
      )
      .select()
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    return NextResponse.json({ success: true, month, price_brutto, price_netto, data });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Unbekannter Fehler";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
