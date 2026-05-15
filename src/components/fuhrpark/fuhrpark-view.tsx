"use client";

import { useState, useRef } from "react";
import { Fuel, Receipt, Upload, Loader2, CheckCircle, AlertCircle, X } from "lucide-react";
import { Button } from "@/components/ui/button";

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

interface UploadResult {
  success: boolean;
  internal_id?: string;
  transactions?: number;
  matched?: number;
  unmatched?: number;
  total_gross?: number;
  error?: string;
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
  mautInvoices: initialMautInvoices,
}: {
  fuelInvoices: FuelInvoice[];
  mautInvoices: MautInvoice[];
}) {
  const [fuelInvoices, setFuelInvoices] = useState(initialFuelInvoices);
  const [activeTab, setActiveTab] = useState<"kraftstoff" | "maut">("kraftstoff");

  // Fuel upload state
  const [fuelCsv, setFuelCsv] = useState<File | null>(null);
  const [fuelPdf, setFuelPdf] = useState<File | null>(null);
  const [fuelUploading, setFuelUploading] = useState(false);
  const [fuelResult, setFuelResult] = useState<UploadResult | null>(null);
  const fuelCsvRef = useRef<HTMLInputElement>(null);
  const fuelPdfRef = useRef<HTMLInputElement>(null);

  async function handleFuelUpload() {
    if (!fuelCsv) return;
    setFuelUploading(true);
    setFuelResult(null);

    const fd = new FormData();
    fd.append("csv", fuelCsv);
    if (fuelPdf) fd.append("pdf", fuelPdf);

    try {
      const res = await fetch("/api/fuhrpark/fuel", { method: "POST", body: fd });
      const data = await res.json();
      setFuelResult(data);
      if (data.success) {
        // Reload invoices
        const listRes = await fetch("/api/fuhrpark/fuel");
        const list = await listRes.json();
        setFuelInvoices(list);
        setFuelCsv(null);
        setFuelPdf(null);
        if (fuelCsvRef.current) fuelCsvRef.current.value = "";
        if (fuelPdfRef.current) fuelPdfRef.current.value = "";
      }
    } catch {
      setFuelResult({ success: false, error: "Netzwerkfehler" });
    } finally {
      setFuelUploading(false);
    }
  }

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="flex items-center gap-3 mb-6">
        <div className="p-2 bg-blue-100 rounded-lg">
          <Fuel className="h-6 w-6 text-blue-600" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Fuhrpark</h1>
          <p className="text-sm text-gray-500">Kraftstoff- und Mautkosten</p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-6 border-b border-gray-200">
        {(["kraftstoff", "maut"] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-4 py-2 text-sm font-medium capitalize border-b-2 transition-colors ${
              activeTab === tab
                ? "border-blue-600 text-blue-600"
                : "border-transparent text-gray-500 hover:text-gray-700"
            }`}
          >
            {tab === "kraftstoff" ? "Kraftstoff" : "Maut"}
          </button>
        ))}
      </div>

      {/* Kraftstoff Tab */}
      {activeTab === "kraftstoff" && (
        <div className="space-y-6">
          {/* Upload Card */}
          <div className="bg-white border border-gray-200 rounded-xl p-6">
            <h2 className="text-base font-semibold text-gray-900 mb-4 flex items-center gap-2">
              <Upload className="h-4 w-4" />
              Rechnung hochladen
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">
                  CSV-Datei <span className="text-red-500">*</span>
                </label>
                <input
                  ref={fuelCsvRef}
                  type="file"
                  accept=".csv"
                  onChange={(e) => setFuelCsv(e.target.files?.[0] ?? null)}
                  className="block w-full text-sm text-gray-500 file:mr-3 file:py-1.5 file:px-3 file:rounded-md file:border file:border-gray-300 file:text-sm file:bg-white file:text-gray-700 hover:file:bg-gray-50"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">
                  PDF-Rechnung (optional)
                </label>
                <input
                  ref={fuelPdfRef}
                  type="file"
                  accept=".pdf"
                  onChange={(e) => setFuelPdf(e.target.files?.[0] ?? null)}
                  className="block w-full text-sm text-gray-500 file:mr-3 file:py-1.5 file:px-3 file:rounded-md file:border file:border-gray-300 file:text-sm file:bg-white file:text-gray-700 hover:file:bg-gray-50"
                />
              </div>
            </div>
            <div className="mt-4">
              <Button
                onClick={handleFuelUpload}
                disabled={!fuelCsv || fuelUploading}
                className="flex items-center gap-2"
              >
                {fuelUploading ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Upload className="h-4 w-4" />
                )}
                {fuelUploading ? "Wird verarbeitet…" : "Hochladen & verarbeiten"}
              </Button>
            </div>

            {/* Result */}
            {fuelResult && (
              <div
                className={`mt-4 p-4 rounded-lg flex items-start gap-3 ${
                  fuelResult.success
                    ? "bg-green-50 border border-green-200"
                    : "bg-red-50 border border-red-200"
                }`}
              >
                {fuelResult.success ? (
                  <CheckCircle className="h-5 w-5 text-green-600 mt-0.5 shrink-0" />
                ) : (
                  <AlertCircle className="h-5 w-5 text-red-600 mt-0.5 shrink-0" />
                )}
                <div className="flex-1 text-sm">
                  {fuelResult.success ? (
                    <>
                      <p className="font-medium text-green-800">
                        Rechnung {fuelResult.internal_id} importiert
                      </p>
                      <p className="text-green-700 mt-0.5">
                        {fuelResult.transactions} Transaktionen · {fuelResult.matched} Fahrzeuge zugeordnet
                        {fuelResult.unmatched ? ` · ${fuelResult.unmatched} nicht zugeordnet` : ""}
                        {" · "}Gesamt: {formatEur(fuelResult.total_gross ?? null)}
                      </p>
                    </>
                  ) : (
                    <p className="text-red-800">{fuelResult.error}</p>
                  )}
                </div>
                <button onClick={() => setFuelResult(null)}>
                  <X className="h-4 w-4 text-gray-400" />
                </button>
              </div>
            )}
          </div>

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
                          <a
                            href={inv.pdf_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-xs text-blue-600 hover:underline"
                          >
                            PDF
                          </a>
                        )}
                        {inv.csv_url && (
                          <a
                            href={inv.csv_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-xs text-green-600 hover:underline"
                          >
                            CSV
                          </a>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot className="bg-gray-50 border-t border-gray-200">
                  <tr>
                    <td colSpan={2} className="px-6 py-3 text-xs font-medium text-gray-500">
                      Gesamt
                    </td>
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
