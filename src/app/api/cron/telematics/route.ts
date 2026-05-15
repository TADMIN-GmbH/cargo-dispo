import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const TADMIN_API = "https://public.api.tadmin.de";

async function getTadminToken(): Promise<string> {
  const clientId = process.env.TADMIN_CLIENT_ID ?? "";
  const clientSecret = process.env.TADMIN_CLIENT_SECRET ?? "";
  const credentials = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");

  const res = await fetch(`${TADMIN_API}/auth/token`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${credentials}`,
      "Content-Type": "application/json",
    },
  });

  if (!res.ok) {
    throw new Error(`TADMIN auth failed: ${res.status} ${await res.text()}`);
  }

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

interface TelematicsResponse {
  count?: number;
  pings?: TelematicsPing[];
}

async function fetchTelematics(
  token: string,
  vehicleId: number,
  from: string,
  to: string,
): Promise<TelematicsResponse> {
  const res = await fetch(`${TADMIN_API}/v1/telematics/read`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ vehicleId, from, to }),
  });

  if (!res.ok) {
    throw new Error(`TADMIN telematics failed for vehicleId ${vehicleId}: ${res.status} ${await res.text()}`);
  }

  return res.json();
}

function extractMileages(response: TelematicsResponse): number[] {
  if (!Array.isArray(response.pings)) return [];
  return response.pings
    .map(ping =>
      ping?.telemetry?.vehicle?.metrics?.mileage ??
      ping?.telemetry?.tachograph?.mileage ??
      ping?.telemetry?.box?.mileage ??
      ping?.telemetry?.metrics?.mileage
    )
    .filter((m): m is number => typeof m === "number" && m > 0);
}

function computeTageskilometer(mileages: number[]): number | null {
  if (mileages.length === 0) return null;
  const first = mileages[0];
  const last = mileages[mileages.length - 1];
  const diff = last - first;
  if (diff > 0) return diff;
  // fallback: max - min
  const fallback = Math.max(...mileages) - Math.min(...mileages);
  return fallback > 0 ? fallback : null;
}

export async function GET(req: NextRequest) {
  // Verify cron secret
  const auth = req.headers.get("authorization");
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

  // Yesterday's date range (UTC)
  const now = new Date();
  const yesterday = new Date(now);
  yesterday.setUTCDate(yesterday.getUTCDate() - 1);
  const dateStr = yesterday.toISOString().slice(0, 10); // YYYY-MM-DD
  const from = `${dateStr}T00:00:00Z`;
  const to = `${dateStr}T23:59:59Z`;

  const errors: string[] = [];
  let updated = 0;

  // Get TADMIN token
  let token: string;
  try {
    token = await getTadminToken();
  } catch (err) {
    return NextResponse.json(
      { updated: 0, errors: [String(err)] },
      { status: 500 },
    );
  }

  // Fetch vehicles with TADMIN ID
  const { data: vehicles, error: vehiclesError } = await supabase
    .from("vehicles")
    .select("id, tadmin_vehicle_id")
    .not("tadmin_vehicle_id", "is", null);

  if (vehiclesError) {
    return NextResponse.json(
      { updated: 0, errors: [vehiclesError.message] },
      { status: 500 },
    );
  }

  for (const vehicle of vehicles ?? []) {
    const vehicleId = vehicle.tadmin_vehicle_id as number;
    try {
      const telematicsData = await fetchTelematics(token, vehicleId, from, to);
      const mileages = extractMileages(telematicsData);
      const tageskilometer = computeTageskilometer(mileages);

      if (tageskilometer === null) {
        // No valid data for this vehicle, skip
        continue;
      }

      // Find tours for this vehicle on yesterday with no actual_km
      const { data: tours, error: toursError } = await supabase
        .from("tours")
        .select("id")
        .eq("vehicle_id", vehicle.id)
        .eq("tour_date", dateStr)
        .is("actual_km", null);

      if (toursError) {
        errors.push(`Vehicle ${vehicleId}: tours query error: ${toursError.message}`);
        continue;
      }

      if (!tours || tours.length === 0) continue;

      const tourIds = tours.map((t: { id: string }) => t.id);

      const { error: updateError } = await supabase
        .from("tours")
        .update({ actual_km: tageskilometer })
        .in("id", tourIds);

      if (updateError) {
        errors.push(`Vehicle ${vehicleId}: update error: ${updateError.message}`);
        continue;
      }

      updated += tourIds.length;
    } catch (err) {
      errors.push(`Vehicle ${vehicleId}: ${String(err)}`);
    }
  }

  return NextResponse.json({ updated, errors });
}
