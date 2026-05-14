"use client";

import { useState, useRef, useCallback, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Wrench,
  Upload,
  Loader2,
  Filter,
  ChevronDown,
  ChevronRight,
  AlertTriangle,
  AlertCircle,
  Info,
  CheckCircle,
  Clock,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface LineItem {
  description: string;
  category: string;
  qty: number | null;
  unit: string | null;
  unit_price: number | null;
  amount: number | null;
}

interface Anomaly {
  severity: "critical" | "warning" | "hint";
  type: string;
  message: string;
}

interface RepairInvoice {
  id: string;
  vehicle_id: string | null;
  license_plate: string | null;
  invoice_date: string | null;
  supplier: string | null;
  invoice_number: string | null;
  amount_netto: number | null;
  amount_brutto: number | null;
  km_reading: number | null;
  file_path: string | null;
  file_name: string | null;
  line_items: LineItem[];
  ai_anomalies: Anomaly[];
  ai_status: string;
  notes: string | null;
  created_at: string;
  vehicle: { license_plate: string; type: string } | null;
}

interface ReparaturenViewProps {
  invoices: RepairInvoice[];
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

const CATEGORY_LABELS: Record<string, string> = {
  tire: "Reifen",
  brake: "Bremsen",
  engine_oil: "Motoröl",
  filter: "Filter",
  inspection: "Inspektion",
  body_repair: "Karosserie",
  electrical: "Elektrik",
  loading_security: "Ladungssicherung",
  accessory: "Zubehör",
  tool: "Werkzeug",
  towing_service: "Abschleppdienst",
  tax_fee: "Steuer/Gebühren",
  used_part: "Gebrauchtteil",
  no_wear_part: "Kein Verschleißteil",
  other: "Sonstiges",
};

function AiStatusBadge({ status }: { status: string }) {
  switch (status) {
    case "ok":
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-700">
          <CheckCircle className="w-3 h-3" /> OK
        </span>
      );
    case "warning":
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-amber-100 text-amber-700">
          <AlertTriangle className="w-3 h-3" /> Warnung
        </span>
      );
    case "alert":
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-700">
          <AlertCircle className="w-3 h-3" /> Alert
        </span>
      );
    default:
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-600">
          <Clock className="w-3 h-3" /> Ausstehend
        </span>
      );
  }
}

function AnomalyChip({ anomaly }: { anomaly: Anomaly }) {
  const colorClass =
    anomaly.severity === "critical"
      ? "bg-red-100 text-red-700"
      : anomaly.severity === "warning"
      ? "bg-amber-100 text-amber-700"
      : "bg-blue-50 text-blue-700";

  const icon =
    anomaly.severity === "critical" ? (
      <AlertCircle className="w-3 h-3 shrink-0" />
    ) : anomaly.severity === "warning" ? (
      <AlertTriangle className="w-3 h-3 shrink-0" />
    ) : (
      <Info className="w-3 h-3 shrink-0" />
    );

  return (
    <span className={cn("inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium", colorClass)}>
      {icon}
      {anomaly.message}
    </span>
  );
}

function InvoiceCard({ invoice, onDelete }: { invoice: RepairInvoice; onDelete: (id: string) => void }) {
  const [expanded, setExpanded] = useState(false);
  const [notes, setNotes] = useState(invoice.notes ?? "");
  const [savingNotes, setSavingNotes] = useState(false);
  const [notesSaved, setNotesSaved] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const displayPlate = invoice.vehicle?.license_plate ?? invoice.license_plate ?? "–";
  const anomalies: Anomaly[] = Array.isArray(invoice.ai_anomalies) ? invoice.ai_anomalies : [];
  const lineItems: LineItem[] = Array.isArray(invoice.line_items) ? invoice.line_items : [];
  const isDuplicate = anomalies.some((a) => a.type === "duplicate");

  async function handleDelete() {
    if (!confirmDelete) { setConfirmDelete(true); return; }
    setDeleting(true);
    try {
      await fetch(`/api/repair-invoices/${invoice.id}`, { method: "DELETE" });
      onDelete(invoice.id);
    } finally {
      setDeleting(false);
      setConfirmDelete(false);
    }
  }

  async function saveNotes() {
    setSavingNotes(true);
    try {
      await fetch(`/api/repair-invoices/${invoice.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ notes }),
      });
      setNotesSaved(true);
      setTimeout(() => setNotesSaved(false), 2000);
    } finally {
      setSavingNotes(false);
    }
  }

  return (
    <Card className={cn("overflow-hidden", isDuplicate && "border-red-300 ring-1 ring-red-300")}>
      <CardContent className="p-0">
        {/* Duplicate banner */}
        {isDuplicate && (
          <div className="flex items-center justify-between px-4 py-2 bg-red-50 border-b border-red-200">
            <span className="text-xs font-semibold text-red-700 flex items-center gap-1.5">
              <AlertCircle className="w-3.5 h-3.5" /> Duplikat erkannt — diese Rechnung existiert bereits
            </span>
            <button
              onClick={handleDelete}
              disabled={deleting}
              className={cn(
                "text-xs font-semibold px-3 py-1 rounded-lg transition-colors",
                confirmDelete
                  ? "bg-red-600 text-white hover:bg-red-700"
                  : "bg-red-100 text-red-700 hover:bg-red-200"
              )}
            >
              {deleting ? "Wird gelöscht…" : confirmDelete ? "Wirklich löschen?" : "Löschen"}
            </button>
          </div>
        )}
        {/* Main row */}
        <div className="p-4">
          <div className="flex flex-wrap items-start gap-3">
            {/* Left: plate + supplier + date */}
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-mono font-bold text-gray-900 text-base">{displayPlate}</span>
                {invoice.vehicle && (
                  <span className="text-xs text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full">
                    {invoice.vehicle.type}
                  </span>
                )}
                {!invoice.vehicle_id && invoice.license_plate && (
                  <span className="text-xs text-amber-600 bg-amber-50 px-2 py-0.5 rounded-full border border-amber-200">
                    Nicht im Fuhrpark
                  </span>
                )}
              </div>
              <div className="flex items-center gap-2 mt-1 text-sm text-gray-600 flex-wrap">
                <span className="font-medium">{invoice.supplier ?? "–"}</span>
                {invoice.invoice_number && (
                  <>
                    <span className="text-gray-300">·</span>
                    <span className="text-gray-500">Nr. {invoice.invoice_number}</span>
                  </>
                )}
                {invoice.invoice_date && (
                  <>
                    <span className="text-gray-300">·</span>
                    <span className="text-gray-500">{formatDate(invoice.invoice_date)}</span>
                  </>
                )}
                {invoice.km_reading && (
                  <>
                    <span className="text-gray-300">·</span>
                    <span className="text-gray-500">{invoice.km_reading.toLocaleString("de-DE")} km</span>
                  </>
                )}
              </div>
            </div>

            {/* Right: amounts + status */}
            <div className="flex items-center gap-4 shrink-0">
              <div className="text-right">
                <p className="text-xs text-gray-400">Netto</p>
                <p className="font-mono text-sm text-gray-700">{formatEur(invoice.amount_netto)}</p>
              </div>
              <div className="text-right">
                <p className="text-xs text-gray-400">Brutto</p>
                <p className="font-mono font-semibold text-gray-900 text-base">{formatEur(invoice.amount_brutto)}</p>
              </div>
              <AiStatusBadge status={invoice.ai_status} />
            </div>
          </div>

          {/* Anomalies */}
          {anomalies.length > 0 && (
            <div className="flex flex-wrap gap-1.5 mt-3">
              {anomalies.map((a, i) => (
                <AnomalyChip key={i} anomaly={a} />
              ))}
            </div>
          )}

          {/* Expand toggle */}
          <div className="flex items-center justify-between mt-3">
            <button
              onClick={() => setExpanded(!expanded)}
              className="flex items-center gap-1 text-xs text-gray-500 hover:text-gray-700 transition-colors"
            >
              {expanded ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
              {lineItems.length} Position{lineItems.length !== 1 ? "en" : ""}
            </button>
            <div className="flex items-center gap-3">
              <span className="text-xs text-gray-400">{invoice.file_name ?? ""}</span>
              {!isDuplicate && (
                <button
                  onClick={handleDelete}
                  disabled={deleting}
                  className={cn(
                    "text-xs px-2 py-0.5 rounded transition-colors",
                    confirmDelete
                      ? "bg-red-600 text-white hover:bg-red-700"
                      : "text-gray-400 hover:text-red-600 hover:bg-red-50"
                  )}
                >
                  {deleting ? "…" : confirmDelete ? "Löschen?" : "Löschen"}
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Expanded: line items + notes */}
        {expanded && (
          <div className="border-t border-gray-100 bg-gray-50">
            {lineItems.length > 0 && (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-200">
                      <th className="text-left px-4 py-2 text-xs font-semibold text-gray-500">Beschreibung</th>
                      <th className="text-left px-4 py-2 text-xs font-semibold text-gray-500">Kategorie</th>
                      <th className="text-right px-4 py-2 text-xs font-semibold text-gray-500">Menge</th>
                      <th className="text-right px-4 py-2 text-xs font-semibold text-gray-500">Einzelpreis</th>
                      <th className="text-right px-4 py-2 text-xs font-semibold text-gray-500">Gesamt</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {lineItems.map((item, i) => (
                      <tr key={i} className="hover:bg-white transition-colors">
                        <td className="px-4 py-2 text-gray-800 max-w-xs">{item.description}</td>
                        <td className="px-4 py-2">
                          <span className="text-xs px-2 py-0.5 rounded-full bg-gray-200 text-gray-600">
                            {CATEGORY_LABELS[item.category] ?? item.category}
                          </span>
                        </td>
                        <td className="px-4 py-2 text-right text-gray-600 font-mono text-xs">
                          {item.qty != null ? `${item.qty} ${item.unit ?? ""}`.trim() : "–"}
                        </td>
                        <td className="px-4 py-2 text-right text-gray-600 font-mono text-xs">
                          {formatEur(item.unit_price)}
                        </td>
                        <td className="px-4 py-2 text-right font-mono font-medium text-gray-800 text-xs">
                          {formatEur(item.amount)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {/* Notes */}
            <div className="p-4 border-t border-gray-100">
              <p className="text-xs font-semibold text-gray-500 mb-1.5">Notizen</p>
              <div className="flex gap-2">
                <Input
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Interne Notiz hinzufügen…"
                  className="text-sm h-8"
                />
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={saveNotes}
                  disabled={savingNotes}
                  className="h-8 text-xs shrink-0"
                >
                  {savingNotes ? <Loader2 className="w-3 h-3 animate-spin" /> : notesSaved ? "Gespeichert" : "Speichern"}
                </Button>
              </div>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

type FileStatus = "pending" | "uploading" | "done" | "error";
type FileEntry = { file: File; status: FileStatus; error?: string };

export function ReparaturenView({ invoices }: ReparaturenViewProps) {
  const [queue, setQueue] = useState<FileEntry[]>([]);
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const processingRef = useRef(false);

  const [allInvoices, setAllInvoices] = useState<RepairInvoice[]>(invoices);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");

  function handleDelete(id: string) {
    setAllInvoices((prev) => prev.filter((inv) => inv.id !== id));
  }

  const filtered = useMemo(() => {
    return allInvoices.filter((inv) => {
      if (statusFilter !== "all" && inv.ai_status !== statusFilter) return false;
      if (search) {
        const q = search.toLowerCase();
        const plate = (inv.vehicle?.license_plate ?? inv.license_plate ?? "").toLowerCase();
        const supplier = (inv.supplier ?? "").toLowerCase();
        const invoiceNum = (inv.invoice_number ?? "").toLowerCase();
        if (!plate.includes(q) && !supplier.includes(q) && !invoiceNum.includes(q)) return false;
      }
      return true;
    });
  }, [invoices, search, statusFilter]);

  const processQueue = useCallback(async (entries: FileEntry[]) => {
    if (processingRef.current) return;
    processingRef.current = true;
    for (let i = 0; i < entries.length; i++) {
      if (entries[i].status !== "pending") continue;
      setQueue((q) => q.map((e, idx) => idx === i ? { ...e, status: "uploading" } : e));
      const file = entries[i].file;
      try {
        const formData = new FormData();
        formData.append("file", file);
        const res = await fetch("/api/repair-invoices/upload", { method: "POST", body: formData });
        const data = await res.json();
        if (!res.ok || !data.success) {
          setQueue((q) => q.map((e, idx) => idx === i ? { ...e, status: "error", error: data.error ?? "Fehler" } : e));
        } else {
          setQueue((q) => q.map((e, idx) => idx === i ? { ...e, status: "done" } : e));
        }
      } catch (err: unknown) {
        setQueue((q) => q.map((e, idx) => idx === i ? { ...e, status: "error", error: err instanceof Error ? err.message : "Fehler" } : e));
      }
    }
    processingRef.current = false;
    // Reload once all done
    setQueue((q) => {
      if (q.every((e) => e.status === "done" || e.status === "error")) {
        setTimeout(() => window.location.reload(), 1200);
      }
      return q;
    });
  }, []);

  function addFiles(files: FileList | File[]) {
    const pdfs = Array.from(files).filter((f) => f.name.toLowerCase().endsWith(".pdf"));
    if (pdfs.length === 0) return;
    const entries: FileEntry[] = pdfs.map((f) => ({ file: f, status: "pending" }));
    setQueue((q) => {
      const next = [...q, ...entries];
      // start processing after state update
      setTimeout(() => processQueue(next), 0);
      return next;
    });
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    if (e.target.files) addFiles(e.target.files);
    e.target.value = "";
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragging(false);
    if (e.dataTransfer.files) addFiles(e.dataTransfer.files);
  }

  const doneCount = queue.filter((e) => e.status === "done").length;
  const errorCount = queue.filter((e) => e.status === "error").length;
  const uploadingNow = queue.find((e) => e.status === "uploading");
  const pendingCount = queue.filter((e) => e.status === "pending").length;
  const isRunning = queue.length > 0 && queue.some((e) => e.status === "pending" || e.status === "uploading");

  const statusCounts = useMemo(() => {
    const counts: Record<string, number> = { all: allInvoices.length, ok: 0, warning: 0, alert: 0, pending: 0 };
    for (const inv of allInvoices) {
      const s = inv.ai_status ?? "pending";
      counts[s] = (counts[s] ?? 0) + 1;
    }
    return counts;
  }, [invoices]);

  return (
    <div className="p-6 space-y-6 max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Wrench className="w-7 h-7 text-blue-600" />
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Reparaturrechnungen</h1>
          <p className="text-sm text-gray-500">
            PDF-Werkstattrechnungen hochladen, KI-Extraktion und Anomalieerkennung
          </p>
        </div>
      </div>

      {/* Upload area */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Upload className="w-4 h-4" />
            Rechnungen hochladen
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div
            className={cn(
              "border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-colors",
              dragging ? "border-blue-500 bg-blue-50" : "border-gray-300 hover:border-blue-400 hover:bg-gray-50",
            )}
            onClick={() => inputRef.current?.click()}
            onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
            onDragLeave={() => setDragging(false)}
            onDrop={handleDrop}
          >
            <input ref={inputRef} type="file" accept="application/pdf" multiple className="hidden" onChange={handleFileChange} />
            <div className="flex flex-col items-center gap-3">
              <Upload className="w-8 h-8 text-gray-400" />
              <div>
                <p className="text-sm font-medium text-gray-700">
                  PDFs hierher ziehen oder klicken zum Auswählen
                </p>
                <p className="text-xs text-gray-400 mt-1">Mehrere Dateien gleichzeitig möglich · Nur PDF · max. 20 MB pro Datei</p>
              </div>
            </div>
          </div>

          {/* Progress */}
          {queue.length > 0 && (
            <div className="mt-4 space-y-2">
              <div className="flex items-center justify-between text-sm">
                <span className="font-medium text-gray-700">
                  {isRunning
                    ? `Verarbeite ${uploadingNow?.file.name ?? "…"} (${doneCount + errorCount + 1} / ${queue.length})`
                    : `Fertig — ${doneCount} erfolgreich${errorCount > 0 ? `, ${errorCount} Fehler` : ""}`}
                </span>
                {isRunning && <Loader2 className="w-4 h-4 animate-spin text-blue-600" />}
              </div>
              {/* Progress bar */}
              <div className="w-full bg-gray-200 rounded-full h-2">
                <div
                  className="bg-blue-500 h-2 rounded-full transition-all"
                  style={{ width: `${((doneCount + errorCount) / queue.length) * 100}%` }}
                />
              </div>
              <p className="text-xs text-gray-400">
                {doneCount} ✓ · {pendingCount} ausstehend{errorCount > 0 ? ` · ${errorCount} Fehler` : ""}
              </p>
              {/* Error list */}
              {errorCount > 0 && (
                <div className="mt-2 space-y-1">
                  {queue.filter((e) => e.status === "error").map((e, i) => (
                    <div key={i} className="text-xs text-red-700 bg-red-50 px-3 py-1.5 rounded">
                      {e.file.name}: {e.error}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Filter bar */}
      <div className="flex flex-wrap gap-3 items-center p-4 bg-gray-50 rounded-xl border border-gray-200">
        <Filter className="w-4 h-4 text-gray-500 shrink-0" />
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Kennzeichen, Lieferant, Rechnungsnr. …"
          className="h-9 text-sm w-64"
        />
        <div className="flex gap-1">
          {(["all", "ok", "warning", "alert", "pending"] as const).map((s) => (
            <button
              key={s}
              onClick={() => setStatusFilter(s)}
              className={cn(
                "px-3 py-1.5 rounded-lg text-xs font-medium transition-colors border",
                statusFilter === s
                  ? "bg-blue-600 text-white border-blue-600"
                  : "bg-white text-gray-600 border-gray-200 hover:border-gray-300"
              )}
            >
              {s === "all"
                ? "Alle"
                : s === "ok"
                ? "OK"
                : s === "warning"
                ? "Warnung"
                : s === "alert"
                ? "Alert"
                : "Ausstehend"}{" "}
              <span className="opacity-70">({statusCounts[s] ?? 0})</span>
            </button>
          ))}
        </div>
        {(search || statusFilter !== "all") && (
          <span className="text-xs text-blue-600 font-medium ml-auto">
            {filtered.length} Rechnung{filtered.length !== 1 ? "en" : ""}
          </span>
        )}
      </div>

      {/* Invoice list */}
      {filtered.length === 0 ? (
        <div className="text-center py-16 text-gray-400 text-sm">
          {invoices.length === 0
            ? "Noch keine Reparaturrechnungen vorhanden. PDF hochladen, um zu beginnen."
            : "Keine Rechnungen für den aktuellen Filter gefunden."}
        </div>
      ) : (
        <div className="space-y-3">
          <Badge variant="secondary" className="text-xs">
            {filtered.length} Rechnung{filtered.length !== 1 ? "en" : ""}
          </Badge>
          {filtered.map((inv) => (
            <InvoiceCard key={inv.id} invoice={inv} onDelete={handleDelete} />
          ))}
        </div>
      )}
    </div>
  );
}
