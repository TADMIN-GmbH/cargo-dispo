"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Driver, Vehicle } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Users, Plus, Search, Pencil, Phone, MessageCircle, History, Archive, RotateCcw } from "lucide-react";

const statusConfig = {
  available: { label: "Verfügbar", variant: "success" as const },
  on_tour: { label: "Auf Tour", variant: "default" as const },
  off: { label: "Frei", variant: "secondary" as const },
  sick: { label: "Krank", variant: "destructive" as const },
};

const emptyDriver = {
  first_name: "",
  last_name: "",
  phone: "",
  license_class: "",
  status: "available" as const,
  current_vehicle_id: "",
  rollkarte_whatsapp_enabled: false,
  notes: "",
};

interface DriverListProps {
  initialDrivers: Driver[];
  availableVehicles: { id: string; license_plate: string; type: string; status: string }[];
}

export function DriverList({ initialDrivers, availableVehicles }: DriverListProps) {
  const supabase = createClient();
  const [drivers, setDrivers] = useState(initialDrivers);
  const [search, setSearch] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Driver | null>(null);
  const [form, setForm] = useState(emptyDriver);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [showArchived, setShowArchived] = useState(false);
  const [archivedDrivers, setArchivedDrivers] = useState<Driver[]>([]);
  const [loadingArchived, setLoadingArchived] = useState(false);

  const filtered = drivers.filter(
    (d) =>
      `${d.first_name} ${d.last_name}`.toLowerCase().includes(search.toLowerCase()) ||
      d.phone?.toLowerCase().includes(search.toLowerCase())
  );

  function openCreate() {
    setEditing(null);
    setForm(emptyDriver);
    setDialogOpen(true);
  }

  function openEdit(d: Driver) {
    setEditing(d);
    setForm({
      first_name: d.first_name,
      last_name: d.last_name,
      phone: d.phone ?? "",
      license_class: d.license_class ?? "",
      status: d.status as typeof emptyDriver.status,
      current_vehicle_id: d.current_vehicle_id ?? "",
      rollkarte_whatsapp_enabled: d.rollkarte_whatsapp_enabled ?? false,
      notes: d.notes ?? "",
    });
    setDialogOpen(true);
  }

  async function handleSave() {
    setSaving(true);
    setSaveError("");

    // Build phone history entry if number changed
    let phoneHistory = editing?.phone_history ?? [];
    const oldPhone = editing?.phone ?? null;
    const newPhone = form.phone || null;
    if (editing && oldPhone && oldPhone !== newPhone) {
      phoneHistory = [
        { phone: oldPhone, changed_at: new Date().toISOString() },
        ...phoneHistory,
      ].slice(0, 10); // keep last 10 entries
    }

    const payload = {
      first_name: form.first_name,
      last_name: form.last_name,
      phone: newPhone,
      phone_history: phoneHistory,
      license_class: form.license_class || null,
      status: form.status,
      current_vehicle_id: form.current_vehicle_id || null,
      rollkarte_whatsapp_enabled: form.rollkarte_whatsapp_enabled,
      notes: form.notes || null,
    };

    if (editing) {
      const { data, error } = await supabase
        .from("drivers")
        .update(payload)
        .eq("id", editing.id)
        .select("*, current_vehicle:current_vehicle_id(id, license_plate, type)")
        .single();
      if (error) { setSaveError(error.message); setSaving(false); return; }
      if (data) setDrivers((prev) => prev.map((d) => (d.id === editing.id ? data : d)));
    } else {
      const { data, error } = await supabase
        .from("drivers")
        .insert(payload)
        .select("*, current_vehicle:current_vehicle_id(id, license_plate, type)")
        .single();
      if (error) { setSaveError(error.message); setSaving(false); return; }
      if (data) setDrivers((prev) => [...prev, data]);
    }

    setSaving(false);
    setDialogOpen(false);
  }

  async function handleArchive(id: string) {
    await supabase.from("drivers").update({ archived_at: new Date().toISOString() }).eq("id", id);
    setDrivers((prev) => prev.filter((d) => d.id !== id));
  }

  async function handleRestore(id: string) {
    await supabase.from("drivers").update({ archived_at: null }).eq("id", id);
    setArchivedDrivers((prev) => prev.filter((d) => d.id !== id));
  }

  async function toggleArchived() {
    if (showArchived) {
      setShowArchived(false);
      return;
    }
    setLoadingArchived(true);
    const { data } = await supabase
      .from("drivers")
      .select("*, current_vehicle:vehicles(id,license_plate)")
      .not("archived_at", "is", null)
      .order("last_name");
    setArchivedDrivers((data ?? []) as Driver[]);
    setLoadingArchived(false);
    setShowArchived(true);
  }

  function formatDate(iso: string) {
    return new Date(iso).toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", year: "numeric" });
  }

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <Users className="w-6 h-6 text-green-600" />
            Fahrer
          </h1>
          <p className="text-gray-500 text-sm mt-1">{drivers.length} Fahrer gesamt</p>
        </div>
        <Button onClick={openCreate}>
          <Plus className="w-4 h-4" />
          Fahrer hinzufügen
        </Button>
      </div>

      <div className="relative mb-6">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
        <Input
          placeholder="Suche nach Name, Telefon..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-9"
        />
      </div>

      <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
        <div className="flex gap-3 flex-wrap">
          {Object.entries(statusConfig).map(([key, cfg]) => (
            <div key={key} className="flex items-center gap-2 bg-white rounded-lg px-3 py-2 border border-gray-200">
              <Badge variant={cfg.variant}>{cfg.label}</Badge>
              <span className="text-sm font-semibold text-gray-700">
                {drivers.filter((d) => d.status === key).length}
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

      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-gray-100">
                  <th className="text-left text-xs font-semibold text-gray-500 uppercase tracking-wider px-6 py-3">Name</th>
                  <th className="text-left text-xs font-semibold text-gray-500 uppercase tracking-wider px-6 py-3">Telefon</th>
                  <th className="text-left text-xs font-semibold text-gray-500 uppercase tracking-wider px-6 py-3">Führerschein</th>
                  <th className="text-left text-xs font-semibold text-gray-500 uppercase tracking-wider px-6 py-3">Status</th>
                  <th className="text-left text-xs font-semibold text-gray-500 uppercase tracking-wider px-6 py-3">Fahrzeug</th>
                  <th className="text-right text-xs font-semibold text-gray-500 uppercase tracking-wider px-6 py-3">Aktionen</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {filtered.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="text-center py-12 text-gray-400">
                      <Users className="w-8 h-8 mx-auto mb-2 opacity-40" />
                      <p className="text-sm">Keine Fahrer gefunden</p>
                    </td>
                  </tr>
                ) : (
                  filtered.map((d) => {
                    const status = statusConfig[d.status] ?? { label: d.status, variant: "secondary" as const };
                    const vehicle = (d as any).current_vehicle;
                    return (
                      <tr key={d.id} className="hover:bg-gray-50 transition-colors">
                        <td className="px-6 py-4">
                          <div className="flex items-center gap-3">
                            <div className="w-8 h-8 rounded-full bg-green-100 flex items-center justify-center text-green-700 font-semibold text-sm">
                              {d.first_name[0]}{d.last_name[0]}
                            </div>
                            <span className="font-medium text-gray-900">{d.first_name} {d.last_name}</span>
                          </div>
                        </td>
                        <td className="px-6 py-4 text-sm text-gray-600">
                          {d.phone ? (
                            <a
                              href={`tel:${d.phone}`}
                              className={`flex items-center gap-1 hover:text-blue-600 ${d.rollkarte_whatsapp_enabled ? "text-green-600 font-medium" : ""}`}
                            >
                              {d.rollkarte_whatsapp_enabled
                                ? <MessageCircle className="w-3 h-3 text-green-600" />
                                : <Phone className="w-3 h-3" />}
                              {d.phone}
                            </a>
                          ) : <span className="text-gray-300">–</span>}
                        </td>
                        <td className="px-6 py-4 text-sm text-gray-600 font-mono">
                          {d.license_class || <span className="text-gray-300">–</span>}
                        </td>
                        <td className="px-6 py-4">
                          <Badge variant={status.variant}>{status.label}</Badge>
                        </td>
                        <td className="px-6 py-4 text-sm text-gray-600 font-mono">
                          {vehicle ? `${vehicle.license_plate}` : <span className="text-gray-300">–</span>}
                        </td>
                        <td className="px-6 py-4 text-right">
                          <div className="flex items-center justify-end gap-2">
                            <Button variant="ghost" size="icon" onClick={() => openEdit(d)}>
                              <Pencil className="w-4 h-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="text-gray-400 hover:text-gray-600 hover:bg-gray-100"
                              title="Archivieren"
                              onClick={() => handleArchive(d.id)}
                            >
                              <Archive className="w-4 h-4" />
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

      {/* Archived drivers section */}
      {showArchived && (
        <div className="mt-6">
          <h2 className="text-sm font-semibold text-gray-500 mb-3 flex items-center gap-2">
            <Archive className="w-4 h-4" />
            Archivierte Fahrer ({archivedDrivers.length})
          </h2>
          {archivedDrivers.length === 0 ? (
            <p className="text-sm text-gray-400 italic">Keine archivierten Fahrer.</p>
          ) : (
            <Card className="opacity-75">
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b border-gray-100">
                        <th className="text-left text-xs font-semibold text-gray-400 uppercase tracking-wider px-6 py-3">Name</th>
                        <th className="text-left text-xs font-semibold text-gray-400 uppercase tracking-wider px-6 py-3">Telefon</th>
                        <th className="text-left text-xs font-semibold text-gray-400 uppercase tracking-wider px-6 py-3">Führerschein</th>
                        <th className="text-left text-xs font-semibold text-gray-400 uppercase tracking-wider px-6 py-3">Archiviert am</th>
                        <th className="text-right text-xs font-semibold text-gray-400 uppercase tracking-wider px-6 py-3">Aktionen</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50">
                      {archivedDrivers.map((d) => (
                        <tr key={d.id} className="bg-gray-50">
                          <td className="px-6 py-3">
                            <div className="flex items-center gap-3">
                              <div className="w-8 h-8 rounded-full bg-gray-200 flex items-center justify-center text-gray-500 font-semibold text-sm">
                                {d.first_name[0]}{d.last_name[0]}
                              </div>
                              <span className="font-medium text-gray-500">{d.first_name} {d.last_name}</span>
                            </div>
                          </td>
                          <td className="px-6 py-3 text-sm text-gray-400">{d.phone || <span className="text-gray-300">–</span>}</td>
                          <td className="px-6 py-3 text-sm text-gray-400 font-mono">{d.license_class || <span className="text-gray-300">–</span>}</td>
                          <td className="px-6 py-3 text-sm text-gray-400">
                            {(d as any).archived_at ? formatDate((d as any).archived_at) : "–"}
                          </td>
                          <td className="px-6 py-3 text-right">
                            <Button
                              variant="ghost"
                              size="sm"
                              className="text-gray-500 hover:text-green-700 hover:bg-green-50 gap-1.5"
                              onClick={() => handleRestore(d.id)}
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

      {/* Create/Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{editing ? "Fahrer bearbeiten" : "Fahrer hinzufügen"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 mt-2">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>Vorname *</Label>
                <Input value={form.first_name} onChange={(e) => setForm({ ...form, first_name: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label>Nachname *</Label>
                <Input value={form.last_name} onChange={(e) => setForm({ ...form, last_name: e.target.value })} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>Telefon</Label>
                <Input placeholder="+49 40 ..." value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
                {editing?.phone_history && editing.phone_history.length > 0 && (
                  <details className="mt-1">
                    <summary className="flex items-center gap-1 text-xs text-gray-400 cursor-pointer hover:text-gray-600 select-none">
                      <History className="w-3 h-3" />
                      Verlauf ({editing.phone_history.length})
                    </summary>
                    <div className="mt-1.5 space-y-1">
                      {editing.phone_history.map((entry, i) => (
                        <div key={i} className="flex items-center justify-between text-xs bg-gray-50 rounded px-2 py-1">
                          <span className="font-mono text-gray-600">{entry.phone}</span>
                          <span className="text-gray-400">
                            {new Date(entry.changed_at).toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", year: "numeric" })}
                          </span>
                        </div>
                      ))}
                    </div>
                  </details>
                )}
              </div>
              <div className="space-y-1.5">
                <Label>Führerscheinklasse</Label>
                <Input placeholder="CE" value={form.license_class} onChange={(e) => setForm({ ...form, license_class: e.target.value })} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>Status</Label>
                <Select value={form.status} onValueChange={(v) => setForm({ ...form, status: v as typeof form.status })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="available">Verfügbar</SelectItem>
                    <SelectItem value="on_tour">Auf Tour</SelectItem>
                    <SelectItem value="off">Frei</SelectItem>
                    <SelectItem value="sick">Krank</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Fahrzeug</Label>
                <Select value={form.current_vehicle_id || "none"} onValueChange={(v) => setForm({ ...form, current_vehicle_id: v === "none" ? "" : v })}>
                  <SelectTrigger><SelectValue placeholder="Keines" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Keines</SelectItem>
                    {availableVehicles.map((v) => (
                      <SelectItem key={v.id} value={v.id}>
                        {v.license_plate} – {v.type}{v.status === "maintenance" ? " (Wartung)" : v.status === "inactive" ? " (Inaktiv)" : ""}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setForm({ ...form, rollkarte_whatsapp_enabled: !form.rollkarte_whatsapp_enabled })}
              className={`w-full flex items-center justify-between px-4 py-3 rounded-lg border-2 transition-colors ${
                form.rollkarte_whatsapp_enabled
                  ? "border-green-500 bg-green-50"
                  : "border-gray-200 bg-gray-50 hover:bg-gray-100"
              }`}
            >
              <div className="flex items-center gap-2.5">
                <MessageCircle className={`w-4 h-4 ${form.rollkarte_whatsapp_enabled ? "text-green-600" : "text-gray-400"}`} />
                <div className="text-left">
                  <p className={`text-sm font-medium ${form.rollkarte_whatsapp_enabled ? "text-green-800" : "text-gray-600"}`}>
                    WhatsApp Rollkarte
                  </p>
                  <p className="text-xs text-gray-400">
                    {form.rollkarte_whatsapp_enabled ? "Fahrer erhält tägliche Anfrage" : "Keine automatische Anfrage"}
                  </p>
                </div>
              </div>
              <div className={`w-10 h-6 rounded-full transition-colors flex items-center px-1 ${form.rollkarte_whatsapp_enabled ? "bg-green-500 justify-end" : "bg-gray-300 justify-start"}`}>
                <div className="w-4 h-4 rounded-full bg-white shadow-sm" />
              </div>
            </button>

            <div className="space-y-1.5">
              <Label>Notizen</Label>
              <Textarea rows={2} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
            </div>
            {saveError && (
              <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-4 py-3">
                Fehler: {saveError}
              </div>
            )}
            <div className="flex gap-3 justify-end pt-2">
              <Button variant="outline" onClick={() => setDialogOpen(false)}>Abbrechen</Button>
              <Button onClick={handleSave} disabled={saving || !form.first_name || !form.last_name}>
                {saving ? "Speichern..." : editing ? "Aktualisieren" : "Hinzufügen"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
