import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = "https://gbcxekmeeyybxzoynles.supabase.co";
const SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImdiY3hla21lZXl5Ynh6b3lubGVzIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3ODU2NzE0MywiZXhwIjoyMDk0MTQzMTQzfQ.KOWD_zhJBTHRyZHR9UVYdNPYaHmKQR-oI5smrRp83Tg";
const TADMIN_API = "https://public.api.tadmin.de";
const TADMIN_CLIENT_ID = "cargokoehler_test";
const TADMIN_CLIENT_SECRET = "Timo2311!";

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

async function getToken() {
  const creds = Buffer.from(`${TADMIN_CLIENT_ID}:${TADMIN_CLIENT_SECRET}`).toString("base64");
  const res = await fetch(`${TADMIN_API}/auth/token`, {
    method: "POST",
    headers: { Authorization: `Basic ${creds}`, "Content-Type": "application/json" },
  });
  const data = await res.json();
  if (!res.ok) throw new Error(`Auth failed: ${JSON.stringify(data)}`);
  console.log("✓ Token erhalten, läuft ab in", data.expires_in, "Sekunden");
  return data.access_token;
}

function extractKm(pings) {
  const mileages = pings
    .map(p => p?.telemetry?.vehicle?.metrics?.mileage ?? p?.telemetry?.tachograph?.mileage ?? p?.telemetry?.box?.mileage ?? p?.telemetry?.metrics?.mileage)
    .filter(m => typeof m === "number" && m > 0);
  if (mileages.length === 0) return null;
  const diff = mileages[mileages.length - 1] - mileages[0];
  if (diff > 0) return diff;
  const fallback = Math.max(...mileages) - Math.min(...mileages);
  return fallback > 0 ? fallback : null;
}

async function run() {
  let token = await getToken();
  let tokenFetchedAt = Date.now();

  const { data: vehicles } = await supabase.from("vehicles").select("id, tadmin_vehicle_id, license_plate").not("tadmin_vehicle_id", "is", null);
  console.log(`✓ ${vehicles.length} Fahrzeuge mit TADMIN-ID gefunden:`, vehicles.map(v => `${v.license_plate}(${v.tadmin_vehicle_id})`).join(", "));

  const from = new Date("2026-01-01T00:00:00Z");
  const to = new Date("2026-05-14T23:59:59Z");

  let totalUpdated = 0;
  let totalErrors = 0;

  for (const vehicle of vehicles) {
    console.log(`\n→ ${vehicle.license_plate} (TADMIN ID: ${vehicle.tadmin_vehicle_id})`);
    const cursor = new Date(from);
    
    while (cursor <= to) {
      // Refresh token if older than 12 minutes
      if (Date.now() - tokenFetchedAt > 12 * 60 * 1000) {
        token = await getToken();
        tokenFetchedAt = Date.now();
      }

      const batchFrom = new Date(cursor);
      const batchTo = new Date(cursor);
      batchTo.setUTCDate(batchTo.getUTCDate() + 6);
      batchTo.setUTCHours(23, 59, 59, 999);
      if (batchTo > to) batchTo.setTime(to.getTime());

      try {
        const res = await fetch(`${TADMIN_API}/v1/telematics/read`, {
          method: "POST",
          headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
          body: JSON.stringify({ vehicleId: vehicle.tadmin_vehicle_id, from: batchFrom.toISOString(), to: batchTo.toISOString() }),
        });
        const data = await res.json();
        const pings = data.pings ?? [];
        
        // Group by date
        const byDate = {};
        for (const ping of pings) {
          if (ping.timestamp) {
            const date = ping.timestamp.slice(0, 10);
            if (!byDate[date]) byDate[date] = [];
            byDate[date].push(ping);
          }
        }

        for (const [date, dayPings] of Object.entries(byDate)) {
          const km = extractKm(dayPings);
          if (km === null) continue;

          const { data: tours } = await supabase.from("tours").select("id").eq("vehicle_id", vehicle.id).eq("tour_date", date).is("actual_km", null);
          if (!tours || tours.length === 0) continue;

          const { error } = await supabase.from("tours").update({ actual_km: km }).in("id", tours.map(t => t.id));
          if (error) { console.log(`  ✗ ${date}: ${error.message}`); totalErrors++; }
          else { console.log(`  ✓ ${date}: ${km} km → ${tours.length} Tour(en)`); totalUpdated += tours.length; }
        }
      } catch (err) {
        console.log(`  ✗ Batch ${batchFrom.toISOString().slice(0,10)}: ${err.message}`);
        totalErrors++;
      }

      cursor.setUTCDate(cursor.getUTCDate() + 7);
    }
  }

  console.log(`\n✅ Fertig: ${totalUpdated} Touren aktualisiert, ${totalErrors} Fehler`);
}

run().catch(console.error);
