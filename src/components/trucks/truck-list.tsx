"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Vehicle } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Truck, Plus, Search, Pencil, Trash2, SlidersHorizontal } from "lucide-react";

const statusConfig = {
  available:   { label: "Verfügbar", variant: "success" as const },
  on_tour:     { label: "Auf Tour",  variant: "default" as const },
  maintenance: { label: "Wartung",   variant: "warning" as const },
  inactive:    { label: "Inaktiv",   variant: "secondary" as const },
};

type ColKey = "type" | "status" | "driver" | "length" | "width" | "height" | "payload" | "notes";

const ALL_COLUMNS: { key: ColKey; label: string }[] = [
  { key: "type",    label: "Typ / Marke" },
  { key: "status",  label: "Status" },
  { key: "driver",  label: "Fahrer" },
  { key: "length",  label: "Länge (m)" },
  { key: "width",   label: "Breite (m)" },
  { key: "height",  label: "Höhe (m)" },
  { key: "payload", label: "Nutzlast (kg)" },
  { key: "notes",   label: "Notizen" },
];

const DEFAULT_VISIBLE: ColKey[] = ["type", "status", "driver", "notes"];

const emptyVehicle = {
  license_plate: "",
  type: "",
  brand: "",
  model: "",
  registration_date: "",
  vin: "",
  tire_size: "",
  status: "available" as const,
  current_driver_id: "",
  length_m: "" as string | number,
  width_m: "" as string | number,
  height_m: "" as string | number,
  payload_kg: "" as string | number,
  notes: "",
};

interface TruckListProps {
  initialVehicles: Vehicle[];
  availableDrivers: { id: string; first_name: string; last_name: string; status: string }[];
  userRole: "admin" | "employee";
}

export function TruckList({ initialVehicles, availableDrivers }: TruckListProps) {
  const supabase = createClient();
  const [vehicles, setVehicles] = useState(initialVehicles);
  const [search, setSearch] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Vehicle | null>(null);
  const [form, setForm] = useState(emptyVehicle);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [visibleCols, setVisibleCols] = useState<Set<ColKey>>(new Set(DEFAULT_VISIBLE));
  const [dialogDrivers, setDialogDrivers] = useState(availableDrivers);

  const filtered = vehicles.filter(
    (v) =>
      v.license_plate.toLowerCase().includes(search.toLowerCase()) ||
      v.type?.toLowerCase().includes(search.toLowerCase()) ||
      v.brand?.toLowerCase().includes(search.toLowerCase())
  );

  function toggleCol(key: ColKey) {
    setVisibleCols((prev) => {
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
    setDialogOpen(true);
  }

  function openEdit(v: Vehicle) {
    setEditing(v);
    const currentDriver = (v as any).current_driver;
    if (currentDriver && !availableDrivers.find((d) => d.id === currentDriver.id)) {
      setDialogDrivers([{ id: currentDriver.id, first_name: currentDriver.first_name, last_name: currentDriver.last_name, status: "on_tour" }, ...availableDrivers]);
    } else {
      setDialogDrivers(availableDrivers);
    }
    setForm({
      license_plate: v.license_plate,
      type: v.type ?? "",
      brand: v.brand ?? "",
      model: v.model ?? "",
      registration_date: v.registration_date ?? "",
      vin: v.vin ?? "",
      tire_size: v.tire_size ?? "",
      status: v.status as typeof emptyVehicle.status,
      current_driver_id: v.current_driver_id ?? "",
      length_m: v.length_m ?? ("" as string | number),
      width_m: v.width_m ?? ("" as string | number),
      height_m: v.height_m ?? ("" as string | number),
      payload_kg: v.payload_kg ?? ("" as string | number),
      notes: v.notes ?? "",
    });
    setSaveError("");
    setDialogOpen(true);
  }

  async function handleSave() {
    setSaving(true);
    setSaveError("");
    const payload = {
      license_plate: form.license_plate,
      type: form.type,
      brand: form.brand || null,
      model: form.model || null,
      registration_date: form.registration_date || null,
      vin: form.vin || null,
      tire_size: form.tire_size || null,
      status: form.status,
      current_driver_id: form.current_driver_id || null,
      length_m: form.length_m !== "" ? Number(form.length_m) : null,
      width_m: form.width_m !== "" ? Number(form.width_m) : null,
      height_m: form.height_m !== "" ? Number(form.height_m) : null,
      payload_kg: form.payload_kg !== "" ? Number(form.payload_kg) : null,
      notes: form.notes || null,
    };

    if (editing) {
      const { data, error } = await supabase
        .from("vehicles")
        .update(payload)
        .eq("id", editing.id)
        .select("*, current_driver:current_driver_id(id, first_name, last_name)")
        .single();
      if (error) { setSaveError(error.message); setSaving(false); return; }
      if (data) setVehicles((prev) => prev.map((v) => (v.id === editing.id ? data : v)));
    } else {
      const { data, error } = await supabase
        .from("vehicles")
        .insert(payload)
        .select("*, current_driver:current_driver_id(id, first_name, last_name)")
        .single();
      if (error) { setSaveError(error.message); setSaving(false); return; }
      if (data) setVehicles((prev) => [...prev, data]);
    }

    setSaving(false);
    setDialogOpen(false);
  }

  async function handleDelete(id: string) {
    await supabase.from("vehicles").delete().eq("id", id);
    setVehicles((prev) => prev.filter((v) => v.id !== id));
    setDeleteId(null);
  }

  const colCount = 2 + visibleCols.size; // Kennzeichen + visible + Aktionen

  return (
    <div className="p-8">
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

      <div className="flex gap-3 mb-6">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <Input
            placeholder="Suche nach Kennzeichen, Typ, Marke..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>

        {/* Column visibility picker */}
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
                  <Checkbox
                    checked={visibleCols.has(key)}
                    onCheckedChange={() => toggleCol(key)}
                  />
                  <span className="text-sm text-gray-700">{label}</span>
                </label>
              ))}
            </div>
          </PopoverContent>
        </Popover>
      </div>

      {/* Status summary */}
      <div className="flex gap-3 mb-6 flex-wrap">
        {Object.entries(statusConfig).map(([key, cfg]) => (
          <div key={key} className="flex items-center gap-2 bg-white rounded-lg px-3 py-2 border border-gray-200">
            <Badge variant={cfg.variant}>{cfg.label}</Badge>
            <span className="text-sm font-semibold text-gray-700">
              {vehicles.filter((v) => v.status === key).length}
            </span>
          </div>
        ))}
      </div>

      {/* Table */}
      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full">
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
                  <th className="text-right text-xs font-semibold text-gray-500 uppercase tracking-wider px-6 py-3">Aktionen</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {filtered.length === 0 ? (
                  <tr>
                    <td colSpan={colCount} className="text-center py-12 text-gray-400">
                      <Truck className="w-8 h-8 mx-auto mb-2 opacity-40" />
                      <p className="text-sm">Keine Fahrzeuge gefunden</p>
                    </td>
                  </tr>
                ) : (
                  filtered.map((v) => {
                    const status = statusConfig[v.status] ?? { label: v.status, variant: "secondary" as const };
                    const driver = (v as any).current_driver;
                    return (
                      <tr key={v.id} className="hover:bg-gray-50 transition-colors">
                        <td className="px-6 py-4">
                          <span className="font-mono font-semibold text-gray-900">{v.license_plate}</span>
                        </td>
                        {visibleCols.has("type") && (
                          <td className="px-6 py-4 text-sm text-gray-600">
                            {v.type && <span className="font-medium">{v.type}</span>}
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
                        <td className="px-6 py-4 text-right">
                          <div className="flex items-center justify-end gap-2">
                            <Button variant="ghost" size="icon" onClick={() => openEdit(v)}>
                              <Pencil className="w-4 h-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="text-red-500 hover:text-red-700 hover:bg-red-50"
                              onClick={() => setDeleteId(v.id)}
                            >
                              <Trash2 className="w-4 h-4" />
                            </Button>
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* Create/Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-xl">
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
                  onChange={(e) => setForm({ ...form, license_plate: e.target.value.toUpperCase() })}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Typ *</Label>
                <Select value={form.type} onValueChange={(v) => setForm({ ...form, type: v })}>
                  <SelectTrigger><SelectValue placeholder="Typ wählen" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="MW 12t">MW 12t</SelectItem>
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

            {/* Marke + Modell + Baujahr */}
            <div className="grid grid-cols-3 gap-4">
              <div className="space-y-1.5">
                <Label>Marke</Label>
                <Input placeholder="Mercedes" value={form.brand} onChange={(e) => setForm({ ...form, brand: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label>Modell</Label>
                <Input placeholder="Actros" value={form.model} onChange={(e) => setForm({ ...form, model: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label>Erstzulassung</Label>
                <Input type="date" value={form.registration_date} onChange={(e) => setForm({ ...form, registration_date: e.target.value })} />
              </div>
            </div>

            {/* VIN + Reifengröße */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>VIN / FIN</Label>
                <Input placeholder="WDB9505371L..." value={form.vin} onChange={(e) => setForm({ ...form, vin: e.target.value.toUpperCase() })} className="font-mono text-sm" />
              </div>
              <div className="space-y-1.5">
                <Label>Reifengröße</Label>
                <Input placeholder="315/80 R22.5" value={form.tire_size} onChange={(e) => setForm({ ...form, tire_size: e.target.value })} />
              </div>
            </div>

            {/* Maße */}
            <div>
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Maße & Nutzlast</p>
              <div className="grid grid-cols-4 gap-3">
                <div className="space-y-1.5">
                  <Label>Länge (m)</Label>
                  <Input
                    type="number" step="0.1" placeholder="13,6"
                    value={form.length_m}
                    onChange={(e) => setForm({ ...form, length_m: e.target.value as unknown as number })}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>Breite (m)</Label>
                  <Input
                    type="number" step="0.1" placeholder="2,4"
                    value={form.width_m}
                    onChange={(e) => setForm({ ...form, width_m: e.target.value as unknown as number })}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>Höhe (m)</Label>
                  <Input
                    type="number" step="0.1" placeholder="2,7"
                    value={form.height_m}
                    onChange={(e) => setForm({ ...form, height_m: e.target.value as unknown as number })}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>Nutzlast (kg)</Label>
                  <Input
                    type="number" step="50" placeholder="24000"
                    value={form.payload_kg}
                    onChange={(e) => setForm({ ...form, payload_kg: e.target.value as unknown as number })}
                  />
                </div>
              </div>
            </div>

            {/* Status + Fahrer */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>Status</Label>
                <Select value={form.status} onValueChange={(v) => setForm({ ...form, status: v as typeof form.status })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="available">Verfügbar</SelectItem>
                    <SelectItem value="on_tour">Auf Tour</SelectItem>
                    <SelectItem value="maintenance">Wartung</SelectItem>
                    <SelectItem value="inactive">Inaktiv</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Fahrer</Label>
                <Select value={form.current_driver_id || "none"} onValueChange={(v) => setForm({ ...form, current_driver_id: v === "none" ? "" : v })}>
                  <SelectTrigger><SelectValue placeholder="Keiner" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Keiner</SelectItem>
                    {dialogDrivers.map((d) => (
                      <SelectItem key={d.id} value={d.id}>
                        {d.first_name} {d.last_name}{d.status === "sick" ? " (Krank)" : d.status === "off" ? " (Frei)" : d.status === "on_tour" ? " (Auf Tour)" : ""}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Notizen */}
            <div className="space-y-1.5">
              <Label>Notizen</Label>
              <Textarea rows={2} placeholder="Interne Notizen..." value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
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

      {/* Delete Dialog */}
      <Dialog open={!!deleteId} onOpenChange={() => setDeleteId(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Fahrzeug löschen?</DialogTitle></DialogHeader>
          <p className="text-sm text-gray-600">Diese Aktion kann nicht rückgängig gemacht werden.</p>
          <div className="flex gap-3 justify-end">
            <Button variant="outline" onClick={() => setDeleteId(null)}>Abbrechen</Button>
            <Button variant="destructive" onClick={() => deleteId && handleDelete(deleteId)}>Löschen</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
