"use client";

import { useState, useRef, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { FileText, Upload, Euro, Calendar, Trash2, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Gutschrift, GutschriftPosition } from "@/lib/types";

type PositionWithGutschrift = GutschriftPosition & {
  gutschrift?: Pick<Gutschrift, "id" | "gutschrift_nr" | "document_date" | "absender" | "file_name"> | null;
};

interface GutschriftenViewProps {
  positionen: PositionWithGutschrift[];
  gutschriften: Gutschrift[];
}

function formatEur(val?: number | null): string {
  if (val == null) return "–";
  return val.toLocaleString("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " €";
}

function formatDate(val?: string | null): string {
  if (!val) return "–";
  try {
    return new Date(val).toLocaleDateString("de-DE");
  } catch {
    return val;
  }
}

type Tab = "datum" | "gutschriften";

export function GutschriftenView({ positionen, gutschriften }: GutschriftenViewProps) {
  const [activeTab, setActiveTab] = useState<Tab>("datum");
  const [uploading, setUploading] = useState(false);
  const [uploadStatus, setUploadStatus] = useState<{ type: "success" | "error"; message: string } | null>(null);
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const uploadFile = useCallback(async (file: File) => {
    if (!file.name.toLowerCase().endsWith(".pdf")) {
      setUploadStatus({ type: "error", message: "Nur PDF-Dateien werden unterstützt." });
      return;
    }
    setUploading(true);
    setUploadStatus(null);

    try {
      const formData = new FormData();
      formData.append("file", file);

      const res = await fetch("/api/gutschriften/upload", {
        method: "POST",
        body: formData,
      });
      const data = await res.json();

      if (!res.ok || !data.success) {
        setUploadStatus({ type: "error", message: data.error ?? "Upload fehlgeschlagen." });
      } else {
        setUploadStatus({ type: "success", message: `Gutschrift erfolgreich verarbeitet und gespeichert.` });
        setTimeout(() => window.location.reload(), 1200);
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Unbekannter Fehler";
      setUploadStatus({ type: "error", message: msg });
    } finally {
      setUploading(false);
    }
  }, []);

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) uploadFile(file);
    e.target.value = "";
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) uploadFile(file);
  }

  async function handleDelete(id: string) {
    if (!confirm("Gutschrift wirklich löschen?")) return;
    await fetch(`/api/gutschriften/${id}`, { method: "DELETE" });
    window.location.reload();
  }

  const tabs: { id: Tab; label: string }[] = [
    { id: "datum", label: "Nach Datum" },
    { id: "gutschriften", label: "Gutschriften" },
  ];

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex items-center gap-3">
        <FileText className="w-7 h-7 text-blue-600" />
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Gutschriften</h1>
          <p className="text-sm text-gray-500">PDF-Gutschriften hochladen und auswerten</p>
        </div>
      </div>

      {/* Upload area */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Upload className="w-4 h-4" />
            Gutschrift hochladen
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div
            className={cn(
              "border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-colors",
              dragging ? "border-blue-500 bg-blue-50" : "border-gray-300 hover:border-blue-400 hover:bg-gray-50",
              uploading && "pointer-events-none opacity-70"
            )}
            onClick={() => !uploading && inputRef.current?.click()}
            onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
            onDragLeave={() => setDragging(false)}
            onDrop={handleDrop}
          >
            <input
              ref={inputRef}
              type="file"
              accept="application/pdf"
              className="hidden"
              onChange={handleFileChange}
            />
            {uploading ? (
              <div className="flex flex-col items-center gap-3">
                <Loader2 className="w-8 h-8 text-blue-600 animate-spin" />
                <p className="text-sm text-gray-600 font-medium">KI analysiert Gutschrift…</p>
                <p className="text-xs text-gray-400">Das kann 15–30 Sekunden dauern</p>
              </div>
            ) : (
              <div className="flex flex-col items-center gap-3">
                <Upload className="w-8 h-8 text-gray-400" />
                <div>
                  <p className="text-sm font-medium text-gray-700">PDF hierher ziehen oder klicken zum Auswählen</p>
                  <p className="text-xs text-gray-400 mt-1">Nur PDF-Dateien, max. 20 MB</p>
                </div>
              </div>
            )}
          </div>

          {uploadStatus && (
            <div
              className={cn(
                "mt-3 px-4 py-3 rounded-lg text-sm font-medium",
                uploadStatus.type === "success"
                  ? "bg-green-50 text-green-800 border border-green-200"
                  : "bg-red-50 text-red-800 border border-red-200"
              )}
            >
              {uploadStatus.message}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Tabs */}
      <div>
        <div className="flex gap-1 border-b border-gray-200 mb-4">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={cn(
                "px-4 py-2 text-sm font-medium transition-colors border-b-2 -mb-px",
                activeTab === tab.id
                  ? "border-blue-600 text-blue-600"
                  : "border-transparent text-gray-500 hover:text-gray-700"
              )}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Tab: Nach Datum */}
        {activeTab === "datum" && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Calendar className="w-4 h-4" />
                Positionen nach Belegdatum
                <Badge className="ml-2">{positionen.length}</Badge>
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              {positionen.length === 0 ? (
                <div className="text-center py-12 text-gray-400 text-sm">
                  Noch keine Positionen vorhanden. Laden Sie eine Gutschrift hoch.
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-gray-100 bg-gray-50">
                        <th className="text-left px-4 py-3 font-semibold text-gray-600">Datum</th>
                        <th className="text-left px-4 py-3 font-semibold text-gray-600">Fahrzeugreferenz</th>
                        <th className="text-right px-4 py-3 font-semibold text-gray-600">Netto (EUR)</th>
                        <th className="text-left px-4 py-3 font-semibold text-gray-600">Gutschrift-Nr.</th>
                        <th className="text-left px-4 py-3 font-semibold text-gray-600">Absender</th>
                        <th className="text-left px-4 py-3 font-semibold text-gray-600">Tour-Nr.</th>
                      </tr>
                    </thead>
                    <tbody>
                      {positionen.map((pos) => (
                        <tr key={pos.id} className="border-b border-gray-50 hover:bg-gray-50 transition-colors">
                          <td className="px-4 py-3 text-gray-700">{formatDate(pos.bel_datum)}</td>
                          <td className="px-4 py-3">
                            {pos.kennzeichen ? (
                              <Badge variant="secondary">{pos.kennzeichen}</Badge>
                            ) : (
                              <span className="text-gray-400">–</span>
                            )}
                          </td>
                          <td className="px-4 py-3 text-right font-mono font-medium text-gray-800">
                            {formatEur(pos.netto_betrag)}
                          </td>
                          <td className="px-4 py-3 text-gray-600">{pos.gutschrift?.gutschrift_nr ?? "–"}</td>
                          <td className="px-4 py-3 text-gray-600 max-w-[200px] truncate">{pos.gutschrift?.absender ?? "–"}</td>
                          <td className="px-4 py-3 text-gray-500">{pos.tour_nr ?? "–"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* Tab: Gutschriften */}
        {activeTab === "gutschriften" && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Euro className="w-4 h-4" />
                Gutschriften
                <Badge className="ml-2">{gutschriften.length}</Badge>
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              {gutschriften.length === 0 ? (
                <div className="text-center py-12 text-gray-400 text-sm">
                  Noch keine Gutschriften vorhanden.
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-gray-100 bg-gray-50">
                        <th className="text-left px-4 py-3 font-semibold text-gray-600">Datum</th>
                        <th className="text-left px-4 py-3 font-semibold text-gray-600">Absender</th>
                        <th className="text-left px-4 py-3 font-semibold text-gray-600">Gutschrift-Nr.</th>
                        <th className="text-right px-4 py-3 font-semibold text-gray-600">Netto</th>
                        <th className="text-right px-4 py-3 font-semibold text-gray-600">MwSt</th>
                        <th className="text-right px-4 py-3 font-semibold text-gray-600">Brutto</th>
                        <th className="text-left px-4 py-3 font-semibold text-gray-600">Dateiname</th>
                        <th className="px-4 py-3"></th>
                      </tr>
                    </thead>
                    <tbody>
                      {gutschriften.map((g) => (
                        <tr key={g.id} className="border-b border-gray-50 hover:bg-gray-50 transition-colors">
                          <td className="px-4 py-3 text-gray-700">{formatDate(g.document_date)}</td>
                          <td className="px-4 py-3 text-gray-800 font-medium max-w-[180px] truncate">{g.absender ?? "–"}</td>
                          <td className="px-4 py-3 text-gray-600">{g.gutschrift_nr ?? "–"}</td>
                          <td className="px-4 py-3 text-right font-mono text-gray-800">{formatEur(g.netto_gesamt)}</td>
                          <td className="px-4 py-3 text-right font-mono text-gray-600">{formatEur(g.mwst)}</td>
                          <td className="px-4 py-3 text-right font-mono font-semibold text-gray-900">{formatEur(g.brutto_gesamt)}</td>
                          <td className="px-4 py-3 text-gray-400 text-xs max-w-[160px] truncate">{g.file_name ?? "–"}</td>
                          <td className="px-4 py-3">
                            <button
                              onClick={() => handleDelete(g.id)}
                              className="p-1.5 rounded-md text-gray-400 hover:text-red-500 hover:bg-red-50 transition-colors"
                              title="Löschen"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
