"use client";

import { useState, useRef, useCallback, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  FileText, Upload, Euro, Calendar, Trash2, Loader2, Car, Filter,
  GitMerge, CheckCircle, AlertTriangle, X, ChevronDown, ChevronRight,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { Gutschrift, GutschriftPosition, GutschriftVehicleEntry } from "@/lib/types";

type PositionWithGutschrift = GutschriftPosition & {
  gutschrift?: Pick<Gutschrift, "id" | "gutschrift_nr" | "document_date" | "absender" | "file_name"> | null;
};

function normalizeAbsender(s: string) {
  return s.toLowerCase().replace(/[\s\-&.,]/g, "").replace(/gmbh|cokg|co\.kg|gmbh&co|&co/g, "");
}

interface ReconcileResult {
  license_plate: string;
  days_claimed: number;
  days_found: number;
  match_status: "matched" | "conflict";
  tours: Array<{
    id: string;
    tour_date: string;
    status: string;
    driver: { first_name: string; last_name: string } | null;
  }>;
}

interface GutschriftenViewProps {
  positionen: PositionWithGutschrift[];
  gutschriften: Gutschrift[];
  aliasMap: Record<string, Record<string, string>>;
  invertMap: Record<string, boolean>;
  vehicleEntries: GutschriftVehicleEntry[];
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

function applyInvert(val: number | null | undefined, invert: boolean): number | null {
  if (val == null) return null;
  return invert ? -val : val;
}

export function GutschriftenView({ positionen, gutschriften, aliasMap, invertMap, vehicleEntries }: GutschriftenViewProps) {
  const [activeTab, setActiveTab] = useState<Tab>("gutschriften");
  const [uploading, setUploading] = useState(false);
  const [uploadStatus, setUploadStatus] = useState<{ type: "success" | "error"; message: string } | null>(null);
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // Global filters
  const [filterAbsender, setFilterAbsender] = useState<string>("all");
  const [filterVon, setFilterVon] = useState("");
  const [filterBis, setFilterBis] = useState("");

  // Reconciliation state
  const [reconciling, setReconciling] = useState<string | null>(null);
  const [reconcileModal, setReconcileModal] = useState<{
    gutschrift: Gutschrift;
    results: ReconcileResult[];
  } | null>(null);
  const [expandedVehicle, setExpandedVehicle] = useState<string | null>(null);

  // Unique absender list
  const absenderList = useMemo(() => {
    const set = new Set<string>();
    gutschriften.forEach((g) => { if (g.absender) set.add(g.absender); });
    return Array.from(set).sort();
  }, [gutschriften]);

  // Filtered positionen (exclude period-based reconciliation rows for the table views)
  const filteredPositionen = useMemo(() => {
    return positionen.filter((p) => {
      if (p.vehicle_entry_id) return false; // skip auto-generated reconciliation rows
      if (filterAbsender !== "all" && p.gutschrift?.absender !== filterAbsender) return false;
      if (filterVon && p.bel_datum && p.bel_datum < filterVon) return false;
      if (filterBis && p.bel_datum && p.bel_datum > filterBis) return false;
      return true;
    });
  }, [positionen, filterAbsender, filterVon, filterBis]);

  const filteredGutschriften = useMemo(() => {
    return gutschriften.filter((g) => {
      if (filterAbsender !== "all" && g.absender !== filterAbsender) return false;
      if (filterVon && g.document_date && g.document_date < filterVon) return false;
      if (filterBis && g.document_date && g.document_date > filterBis) return false;
      return true;
    });
  }, [gutschriften, filterAbsender, filterVon, filterBis]);

  const byKennzeichen = useMemo(() => {
    const map = new Map<string, { plate: string | null; raw: string; resolved: boolean; positionen: PositionWithGutschrift[]; netto: number }>();
    filteredPositionen.forEach((p) => {
      const r = resolveKennzeichen(p, aliasMap, normalizeAbsender);
      const raw = r.raw ?? "–";
      const groupKey = r.plate ?? raw;
      const existing = map.get(groupKey) ?? { plate: r.plate, raw, resolved: r.resolved, positionen: [], netto: 0 };
      existing.positionen.push(p);
      existing.netto += applyInvert(p.netto_betrag, !!invertMap[normalizeAbsender(p.gutschrift?.absender ?? "")]) ?? 0;
      map.set(groupKey, existing);
    });
    return Array.from(map.entries())
      .map(([groupKey, data]) => ({ groupKey, ...data }))
      .sort((a, b) => a.groupKey.localeCompare(b.groupKey));
  }, [filteredPositionen, aliasMap, invertMap]);

  const [expandedKennzeichen, setExpandedKennzeichen] = useState<string | null>(null);

  // Build vehicle entries grouped by gutschrift for quick lookup
  const vehicleEntriesByGutschrift = useMemo(() => {
    const map: Record<string, GutschriftVehicleEntry[]> = {};
    vehicleEntries.forEach((ve) => {
      if (!map[ve.gutschrift_id]) map[ve.gutschrift_id] = [];
      map[ve.gutschrift_id].push(ve);
    });
    return map;
  }, [vehicleEntries]);

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
        const msg = data.billing_type === "per_period"
          ? `Periodenabrechnung erkannt — ${data.vehicle_entries_count} Fahrzeug-Einträge gespeichert. Jetzt Abgleichen!`
          : `Gutschrift erfolgreich verarbeitet und gespeichert.`;
        setUploadStatus({ type: "success", message: msg });
        setTimeout(() => window.location.reload(), 1800);
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

  async function handleReconcile(g: Gutschrift) {
    setReconciling(g.id);
    setReconcileModal(null);
    setExpandedVehicle(null);
    try {
      const res = await fetch(`/api/gutschriften/${g.id}/reconcile`, { method: "POST" });
      const data = await res.json();
      if (data.success) {
        setReconcileModal({ gutschrift: g, results: data.results });
      }
    } finally {
      setReconciling(null);
    }
  }

  const tabs: { id: Tab; label: string; icon: React.ReactNode }[] = [
    { id: "gutschriften", label: "Gutschriften", icon: <Euro className="w-3.5 h-3.5" /> },
    { id: "datum",        label: "Nach Datum",   icon: <Calendar className="w-3.5 h-3.5" /> },
    { id: "kennzeichen",  label: "Nach Fahrzeug", icon: <Car className="w-3.5 h-3.5" /> },
  ];

  const hasFilter = filterAbsender !== "all" || filterVon || filterBis;

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex items-center gap-3">
        <FileText className="w-7 h-7 text-blue-600" />
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Gutschriften</h1>
          <p className="text-sm text-gray-500">PDF-Gutschriften hochladen, auswerten und mit Touren abgleichen</p>
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

        {/* ── Tab: Gutschriften ── */}
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
                        <th className="text-left px-4 py-3 font-semibold text-gray-600">Abgleich</th>
                        <th className="text-left px-4 py-3 font-semibold text-gray-600">Dateiname</th>
                        <th className="px-4 py-3"></th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredGutschriften.map((g) => {
                        const inv = !!invertMap[normalizeAbsender(g.absender ?? "")];
                        const entries = vehicleEntriesByGutschrift[g.id] ?? [];
                        return (
                          <tr key={g.id} className="border-b border-gray-50 hover:bg-gray-50 transition-colors">
                            <td className="px-4 py-3 text-gray-700">{formatDate(g.document_date)}</td>
                            <td className="px-4 py-3 text-gray-800 font-medium max-w-[180px] truncate">{g.absender ?? "–"}</td>
                            <td className="px-4 py-3 text-gray-600">
                              <div className="flex items-center gap-2">
                                {g.gutschrift_nr ?? "–"}
                                {g.billing_type === "per_period" && (
                                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-purple-100 text-purple-700 font-medium">PERIODE</span>
                                )}
                              </div>
                            </td>
                            <td className="px-4 py-3 text-right font-mono text-gray-800">{formatEur(applyInvert(g.netto_gesamt, inv))}</td>
                            <td className="px-4 py-3 text-right font-mono text-gray-600">{formatEur(applyInvert(g.mwst, inv))}</td>
                            <td className="px-4 py-3 text-right font-mono font-semibold text-gray-900">{formatEur(applyInvert(g.brutto_gesamt, inv))}</td>

                            {/* Reconciliation status cell */}
                            <td className="px-4 py-3">
                              {g.billing_type === "per_period" ? (
                                g.reconciliation_status === "ok" ? (
                                  <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium bg-green-100 text-green-700 whitespace-nowrap">
                                    <CheckCircle className="w-3 h-3" /> Abgeglichen
                                  </span>
                                ) : g.reconciliation_status === "conflict" ? (
                                  <button
                                    onClick={() => handleReconcile(g)}
                                    disabled={reconciling === g.id}
                                    className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium bg-red-100 text-red-700 hover:bg-red-200 disabled:opacity-50 whitespace-nowrap"
                                  >
                                    {reconciling === g.id
                                      ? <Loader2 className="w-3 h-3 animate-spin" />
                                      : <AlertTriangle className="w-3 h-3" />}
                                    {reconciling === g.id ? "Läuft…" : `${entries.filter(e => e.match_status === "conflict").length} Konflikt(e)`}
                                  </button>
                                ) : (
                                  <button
                                    onClick={() => handleReconcile(g)}
                                    disabled={reconciling === g.id}
                                    className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium bg-yellow-100 text-yellow-700 hover:bg-yellow-200 disabled:opacity-50 whitespace-nowrap"
                                  >
                                    {reconciling === g.id
                                      ? <Loader2 className="w-3 h-3 animate-spin" />
                                      : <GitMerge className="w-3 h-3" />}
                                    {reconciling === g.id ? "Läuft…" : "Abgleichen"}
                                  </button>
                                )
                              ) : (
                                <span className="text-xs text-gray-400">–</span>
                              )}
                            </td>

                            <td className="px-4 py-3 text-gray-400 text-xs max-w-[140px] truncate">{g.file_name ?? "–"}</td>
                            <td className="px-4 py-3">
                              <button onClick={() => handleDelete(g.id)}
                                className="p-1.5 rounded-md text-gray-400 hover:text-red-500 hover:bg-red-50 transition-colors" title="Löschen">
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                    <tfoot>
                      <tr className="border-t-2 border-gray-200 bg-gray-50">
                        <td colSpan={3} className="px-4 py-3 text-sm font-semibold text-gray-700">Gesamt</td>
                        <td className="px-4 py-3 text-right font-mono font-bold text-gray-900">
                          {formatEur(filteredGutschriften.reduce((s, g) => s + (applyInvert(g.netto_gesamt, !!invertMap[normalizeAbsender(g.absender ?? "")]) ?? 0), 0))}
                        </td>
                        <td className="px-4 py-3 text-right font-mono font-bold text-gray-600">
                          {formatEur(filteredGutschriften.reduce((s, g) => s + (applyInvert(g.mwst, !!invertMap[normalizeAbsender(g.absender ?? "")]) ?? 0), 0))}
                        </td>
                        <td className="px-4 py-3 text-right font-mono font-bold text-gray-900">
                          {formatEur(filteredGutschriften.reduce((s, g) => s + (applyInvert(g.brutto_gesamt, !!invertMap[normalizeAbsender(g.absender ?? "")]) ?? 0), 0))}
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

        {/* ── Tab: Nach Datum ── */}
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
                          <td className="px-4 py-3 text-right font-mono font-medium text-gray-800">{formatEur(applyInvert(pos.netto_betrag, !!invertMap[normalizeAbsender(pos.gutschrift?.absender ?? "")]))}</td>
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
                          {formatEur(filteredPositionen.reduce((s, p) => s + (applyInvert(p.netto_betrag, !!invertMap[normalizeAbsender(p.gutschrift?.absender ?? "")]) ?? 0), 0))}
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

        {/* ── Tab: Nach Fahrzeug ── */}
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
                                  <td className="px-4 py-2 text-right font-mono text-gray-800">{formatEur(applyInvert(p.netto_betrag, !!invertMap[normalizeAbsender(p.gutschrift?.absender ?? "")]))}</td>
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
      </div>

      {/* ── Reconciliation Modal ── */}
      {reconcileModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-2xl w-full max-h-[85vh] flex flex-col">
            {/* Modal header */}
            <div className="flex items-center justify-between px-6 py-4 border-b">
              <div>
                <h2 className="text-base font-semibold text-gray-900 flex items-center gap-2">
                  <GitMerge className="w-4 h-4 text-blue-600" />
                  Abgleich: {reconcileModal.gutschrift.gutschrift_nr ?? "Gutschrift"}
                </h2>
                <p className="text-xs text-gray-500 mt-0.5">
                  {reconcileModal.gutschrift.absender} ·{" "}
                  {reconcileModal.gutschrift.period_from && reconcileModal.gutschrift.period_to
                    ? `${formatDate(reconcileModal.gutschrift.period_from)} – ${formatDate(reconcileModal.gutschrift.period_to)}`
                    : formatDate(reconcileModal.gutschrift.document_date)}
                </p>
              </div>
              <button
                onClick={() => { setReconcileModal(null); window.location.reload(); }}
                className="p-1.5 rounded-lg hover:bg-gray-100 transition-colors"
              >
                <X className="w-5 h-5 text-gray-500" />
              </button>
            </div>

            {/* Summary table */}
            <div className="overflow-auto flex-1 p-6 space-y-4">
              {/* Overall status banner */}
              {reconcileModal.results.every(r => r.match_status === "matched") ? (
                <div className="flex items-center gap-2 p-3 rounded-lg bg-green-50 border border-green-200 text-green-800 text-sm font-medium">
                  <CheckCircle className="w-4 h-4 shrink-0" />
                  Alle Fahrzeuge vollständig abgeglichen — keine Konflikte.
                </div>
              ) : (
                <div className="flex items-center gap-2 p-3 rounded-lg bg-red-50 border border-red-200 text-red-800 text-sm font-medium">
                  <AlertTriangle className="w-4 h-4 shrink-0" />
                  {reconcileModal.results.filter(r => r.match_status === "conflict").length} Fahrzeug(e) mit Differenz — bitte prüfen.
                </div>
              )}

              {/* Per-vehicle rows */}
              <div className="border rounded-xl overflow-hidden">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-gray-50 border-b text-left">
                      <th className="px-4 py-2.5 font-semibold text-gray-600 w-6"></th>
                      <th className="px-4 py-2.5 font-semibold text-gray-600">Fahrzeug</th>
                      <th className="px-4 py-2.5 font-semibold text-gray-600 text-center">Gutschrift</th>
                      <th className="px-4 py-2.5 font-semibold text-gray-600 text-center">Dispo</th>
                      <th className="px-4 py-2.5 font-semibold text-gray-600 text-center">Differenz</th>
                      <th className="px-4 py-2.5 font-semibold text-gray-600 text-center">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {reconcileModal.results.map((r) => {
                      const diff = r.days_found - r.days_claimed;
                      const isExpanded = expandedVehicle === r.license_plate;
                      return (
                        <>
                          <tr
                            key={r.license_plate}
                            className={cn(
                              "hover:bg-gray-50 cursor-pointer transition-colors",
                              r.tours.length > 0 && "cursor-pointer"
                            )}
                            onClick={() => r.tours.length > 0 && setExpandedVehicle(isExpanded ? null : r.license_plate)}
                          >
                            <td className="px-3 py-3 text-gray-400">
                              {r.tours.length > 0
                                ? (isExpanded ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />)
                                : null}
                            </td>
                            <td className="px-4 py-3 font-mono font-medium text-gray-900">{r.license_plate}</td>
                            <td className="px-4 py-3 text-center text-gray-700">{r.days_claimed} Tage</td>
                            <td className="px-4 py-3 text-center text-gray-700">{r.days_found} Tage</td>
                            <td className="px-4 py-3 text-center">
                              {diff === 0 ? (
                                <span className="text-gray-400">–</span>
                              ) : (
                                <span className={cn("font-semibold", diff > 0 ? "text-blue-600" : "text-red-600")}>
                                  {diff > 0 ? `+${diff}` : diff}
                                </span>
                              )}
                            </td>
                            <td className="px-4 py-3 text-center">
                              {r.match_status === "matched" ? (
                                <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium bg-green-100 text-green-700">
                                  <CheckCircle className="w-3 h-3" /> OK
                                </span>
                              ) : (
                                <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium bg-red-100 text-red-700">
                                  <AlertTriangle className="w-3 h-3" /> Konflikt
                                </span>
                              )}
                            </td>
                          </tr>
                          {/* Expanded tour list */}
                          {isExpanded && (
                            <tr key={`${r.license_plate}-detail`}>
                              <td colSpan={6} className="px-0 py-0">
                                <div className="bg-gray-50 border-t border-gray-100 px-8 py-3">
                                  <p className="text-xs font-semibold text-gray-500 mb-2">Touren in der Dispo ({r.tours.length}):</p>
                                  <div className="space-y-1">
                                    {r.tours.map((t, idx) => (
                                      <div key={t.id} className={cn(
                                        "flex items-center gap-3 text-xs px-3 py-1.5 rounded-lg",
                                        idx < r.days_claimed ? "bg-green-50 text-green-800" : "bg-orange-50 text-orange-800"
                                      )}>
                                        <span className="font-medium">{formatDate(t.tour_date)}</span>
                                        {t.driver && (
                                          <span className="text-gray-600">{t.driver.first_name} {t.driver.last_name}</span>
                                        )}
                                        {idx >= r.days_claimed && (
                                          <span className="ml-auto font-medium">Überzählig (nicht in Gutschrift)</span>
                                        )}
                                      </div>
                                    ))}
                                    {r.days_claimed > r.days_found && (
                                      Array.from({ length: r.days_claimed - r.days_found }, (_, i) => (
                                        <div key={`missing-${i}`} className="flex items-center gap-3 text-xs px-3 py-1.5 rounded-lg bg-red-50 text-red-700">
                                          <span className="font-medium">Fehlende Tour</span>
                                          <span className="ml-auto">In Gutschrift berechnet, kein Eintrag in Dispo</span>
                                        </div>
                                      ))
                                    )}
                                  </div>
                                </div>
                              </td>
                            </tr>
                          )}
                        </>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* Netto summary */}
              <div className="p-4 rounded-xl bg-blue-50 border border-blue-100 text-sm">
                <div className="flex justify-between items-center">
                  <span className="text-blue-700 font-medium">Netto zugeordnet</span>
                  <span className="font-mono font-bold text-blue-900">
                    {formatEur(reconcileModal.results.reduce((s, r) => {
                      const entries = vehicleEntriesByGutschrift[reconcileModal.gutschrift.id] ?? [];
                      const entry = entries.find(e => e.license_plate.replace(/-/g, " ").toUpperCase() === r.license_plate);
                      const dieselPerDay = (entry?.days_claimed ?? 0) > 0 ? (entry?.diesel_amount ?? 0) / (entry?.days_claimed ?? 1) : 0;
                      const nettoPerDay = (entry?.daily_rate ?? 0) + dieselPerDay;
                      return s + nettoPerDay * Math.min(r.days_claimed, r.days_found);
                    }, 0))}
                  </span>
                </div>
                <p className="text-xs text-blue-600 mt-1">
                  Nur vollständig gematchte Tage werden in der Auswertung berücksichtigt.
                </p>
              </div>
            </div>

            {/* Modal footer */}
            <div className="px-6 py-4 border-t flex justify-end">
              <Button onClick={() => { setReconcileModal(null); window.location.reload(); }}>
                Schließen & aktualisieren
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
