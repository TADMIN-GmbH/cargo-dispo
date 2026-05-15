"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Vehicle } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Truck, Plus, Search, Pencil, SlidersHorizontal, Link2, X, Archive, RotateCcw } from "lucide-react";

const TOWING_TYPES = ["MW 12t", "MW 15t", "MW 18t", "MW 26t", "SZM", "Transporter", "PKW"];
const TOWED_TYPES  = ["Auflieger", "Anhänger"];

const statusConfig = {
  available:   { label: "Verfügbar", variant: "success"    as const },
  on_tour:     { label: "Auf Tour",  variant: "default"    as const },
  maintenance: { label: "Wartung",   variant: "warning"    as const },
  inactive:    { label: "Inaktiv",   variant: "secondary"  as const },
};

type ColKey = "type" | "status" | "driver" | "length" | "width" | "height" | "payload" | "notes";

const ALL_COLUMNS: { key: ColKey; label: string }[] = [
  { key: "type",    label: "Typ / Marke"   },
  { key: "status",  label: "Status"        },
  { key: "driver",  label: "Fahrer"        },
  { key: "length",  label: "Länge (m)"     },
  { key: "width",   label: "Breite (m)"    },
  { key: "height",  label: "Höhe (m)"      },
  { key: "payload", label: "Nutzlast (kg)" },
  { key: "notes",   label: "Notizen"       },
];

const DEFAULT_VISIBLE: ColKey[] = ["type", "status", "driver", "notes"];

const emptyVehicle = {
  license_plate:     "",
  type:              "",
  brand:             "",
  model:             "",
  registration_date: "",
  vin:               "",
  tire_size:         "",
  km_class:          "" as string,
  status:            "available" as const,
  current_driver_id: "",
  length_m:          "" as string | number,
  width_m:           "" as string | number,
  height_m:          "" as string | number,
  payload_kg:        "" as string | number,
  notes:             "",
  tadmin_vehicle_id: "" as string | number,
};

interface TruckListProps {
  initialVehicles: Vehicle[];
  availableDrivers: { id: string; first_name: string; last_name: string; status: string }[];
  userRole: "admin" | "employee";
}

export function TruckList({ initialVehicles, availableDrivers }: TruckListProps) {
  const supabase = createClient();
  const [vehicles,          setVehicles]          = useState(initialVehicles);
  const [search,            setSearch]            = useState("");
  const [dialogOpen,        setDialogOpen]        = useState(false);
  const [editing,           setEditing]           = useState<Vehicle | null>(null);
  const [form,              setForm]              = useState(emptyVehicle);
  const [saving,            setSaving]            = useState(false);
  const [saveError,         setSaveError]         = useState("");
  const [visibleCols,       setVisibleCols]       = useState<Set<ColKey>>(new Set(DEFAULT_VISIBLE));
  const [dialogDrivers,     setDialogDrivers]     = useState(availableDrivers);
  const [trailerIds,        setTrailerIds]        = useState<string[]>([]);
  const [originalTrailerIds,setOriginalTrailerIds]= useState<string[]>([]);
  const [showArchived,      setShowArchived]      = useState(false);
  const [archivedVehicles,  setArchivedVehicles]  = useState<Vehicle[]>([]);
  const [loadingArchived,   setLoadingArchived]   = useState(false);

  function matchesSearch(v: Vehicle) {
    const q = search.toLowerCase();
    return (
      v.license_plate.toLowerCase().includes(q) ||
      (v.type  ?? "").toLowerCase().includes(q) ||
      (v.brand ?? "").toLowerCase().includes(q) ||
      (v.model ?? "").toLowerCase().includes(q)
    );
  }

  const towingVehicles = vehicles.filter(v =>  TOWING_TYPES.includes(v.type) && matchesSearch(v));
  const towedVehicles  = vehicles.filter(v =>  TOWED_TYPES.includes(v.type)  && matchesSearch(v));
  const otherVehicles  = vehicles.filter(v => !TOWING_TYPES.includes(v.type) && !TOWED_TYPES.includes(v.type) && matchesSearch(v));

  function toggleCol(key: ColKey) {
    setVisibleCols(prev => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });
  }

  function openCreate() {
    setEditing(null);
    setForm(emptyVehicle);
    setSaveError("");
    setDialogDrivers(availableDrivers);
    setTrailerIds([]);
    setOriginalTrailerIds([]);
    setDialogOpen(true);
  }

  function openEdit(v: Vehicle) {
    setEditing(v);
    setForm({
      license_plate:     v.license_plate,
      type:              v.type              ?? "",
      brand:             v.brand             ?? "",
      model:             v.model             ?? "",
      registration_date: v.registration_date ?? "",
      vin:               v.vin               ?? "",
      tire_size:         v.tire_size         ?? "",
      km_class:          (v as any).km_class ?? "",
      status:            v.status            as typeof emptyVehicle.status,
      current_driver_id: v.current_driver_id ?? "",
      length_m:          v.length_m          ?? ("" as string | number),
      width_m:           v.width_m           ?? ("" as string | number),
      height_m:          v.height_m          ?? ("" as string | number),
      payload_kg:        v.payload_kg        ?? ("" as string | number),
      notes:             v.notes             ?? "",
      tadmin_vehicle_id: (v as any).tadmin_vehicle_id ?? ("" as string | number),
    });
    const currentDriver = (v as any).current_driver;
    if (currentDriver && !availableDrivers.find(d => d.id === currentDriver.id)) {
      setDialogDrivers([
        { id: currentDriver.id, first_name: currentDriver.first_name, last_name: currentDriver.last_name, status: "on_tour" },
        ...availableDrivers,
      ]);
    } else {
      setDialogDrivers(availableDrivers);
    }
    const currentTrailers = vehicles.filter(vv => vv.towing_vehicle_id === v.id).map(vv => vv.id);
    setTrailerIds(currentTrailers);
    setOriginalTrailerIds(currentTrailers);
    setSaveError("");
    setDialogOpen(true);
  }

  async function handleSave() {
    setSaving(true);
    setSaveError("");
    const payload = {
      license_plate:     form.license_plate,
      type:              form.type,
      brand:             form.brand             || null,
      model:             form.model             || null,
      registration_date: form.registration_date || null,
      vin:               form.vin               || null,
      tire_size:         form.tire_size         || null,
      km_class:          form.km_class          || null,
      status:            form.status,
      current_driver_id: form.current_driver_id || null,
      length_m:          form.length_m  !== "" ? Number(form.length_m)  : null,
      width_m:           form.width_m   !== "" ? Number(form.width_m)   : null,
      height_m:          form.height_m  !== "" ? Number(form.height_m)  : null,
      payload_kg:        form.payload_kg !== "" ? Number(form.payload_kg): null,
      notes:             form.notes || null,
      tadmin_vehicle_id: form.tadmin_vehicle_id !== "" ? Number(form.tadmin_vehicle_id) : null,
    };

    let savedId: string | null = editing?.id ?? null;

    if (editing) {
      const { data, error } = await supabase
        .from("vehicles")
        .update(payload)
        .eq("id", editing.id)
        .select("*, current_driver:current_driver_id(id, first_name, last_name)")
        .single();
      if (error) { setSaveError(error.message); setSaving(false); return; }
      if (data) setVehicles(prev => prev.map(v => v.id === editing.id ? { ...data, towing_vehicle_id: v.towing_vehicle_id } : v));
    } else {
      const { data, error } = await supabase
        .from("vehicles")
        .insert(payload)
        .select("*, current_driver:current_driver_id(id, first_name, last_name)")
        .single();
      if (error) { setSaveError(error.message); setSaving(false); return; }
      if (data) { savedId = data.id; setVehicles(prev => [...prev, data]); }
    }

    // Handle trailer assignments for towing vehicles
    if (TOWING_TYPES.includes(form.type) && savedId) {
      const removed = originalTrailerIds.filter(id => !trailerIds.includes(id));
      const added   = trailerIds.filter(id => !originalTrailerIds.includes(id));
      for (const id of removed) {
        await supabase.from("vehicles").update({ towing_vehicle_id: null }).eq("id", id);
      }
      for (const id of added) {
        await supabase.from("vehicles").update({ towing_vehicle_id: savedId }).eq("id", id);
      }
      if (removed.length > 0 || added.length > 0) {
        const fid = savedId;
        setVehicles(prev => prev.map(v => {
          if (removed.includes(v.id)) return { ...v, towing_vehicle_id: undefined };
          if (added.includes(v.id))   return { ...v, towing_vehicle_id: fid };
          return v;
        }));
      }
    }

    // If type or km_class changed, recompute soll for this vehicle's tours
    if (editing && savedId && (editing.type !== form.type || (editing as any).km_class !== (form.km_class || null))) {
      fetch("/api/tours/compute-soll", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ vehicle_id: savedId, since: "2026-01-01" }),
      }).catch(() => {/* silent */});
    }

    setSaving(false);
    setDialogOpen(false);
  }

  async function handleArchive(id: string) {
    await supabase.from("vehicles").update({ archived_at: new Date().toISOString() }).eq("id", id);
    setVehicles(prev =>
      prev.filter(v => v.id !== id)
          .map(v => v.towing_vehicle_id === id ? { ...v, towing_vehicle_id: undefined } : v)
    );
  }

  async function handleRestore(id: string) {
    await fetch("/api/archived", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ table: "vehicles", id }) });
    setArchivedVehicles(prev => prev.filter(v => v.id !== id));
  }

  async function toggleArchived() {
    if (showArchived) {
      setShowArchived(false);
      return;
    }
    setLoadingArchived(true);
    const res = await fetch("/api/archived?table=vehicles");
    const data = await res.json();
    setArchivedVehicles(Array.isArray(data) ? data : []);
    setLoadingArchived(false);
    setShowArchived(true);
  }

  function formatDate(iso: string) {
    return new Date(iso).toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", year: "numeric" });
  }

  const isTowing = TOWING_TYPES.includes(form.type);

  const availableTrailersForDialog = vehicles.filter(v =>
    TOWED_TYPES.includes(v.type) &&
    (!v.towing_vehicle_id || v.towing_vehicle_id === editing?.id) &&
    !trailerIds.includes(v.id)
  );

  // ── Table helpers ──────────────────────────────────────────────────────────

  function renderTableHead(extraColLabel: string) {
    return (
      <thead>
        <tr className="border-b border-gray-100">
          <th className="text-left text-xs font-semibold text-gray-500 uppercase tracking-wider px-6 py-3">Kennzeichen</th>
          {visibleCols.has("type")    && <th className="text-left text-xs font-semibold text-gray-500 uppercase tracking-wider px-6 py-3">Typ / Marke</th>}
          {visibleCols.has("status")  && <th className="text-left text-xs font-semibold text-gray-500 uppercase tracking-wider px-6 py-3">Status</th>}
          {visibleCols.has("driver")  && <th className="text-left text-xs font-semibold text-gray-500 uppercase tracking-wider px-6 py-3">Fahrer</th>}
          {visibleCols.has("length")  && <th className="text-right text-xs font-semibold text-gray-500 uppercase tracking-wider px-6 py-3">Länge (m)</th>}
          {visibleCols.has("width")   && <th className="text-right text-xs font-semibold text-gray-500 uppercase tracking-wider px-6 py-3">Breite (m)</th>}
          {visibleCols.has("height")  && <th className="text-right text-xs font-semibold text-gray-500 uppercase tracking-wider px-6 py-3">Höhe (m)</th>}
          {visibleCols.has("payload") && <th className="text-right text-xs font-semibold text-gray-500 uppercase tracking-wider px-6 py-3">Nutzlast (kg)</th>}
          {visibleCols.has("notes")   && <th className="text-left text-xs font-semibold text-gray-500 uppercase tracking-wider px-6 py-3">Notizen</th>}
          <th className="text-left text-xs font-semibold text-gray-500 uppercase tracking-wider px-6 py-3">{extraColLabel}</th>
          <th className="text-right text-xs font-semibold text-gray-500 uppercase tracking-wider px-6 py-3">Aktionen</th>
        </tr>
      </thead>
    );
  }

  function renderRow(v: Vehicle, showTowingCol: boolean) {
    const status      = statusConfig[v.status] ?? { label: v.status, variant: "secondary" as const };
    const driver      = (v as any).current_driver;
    const trailers    = vehicles.filter(vv => vv.towing_vehicle_id === v.id);
    const towingVeh   = v.towing_vehicle_id ? vehicles.find(vv => vv.id === v.towing_vehicle_id) : null;

    return (
      <tr key={v.id} className="hover:bg-gray-50 transition-colors">
        <td className="px-6 py-4">
          <span className="font-mono font-semibold text-gray-900">{v.license_plate}</span>
        </td>
        {visibleCols.has("type") && (
          <td className="px-6 py-4 text-sm text-gray-600">
            {v.type  && <span className="font-medium">{v.type}</span>}
            {v.brand && <span className="text-gray-400"> · {v.brand}{v.model ? ` ${v.model}` : ""}</span>}
            {v.registration_date && <span className="text-gray-400"> ({new Date(v.registration_date).toLocaleDateString("de-DE")})</span>}
          </td>
        )}
        {visibleCols.has("status") && (
          <td className="px-6 py-4">
            <Badge variant={status.variant}>{status.label}</Badge>
          </td>
        )}
        {visibleCols.has("driver") && (
          <td className="px-6 py-4 text-sm text-gray-600">
            {driver ? `${driver.first_name} ${driver.last_name}` : <span className="text-gray-300">–</span>}
          </td>
        )}
        {visibleCols.has("length") && (
          <td className="px-6 py-4 text-sm text-gray-600 text-right font-mono">
            {v.length_m ?? <span className="text-gray-300">–</span>}
          </td>
        )}
        {visibleCols.has("width") && (
          <td className="px-6 py-4 text-sm text-gray-600 text-right font-mono">
            {v.width_m ?? <span className="text-gray-300">–</span>}
          </td>
        )}
        {visibleCols.has("height") && (
          <td className="px-6 py-4 text-sm text-gray-600 text-right font-mono">
            {v.height_m ?? <span className="text-gray-300">–</span>}
          </td>
        )}
        {visibleCols.has("payload") && (
          <td className="px-6 py-4 text-sm text-gray-600 text-right font-mono">
            {v.payload_kg != null ? v.payload_kg.toLocaleString("de-DE") : <span className="text-gray-300">–</span>}
          </td>
        )}
        {visibleCols.has("notes") && (
          <td className="px-6 py-4 text-sm text-gray-500 max-w-[200px] truncate">
            {v.notes || <span className="text-gray-300">–</span>}
          </td>
        )}
        {/* Extra column: trailers (for towing) or towing vehicle (for towed) */}
        <td className="px-6 py-4 text-sm">
          {showTowingCol ? (
            trailers.length > 0 ? (
              <div className="flex flex-wrap gap-1">
                {trailers.map(t => (
                  <span key={t.id} className="inline-flex items-center gap-1 bg-blue-50 text-blue-700 text-xs font-mono px-2 py-0.5 rounded-full">
                    <Link2 className="w-3 h-3" />{t.license_plate}
                  </span>
                ))}
              </div>
            ) : <span className="text-gray-300">–</span>
          ) : (
            towingVeh
              ? <span className="inline-flex items-center gap-1 bg-gray-100 text-gray-600 text-xs font-mono px-2 py-0.5 rounded-full"><Link2 className="w-3 h-3" />{towingVeh.license_plate}</span>
              : <span className="text-gray-300">–</span>
          )}
        </td>
        <td className="px-6 py-4 text-right">
          <div className="flex items-center justify-end gap-2">
            <Button variant="ghost" size="icon" onClick={() => openEdit(v)}>
              <Pencil className="w-4 h-4" />
            </Button>
            <Button
              variant="ghost" size="icon"
              className="text-gray-400 hover:text-gray-600 hover:bg-gray-100"
              title="Archivieren"
              onClick={() => handleArchive(v.id)}
            >
              <Archive className="w-4 h-4" />
            </Button>
          </div>
        </td>
      </tr>
    );
  }

  function renderSection(
    title: string,
    icon: React.ReactNode,
    list: Vehicle[],
    extraColLabel: string,
    showTowingCol: boolean,
    emptyText: string,
  ) {
    const colCount = 2 + visibleCols.size + 1; // Kennzeichen + visible + extra + Aktionen
    return (
      <Card className="mb-6">
        <CardHeader className="pb-3 border-b border-gray-100">
          <CardTitle className="text-base flex items-center gap-2">
            {icon}
            {title}
            <span className="text-sm font-normal text-gray-400">({list.length})</span>
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full">
              {renderTableHead(extraColLabel)}
              <tbody className="divide-y divide-gray-50">
                {list.length === 0 ? (
                  <tr>
                    <td colSpan={colCount} className="text-center py-8 text-gray-400 text-sm">{emptyText}</td>
                  </tr>
                ) : (
                  list.map(v => renderRow(v, showTowingCol))
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="p-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <Truck className="w-6 h-6 text-blue-600" />
            Fahrzeuge
          </h1>
          <p className="text-gray-500 text-sm mt-1">{vehicles.length} Fahrzeuge gesamt</p>
        </div>
        <Button onClick={openCreate}>
          <Plus className="w-4 h-4" />
          Fahrzeug hinzufügen
        </Button>
      </div>

      {/* Search + Column picker */}
      <div className="flex gap-3 mb-6">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <Input
            placeholder="Suche nach Kennzeichen, Typ, Marke..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <Popover>
          <PopoverTrigger asChild>
            <Button variant="outline" className="gap-2 shrink-0">
              <SlidersHorizontal className="w-4 h-4" />
              Spalten
            </Button>
          </PopoverTrigger>
          <PopoverContent align="end" className="w-48 p-3">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Spalten anzeigen</p>
            <div className="space-y-2">
              {ALL_COLUMNS.map(({ key, label }) => (
                <label key={key} className="flex items-center gap-2 cursor-pointer">
                  <Checkbox checked={visibleCols.has(key)} onCheckedChange={() => toggleCol(key)} />
                  <span className="text-sm text-gray-700">{label}</span>
                </label>
              ))}
            </div>
          </PopoverContent>
        </Popover>
      </div>

      {/* Status summary */}
      <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
        <div className="flex gap-3 flex-wrap">
          {Object.entries(statusConfig).map(([key, cfg]) => (
            <div key={key} className="flex items-center gap-2 bg-white rounded-lg px-3 py-2 border border-gray-200">
              <Badge variant={cfg.variant}>{cfg.label}</Badge>
              <span className="text-sm font-semibold text-gray-700">
                {vehicles.filter(v => v.status === key).length}
              </span>
            </div>
          ))}
        </div>
        <button
          onClick={toggleArchived}
          disabled={loadingArchived}
          className={`text-xs flex items-center gap-1.5 px-3 py-1.5 rounded-lg border transition-colors ${
            showArchived
              ? "bg-gray-200 border-gray-300 text-gray-700"
              : "bg-white border-gray-200 text-gray-500 hover:bg-gray-50"
          }`}
        >
          <Archive className="w-3.5 h-3.5" />
          {loadingArchived ? "Laden..." : showArchived ? "Archiv ausblenden" : "Archivierte anzeigen"}
        </button>
      </div>

      {/* Ziehende Einheiten */}
      {renderSection(
        "Ziehende Einheiten",
        <Truck className="w-4 h-4 text-blue-600" />,
        [...towingVehicles, ...otherVehicles],
        "Anhänger / Auflieger",
        true,
        "Keine ziehenden Einheiten gefunden",
      )}

      {/* Gezogene Einheiten */}
      {renderSection(
        "Gezogene Einheiten",
        <Link2 className="w-4 h-4 text-orange-500" />,
        towedVehicles,
        "Zugfahrzeug",
        false,
        "Keine gezogenen Einheiten gefunden",
      )}

      {/* Create / Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editing ? "Fahrzeug bearbeiten" : "Fahrzeug hinzufügen"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 mt-2">

            {/* Kennzeichen + Typ */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>Kennzeichen *</Label>
                <Input
                  placeholder="HH-XY 123"
                  value={form.license_plate}
                  onChange={e => setForm({ ...form, license_plate: e.target.value.toUpperCase() })}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Typ *</Label>
                <Select value={form.type} onValueChange={v => setForm({ ...form, type: v })}>
                  <SelectTrigger><SelectValue placeholder="Typ wählen" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="MW 12t">MW 12t</SelectItem>
                    <SelectItem value="MW 15t">MW 15t</SelectItem>
                    <SelectItem value="MW 18t">MW 18t</SelectItem>
                    <SelectItem value="MW 26t">MW 26t</SelectItem>
                    <SelectItem value="SZM">SZM</SelectItem>
                    <SelectItem value="Auflieger">Auflieger</SelectItem>
                    <SelectItem value="Anhänger">Anhänger</SelectItem>
                    <SelectItem value="Transporter">Transporter</SelectItem>
                    <SelectItem value="PKW">PKW</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Marke + Modell + Erstzulassung */}
            <div className="grid grid-cols-3 gap-4">
              <div className="space-y-1.5">
                <Label>Marke</Label>
                <Input placeholder="Mercedes" value={form.brand} onChange={e => setForm({ ...form, brand: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label>Modell</Label>
                <Input placeholder="Actros" value={form.model} onChange={e => setForm({ ...form, model: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label>Erstzulassung</Label>
                <Input type="date" value={form.registration_date} onChange={e => setForm({ ...form, registration_date: e.target.value })} />
              </div>
            </div>

            {/* VIN + Reifengröße */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>VIN / FIN</Label>
                <Input
                  placeholder="WDB9505371L..."
                  value={form.vin}
                  onChange={e => setForm({ ...form, vin: e.target.value.toUpperCase() })}
                  className="font-mono text-sm"
                />
              </div>
              <div className="space-y-1.5">
                <Label>Reifengröße</Label>
                <Input placeholder="315/80 R22.5" value={form.tire_size} onChange={e => setForm({ ...form, tire_size: e.target.value })} />
              </div>
            </div>

            {/* km_class – only for SZM */}
            {form.type === "SZM" && (
              <div className="space-y-1.5">
                <Label>Km-Klasse (SZM)</Label>
                <Select value={form.km_class || "none"} onValueChange={v => setForm({ ...form, km_class: v === "none" ? "" : v })}>
                  <SelectTrigger><SelectValue placeholder="Nicht festgelegt" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Nicht festgelegt</SelectItem>
                    <SelectItem value="300km">300 km</SelectItem>
                    <SelectItem value="450km">450 km</SelectItem>
                  </SelectContent>
                </Select>
                <p className="text-[11px] text-gray-400">Bestimmt die Abrechnungsklasse für SZM-Einsätze (fest pro Fahrzeug).</p>
              </div>
            )}

            {/* Maße & Nutzlast */}
            <div>
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Maße & Nutzlast</p>
              <div className="grid grid-cols-4 gap-3">
                <div className="space-y-1.5">
                  <Label>Länge (m)</Label>
                  <Input type="number" step="0.1" placeholder="13,6" value={form.length_m}
                    onChange={e => setForm({ ...form, length_m: e.target.value as unknown as number })} />
                </div>
                <div className="space-y-1.5">
                  <Label>Breite (m)</Label>
                  <Input type="number" step="0.1" placeholder="2,4" value={form.width_m}
                    onChange={e => setForm({ ...form, width_m: e.target.value as unknown as number })} />
                </div>
                <div className="space-y-1.5">
                  <Label>Höhe (m)</Label>
                  <Input type="number" step="0.1" placeholder="2,7" value={form.height_m}
                    onChange={e => setForm({ ...form, height_m: e.target.value as unknown as number })} />
                </div>
                <div className="space-y-1.5">
                  <Label>Nutzlast (kg)</Label>
                  <Input type="number" step="50" placeholder="24000" value={form.payload_kg}
                    onChange={e => setForm({ ...form, payload_kg: e.target.value as unknown as number })} />
                </div>
              </div>
            </div>

            {/* Status + Fahrer */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>Status</Label>
                <Select value={form.status} onValueChange={v => setForm({ ...form, status: v as typeof form.status })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="available">Verfügbar</SelectItem>
                    <SelectItem value="on_tour">Auf Tour</SelectItem>
                    <SelectItem value="maintenance">Wartung</SelectItem>
                    <SelectItem value="inactive">Inaktiv</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {isTowing && (
                <div className="space-y-1.5">
                  <Label>Fahrer</Label>
                  <Select value={form.current_driver_id || "none"} onValueChange={v => setForm({ ...form, current_driver_id: v === "none" ? "" : v })}>
                    <SelectTrigger><SelectValue placeholder="Keiner" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">Keiner</SelectItem>
                      {dialogDrivers.map(d => (
                        <SelectItem key={d.id} value={d.id}>
                          {d.first_name} {d.last_name}
                          {d.status === "sick" ? " (Krank)" : d.status === "off" ? " (Frei)" : d.status === "on_tour" ? " (Auf Tour)" : ""}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
            </div>

            {/* Trailer assignment – only when editing a towing vehicle */}
            {isTowing && editing && (
              <div>
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Zugeordnete Anhänger / Auflieger</p>
                <div className="space-y-1.5 mb-2">
                  {trailerIds.length === 0 ? (
                    <p className="text-sm text-gray-400 py-1 italic">Keine zugeordnet</p>
                  ) : (
                    trailerIds.map(id => {
                      const trailer = vehicles.find(v => v.id === id);
                      return (
                        <div key={id} className="flex items-center justify-between bg-blue-50 rounded-lg px-3 py-2">
                          <div className="flex items-center gap-2">
                            <Link2 className="w-4 h-4 text-blue-500" />
                            <span className="text-sm font-mono font-semibold text-blue-700">{trailer?.license_plate}</span>
                            <span className="text-xs text-blue-500">{trailer?.type}</span>
                          </div>
                          <Button
                            variant="ghost" size="icon"
                            className="h-6 w-6 text-blue-300 hover:text-red-500 hover:bg-red-50"
                            onClick={() => setTrailerIds(prev => prev.filter(i => i !== id))}
                          >
                            <X className="w-3.5 h-3.5" />
                          </Button>
                        </div>
                      );
                    })
                  )}
                </div>
                {availableTrailersForDialog.length > 0 && (
                  <Select onValueChange={id => setTrailerIds(prev => [...prev, id])} value="">
                    <SelectTrigger className="text-sm text-gray-500 border-dashed">
                      <SelectValue placeholder="+ Anhänger / Auflieger hinzufügen" />
                    </SelectTrigger>
                    <SelectContent>
                      {availableTrailersForDialog.map(t => (
                        <SelectItem key={t.id} value={t.id}>
                          {t.license_plate} – {t.type}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              </div>
            )}

            {/* Notizen */}
            <div className="space-y-1.5">
              <Label>Notizen</Label>
              <Textarea rows={2} placeholder="Interne Notizen..." value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} />
            </div>

            {/* TADMIN Telematics */}
            <div className="space-y-1.5">
              <Label>TADMIN Fahrzeug-ID</Label>
              <Input
                type="number"
                placeholder="z.B. 25"
                value={form.tadmin_vehicle_id}
                onChange={e => setForm({ ...form, tadmin_vehicle_id: e.target.value as unknown as number })}
              />
              <p className="text-[11px] text-gray-400">Wird täglich für automatische KM-Erfassung verwendet</p>
            </div>

            {saveError && (
              <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-4 py-3">
                Fehler: {saveError}
              </div>
            )}

            <div className="flex gap-3 justify-end pt-2">
              <Button variant="outline" onClick={() => setDialogOpen(false)}>Abbrechen</Button>
              <Button onClick={handleSave} disabled={saving || !form.license_plate || !form.type}>
                {saving ? "Speichern..." : editing ? "Aktualisieren" : "Hinzufügen"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Archived vehicles section */}
      {showArchived && (
        <div className="mt-6">
          <h2 className="text-sm font-semibold text-gray-500 mb-3 flex items-center gap-2">
            <Archive className="w-4 h-4" />
            Archivierte Fahrzeuge ({archivedVehicles.length})
          </h2>
          {archivedVehicles.length === 0 ? (
            <p className="text-sm text-gray-400 italic">Keine archivierten Fahrzeuge.</p>
          ) : (
            <Card className="opacity-75">
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b border-gray-100">
                        <th className="text-left text-xs font-semibold text-gray-400 uppercase tracking-wider px-6 py-3">Kennzeichen</th>
                        <th className="text-left text-xs font-semibold text-gray-400 uppercase tracking-wider px-6 py-3">Typ / Marke</th>
                        <th className="text-left text-xs font-semibold text-gray-400 uppercase tracking-wider px-6 py-3">Archiviert am</th>
                        <th className="text-right text-xs font-semibold text-gray-400 uppercase tracking-wider px-6 py-3">Aktionen</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50">
                      {archivedVehicles.map((v) => (
                        <tr key={v.id} className="bg-gray-50">
                          <td className="px-6 py-3">
                            <span className="font-mono font-semibold text-gray-500">{v.license_plate}</span>
                          </td>
                          <td className="px-6 py-3 text-sm text-gray-400">
                            {v.type && <span className="font-medium">{v.type}</span>}
                            {v.brand && <span className="text-gray-300"> · {v.brand}{v.model ? ` ${v.model}` : ""}</span>}
                          </td>
                          <td className="px-6 py-3 text-sm text-gray-400">
                            {(v as any).archived_at ? formatDate((v as any).archived_at) : "–"}
                          </td>
                          <td className="px-6 py-3 text-right">
                            <Button
                              variant="ghost"
                              size="sm"
                              className="text-gray-500 hover:text-green-700 hover:bg-green-50 gap-1.5"
                              onClick={() => handleRestore(v.id)}
                            >
                              <RotateCcw className="w-3.5 h-3.5" />
                              Wiederherstellen
                            </Button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      )}
    </div>
  );
}
