"use client";

import { useState } from "react";
import { BarChart3, Fuel, Receipt, Wrench } from "lucide-react";
import { usePortal, accentClasses } from "@/lib/portal-context";
import { cn } from "@/lib/utils";

interface FuelInvoice {
  id: string;
  invoice_date: string | null;
  total_gross: number | null;
}

interface MautInvoice {
  id: string;
  period_from: string | null;
  total_eur: number | null;
}

interface RepairInvoice {
  id: string;
  invoice_date: string | null;
  total_gross: number | null;
  vehicle: { license_plate: string } | null;
}

function formatEur(val: number): string {
  return val.toLocaleString("de-DE", { style: "currency", currency: "EUR" });
}

function getYear(d: string | null): number {
  if (!d) return 0;
  return new Date(d).getFullYear();
}

function getMonth(d: string | null): string {
  if (!d) return "";
  const dt = new Date(d);
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}`;
}

function monthLabel(ym: string): string {
  const [y, m] = ym.split("-");
  const date = new Date(Number(y), Number(m) - 1, 1);
  return date.toLocaleDateString("de-DE", { month: "short", year: "2-digit" });
}

export function KostenView({
  fuelInvoices,
  mautInvoices,
  repairInvoices,
}: {
  fuelInvoices: FuelInvoice[];
  mautInvoices: MautInvoice[];
  repairInvoices: RepairInvoice[];
}) {
  const { accentColor } = usePortal();

  const totalFuel = fuelInvoices.reduce((s, i) => s + (i.total_gross ?? 0), 0);
  const totalMaut = mautInvoices.reduce((s, i) => s + (i.total_eur ?? 0), 0);
  const totalRepair = repairInvoices.reduce((s, i) => s + (i.total_gross ?? 0), 0);
  const totalAll = totalFuel + totalMaut + totalRepair;

  // Build monthly breakdown
  const months = new Set<string>();
  fuelInvoices.forEach((i) => { if (i.invoice_date) months.add(getMonth(i.invoice_date)); });
  mautInvoices.forEach((i) => { if (i.period_from) months.add(getMonth(i.period_from)); });
  repairInvoices.forEach((i) => { if (i.invoice_date) months.add(getMonth(i.invoice_date)); });
  const sortedMonths = Array.from(months).sort().reverse();

  const monthlyData = sortedMonths.map((ym) => {
    const fuel = fuelInvoices
      .filter((i) => getMonth(i.invoice_date) === ym)
      .reduce((s, i) => s + (i.total_gross ?? 0), 0);
    const maut = mautInvoices
      .filter((i) => getMonth(i.period_from) === ym)
      .reduce((s, i) => s + (i.total_eur ?? 0), 0);
    const repair = repairInvoices
      .filter((i) => getMonth(i.invoice_date) === ym)
      .reduce((s, i) => s + (i.total_gross ?? 0), 0);
    return { ym, fuel, maut, repair, total: fuel + maut + repair };
  });

  const maxTotal = Math.max(...monthlyData.map((m) => m.total), 1);

  return (
    <div className="p-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <div className={cn("p-2 rounded-lg", accentClasses.iconBg[accentColor])}>
          <BarChart3 className="h-6 w-6" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Kostenanalyse</h1>
          <p className="text-sm text-gray-500">Kraftstoff · Maut · Reparaturen</p>
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <div className="bg-white border border-gray-200 rounded-xl p-4">
          <div className="flex items-center gap-2 mb-2">
            <Fuel className="h-4 w-4 text-orange-500" />
            <p className="text-xs text-gray-500">Kraftstoff</p>
          </div>
          <p className="text-xl font-bold text-gray-900">{formatEur(totalFuel)}</p>
        </div>
        <div className="bg-white border border-gray-200 rounded-xl p-4">
          <div className="flex items-center gap-2 mb-2">
            <Receipt className="h-4 w-4 text-blue-500" />
            <p className="text-xs text-gray-500">Maut</p>
          </div>
          <p className="text-xl font-bold text-gray-900">{formatEur(totalMaut)}</p>
        </div>
        <div className="bg-white border border-gray-200 rounded-xl p-4">
          <div className="flex items-center gap-2 mb-2">
            <Wrench className="h-4 w-4 text-purple-500" />
            <p className="text-xs text-gray-500">Reparaturen</p>
          </div>
          <p className="text-xl font-bold text-gray-900">{formatEur(totalRepair)}</p>
        </div>
        <div className={cn("border rounded-xl p-4", accentClasses.iconBg[accentColor])}>
          <div className="flex items-center gap-2 mb-2">
            <BarChart3 className="h-4 w-4" />
            <p className="text-xs font-medium">Gesamt</p>
          </div>
          <p className="text-xl font-bold text-gray-900">{formatEur(totalAll)}</p>
        </div>
      </div>

      {/* Monthly breakdown */}
      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-100">
          <h2 className="text-base font-semibold text-gray-900">Monatliche Übersicht</h2>
        </div>
        {monthlyData.length === 0 ? (
          <div className="px-6 py-12 text-center text-gray-400 text-sm">
            Noch keine Daten vorhanden
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-xs text-gray-500 uppercase tracking-wide">
              <tr>
                <th className="px-6 py-3 text-left">Monat</th>
                <th className="px-6 py-3 text-right">Kraftstoff</th>
                <th className="px-6 py-3 text-right">Maut</th>
                <th className="px-6 py-3 text-right">Reparaturen</th>
                <th className="px-6 py-3 text-right">Gesamt</th>
                <th className="px-6 py-3 w-40"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {monthlyData.map(({ ym, fuel, maut, repair, total }) => (
                <tr key={ym} className="hover:bg-gray-50">
                  <td className="px-6 py-3 font-medium text-gray-900">{monthLabel(ym)}</td>
                  <td className="px-6 py-3 text-right text-orange-700">
                    {fuel > 0 ? formatEur(fuel) : <span className="text-gray-300">–</span>}
                  </td>
                  <td className="px-6 py-3 text-right text-blue-700">
                    {maut > 0 ? formatEur(maut) : <span className="text-gray-300">–</span>}
                  </td>
                  <td className="px-6 py-3 text-right text-purple-700">
                    {repair > 0 ? formatEur(repair) : <span className="text-gray-300">–</span>}
                  </td>
                  <td className="px-6 py-3 text-right font-semibold text-gray-900">
                    {formatEur(total)}
                  </td>
                  <td className="px-6 py-3">
                    <div className="flex gap-0.5 h-4 items-end">
                      {fuel > 0 && (
                        <div
                          className="bg-orange-400 rounded-sm"
                          style={{ width: `${(fuel / maxTotal) * 100 * 0.33}%`, minWidth: 3, height: "100%" }}
                        />
                      )}
                      {maut > 0 && (
                        <div
                          className="bg-blue-400 rounded-sm"
                          style={{ width: `${(maut / maxTotal) * 100 * 0.33}%`, minWidth: 3, height: "100%" }}
                        />
                      )}
                      {repair > 0 && (
                        <div
                          className="bg-purple-400 rounded-sm"
                          style={{ width: `${(repair / maxTotal) * 100 * 0.33}%`, minWidth: 3, height: "100%" }}
                        />
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot className="bg-gray-50 border-t border-gray-200">
              <tr>
                <td className="px-6 py-3 text-xs font-medium text-gray-500">Gesamt</td>
                <td className="px-6 py-3 text-right text-sm font-semibold text-orange-700">
                  {formatEur(totalFuel)}
                </td>
                <td className="px-6 py-3 text-right text-sm font-semibold text-blue-700">
                  {formatEur(totalMaut)}
                </td>
                <td className="px-6 py-3 text-right text-sm font-semibold text-purple-700">
                  {formatEur(totalRepair)}
                </td>
                <td className="px-6 py-3 text-right text-sm font-semibold text-gray-900">
                  {formatEur(totalAll)}
                </td>
                <td />
              </tr>
            </tfoot>
          </table>
        )}
      </div>
    </div>
  );
}
