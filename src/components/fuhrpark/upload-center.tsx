"use client";

import { useState, useRef, useCallback } from "react";
import {
  FileText, FileSpreadsheet, Upload, Loader2,
  CheckCircle, AlertCircle, X, Fuel, Receipt, Wrench, HelpCircle,
} from "lucide-react";
import { usePortal, accentClasses } from "@/lib/portal-context";
import { cn } from "@/lib/utils";

type DetectedType = "kraftstoff" | "maut" | "reparatur" | "unknown" | null;

interface UploadEntry {
  id: string;
  file: File;
  fileType: "pdf" | "csv";
  detectedType: DetectedType;
  status: "detecting" | "pending" | "uploading" | "done" | "error";
  result?: string;
  error?: string;
}

const typeConfig: Record<string, { label: string; icon: React.ElementType; color: string }> = {
  kraftstoff: { label: "Kraftstoff",       icon: Fuel,     color: "text-orange-600 bg-orange-50 border-orange-200" },
  maut:       { label: "Maut",             icon: Receipt,  color: "text-blue-600 bg-blue-50 border-blue-200" },
  reparatur:  { label: "Werkstattrechnung",icon: Wrench,   color: "text-purple-600 bg-purple-50 border-purple-200" },
  unknown:    { label: "Unbekannt",        icon: HelpCircle, color: "text-gray-500 bg-gray-50 border-gray-200" },
};

function formatEur(val: number | null): string {
  if (val == null) return "";
  return val.toLocaleString("de-DE", { style: "currency", currency: "EUR" });
}

export function UploadCenter({ onDone }: { onDone?: () => void }) {
  const { accentColor } = usePortal();
  const [entries, setEntries] = useState<UploadEntry[]>([]);
  const pdfInputRef = useRef<HTMLInputElement>(null);
  const csvInputRef = useRef<HTMLInputElement>(null);
  const [pdfDragging, setPdfDragging] = useState(false);
  const [csvDragging, setCsvDragging] = useState(false);

  function updateEntry(id: string, patch: Partial<UploadEntry>) {
    setEntries((prev) => prev.map((e) => (e.id === id ? { ...e, ...patch } : e)));
  }

  async function detectCsvType(file: File): Promise<DetectedType> {
    const fd = new FormData();
    fd.append("file", file);
    const res = await fetch("/api/fuhrpark/detect", { method: "POST", body: fd });
    const data = await res.json();
    return data.type ?? "unknown";
  }

  async function processEntry(entry: UploadEntry) {
    updateEntry(entry.id, { status: "uploading" });

    try {
      if (entry.detectedType === "kraftstoff") {
        const fd = new FormData();
        fd.append("csv", entry.file);
        const res = await fetch("/api/fuhrpark/fuel", { method: "POST", body: fd });
        const data = await res.json();
        if (data.success) {
          updateEntry(entry.id, {
            status: "done",
            result: `${data.transactions} Transaktionen · ${data.matched} Fahrzeuge · ${formatEur(data.total_gross)}`,
          });
          onDone?.();
        } else {
          updateEntry(entry.id, { status: "error", error: data.error });
        }

      } else if (entry.detectedType === "reparatur") {
        const fd = new FormData();
        fd.append("file", entry.file);
        const res = await fetch("/api/repair-invoices/upload", { method: "POST", body: fd });
        const data = await res.json();
        if (data.id) {
          updateEntry(entry.id, {
            status: "done",
            result: `${data.vehicle?.license_plate ?? "Fahrzeug"} · ${formatEur(data.total_gross)}`,
          });
          onDone?.();
        } else {
          updateEntry(entry.id, { status: "error", error: data.error ?? "Fehler beim Verarbeiten" });
        }

      } else if (entry.detectedType === "maut") {
        const fd = new FormData();
        fd.append("csv", entry.file);
        const res = await fetch("/api/fuhrpark/maut", { method: "POST", body: fd });
        const data = await res.json();
        if (data.success) {
          updateEntry(entry.id, {
            status: "done",
            result: `${data.transactions} Fahrten · ${data.matched} Fahrzeuge · ${formatEur(data.total_eur)}`,
          });
          onDone?.();
        } else {
          updateEntry(entry.id, { status: "error", error: data.error ?? "Fehler beim Verarbeiten" });
        }

      } else {
        updateEntry(entry.id, { status: "error", error: "Dateiformat nicht erkannt" });
      }
    } catch (err) {
      updateEntry(entry.id, { status: "error", error: String(err) });
    }
  }

  async function addFiles(files: File[]) {
    const newEntries: UploadEntry[] = files.map((f) => ({
      id: Math.random().toString(36).slice(2),
      file: f,
      fileType: f.name.toLowerCase().endsWith(".csv") ? "csv" : "pdf",
      detectedType: f.name.toLowerCase().endsWith(".pdf") ? "reparatur" : null,
      status: f.name.toLowerCase().endsWith(".csv") ? "detecting" : "pending",
    }));

    setEntries((prev) => [...prev, ...newEntries]);

    // Detect CSV types, then process all
    for (const entry of newEntries) {
      if (entry.fileType === "csv") {
        const detected = await detectCsvType(entry.file);
        updateEntry(entry.id, { detectedType: detected, status: "pending" });
        const updated = { ...entry, detectedType: detected, status: "pending" as const };
        await processEntry(updated);
      } else {
        await processEntry(entry);
      }
    }
  }

  const onDrop = useCallback((e: React.DragEvent, accept: "pdf" | "csv") => {
    e.preventDefault();
    setPdfDragging(false);
    setCsvDragging(false);
    const files = Array.from(e.dataTransfer.files).filter((f) => {
      if (accept === "pdf") return f.type === "application/pdf";
      if (accept === "csv") return f.name.toLowerCase().endsWith(".csv");
      return false;
    });
    if (files.length) addFiles(files);
  }, []);

  const pendingCount = entries.filter((e) => e.status === "pending" || e.status === "uploading" || e.status === "detecting").length;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* PDF Drop Zone */}
        <div>
          <p className="text-xs font-medium text-gray-500 mb-2 flex items-center gap-1.5">
            <FileText className="h-3.5 w-3.5" /> PDF-Dokumente
          </p>
          <div
            onDragOver={(e) => { e.preventDefault(); setPdfDragging(true); }}
            onDragLeave={() => setPdfDragging(false)}
            onDrop={(e) => onDrop(e, "pdf")}
            onClick={() => pdfInputRef.current?.click()}
            className={cn(
              "relative border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-all",
              pdfDragging
                ? cn("border-current scale-[1.01]", accentClasses.text[accentColor], "bg-opacity-5")
                : "border-gray-200 hover:border-gray-300 hover:bg-gray-50"
            )}
          >
            <input
              ref={pdfInputRef}
              type="file"
              accept=".pdf"
              multiple
              className="hidden"
              onChange={(e) => { if (e.target.files) addFiles(Array.from(e.target.files)); }}
            />
            <Upload className={cn("h-8 w-8 mx-auto mb-3", pdfDragging ? accentClasses.text[accentColor] : "text-gray-300")} />
            <p className="text-sm font-medium text-gray-700">PDFs hierher ziehen oder klicken</p>
            <p className="text-xs text-gray-400 mt-1">Werkstattrechnungen · max. 20 MB pro Datei</p>
          </div>
        </div>

        {/* CSV Drop Zone */}
        <div>
          <p className="text-xs font-medium text-gray-500 mb-2 flex items-center gap-1.5">
            <FileSpreadsheet className="h-3.5 w-3.5" /> CSV-Dateien
          </p>
          <div
            onDragOver={(e) => { e.preventDefault(); setCsvDragging(true); }}
            onDragLeave={() => setCsvDragging(false)}
            onDrop={(e) => onDrop(e, "csv")}
            onClick={() => csvInputRef.current?.click()}
            className={cn(
              "relative border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-all",
              csvDragging
                ? cn("border-current scale-[1.01]", accentClasses.text[accentColor], "bg-opacity-5")
                : "border-gray-200 hover:border-gray-300 hover:bg-gray-50"
            )}
          >
            <input
              ref={csvInputRef}
              type="file"
              accept=".csv"
              multiple
              className="hidden"
              onChange={(e) => { if (e.target.files) addFiles(Array.from(e.target.files)); }}
            />
            <FileSpreadsheet className={cn("h-8 w-8 mx-auto mb-3", csvDragging ? accentClasses.text[accentColor] : "text-gray-300")} />
            <p className="text-sm font-medium text-gray-700">CSV hierher ziehen oder klicken</p>
            <p className="text-xs text-gray-400 mt-1">Kraftstoff (DKV/UTA) · Maut (Toll Collect)</p>
          </div>
        </div>
      </div>

      {/* Upload Queue */}
      {entries.length > 0 && (
        <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
            <p className="text-sm font-medium text-gray-700">
              Uploads ({entries.length})
              {pendingCount > 0 && (
                <span className="ml-2 text-xs text-gray-400">{pendingCount} in Bearbeitung…</span>
              )}
            </p>
            <button
              onClick={() => setEntries([])}
              className="text-xs text-gray-400 hover:text-gray-600"
            >
              Alle entfernen
            </button>
          </div>
          <ul className="divide-y divide-gray-100">
            {entries.map((entry) => {
              const tc = typeConfig[entry.detectedType ?? "unknown"];
              const Icon = tc?.icon ?? HelpCircle;
              return (
                <li key={entry.id} className="px-4 py-3 flex items-center gap-3">
                  {/* File type badge */}
                  <div className={cn("flex items-center gap-1.5 px-2 py-1 rounded-md border text-xs font-medium shrink-0", tc?.color ?? "text-gray-500 bg-gray-50 border-gray-200")}>
                    <Icon className="h-3.5 w-3.5" />
                    {entry.status === "detecting" ? "Erkennung…" : (tc?.label ?? "?")}
                  </div>

                  {/* Filename */}
                  <span className="flex-1 text-sm text-gray-700 truncate">{entry.file.name}</span>

                  {/* Status */}
                  <div className="shrink-0 flex items-center gap-2">
                    {(entry.status === "uploading" || entry.status === "detecting") && (
                      <Loader2 className="h-4 w-4 animate-spin text-gray-400" />
                    )}
                    {entry.status === "done" && (
                      <div className="flex items-center gap-1.5">
                        <CheckCircle className="h-4 w-4 text-green-500" />
                        {entry.result && <span className="text-xs text-gray-500">{entry.result}</span>}
                      </div>
                    )}
                    {entry.status === "error" && (
                      <div className="flex items-center gap-1.5">
                        <AlertCircle className="h-4 w-4 text-red-500" />
                        <span className="text-xs text-red-600">{entry.error}</span>
                      </div>
                    )}
                    {entry.status === "pending" && (
                      <span className="text-xs text-gray-400">Warte…</span>
                    )}
                    <button
                      onClick={() => setEntries((p) => p.filter((e) => e.id !== entry.id))}
                      className="text-gray-300 hover:text-gray-500"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}
