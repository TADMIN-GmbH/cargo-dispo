"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Tour, Driver, Vehicle, Customer } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { MapPin, Plus, Search, Pencil, Trash2, Filter, Hash, MessageCircle } from "lucide-react";
import { formatDate } from "@/lib/utils";

const statusConfig = {
  planned: { label: "Geplant", variant: "default" as const },
  active: { label: "Aktiv", variant: "success" as const },
  completed: { label: "Abgeschlossen", variant: "secondary" as const },
  cancelled: { label: "Abgesagt", variant: "destructive" as const },
};

const rollkarteStatusConfig = {
  pending:   { label: "Ausstehend", className: "bg-gray-100 text-gray-500" },
  requested: { label: "Angefragt",  className: "bg-yellow-100 text-yellow-700" },
  received:  { label: "Erhalten",   className: "bg-green-100 text-green-700" },
  manual:    { label: "Manuell",    className: "bg-blue-100 text-blue-700" },
};

const emptyTour = {
  tour_date: new Date().toISOString().split("T")[0],
  driver_id: "",
  vehicle_id: "",
  customer_id: "",
  status: "planned" as const,
  pickup_address: "",
  delivery_address: "",
  notes: "",
};

interface TourPlannerProps {
  initialTours: Tour[];
  drivers: Pick<Driver, "id" | "first_name" | "last_name" | "status">[];
  vehicles: Pick<Vehicle, "id" | "license_plate" | "type" | "status">[];
  customers: Pick<Customer, "id" | "company_name" | "city">[];
  selectedDate?: string;
}

export function TourPlanner({ initialTours, drivers, vehicles, customers, selectedDate }: TourPlannerProps) {
  const supabase = createClient();
  const [tours, setTours] = useState(initialTours);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Tour | null>(null);
  const defaultDate = selectedDate ?? new Date().toISOString().split("T")[0];
  const [form, setForm] = useState({ ...emptyTour, tour_date: defaultDate });
  const [saving, setSaving] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [rollkarteTourId, setRollkarteTourId] = useState<string | null>(null);
  const [rollkarteInput, setRollkarteInput] = useState("");
  const [sendingRollkarte, setSendingRollkarte] = useState(false);
  const [rollkarteResult, setRollkarteResult] = useState<string | null>(null);

  const filtered = tours.filter((t) => {
    const customer = (t as any).customer;
    const driver = (t as any).driver;
    const matchSearch =
      customer?.company_name?.toLowerCase().includes(search.toLowerCase()) ||
      `${driver?.first_name} ${driver?.last_name}`.toLowerCase().includes(search.toLowerCase()) ||
      t.tour_date.includes(search);
    const matchStatus = statusFilter === "all" || t.status === statusFilter;
    return matchSearch && matchStatus;
  });

  function openCreate() {
    setEditing(null);
    setForm({ ...emptyTour, tour_date: defaultDate });
    setDialogOpen(true);
  }

  function openEdit(t: Tour) {
    setEditing(t);
    setForm({
      tour_date: t.tour_date,
      driver_id: t.driver_id ?? "",
      vehicle_id: t.vehicle_id ?? "",
      customer_id: t.customer_id ?? "",
      status: t.status as typeof emptyTour.status,
      pickup_address: t.pickup_address ?? "",
      delivery_address: t.delivery_address ?? "",
      notes: t.notes ?? "",
    });
    setDialogOpen(true);
  }

  async function handleSave() {
    setSaving(true);
    const payload = {
      tour_date: form.tour_date,
      driver_id: form.driver_id || null,
      vehicle_id: form.vehicle_id || null,
      customer_id: form.customer_id || null,
      status: form.status,
      pickup_address: form.pickup_address || null,
      delivery_address: form.delivery_address || null,
      notes: form.notes || null,
    };

    const joinQuery = "*, driver:drivers(id,first_name,last_name), vehicle:vehicles(id,license_plate,type), customer:customers(id,company_name,city)";

    if (editing) {
      const { data } = await supabase.from("tours").update(payload).eq("id", editing.id).select(joinQuery).single();
      if (data) setTours((prev) => prev.map((t) => (t.id === editing.id ? data : t)));
    } else {
      const { data } = await supabase.from("tours").insert(payload).select(joinQuery).single();
      if (data) setTours((prev) => [data, ...prev]);
    }

    setSaving(false);
    setDialogOpen(false);
  }

  async function handleDelete(id: string) {
    await supabase.from("tours").delete().eq("id", id);
    setTours((prev) => prev.filter((t) => t.id !== id));
    setDeleteId(null);
  }

  async function triggerRollkarteRequests() {
    setSendingRollkarte(true);
    setRollkarteResult(null);
    try {
      const res = await fetch(`/api/rollkarte/trigger`, { method: "POST" });
      const json = await res.json();
      const allResults: any[] = json.results ?? [];
      const sent = allResults.filter((r: any) => r.sent).length;
      const skipped = allResults.filter((r: any) => r.skipped);
      const failed = allResults.filter((r: any) => !r.sent && !r.skipped);

      if (allResults.length === 0) {
        setRollkarteResult("Keine ausstehenden Touren für heute gefunden.");
      } else {
        const lines: string[] = [];
        if (sent > 0) lines.push(`✓ ${sent} WhatsApp${sent > 1 ? "s" : ""} versendet`);
        for (const r of allResults.filter((r: any) => r.sent)) {
          lines.push(`  → ${r.driver} (${r.phone})`);
        }
        if (skipped.length > 0) {
          lines.push(`⚠ ${skipped.length} übersprungen:`);
          for (const r of skipped) lines.push(`  → ${r.driver}: ${r.skipped}`);
        }
        if (failed.length > 0) {
          lines.push(`✗ ${failed.length} Fehler:`);
          for (const r of failed) lines.push(`  → ${r.driver}: ${r.error}`);
        }
        setRollkarteResult(lines.join("\n"));
      }
    } catch {
      setRollkarteResult("Fehler beim Senden.");
    }
    setSendingRollkarte(false);
  }

  async function saveRollkarte() {
    if (!rollkarteTourId) return;
    const num = rollkarteInput.trim();
    const update = num
      ? { rollkarte_number: num, rollkarte_status: "manual", rollkarte_source: "manual", rollkarte_answered_at: new Date().toISOString() }
      : { rollkarte_number: null, rollkarte_status: "pending", rollkarte_source: null, rollkarte_answered_at: null };
    const { data } = await supabase.from("tours").update(update).eq("id", rollkarteTourId).select("*").single();
    if (data) setTours((prev) => prev.map((t) => (t.id === rollkarteTourId ? { ...t, ...data } : t)));
    setRollkarteTourId(null);
    setRollkarteInput("");
  }

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <MapPin className="w-6 h-6 text-orange-600" />
            Touren
          </h1>
          <p className="text-gray-500 text-sm mt-1">{tours.length} Touren gesamt</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex flex-col items-end">
            <Button
              variant="outline"
              size="sm"
              onClick={triggerRollkarteRequests}
              disabled={sendingRollkarte}
              className="gap-1.5 text-green-700 border-green-300 hover:bg-green-50"
            >
              <MessageCircle className="w-4 h-4" />
              {sendingRollkarte ? "Wird gesendet…" : "Rollkarte anfragen"}
            </Button>
            {rollkarteResult && (
              <pre className="text-xs text-gray-600 mt-1 whitespace-pre-wrap font-sans leading-relaxed">{rollkarteResult}</pre>
            )}
          </div>
          <Button onClick={openCreate}>
            <Plus className="w-4 h-4" />
            Tour anlegen
          </Button>
        </div>
      </div>

      <div className="flex gap-3 mb-6">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <Input
            placeholder="Suche nach Kunde, Fahrer, Datum..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-44">
            <Filter className="w-4 h-4 mr-2" />
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Alle Status</SelectItem>
            <SelectItem value="planned">Geplant</SelectItem>
            <SelectItem value="active">Aktiv</SelectItem>
            <SelectItem value="completed">Abgeschlossen</SelectItem>
            <SelectItem value="cancelled">Abgesagt</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-gray-100">
                  <th className="text-left text-xs font-semibold text-gray-500 uppercase tracking-wider px-6 py-3">Datum</th>
                  <th className="text-left text-xs font-semibold text-gray-500 uppercase tracking-wider px-6 py-3">Kunde</th>
                  <th className="text-left text-xs font-semibold text-gray-500 uppercase tracking-wider px-6 py-3">Fahrer</th>
                  <th className="text-left text-xs font-semibold text-gray-500 uppercase tracking-wider px-6 py-3">Fahrzeug</th>
                  <th className="text-left text-xs font-semibold text-gray-500 uppercase tracking-wider px-6 py-3">Lieferadresse</th>
                  <th className="text-left text-xs font-semibold text-gray-500 uppercase tracking-wider px-6 py-3">Status</th>
                  <th className="text-left text-xs font-semibold text-gray-500 uppercase tracking-wider px-6 py-3">Rollkarte</th>
                  <th className="text-right text-xs font-semibold text-gray-500 uppercase tracking-wider px-6 py-3">Aktionen</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {filtered.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="text-center py-12 text-gray-400">
                      <MapPin className="w-8 h-8 mx-auto mb-2 opacity-40" />
                      <p className="text-sm">Keine Touren gefunden</p>
                    </td>
                  </tr>
                ) : (
                  filtered.map((t) => {
                    const status = statusConfig[t.status] ?? { label: t.status, variant: "secondary" as const };
                    const driver = (t as any).driver;
                    const vehicle = (t as any).vehicle;
                    const customer = (t as any).customer;
                    return (
                      <tr key={t.id} className="hover:bg-gray-50 transition-colors">
                        <td className="px-6 py-4 text-sm font-medium text-gray-900 whitespace-nowrap">
                          {formatDate(t.tour_date)}
                        </td>
                        <td className="px-6 py-4 text-sm text-gray-900">
                          {customer?.company_name ?? <span className="text-gray-300">–</span>}
                          {customer?.city && <span className="text-gray-400 text-xs block">{customer.city}</span>}
                        </td>
                        <td className="px-6 py-4 text-sm text-gray-600">
                          {driver ? `${driver.first_name} ${driver.last_name}` : <span className="text-gray-300">–</span>}
                        </td>
                        <td className="px-6 py-4 text-sm font-mono text-gray-600">
                          {vehicle?.license_plate ?? <span className="text-gray-300">–</span>}
                        </td>
                        <td className="px-6 py-4 text-sm text-gray-600 max-w-[160px] truncate">
                          {t.delivery_address || <span className="text-gray-300">–</span>}
                        </td>
                        <td className="px-6 py-4">
                          <Badge variant={status.variant}>{status.label}</Badge>
                        </td>
                        <td className="px-6 py-4">
                          <button
                            onClick={() => { setRollkarteTourId(t.id); setRollkarteInput(t.rollkarte_number ?? ""); }}
                            className="flex items-center gap-1.5 group"
                          >
                            {t.rollkarte_number ? (
                              <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-mono font-semibold ${rollkarteStatusConfig[t.rollkarte_status ?? "pending"]?.className}`}>
                                <Hash className="w-3 h-3" />{t.rollkarte_number}
                              </span>
                            ) : (
                              <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs ${rollkarteStatusConfig[t.rollkarte_status ?? "pending"]?.className}`}>
                                {rollkarteStatusConfig[t.rollkarte_status ?? "pending"]?.label}
                              </span>
                            )}
                          </button>
                        </td>
                        <td className="px-6 py-4 text-right">
                          <div className="flex items-center justify-end gap-2">
                            <Button variant="ghost" size="icon" onClick={() => openEdit(t)}>
                              <Pencil className="w-4 h-4" />
                            </Button>
                            <Button variant="ghost" size="icon" className="text-red-500 hover:text-red-700 hover:bg-red-50" onClick={() => setDeleteId(t.id)}>
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
            <DialogTitle>{editing ? "Tour bearbeiten" : "Tour anlegen"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 mt-2">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>Datum *</Label>
                <Input type="date" value={form.tour_date} onChange={(e) => setForm({ ...form, tour_date: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label>Status</Label>
                <Select value={form.status} onValueChange={(v) => setForm({ ...form, status: v as typeof form.status })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="planned">Geplant</SelectItem>
                    <SelectItem value="active">Aktiv</SelectItem>
                    <SelectItem value="completed">Abgeschlossen</SelectItem>
                    <SelectItem value="cancelled">Abgesagt</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-1.5">
              <Label>Kunde</Label>
              <Select value={form.customer_id || "none"} onValueChange={(v) => setForm({ ...form, customer_id: v === "none" ? "" : v })}>
                <SelectTrigger><SelectValue placeholder="Kunde wählen" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Kein Kunde</SelectItem>
                  {customers.map((c) => (
                    <SelectItem key={c.id} value={c.id}>{c.company_name}{c.city ? ` – ${c.city}` : ""}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>Fahrer</Label>
                <Select value={form.driver_id || "none"} onValueChange={(v) => setForm({ ...form, driver_id: v === "none" ? "" : v })}>
                  <SelectTrigger><SelectValue placeholder="Fahrer wählen" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Kein Fahrer</SelectItem>
                    {drivers.map((d) => (
                      <SelectItem key={d.id} value={d.id}>{d.first_name} {d.last_name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Fahrzeug</Label>
                <Select value={form.vehicle_id || "none"} onValueChange={(v) => setForm({ ...form, vehicle_id: v === "none" ? "" : v })}>
                  <SelectTrigger><SelectValue placeholder="Fahrzeug wählen" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Kein Fahrzeug</SelectItem>
                    {vehicles.map((v) => (
                      <SelectItem key={v.id} value={v.id}>{v.license_plate} – {v.type}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-1.5">
              <Label>Abholadresse</Label>
              <Input placeholder="Straße, PLZ Stadt" value={form.pickup_address} onChange={(e) => setForm({ ...form, pickup_address: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label>Lieferadresse</Label>
              <Input placeholder="Straße, PLZ Stadt" value={form.delivery_address} onChange={(e) => setForm({ ...form, delivery_address: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label>Notizen</Label>
              <Textarea rows={2} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
            </div>
            <div className="flex gap-3 justify-end pt-2">
              <Button variant="outline" onClick={() => setDialogOpen(false)}>Abbrechen</Button>
              <Button onClick={handleSave} disabled={saving || !form.tour_date}>
                {saving ? "Speichern..." : editing ? "Aktualisieren" : "Tour anlegen"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={!!deleteId} onOpenChange={() => setDeleteId(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Tour löschen?</DialogTitle></DialogHeader>
          <p className="text-sm text-gray-600">Diese Aktion kann nicht rückgängig gemacht werden.</p>
          <div className="flex gap-3 justify-end">
            <Button variant="outline" onClick={() => setDeleteId(null)}>Abbrechen</Button>
            <Button variant="destructive" onClick={() => deleteId && handleDelete(deleteId)}>Löschen</Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={!!rollkarteTourId} onOpenChange={(open) => { if (!open) { setRollkarteTourId(null); setRollkarteInput(""); } }}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Rollkartennummer eingeben</DialogTitle></DialogHeader>
          <div className="space-y-3 mt-2">
            <div className="space-y-1.5">
              <Label>Rollkartennummer</Label>
              <Input
                placeholder="z.B. 12345"
                value={rollkarteInput}
                onChange={(e) => setRollkarteInput(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && saveRollkarte()}
                autoFocus
              />
            </div>
            {rollkarteInput === "" && (
              <p className="text-xs text-gray-400">Leer lassen zum Zurücksetzen auf „Ausstehend".</p>
            )}
            <div className="flex gap-3 justify-end pt-1">
              <Button variant="outline" onClick={() => { setRollkarteTourId(null); setRollkarteInput(""); }}>Abbrechen</Button>
              <Button onClick={saveRollkarte}>Speichern</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
