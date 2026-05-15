"use client";

import { useState } from "react";
import { Fuel, Receipt } from "lucide-react";
import { usePortal, accentClasses } from "@/lib/portal-context";
import { cn } from "@/lib/utils";
import { UploadCenter } from "./upload-center";

interface FuelInvoice {
  id: string;
  invoice_id: string;
  internal_id: string;
  invoice_date: string;
  total_net: number;
  total_gross: number;
  pdf_url: string | null;
  csv_url: string | null;
}

interface MautInvoice {
  id: string;
  invoice_number: string;
  period_from: string;
  period_to: string;
  total_net: number;
  total_gross: number;
}


function formatEur(val: number | null): string {
  if (val == null) return "–";
  return val.toLocaleString("de-DE", { style: "currency", currency: "EUR" });
}

function formatDate(d: string | null): string {
  if (!d) return "–";
  return new Date(d).toLocaleDateString("de-DE");
}

export function FuhrparkView({
  fuelInvoices: initialFuelInvoices,
  mautInvoices: _mautInvoices,
}: {
  fuelInvoices: FuelInvoice[];
  mautInvoices: MautInvoice[];
}) {
  const { accentColor } = usePortal();
  const [fuelInvoices, setFuelInvoices] = useState(initialFuelInvoices);
  const [activeTab, setActiveTab] = useState<"upload" | "kraftstoff" | "maut">("upload");

  async function refreshFuelInvoices() {
    const res = await fetch("/api/fuhrpark/fuel");
    const list = await res.json();
    setFuelInvoices(list);
  }

  return (
    <div className="p-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <div className={cn("p-2 rounded-lg", accentClasses.iconBg[accentColor])}>
          <Fuel className="h-6 w-6" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Fuhrpark</h1>
          <p className="text-sm text-gray-500">Kraftstoff- und Mautkosten</p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-6 border-b border-gray-200">
        {([
          { key: "upload", label: "Upload" },
          { key: "kraftstoff", label: "Kraftstoff" },
          { key: "maut", label: "Maut" },
        ] as const).map(({ key, label }) => (
          <button
            key={key}
            onClick={() => setActiveTab(key)}
            className={cn(
              "px-4 py-2 text-sm font-medium border-b-2 transition-colors",
              activeTab === key
                ? cn("border-current", accentClasses.tab[accentColor])
                : "border-transparent text-gray-500 hover:text-gray-700"
            )}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Upload Tab */}
      {activeTab === "upload" && (
        <div className="bg-white border border-gray-200 rounded-xl p-6">
          <UploadCenter onDone={refreshFuelInvoices} />
        </div>
      )}

      {/* Kraftstoff Tab */}
      {activeTab === "kraftstoff" && (
        <div className="space-y-6">
          {/* Invoice List */}
          <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-100">
              <h2 className="text-base font-semibold text-gray-900 flex items-center gap-2">
                <Receipt className="h-4 w-4" />
                Kraftstoffrechnungen ({fuelInvoices.length})
              </h2>
            </div>
            {fuelInvoices.length === 0 ? (
              <div className="px-6 py-12 text-center text-gray-400 text-sm">
                Noch keine Rechnungen importiert
              </div>
            ) : (
              <table className="w-full text-sm">
                <thead className="bg-gray-50 text-xs text-gray-500 uppercase tracking-wide">
                  <tr>
                    <th className="px-6 py-3 text-left">Rechnungsnr.</th>
                    <th className="px-6 py-3 text-left">Datum</th>
                    <th className="px-6 py-3 text-right">Netto</th>
                    <th className="px-6 py-3 text-right">Brutto</th>
                    <th className="px-6 py-3 text-center">Dokumente</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {fuelInvoices.map((inv) => (
                    <tr key={inv.id} className="hover:bg-gray-50">
                      <td className="px-6 py-4 font-mono text-gray-900">
                        {inv.invoice_id}
                        <span className="ml-2 text-xs text-gray-400">{inv.internal_id}</span>
                      </td>
                      <td className="px-6 py-4 text-gray-600">{formatDate(inv.invoice_date)}</td>
                      <td className="px-6 py-4 text-right text-gray-900">{formatEur(inv.total_net)}</td>
                      <td className="px-6 py-4 text-right font-semibold text-gray-900">
                        {formatEur(inv.total_gross)}
                      </td>
                      <td className="px-6 py-4 text-center flex justify-center gap-2">
                        {inv.pdf_url && (
                          <a href={inv.pdf_url} target="_blank" rel="noopener noreferrer"
                            className={cn("text-xs hover:underline", accentClasses.text[accentColor])}>
                            PDF
                          </a>
                        )}
                        {inv.csv_url && (
                          <a href={inv.csv_url} target="_blank" rel="noopener noreferrer"
                            className="text-xs text-green-600 hover:underline">
                            CSV
                          </a>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot className="bg-gray-50 border-t border-gray-200">
                  <tr>
                    <td colSpan={2} className="px-6 py-3 text-xs font-medium text-gray-500">Gesamt</td>
                    <td className="px-6 py-3 text-right text-sm font-semibold text-gray-900">
                      {formatEur(fuelInvoices.reduce((s, i) => s + (i.total_net ?? 0), 0))}
                    </td>
                    <td className="px-6 py-3 text-right text-sm font-semibold text-gray-900">
                      {formatEur(fuelInvoices.reduce((s, i) => s + (i.total_gross ?? 0), 0))}
                    </td>
                    <td />
                  </tr>
                </tfoot>
              </table>
            )}
          </div>
        </div>
      )}

      {/* Maut Tab */}
      {activeTab === "maut" && (
        <div className="bg-white border border-gray-200 rounded-xl p-6">
          <div className="flex items-center gap-3 text-gray-400">
            <Receipt className="h-8 w-8" />
            <div>
              <p className="font-medium text-gray-600">Maut-Import folgt</p>
              <p className="text-sm">CSV aus Toll Collect hochladen</p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
