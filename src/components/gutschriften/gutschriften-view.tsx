"use client";

import { useState, useRef, useCallback, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { FileText, Upload, Euro, Calendar, Trash2, Loader2, Car, Filter } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Gutschrift, GutschriftPosition } from "@/lib/types";

type PositionWithGutschrift = GutschriftPosition & {
  gutschrift?: Pick<Gutschrift, "id" | "gutschrift_nr" | "document_date" | "absender" | "file_name"> | null;
};

interface GutschriftenViewProps {
  positionen: PositionWithGutschrift[];
  gutschriften: Gutschrift[];
  aliasMap: Record<string, Record<string, string>>; // normalized_absender → { alias → license_plate }
  normalizeAbsender: (s: string) => string;
}

function formatEur(val?: number | null): string {
  if (val == null) return "–";
  return val.toLocaleString("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " €";
}

function formatDate(val?: string | null): string {
  if (!val) return "–";
  try { return new Date(val).toLocaleDateString("de-DE"); } catch { return val; }
}

type Tab = "datum" | "kennzeichen" | "gutschriften";

function resolveKennzeichen(
  pos: PositionWithGutschrift,
  aliasMap: Record<string, Record<string, string>>,
  normalize: (s: string) => string
): { plate: string | null; raw: string | null; resolved: boolean } {
  const raw = pos.kennzeichen ?? null;
  const absender = pos.gutschrift?.absender ?? "";
  if (!raw) return { plate: null, raw: null, resolved: false };
  const plate = aliasMap[normalize(absender)]?.[raw] ?? null;
  return { plate, raw, resolved: !!plate };
}

export function GutschriftenView({ positionen, gutschriften, aliasMap, normalizeAbsender }: GutschriftenViewProps) {
  const [activeTab, setActiveTab] = useState<Tab>("datum");
  const [uploading, setUploading] = useState(false);
  const [uploadStatus, setUploadStatus] = useState<{ type: "success" | "error"; message: string } | null>(null);
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // Global filters
  const [filterAbsender, setFilterAbsender] = useState<string>("all");
  const [filterVon, setFilterVon] = useState("");
  const [filterBis, setFilterBis] = useState("");

  // Unique absender list for dropdown
  const absenderList = useMemo(() => {
    const set = new Set<string>();
    gutschriften.forEach((g) => { if (g.absender) set.add(g.absender); });
    return Array.from(set).sort();
  }, [gutschriften]);

  // Filtered positionen
  const filteredPositionen = useMemo(() => {
    return positionen.filter((p) => {
      if (filterAbsender !== "all" && p.gutschrift?.absender !== filterAbsender) return false;
      if (filterVon && p.bel_datum && p.bel_datum < filterVon) return false;
      if (filterBis && p.bel_datum && p.bel_datum > filterBis) return false;
      return true;
    });
  }, [positionen, filterAbsender, filterVon, filterBis]);

  // Filtered gutschriften
  const filteredGutschriften = useMemo(() => {
    return gutschriften.filter((g) => {
      if (filterAbsender !== "all" && g.absender !== filterAbsender) return false;
      if (filterVon && g.document_date && g.document_date < filterVon) return false;
      if (filterBis && g.document_date && g.document_date > filterBis) return false;
      return true;
    });
  }, [gutschriften, filterAbsender, filterVon, filterBis]);

  // Grouped by Kennzeichen (use resolved plate as group key if available)
  const byKennzeichen = useMemo(() => {
    const map = new Map<string, { plate: string | null; raw: string; resolved: boolean; positionen: PositionWithGutschrift[]; netto: number }>();
    filteredPositionen.forEach((p) => {
      const r = resolveKennzeichen(p, aliasMap, normalizeAbsender);
      const raw = r.raw ?? "–";
      const groupKey = r.plate ?? raw;
      const existing = map.get(groupKey) ?? { plate: r.plate, raw, resolved: r.resolved, positionen: [], netto: 0 };
      existing.positionen.push(p);
      existing.netto += p.netto_betrag ?? 0;
      map.set(groupKey, existing);
    });
    return Array.from(map.entries())
      .map(([groupKey, data]) => ({ groupKey, ...data }))
      .sort((a, b) => a.groupKey.localeCompare(b.groupKey));
  }, [filteredPositionen, aliasMap, normalizeAbsender]);

  const [expandedKennzeichen, setExpandedKennzeichen] = useState<string | null>(null);

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
      const res = await fetch("/api/gutschriften/upload", { method: "POST", body: formData });
      const data = await res.json();
      if (!res.ok || !data.success) {
        setUploadStatus({ type: "error", message: data.error ?? "Upload fehlgeschlagen." });
      } else {
        setUploadStatus({ type: "success", message: `Gutschrift erfolgreich verarbeitet und gespeichert.` });
        setTimeout(() => window.location.reload(), 1200);
      }
    } catch (err: unknown) {
      setUploadStatus({ type: "error", message: err instanceof Error ? err.message : "Unbekannter Fehler" });
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

  const tabs: { id: Tab; label: string; icon: React.ReactNode }[] = [
    { id: "datum",        label: "Nach Datum",       icon: <Calendar className="w-3.5 h-3.5" /> },
    { id: "kennzeichen",  label: "Nach Fahrzeug",    icon: <Car className="w-3.5 h-3.5" /> },
    { id: "gutschriften", label: "Gutschriften",      icon: <Euro className="w-3.5 h-3.5" /> },
  ];

  const hasFilter = filterAbsender !== "all" || filterVon || filterBis;

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
            <input ref={inputRef} type="file" accept="application/pdf" className="hidden" onChange={handleFileChange} />
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
            <div className={cn("mt-3 px-4 py-3 rounded-lg text-sm font-medium",
              uploadStatus.type === "success" ? "bg-green-50 text-green-800 border border-green-200" : "bg-red-50 text-red-800 border border-red-200")}>
              {uploadStatus.message}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Global filter bar */}
      <div className="flex flex-wrap gap-3 items-center p-4 bg-gray-50 rounded-xl border border-gray-200">
        <Filter className="w-4 h-4 text-gray-500 shrink-0" />
        <select
          value={filterAbsender}
          onChange={(e) => setFilterAbsender(e.target.value)}
          className="h-9 text-sm border border-gray-300 rounded-lg px-3 bg-white min-w-[200px]"
        >
          <option value="all">Alle Kunden</option>
          {absenderList.map((a) => <option key={a} value={a}>{a}</option>)}
        </select>
        <div className="flex items-center gap-2">
          <span className="text-xs text-gray-500">Von</span>
          <Input type="date" value={filterVon} onChange={(e) => setFilterVon(e.target.value)} className="h-9 text-sm w-36" />
          <span className="text-xs text-gray-500">Bis</span>
          <Input type="date" value={filterBis} onChange={(e) => setFilterBis(e.target.value)} className="h-9 text-sm w-36" />
        </div>
        {hasFilter && (
          <Button variant="ghost" size="sm" className="text-gray-500 h-9"
            onClick={() => { setFilterAbsender("all"); setFilterVon(""); setFilterBis(""); }}>
            Zurücksetzen
          </Button>
        )}
        {hasFilter && (
          <span className="text-xs text-blue-600 font-medium ml-auto">
            {filteredPositionen.length} Position{filteredPositionen.length !== 1 ? "en" : ""} · {filteredGutschriften.length} Gutschrift{filteredGutschriften.length !== 1 ? "en" : ""}
          </span>
        )}
      </div>

      {/* Tabs */}
      <div>
        <div className="flex gap-1 border-b border-gray-200 mb-4">
          {tabs.map((tab) => (
            <button key={tab.id} onClick={() => setActiveTab(tab.id)}
              className={cn("flex items-center gap-1.5 px-4 py-2 text-sm font-medium transition-colors border-b-2 -mb-px",
                activeTab === tab.id ? "border-blue-600 text-blue-600" : "border-transparent text-gray-500 hover:text-gray-700")}>
              {tab.icon}{tab.label}
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
                <Badge className="ml-2">{filteredPositionen.length}</Badge>
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              {filteredPositionen.length === 0 ? (
                <div className="text-center py-12 text-gray-400 text-sm">Keine Positionen gefunden.</div>
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
                      {filteredPositionen.map((pos) => (
                        <tr key={pos.id} className="border-b border-gray-50 hover:bg-gray-50 transition-colors">
                          <td className="px-4 py-3 text-gray-700">{formatDate(pos.bel_datum)}</td>
                          <td className="px-4 py-3">
                            {(() => {
                              const r = resolveKennzeichen(pos, aliasMap, normalizeAbsender);
                              if (!r.raw) return <span className="text-gray-400">–</span>;
                              return (
                                <div className="flex flex-col gap-0.5">
                                  <Badge variant={r.resolved ? "default" : "secondary"} className="font-mono w-fit">
                                    {r.plate ?? r.raw}
                                  </Badge>
                                  {r.resolved && <span className="text-[11px] text-gray-400 font-mono">{r.raw}</span>}
                                </div>
                              );
                            })()}
                          </td>
                          <td className="px-4 py-3 text-right font-mono font-medium text-gray-800">{formatEur(pos.netto_betrag)}</td>
                          <td className="px-4 py-3 text-gray-600">{pos.gutschrift?.gutschrift_nr ?? "–"}</td>
                          <td className="px-4 py-3 text-gray-600 max-w-[200px] truncate">{pos.gutschrift?.absender ?? "–"}</td>
                          <td className="px-4 py-3 text-gray-500">{pos.tour_nr ?? "–"}</td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr className="border-t-2 border-gray-200 bg-gray-50">
                        <td colSpan={2} className="px-4 py-3 text-sm font-semibold text-gray-700">Gesamt</td>
                        <td className="px-4 py-3 text-right font-mono font-bold text-gray-900">
                          {formatEur(filteredPositionen.reduce((s, p) => s + (p.netto_betrag ?? 0), 0))}
                        </td>
                        <td colSpan={3} />
                      </tr>
                    </tfoot>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* Tab: Nach Fahrzeug */}
        {activeTab === "kennzeichen" && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Car className="w-4 h-4" />
                Positionen nach Fahrzeugreferenz
                <Badge className="ml-2">{byKennzeichen.length}</Badge>
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              {byKennzeichen.length === 0 ? (
                <div className="text-center py-12 text-gray-400 text-sm">Keine Positionen gefunden.</div>
              ) : (
                <div className="divide-y divide-gray-100">
                  {byKennzeichen.map(({ groupKey, plate, raw, resolved, positionen: pos, netto }) => (
                    <div key={groupKey}>
                      {/* Summary row — clickable to expand */}
                      <button
                        className="w-full flex items-center gap-4 px-4 py-3 hover:bg-gray-50 transition-colors text-left"
                        onClick={() => setExpandedKennzeichen(expandedKennzeichen === groupKey ? null : groupKey)}
                      >
                        <div className="flex flex-col gap-0.5 min-w-[100px]">
                          <Badge variant={resolved ? "default" : "secondary"} className="font-mono w-fit">
                            {plate ?? raw}
                          </Badge>
                          {resolved && <span className="text-[11px] text-gray-400 font-mono">{raw}</span>}
                        </div>
                        <span className="text-sm text-gray-500">{pos.length} Position{pos.length !== 1 ? "en" : ""}</span>
                        <span className="ml-auto font-mono font-semibold text-gray-900">{formatEur(netto)}</span>
                        <span className="text-gray-400 text-xs">{expandedKennzeichen === groupKey ? "▲" : "▼"}</span>
                      </button>

                      {/* Expanded detail rows */}
                      {expandedKennzeichen === groupKey && (
                        <div className="bg-gray-50 border-t border-gray-100">
                          <table className="w-full text-sm">
                            <thead>
                              <tr className="border-b border-gray-200">
                                <th className="text-left px-8 py-2 text-xs font-semibold text-gray-500">Datum</th>
                                <th className="text-right px-4 py-2 text-xs font-semibold text-gray-500">Netto</th>
                                <th className="text-left px-4 py-2 text-xs font-semibold text-gray-500">Gutschrift-Nr.</th>
                                <th className="text-left px-4 py-2 text-xs font-semibold text-gray-500">Absender</th>
                                <th className="text-left px-4 py-2 text-xs font-semibold text-gray-500">Tour-Nr.</th>
                              </tr>
                            </thead>
                            <tbody>
                              {pos.sort((a, b) => (a.bel_datum ?? "").localeCompare(b.bel_datum ?? "")).map((p) => (
                                <tr key={p.id} className="border-b border-gray-100 hover:bg-white transition-colors">
                                  <td className="px-8 py-2 text-gray-700">{formatDate(p.bel_datum)}</td>
                                  <td className="px-4 py-2 text-right font-mono text-gray-800">{formatEur(p.netto_betrag)}</td>
                                  <td className="px-4 py-2 text-gray-600">{p.gutschrift?.gutschrift_nr ?? "–"}</td>
                                  <td className="px-4 py-2 text-gray-500 max-w-[180px] truncate">{p.gutschrift?.absender ?? "–"}</td>
                                  <td className="px-4 py-2 text-gray-500">{p.tour_nr ?? "–"}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </div>
                  ))}

                  {/* Grand total */}
                  <div className="flex items-center gap-4 px-4 py-3 bg-gray-50 border-t-2 border-gray-200">
                    <span className="text-sm font-semibold text-gray-700">Gesamt</span>
                    <span className="ml-auto font-mono font-bold text-gray-900">
                      {formatEur(byKennzeichen.reduce((s, k) => s + k.netto, 0))}
                    </span>
                    <span className="w-6" />
                  </div>
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
                <Badge className="ml-2">{filteredGutschriften.length}</Badge>
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              {filteredGutschriften.length === 0 ? (
                <div className="text-center py-12 text-gray-400 text-sm">Keine Gutschriften gefunden.</div>
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
                      {filteredGutschriften.map((g) => (
                        <tr key={g.id} className="border-b border-gray-50 hover:bg-gray-50 transition-colors">
                          <td className="px-4 py-3 text-gray-700">{formatDate(g.document_date)}</td>
                          <td className="px-4 py-3 text-gray-800 font-medium max-w-[180px] truncate">{g.absender ?? "–"}</td>
                          <td className="px-4 py-3 text-gray-600">{g.gutschrift_nr ?? "–"}</td>
                          <td className="px-4 py-3 text-right font-mono text-gray-800">{formatEur(g.netto_gesamt)}</td>
                          <td className="px-4 py-3 text-right font-mono text-gray-600">{formatEur(g.mwst)}</td>
                          <td className="px-4 py-3 text-right font-mono font-semibold text-gray-900">{formatEur(g.brutto_gesamt)}</td>
                          <td className="px-4 py-3 text-gray-400 text-xs max-w-[160px] truncate">{g.file_name ?? "–"}</td>
                          <td className="px-4 py-3">
                            <button onClick={() => handleDelete(g.id)}
                              className="p-1.5 rounded-md text-gray-400 hover:text-red-500 hover:bg-red-50 transition-colors" title="Löschen">
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr className="border-t-2 border-gray-200 bg-gray-50">
                        <td colSpan={3} className="px-4 py-3 text-sm font-semibold text-gray-700">Gesamt</td>
                        <td className="px-4 py-3 text-right font-mono font-bold text-gray-900">
                          {formatEur(filteredGutschriften.reduce((s, g) => s + (g.netto_gesamt ?? 0), 0))}
                        </td>
                        <td className="px-4 py-3 text-right font-mono font-bold text-gray-600">
                          {formatEur(filteredGutschriften.reduce((s, g) => s + (g.mwst ?? 0), 0))}
                        </td>
                        <td className="px-4 py-3 text-right font-mono font-bold text-gray-900">
                          {formatEur(filteredGutschriften.reduce((s, g) => s + (g.brutto_gesamt ?? 0), 0))}
                        </td>
                        <td colSpan={2} />
                      </tr>
                    </tfoot>
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
