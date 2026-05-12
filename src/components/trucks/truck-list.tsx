"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Vehicle, Driver } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Truck, Plus, Search, Pencil, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";

const statusConfig = {
  available: { label: "Verfügbar", variant: "success" as const },
  on_tour: { label: "Auf Tour", variant: "default" as const },
  maintenance: { label: "Wartung", variant: "warning" as const },
  inactive: { label: "Inaktiv", variant: "secondary" as const },
};

const emptyVehicle = {
  license_plate: "",
  type: "",
  brand: "",
  model: "",
  year: new Date().getFullYear(),
  status: "available" as const,
  current_driver_id: "",
  notes: "",
};

interface TruckListProps {
  initialVehicles: Vehicle[];
  availableDrivers: { id: string; first_name: string; last_name: string; status: string }[];
  userRole: "admin" | "employee";
}

export function TruckList({ initialVehicles, availableDrivers, userRole }: TruckListProps) {
  const router = useRouter();
  const supabase = createClient();
  const [vehicles, setVehicles] = useState(initialVehicles);
  const [search, setSearch] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Vehicle | null>(null);
  const [form, setForm] = useState(emptyVehicle);
  const [saving, setSaving] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const filtered = vehicles.filter(
    (v) =>
      v.license_plate.toLowerCase().includes(search.toLowerCase()) ||
      v.type?.toLowerCase().includes(search.toLowerCase()) ||
      v.brand?.toLowerCase().includes(search.toLowerCase())
  );

  function openCreate() {
    setEditing(null);
    setForm(emptyVehicle);
    setDialogOpen(true);
  }

  function openEdit(v: Vehicle) {
    setEditing(v);
    setForm({
      license_plate: v.license_plate,
      type: v.type ?? "",
      brand: v.brand ?? "",
      model: v.model ?? "",
      year: v.year ?? new Date().getFullYear(),
      status: v.status as typeof emptyVehicle.status,
      current_driver_id: v.current_driver_id ?? "",
      notes: v.notes ?? "",
    });
    setDialogOpen(true);
  }

  async function handleSave() {
    setSaving(true);
    const payload = {
      license_plate: form.license_plate,
      type: form.type,
      brand: form.brand || null,
      model: form.model || null,
      year: form.year || null,
      status: form.status,
      current_driver_id: form.current_driver_id || null,
      notes: form.notes || null,
    };

    if (editing) {
      const { data, error } = await supabase
        .from("vehicles")
        .update(payload)
        .eq("id", editing.id)
        .select("*, current_driver:current_driver_id(id, first_name, last_name)")
        .single();
      if (!error && data) {
        setVehicles((prev) => prev.map((v) => (v.id === editing.id ? data : v)));
      }
    } else {
      const { data, error } = await supabase
        .from("vehicles")
        .insert(payload)
        .select("*, current_driver:current_driver_id(id, first_name, last_name)")
        .single();
      if (!error && data) {
        setVehicles((prev) => [...prev, data]);
      }
    }

    setSaving(false);
    setDialogOpen(false);
  }

  async function handleDelete(id: string) {
    const { error } = await supabase.from("vehicles").delete().eq("id", id);
    if (!error) {
      setVehicles((prev) => prev.filter((v) => v.id !== id));
    }
    setDeleteId(null);
  }

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

      {/* Search */}
      <div className="relative mb-6">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
        <Input
          placeholder="Suche nach Kennzeichen, Typ, Marke..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-9"
        />
      </div>

      {/* Status Badges */}
      <div className="flex gap-3 mb-6 flex-wrap">
        {Object.entries(statusConfig).map(([key, cfg]) => {
          const count = vehicles.filter((v) => v.status === key).length;
          return (
            <div key={key} className="flex items-center gap-2 bg-white rounded-lg px-3 py-2 border border-gray-200">
              <Badge variant={cfg.variant}>{cfg.label}</Badge>
              <span className="text-sm font-semibold text-gray-700">{count}</span>
            </div>
          );
        })}
      </div>

      {/* Table */}
      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-gray-100">
                  <th className="text-left text-xs font-semibold text-gray-500 uppercase tracking-wider px-6 py-3">Kennzeichen</th>
                  <th className="text-left text-xs font-semibold text-gray-500 uppercase tracking-wider px-6 py-3">Typ / Marke</th>
                  <th className="text-left text-xs font-semibold text-gray-500 uppercase tracking-wider px-6 py-3">Status</th>
                  <th className="text-left text-xs font-semibold text-gray-500 uppercase tracking-wider px-6 py-3">Fahrer</th>
                  <th className="text-left text-xs font-semibold text-gray-500 uppercase tracking-wider px-6 py-3">Notizen</th>
                  <th className="text-right text-xs font-semibold text-gray-500 uppercase tracking-wider px-6 py-3">Aktionen</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {filtered.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="text-center py-12 text-gray-400">
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
                        <td className="px-6 py-4 text-sm text-gray-600">
                          {v.type && <span className="font-medium">{v.type}</span>}
                          {v.brand && <span className="text-gray-400"> · {v.brand} {v.model}</span>}
                          {v.year && <span className="text-gray-400"> ({v.year})</span>}
                        </td>
                        <td className="px-6 py-4">
                          <Badge variant={status.variant}>{status.label}</Badge>
                        </td>
                        <td className="px-6 py-4 text-sm text-gray-600">
                          {driver ? `${driver.first_name} ${driver.last_name}` : <span className="text-gray-300">–</span>}
                        </td>
                        <td className="px-6 py-4 text-sm text-gray-500 max-w-[200px] truncate">
                          {v.notes || <span className="text-gray-300">–</span>}
                        </td>
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
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{editing ? "Fahrzeug bearbeiten" : "Fahrzeug hinzufügen"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 mt-2">
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
                <Input
                  placeholder="z.B. LKW 7,5t"
                  value={form.type}
                  onChange={(e) => setForm({ ...form, type: e.target.value })}
                />
              </div>
            </div>
            <div className="grid grid-cols-3 gap-4">
              <div className="space-y-1.5">
                <Label>Marke</Label>
                <Input
                  placeholder="Mercedes"
                  value={form.brand}
                  onChange={(e) => setForm({ ...form, brand: e.target.value })}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Modell</Label>
                <Input
                  placeholder="Sprinter"
                  value={form.model}
                  onChange={(e) => setForm({ ...form, model: e.target.value })}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Baujahr</Label>
                <Input
                  type="number"
                  placeholder="2022"
                  value={form.year}
                  onChange={(e) => setForm({ ...form, year: parseInt(e.target.value) })}
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>Status</Label>
                <Select
                  value={form.status}
                  onValueChange={(v) => setForm({ ...form, status: v as typeof form.status })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
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
                <Select
                  value={form.current_driver_id || "none"}
                  onValueChange={(v) => setForm({ ...form, current_driver_id: v === "none" ? "" : v })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Keiner" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Keiner</SelectItem>
                    {availableDrivers.map((d) => (
                      <SelectItem key={d.id} value={d.id}>
                        {d.first_name} {d.last_name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Notizen</Label>
              <Textarea
                placeholder="Interne Notizen..."
                value={form.notes}
                onChange={(e) => setForm({ ...form, notes: e.target.value })}
                rows={2}
              />
            </div>
            <div className="flex gap-3 justify-end pt-2">
              <Button variant="outline" onClick={() => setDialogOpen(false)}>
                Abbrechen
              </Button>
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
          <DialogHeader>
            <DialogTitle>Fahrzeug löschen?</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-gray-600">
            Möchtest du dieses Fahrzeug wirklich löschen? Diese Aktion kann nicht rückgängig gemacht werden.
          </p>
          <div className="flex gap-3 justify-end">
            <Button variant="outline" onClick={() => setDeleteId(null)}>Abbrechen</Button>
            <Button variant="destructive" onClick={() => deleteId && handleDelete(deleteId)}>Löschen</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
