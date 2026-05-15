import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const TADMIN_API = "https://public.api.tadmin.de";

async function getTadminToken(): Promise<string> {
  const clientId = process.env.TADMIN_CLIENT_ID ?? "";
  const clientSecret = process.env.TADMIN_CLIENT_SECRET ?? "";
  const credentials = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");
  const res = await fetch(`${TADMIN_API}/auth/token`, {
    method: "POST",
    headers: { Authorization: `Basic ${credentials}`, "Content-Type": "application/json" },
  });
  if (!res.ok) throw new Error(`TADMIN auth failed: ${res.status} ${await res.text()}`);
  const data = await res.json();
  return data.access_token as string;
}

interface TelematicsPing {
  telemetry?: {
    vehicle?: { metrics?: { mileage?: number | null } };
    box?: { mileage?: number | null };
    tachograph?: { mileage?: number | null };
    metrics?: { mileage?: number | null };
  };
}

function extractMileages(pings: TelematicsPing[]): number[] {
  return pings
    .map(p =>
      p?.telemetry?.vehicle?.metrics?.mileage ??
      p?.telemetry?.tachograph?.mileage ??
      p?.telemetry?.box?.mileage ??
      p?.telemetry?.metrics?.mileage
    )
    .filter((m): m is number => typeof m === "number" && m > 0);
}

function computeKm(mileages: number[]): number | null {
  if (mileages.length === 0) return null;
  const diff = mileages[mileages.length - 1] - mileages[0];
  if (diff > 0) return diff;
  const fallback = Math.max(...mileages) - Math.min(...mileages);
  return fallback > 0 ? fallback : null;
}

// Split date range into weekly chunks (max 7 days per TADMIN API limit)
function weeklyChunks(from: Date, to: Date): Array<{ from: string; to: string; date: string }> {
  const chunks: Array<{ from: string; to: string; date: string }> = [];
  const cursor = new Date(from);
  while (cursor <= to) {
    const dayEnd = new Date(cursor);
    dayEnd.setUTCHours(23, 59, 59, 999);
    const chunkEnd = dayEnd < to ? dayEnd : to;
    chunks.push({
      from: cursor.toISOString(),
      to: chunkEnd.toISOString(),
      date: cursor.toISOString().slice(0, 10),
    });
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return chunks;
}

// GET /api/cron/telematics/backfill?from=2026-01-01&to=2026-05-14
export async function GET(req: NextRequest) {
  const auth = req.headers.get("authorization");
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const fromParam = req.nextUrl.searchParams.get("from") ?? "2026-01-01";
  const toParam = req.nextUrl.searchParams.get("to") ??
    new Date(Date.now() - 86400000).toISOString().slice(0, 10); // yesterday

  const fromDate = new Date(`${fromParam}T00:00:00Z`);
  const toDate = new Date(`${toParam}T23:59:59Z`);

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

  const errors: string[] = [];
  let updated = 0;
  let skipped = 0;

  let token: string;
  try {
    token = await getTadminToken();
  } catch (err) {
    return NextResponse.json({ updated: 0, errors: [String(err)] }, { status: 500 });
  }

  const { data: vehicles, error: vehiclesError } = await supabase
    .from("vehicles")
    .select("id, tadmin_vehicle_id, license_plate")
    .not("tadmin_vehicle_id", "is", null);

  if (vehiclesError) {
    return NextResponse.json({ updated: 0, errors: [vehiclesError.message] }, { status: 500 });
  }

  const days = weeklyChunks(fromDate, toDate);

  for (const vehicle of vehicles ?? []) {
    const tadminId = vehicle.tadmin_vehicle_id as number;

    // Process in 7-day batches to respect API limit
    const batchSize = 7;
    for (let i = 0; i < days.length; i += batchSize) {
      const batch = days.slice(i, i + batchSize);
      const batchFrom = batch[0].from;
      const batchTo = batch[batch.length - 1].to;

      let pings: TelematicsPing[] = [];
      try {
        // Token expires after 15 min — refresh if processing many vehicles
        const res = await fetch(`${TADMIN_API}/v1/telematics/read`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ vehicleId: tadminId, from: batchFrom, to: batchTo }),
        });

        if (res.status === 401) {
          // Token expired — refresh
          token = await getTadminToken();
          const retry = await fetch(`${TADMIN_API}/v1/telematics/read`, {
            method: "POST",
            headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
            body: JSON.stringify({ vehicleId: tadminId, from: batchFrom, to: batchTo }),
          });
          if (!retry.ok) throw new Error(`${retry.status} ${await retry.text()}`);
          const data = await retry.json();
          pings = data.pings ?? [];
        } else if (!res.ok) {
          throw new Error(`${res.status} ${await res.text()}`);
        } else {
          const data = await res.json();
          pings = data.pings ?? [];
        }
      } catch (err) {
        errors.push(`Vehicle ${vehicle.license_plate} (${tadminId}) batch ${batchFrom}: ${String(err)}`);
        continue;
      }

      // Group pings by date
      const pingsByDate: Record<string, TelematicsPing[]> = {};
      for (const ping of pings) {
        // pings don't carry timestamp in our type but the API returns it
        const p = ping as TelematicsPing & { timestamp?: string };
        if (p.timestamp) {
          const date = p.timestamp.slice(0, 10);
          if (!pingsByDate[date]) pingsByDate[date] = [];
          pingsByDate[date].push(ping);
        }
      }

      // For each day in batch, compute km and update tours
      for (const day of batch) {
        const dayPings = pingsByDate[day.date] ?? [];
        const mileages = extractMileages(dayPings);
        const km = computeKm(mileages);

        if (km === null) { skipped++; continue; }

        const { data: tours } = await supabase
          .from("tours")
          .select("id")
          .eq("vehicle_id", vehicle.id)
          .eq("tour_date", day.date)
          .is("actual_km", null);

        if (!tours || tours.length === 0) { skipped++; continue; }

        const { error: updateError } = await supabase
          .from("tours")
          .update({ actual_km: km })
          .in("id", tours.map((t: { id: string }) => t.id));

        if (updateError) {
          errors.push(`Vehicle ${vehicle.license_plate} ${day.date}: ${updateError.message}`);
        } else {
          updated += tours.length;
        }
      }
    }
  }

  return NextResponse.json({ updated, skipped, errors, vehicles: vehicles?.length ?? 0 });
}
