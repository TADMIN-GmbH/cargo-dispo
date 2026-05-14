import { NextRequest, NextResponse } from "next/server";

// Monthly cron: fetch current diesel price from en2x.de
// Runs on 26th of each month (price for next month is available ~5 days before 1st)
// Vercel cron schedule: "0 6 26 * *" (06:00 on 26th of every month)
export async function GET(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://cargokoehler-dispo.vercel.app";
  const res = await fetch(`${baseUrl}/api/diesel-prices/fetch`, { method: "POST" });
  const data = await res.json();

  if (!res.ok) {
    console.error("Diesel price fetch failed:", data);
    return NextResponse.json({ error: data.error }, { status: 500 });
  }

  return NextResponse.json({ success: true, ...data });
}
