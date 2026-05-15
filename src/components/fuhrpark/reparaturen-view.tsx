"use client";

import { Wrench } from "lucide-react";
import { usePortal, accentClasses } from "@/lib/portal-context";
import { cn } from "@/lib/utils";

interface RepairInvoice {
  id: string;
  invoice_number: string | null;
  invoice_date: string | null;
  total_net: number | null;
  total_gross: number | null;
  description: string | null;
  pdf_url: string | null;
  vehicle: { license_plate: string; type: string } | null;
}

function formatEur(val: number | null): string {
  if (val == null) return "–";
  return val.toLocaleString("de-DE", { style: "currency", currency: "EUR" });
}

function formatDate(d: string | null): string {
  if (!d) return "–";
  return new Date(d).toLocaleDateString("de-DE");
}

export function ReparaturenView({ invoices }: { invoices: RepairInvoice[] }) {
  const { accentColor } = usePortal();

  const total = invoices.reduce((s, i) => s + (i.total_gross ?? 0), 0);

  return (
    <div className="p-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <div className={cn("p-2 rounded-lg", accentClasses.iconBg[accentColor])}>
          <Wrench className="h-6 w-6" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Reparaturen</h1>
          <p className="text-sm text-gray-500">Werkstattrechnungen & Instandhaltung</p>
        </div>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
        <div className="bg-white border border-gray-200 rounded-xl p-4">
          <p className="text-xs text-gray-500 mb-1">Rechnungen gesamt</p>
          <p className="text-2xl font-bold text-gray-900">{invoices.length}</p>
        </div>
        <div className="bg-white border border-gray-200 rounded-xl p-4">
          <p className="text-xs text-gray-500 mb-1">Gesamtkosten (Brutto)</p>
          <p className="text-2xl font-bold text-gray-900">{formatEur(total)}</p>
        </div>
        <div className="bg-white border border-gray-200 rounded-xl p-4">
          <p className="text-xs text-gray-500 mb-1">Fahrzeuge betroffen</p>
          <p className="text-2xl font-bold text-gray-900">
            {new Set(invoices.map((i) => i.vehicle?.license_plate).filter(Boolean)).size}
          </p>
        </div>
      </div>

      {/* Table */}
      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-100">
          <h2 className="text-base font-semibold text-gray-900">
            Alle Rechnungen ({invoices.length})
          </h2>
        </div>
        {invoices.length === 0 ? (
          <div className="px-6 py-12 text-center text-gray-400 text-sm">
            Noch keine Rechnungen hochgeladen
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-xs text-gray-500 uppercase tracking-wide">
              <tr>
                <th className="px-6 py-3 text-left">Fahrzeug</th>
                <th className="px-6 py-3 text-left">Rechnungsnr.</th>
                <th className="px-6 py-3 text-left">Datum</th>
                <th className="px-6 py-3 text-left">Beschreibung</th>
                <th className="px-6 py-3 text-right">Netto</th>
                <th className="px-6 py-3 text-right">Brutto</th>
                <th className="px-6 py-3 text-center">PDF</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {invoices.map((inv) => (
                <tr key={inv.id} className="hover:bg-gray-50">
                  <td className="px-6 py-4 font-medium text-gray-900">
                    {inv.vehicle?.license_plate ?? "–"}
                  </td>
                  <td className="px-6 py-4 font-mono text-gray-700">
                    {inv.invoice_number ?? "–"}
                  </td>
                  <td className="px-6 py-4 text-gray-600">{formatDate(inv.invoice_date)}</td>
                  <td className="px-6 py-4 text-gray-600 max-w-xs truncate">
                    {inv.description ?? "–"}
                  </td>
                  <td className="px-6 py-4 text-right text-gray-900">{formatEur(inv.total_net)}</td>
                  <td className="px-6 py-4 text-right font-semibold text-gray-900">
                    {formatEur(inv.total_gross)}
                  </td>
                  <td className="px-6 py-4 text-center">
                    {inv.pdf_url ? (
                      <a
                        href={inv.pdf_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className={cn("text-xs hover:underline", accentClasses.text[accentColor])}
                      >
                        PDF
                      </a>
                    ) : (
                      <span className="text-gray-300">–</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot className="bg-gray-50 border-t border-gray-200">
              <tr>
                <td colSpan={4} className="px-6 py-3 text-xs font-medium text-gray-500">
                  Gesamt
                </td>
                <td className="px-6 py-3 text-right text-sm font-semibold text-gray-900">
                  {formatEur(invoices.reduce((s, i) => s + (i.total_net ?? 0), 0))}
                </td>
                <td className="px-6 py-3 text-right text-sm font-semibold text-gray-900">
                  {formatEur(total)}
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
