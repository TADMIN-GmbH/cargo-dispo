"use client";

import { useState } from "react";
import { Route } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface Customer {
  id: string;
  company_name: string;
  km_billing_type: string;
}

interface KmRow {
  vehicle_id: string;
  license_plate: string;
  vehicle_type: string | null;
  km_class: string | null;
  tours_count: number;
  soll_km: number | null;
  actual_km: number;
  tours_without_km: number;
  diff_km: number | null;
  free_km: number | null;
  extra_km_rate: number | null;
  mehrkilometer_eur: number | null;
  pricing_model_found: boolean;
}

interface FleetTotal {
  tours_count: number;
  soll_km: number;
  actual_km: number;
  tours_without_km: number;
  diff_km: number;
  mehrkilometer_eur: number;
}

interface ApiResult {
  customer: Customer;
  period: { from: string; to: string };
  km_billing_type: string;
  rows: KmRow[];
  fleet_total: FleetTotal | null;
}

const MONTHS = [
  "Januar", "Februar", "März", "April", "Mai", "Juni",
  "Juli", "August", "September", "Oktober", "November", "Dezember",
];

function fmtKm(n: number | null) {
  if (n === null) return "–";
  return n.toLocaleString("de-DE", { maximumFractionDigits: 0 }) + " km";
}

function fmtEur(n: number | null) {
  if (n === null) return "–";
  return n.toLocaleString("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " €";
}

function fmtRate(n: number | null) {
  if (n === null || n === 0) return "–";
  return n.toLocaleString("de-DE", { minimumFractionDigits: 4, maximumFractionDigits: 4 }) + " €/km";
}

function DiffCell({ diff_km }: { diff_km: number | null }) {
  if (diff_km === null) return <span className="text-gray-400">–</span>;
  if (diff_km > 0)
    return <span className="text-red-600 font-semibold">+{fmtKm(diff_km)}</span>;
  if (diff_km < 0)
    return <span className="text-green-600 font-semibold">{fmtKm(diff_km)}</span>;
  return <span className="text-gray-500">0 km</span>;
}

export function KmAuswertungView({ customers }: { customers: Customer[] }) {
  const now = new Date();
  const [customerId, setCustomerId] = useState("");
  const [year, setYear] = useState(String(now.getFullYear()));
  const [month, setMonth] = useState(String(now.getMonth() + 1));
  const [half, setHalf] = useState("1");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<ApiResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleLoad() {
    if (!customerId) return;
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const params = new URLSearchParams({
        customer_id: customerId,
        year,
        month,
        half,
      });
      const res = await fetch(`/api/km-auswertung?${params}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Fehler beim Laden");
      setResult(data);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Unbekannter Fehler");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Route className="w-6 h-6 text-blue-600" />
        <h1 className="text-2xl font-bold text-gray-900">KM-Auswertung</h1>
      </div>

      {/* Filter bar */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex flex-wrap gap-4 items-end">
            {/* Customer */}
            <div className="flex flex-col gap-1.5 min-w-[220px]">
              <Label>Kunde</Label>
              <Select value={customerId} onValueChange={setCustomerId}>
                <SelectTrigger>
                  <SelectValue placeholder="Kunde wählen…" />
                </SelectTrigger>
                <SelectContent>
                  {customers.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.company_name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Year */}
            <div className="flex flex-col gap-1.5 w-24">
              <Label>Jahr</Label>
              <Input
                type="number"
                value={year}
                onChange={(e) => setYear(e.target.value)}
                min={2020}
                max={2099}
              />
            </div>

            {/* Month */}
            <div className="flex flex-col gap-1.5 w-36">
              <Label>Monat</Label>
              <Select value={month} onValueChange={setMonth}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {MONTHS.map((name, i) => (
                    <SelectItem key={i + 1} value={String(i + 1)}>
                      {name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Half */}
            <div className="flex flex-col gap-1.5 w-36">
              <Label>Hälfte</Label>
              <Select value={half} onValueChange={setHalf}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="1">1–15</SelectItem>
                  <SelectItem value="2">16–Ende</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <Button onClick={handleLoad} disabled={!customerId || loading}>
              {loading ? (
                <span className="flex items-center gap-2">
                  <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                  </svg>
                  Laden…
                </span>
              ) : (
                "Laden"
              )}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Error */}
      {error && (
        <div className="rounded-md bg-red-50 border border-red-200 p-4 text-red-700 text-sm">
          {error}
        </div>
      )}

      {/* Empty state */}
      {!loading && !result && !error && (
        <div className="text-center text-gray-400 py-16">
          Wähle einen Kunden und klicke auf „Laden"
        </div>
      )}

      {/* Results */}
      {result && (
        <Card>
          <CardContent className="pt-6">
            <div className="mb-4 flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-500">
                  Zeitraum:{" "}
                  <span className="font-medium text-gray-700">
                    {result.period.from} – {result.period.to}
                  </span>
                </p>
                <p className="text-sm text-gray-500">
                  Abrechnungsmodell:{" "}
                  <span className="font-medium text-gray-700">
                    {result.km_billing_type === "fleet" ? "Flotte (gesamt)" : "Je Fahrzeug"}
                  </span>
                </p>
              </div>
            </div>

            {result.rows.length === 0 ? (
              <p className="text-gray-400 text-sm py-8 text-center">
                Keine Touren mit Fahrzeug im gewählten Zeitraum gefunden.
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b text-left text-gray-500 text-xs uppercase tracking-wide">
                      <th className="pb-2 pr-4">Fahrzeug</th>
                      <th className="pb-2 pr-4">Typ</th>
                      <th className="pb-2 pr-4 text-right">Touren</th>
                      <th className="pb-2 pr-4 text-right">Soll-km</th>
                      <th className="pb-2 pr-4 text-right">Ist-km</th>
                      <th className="pb-2 pr-4 text-right">Differenz</th>
                      <th className="pb-2 pr-4 text-right">Preis/km</th>
                      <th className="pb-2 text-right">Mehrkilometer €</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {result.rows.map((row) => (
                      <tr key={row.vehicle_id} className="hover:bg-gray-50">
                        <td className="py-2 pr-4 font-medium">
                          <div className="flex items-center gap-2">
                            {row.license_plate}
                            {row.tours_without_km > 0 && (
                              <span className="inline-flex items-center rounded-full bg-amber-100 text-amber-700 text-xs px-2 py-0.5">
                                {row.tours_without_km} ohne km
                              </span>
                            )}
                            {!row.pricing_model_found && (
                              <span className="inline-flex items-center rounded-full bg-red-100 text-red-700 text-xs px-2 py-0.5">
                                Kein Preismodell
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="py-2 pr-4 text-gray-600">
                          {row.vehicle_type ?? "–"}
                          {row.km_class ? ` / ${row.km_class}` : ""}
                        </td>
                        <td className="py-2 pr-4 text-right">{row.tours_count}</td>
                        <td className="py-2 pr-4 text-right text-gray-600">{fmtKm(row.soll_km)}</td>
                        <td className="py-2 pr-4 text-right text-gray-600">{fmtKm(row.actual_km)}</td>
                        <td className="py-2 pr-4 text-right">
                          <DiffCell diff_km={row.diff_km} />
                        </td>
                        <td className="py-2 pr-4 text-right text-gray-600">{fmtRate(row.extra_km_rate)}</td>
                        <td className="py-2 text-right font-medium">
                          {row.mehrkilometer_eur !== null && row.mehrkilometer_eur > 0 ? (
                            <span className="text-red-600">{fmtEur(row.mehrkilometer_eur)}</span>
                          ) : (
                            <span className="text-gray-400">–</span>
                          )}
                        </td>
                      </tr>
                    ))}

                    {/* Fleet total row */}
                    {result.fleet_total && (
                      <tr className="bg-blue-50 font-bold border-t-2 border-blue-200">
                        <td className="py-3 pr-4 text-blue-900" colSpan={2}>
                          Flotte gesamt
                        </td>
                        <td className="py-3 pr-4 text-right text-blue-900">
                          {result.fleet_total.tours_count}
                          {result.fleet_total.tours_without_km > 0 && (
                            <span className="ml-2 inline-flex items-center rounded-full bg-amber-100 text-amber-700 text-xs px-2 py-0.5 font-normal">
                              {result.fleet_total.tours_without_km} ohne km
                            </span>
                          )}
                        </td>
                        <td className="py-3 pr-4 text-right text-blue-900">{fmtKm(result.fleet_total.soll_km)}</td>
                        <td className="py-3 pr-4 text-right text-blue-900">{fmtKm(result.fleet_total.actual_km)}</td>
                        <td className="py-3 pr-4 text-right">
                          <DiffCell diff_km={result.fleet_total.diff_km} />
                        </td>
                        <td className="py-3 pr-4 text-right text-blue-900">–</td>
                        <td className="py-3 text-right text-blue-900">
                          {result.fleet_total.mehrkilometer_eur > 0
                            ? <span className="text-red-700">{fmtEur(result.fleet_total.mehrkilometer_eur)}</span>
                            : "–"}
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
