"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Customer, CustomerVehicleAlias, Vehicle, CustomerPricingModel } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Building2, Plus, Search, Pencil, Trash2, Phone, Mail, MapPin, Hash, ArrowLeftRight, Navigation } from "lucide-react";
import { CustomerLocation } from "@/lib/types";

const emptyCustomer = {
  company_name: "",
  contact_person: "",
  street: "",
  zip: "",
  city: "",
  country: "Deutschland",
  phone: "",
  email: "",
  notes: "",
  rollkarte_prefix: "",
  rollkarte_accepts_text: false,
  vehicle_ref_label: "Kennzeichen",
  price_daily_rate: undefined as number | undefined,
  price_diesel_pct: undefined as number | undefined,
  price_toll_flat: undefined as number | undefined,
  invert_gutschrift_sign: false,
};

interface CustomerListProps {
  initialCustomers: Customer[];
  vehicles: Pick<Vehicle, "id" | "license_plate" | "type">[];
}

export function CustomerList({ initialCustomers, vehicles }: CustomerListProps) {
  const supabase = createClient();
  const [customers, setCustomers] = useState(initialCustomers);
  const [search, setSearch] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Customer | null>(null);
  const [form, setForm] = useState(emptyCustomer);
  const [saving, setSaving] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [view, setView] = useState<"table" | "cards">("table");
  const [aliases, setAliases] = useState<CustomerVehicleAlias[]>([]);
  const [newAlias, setNewAlias] = useState({ alias: "", vehicle_id: "" });
  const [locations, setLocations] = useState<CustomerLocation[]>([]);
  const [locationForm, setLocationForm] = useState({ name: "", street: "", zip: "", city: "", contact_person: "", phone: "", email: "" });
  const [editingLocation, setEditingLocation] = useState<CustomerLocation | null>(null);
  const [pricingModels, setPricingModels] = useState<CustomerPricingModel[]>([]);
  const emptyPricingForm = { vehicle_type: "", km_class: "", daily_rate_netto: "", maut_flat: "0", diesel_base_price: "1.04", diesel_factor: "20", valid_from: new Date().toISOString().slice(0, 10), notes: "" };
  const [pricingForm, setPricingForm] = useState(emptyPricingForm);
  const [savingPricing, setSavingPricing] = useState(false);
  const [dialogTab, setDialogTab] = useState<"stammdaten" | "einstellungen" | "standorte" | "preismodell" | "preisformel">("stammdaten");

  const filtered = customers.filter(
    (c) =>
      c.company_name.toLowerCase().includes(search.toLowerCase()) ||
      c.contact_person?.toLowerCase().includes(search.toLowerCase()) ||
      c.city?.toLowerCase().includes(search.toLowerCase())
  );

  function openCreate() {
    setEditing(null);
    setForm(emptyCustomer);
    setAliases([]);
    setNewAlias({ alias: "", vehicle_id: "" });
    setLocations([]);
    setLocationForm({ name: "", street: "", zip: "", city: "", contact_person: "", phone: "", email: "" });
    setEditingLocation(null);
    setPricingModels([]);
    setPricingForm(emptyPricingForm);
    setDialogTab("stammdaten");
    setDialogOpen(true);
  }

  function openEdit(c: Customer) {
    setEditing(c);
    setAliases(c.vehicle_aliases ?? []);
    setNewAlias({ alias: "", vehicle_id: "" });
    setLocations(c.locations ?? []);
    setLocationForm({ name: "", street: "", zip: "", city: "", contact_person: "", phone: "", email: "" });
    setEditingLocation(null);
    setPricingModels([]);
    setPricingForm(emptyPricingForm);
    // Load pricing models for this customer
    fetch(`/api/customers/${c.id}/pricing`).then(r => r.json()).then(setPricingModels).catch(() => {});
    setDialogTab("stammdaten");
    setForm({
      company_name: c.company_name,
      contact_person: c.contact_person ?? "",
      street: c.street ?? "",
      zip: c.zip ?? "",
      city: c.city ?? "",
      country: c.country ?? "Deutschland",
      phone: c.phone ?? "",
      email: c.email ?? "",
      notes: c.notes ?? "",
      rollkarte_prefix: c.rollkarte_prefix ?? "",
      rollkarte_accepts_text: c.rollkarte_accepts_text ?? false,
      vehicle_ref_label: c.vehicle_ref_label ?? "Kennzeichen",
      price_daily_rate: c.price_daily_rate ?? undefined,
      price_diesel_pct: c.price_diesel_pct ?? undefined,
      price_toll_flat: c.price_toll_flat ?? undefined,
      invert_gutschrift_sign: c.invert_gutschrift_sign ?? false,
    });
    setDialogOpen(true);
  }

  async function handleSave() {
    setSaving(true);
    const payload = {
      company_name: form.company_name,
      contact_person: form.contact_person || null,
      street: form.street || null,
      zip: form.zip || null,
      city: form.city || null,
      country: form.country || null,
      phone: form.phone || null,
      email: form.email || null,
      notes: form.notes || null,
      rollkarte_prefix: form.rollkarte_prefix || null,
      rollkarte_accepts_text: form.rollkarte_accepts_text,
      vehicle_ref_label: form.vehicle_ref_label || "Kennzeichen",
      price_daily_rate: form.price_daily_rate ?? null,
      price_diesel_pct: form.price_diesel_pct ?? null,
      price_toll_flat: form.price_toll_flat ?? null,
      invert_gutschrift_sign: form.invert_gutschrift_sign,
    };

    if (editing) {
      const { data } = await supabase.from("customers").update(payload).eq("id", editing.id).select().single();
      if (data) setCustomers((prev) => prev.map((c) => (c.id === editing.id ? data : c)));
    } else {
      const { data } = await supabase.from("customers").insert(payload).select().single();
      if (data) setCustomers((prev) => [...prev, data].sort((a, b) => a.company_name.localeCompare(b.company_name)));
    }

    setSaving(false);
    setDialogOpen(false);
  }

  async function saveAlias() {
    if (!editing || !newAlias.alias || !newAlias.vehicle_id) return;
    const { data } = await supabase
      .from("customer_vehicle_aliases")
      .insert({ customer_id: editing.id, alias: newAlias.alias, vehicle_id: newAlias.vehicle_id })
      .select("id, alias, vehicle_id, vehicle:vehicles(id, license_plate, type)")
      .single();
    if (data) {
      setAliases((prev) => [...prev, data as unknown as CustomerVehicleAlias]);
      setNewAlias({ alias: "", vehicle_id: "" });
    }
  }

  async function deleteAlias(id: string) {
    await supabase.from("customer_vehicle_aliases").delete().eq("id", id);
    setAliases((prev) => prev.filter((a) => a.id !== id));
  }

  async function saveLocation() {
    if (!editing || !locationForm.name) return;
    if (editingLocation) {
      const { data } = await supabase
        .from("customer_locations")
        .update(locationForm)
        .eq("id", editingLocation.id)
        .select()
        .single();
      if (data) {
        setLocations((prev) => prev.map((l) => (l.id === editingLocation.id ? data as CustomerLocation : l)));
        setEditingLocation(null);
        setLocationForm({ name: "", street: "", zip: "", city: "", contact_person: "", phone: "", email: "" });
      }
    } else {
      const { data } = await supabase
        .from("customer_locations")
        .insert({ ...locationForm, customer_id: editing.id })
        .select()
        .single();
      if (data) {
        setLocations((prev) => [...prev, data as CustomerLocation]);
        setLocationForm({ name: "", street: "", zip: "", city: "", contact_person: "", phone: "", email: "" });
      }
    }
  }

  async function deleteLocation(id: string) {
    await supabase.from("customer_locations").delete().eq("id", id);
    setLocations((prev) => prev.filter((l) => l.id !== id));
  }

  async function savePricingModel() {
    if (!editing || !pricingForm.vehicle_type || !pricingForm.daily_rate_netto || !pricingForm.valid_from) return;
    setSavingPricing(true);
    const res = await fetch(`/api/customers/${editing.id}/pricing`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        vehicle_type: pricingForm.vehicle_type,
        km_class: pricingForm.vehicle_type === "SZM" && pricingForm.km_class ? pricingForm.km_class : null,
        daily_rate_netto: parseFloat(pricingForm.daily_rate_netto),
        maut_flat: parseFloat(pricingForm.maut_flat) || 0,
        diesel_base_price: parseFloat(pricingForm.diesel_base_price) || 1.04,
        diesel_factor: parseFloat(pricingForm.diesel_factor) || 20,
        valid_from: pricingForm.valid_from,
        notes: pricingForm.notes || null,
      }),
    });
    if (res.ok) {
      const data = await res.json();
      setPricingModels((prev) => [data, ...prev].sort((a, b) => a.vehicle_type.localeCompare(b.vehicle_type) || b.valid_from.localeCompare(a.valid_from)));
      setPricingForm(emptyPricingForm);
    }
    setSavingPricing(false);
  }

  async function deletePricingModel(id: string) {
    await fetch(`/api/customers/${editing!.id}/pricing?rowId=${id}`, { method: "DELETE" });
    setPricingModels((prev) => prev.filter((m) => m.id !== id));
  }

  async function handleDelete(id: string) {
    await supabase.from("customers").delete().eq("id", id);
    setCustomers((prev) => prev.filter((c) => c.id !== id));
    setDeleteId(null);
  }

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <Building2 className="w-6 h-6 text-purple-600" />
            Kunden
          </h1>
          <p className="text-gray-500 text-sm mt-1">{customers.length} Kunden gesamt</p>
        </div>
        <Button onClick={openCreate}>
          <Plus className="w-4 h-4" />
          Kunde hinzufügen
        </Button>
      </div>

      <div className="flex gap-3 mb-6">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <Input
            placeholder="Suche nach Firma, Ansprechpartner, Stadt..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <div className="flex rounded-lg border border-gray-300 overflow-hidden">
          <button
            onClick={() => setView("table")}
            className={`px-3 py-2 text-sm ${view === "table" ? "bg-blue-600 text-white" : "bg-white text-gray-600 hover:bg-gray-50"}`}
          >
            Liste
          </button>
          <button
            onClick={() => setView("cards")}
            className={`px-3 py-2 text-sm ${view === "cards" ? "bg-blue-600 text-white" : "bg-white text-gray-600 hover:bg-gray-50"}`}
          >
            Karten
          </button>
        </div>
      </div>

      {view === "table" ? (
        <Card>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-gray-100">
                    <th className="text-left text-xs font-semibold text-gray-500 uppercase tracking-wider px-6 py-3">Firma</th>
                    <th className="text-left text-xs font-semibold text-gray-500 uppercase tracking-wider px-6 py-3">Ansprechpartner</th>
                    <th className="text-left text-xs font-semibold text-gray-500 uppercase tracking-wider px-6 py-3">Adresse</th>
                    <th className="text-left text-xs font-semibold text-gray-500 uppercase tracking-wider px-6 py-3">Kontakt</th>
                    <th className="text-right text-xs font-semibold text-gray-500 uppercase tracking-wider px-6 py-3">Aktionen</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {filtered.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="text-center py-12 text-gray-400">
                        <Building2 className="w-8 h-8 mx-auto mb-2 opacity-40" />
                        <p className="text-sm">Keine Kunden gefunden</p>
                      </td>
                    </tr>
                  ) : (
                    filtered.map((c) => (
                      <tr key={c.id} className="hover:bg-gray-50 transition-colors">
                        <td className="px-6 py-4">
                          <div className="flex items-center gap-3">
                            <div className="w-8 h-8 rounded-lg bg-purple-100 flex items-center justify-center text-purple-700 font-bold text-sm">
                              {c.company_name[0]}
                            </div>
                            <span className="font-medium text-gray-900">{c.company_name}</span>
                          </div>
                        </td>
                        <td className="px-6 py-4 text-sm text-gray-600">{c.contact_person || <span className="text-gray-300">–</span>}</td>
                        <td className="px-6 py-4 text-sm text-gray-600">
                          {c.city ? `${c.zip} ${c.city}` : <span className="text-gray-300">–</span>}
                        </td>
                        <td className="px-6 py-4 text-sm text-gray-600">
                          <div className="flex flex-col gap-1">
                            {c.phone && <a href={`tel:${c.phone}`} className="flex items-center gap-1 hover:text-blue-600 text-xs"><Phone className="w-3 h-3" />{c.phone}</a>}
                            {c.email && <a href={`mailto:${c.email}`} className="flex items-center gap-1 hover:text-blue-600 text-xs"><Mail className="w-3 h-3" />{c.email}</a>}
                          </div>
                        </td>
                        <td className="px-6 py-4 text-right">
                          <div className="flex items-center justify-end gap-2">
                            <Button variant="ghost" size="icon" onClick={() => openEdit(c)}>
                              <Pencil className="w-4 h-4" />
                            </Button>
                            <Button variant="ghost" size="icon" className="text-red-500 hover:text-red-700 hover:bg-red-50" onClick={() => setDeleteId(c.id)}>
                              <Trash2 className="w-4 h-4" />
                            </Button>
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map((c) => (
            <Card key={c.id} className="hover:shadow-md transition-shadow">
              <CardContent className="pt-5">
                <div className="flex items-start justify-between mb-3">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-purple-100 flex items-center justify-center text-purple-700 font-bold">
                      {c.company_name[0]}
                    </div>
                    <div>
                      <p className="font-semibold text-gray-900 text-sm">{c.company_name}</p>
                      {c.contact_person && <p className="text-xs text-gray-500">{c.contact_person}</p>}
                    </div>
                  </div>
                  <div className="flex gap-1">
                    <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEdit(c)}>
                      <Pencil className="w-3 h-3" />
                    </Button>
                    <Button variant="ghost" size="icon" className="h-7 w-7 text-red-500" onClick={() => setDeleteId(c.id)}>
                      <Trash2 className="w-3 h-3" />
                    </Button>
                  </div>
                </div>
                <div className="space-y-1.5 text-xs text-gray-500">
                  {c.city && <div className="flex items-center gap-1.5"><MapPin className="w-3 h-3" />{c.street}, {c.zip} {c.city}</div>}
                  {c.phone && <div className="flex items-center gap-1.5"><Phone className="w-3 h-3" />{c.phone}</div>}
                  {c.email && <div className="flex items-center gap-1.5"><Mail className="w-3 h-3" />{c.email}</div>}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Create/Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{editing ? "Kunde bearbeiten" : "Kunde hinzufügen"}</DialogTitle>
          </DialogHeader>

          {/* Tab buttons */}
          <div className="flex border-b border-gray-200 -mx-6 px-6 mb-4 overflow-x-auto">
            {(["stammdaten", "standorte", "einstellungen", "preismodell", "preisformel"] as const).map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setDialogTab(t)}
                className={`px-3 py-2 text-sm font-medium border-b-2 -mb-px transition-colors whitespace-nowrap ${
                  dialogTab === t ? "border-blue-600 text-blue-600" : "border-transparent text-gray-500 hover:text-gray-700"
                }`}
              >
                {t === "stammdaten" ? "Stammdaten"
                  : t === "standorte" ? `Standorte${locations.length > 0 ? ` (${locations.length})` : ""}`
                  : t === "einstellungen" ? "Einstellungen"
                  : t === "preismodell" ? `Preismodell${pricingModels.length > 0 ? ` (${pricingModels.length})` : ""}`
                  : "Preisformel (alt)"}
              </button>
            ))}
          </div>

          {/* Scrollable tab content */}
          <div className="max-h-[60vh] overflow-y-auto">
            {dialogTab === "stammdaten" && (
              <div className="space-y-4">
                <div className="space-y-1.5">
                  <Label>Firmenname *</Label>
                  <Input value={form.company_name} onChange={(e) => setForm({ ...form, company_name: e.target.value })} />
                </div>
                <div className="space-y-1.5">
                  <Label>Ansprechpartner</Label>
                  <Input value={form.contact_person} onChange={(e) => setForm({ ...form, contact_person: e.target.value })} />
                </div>
                <div className="space-y-1.5">
                  <Label>Straße</Label>
                  <Input value={form.street} onChange={(e) => setForm({ ...form, street: e.target.value })} />
                </div>
                <div className="grid grid-cols-3 gap-3">
                  <div className="space-y-1.5">
                    <Label>PLZ</Label>
                    <Input value={form.zip} onChange={(e) => setForm({ ...form, zip: e.target.value })} />
                  </div>
                  <div className="col-span-2 space-y-1.5">
                    <Label>Stadt</Label>
                    <Input value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <Label>Telefon</Label>
                    <Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
                  </div>
                  <div className="space-y-1.5">
                    <Label>E-Mail</Label>
                    <Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label>Notizen</Label>
                  <Textarea rows={2} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
                </div>
              </div>
            )}

            {dialogTab === "standorte" && (
              <div className="space-y-4">
                {!editing && (
                  <p className="text-sm text-gray-500 text-center py-4">Bitte zuerst den Kunden anlegen, dann Standorte hinzufügen.</p>
                )}
                {editing && (
                  <>
                    {/* Existing locations */}
                    {locations.length > 0 && (
                      <div className="space-y-2">
                        {locations.map((loc) => (
                          <div key={loc.id} className="rounded-lg border border-gray-200 bg-white p-3">
                            {editingLocation?.id === loc.id ? (
                              <div className="space-y-2">
                                <div className="grid grid-cols-2 gap-2">
                                  <div className="space-y-1">
                                    <Label className="text-xs">Standortname *</Label>
                                    <Input className="h-8 text-sm" value={locationForm.name} onChange={(e) => setLocationForm({ ...locationForm, name: e.target.value })} />
                                  </div>
                                  <div className="space-y-1">
                                    <Label className="text-xs">Ansprechpartner</Label>
                                    <Input className="h-8 text-sm" value={locationForm.contact_person} onChange={(e) => setLocationForm({ ...locationForm, contact_person: e.target.value })} />
                                  </div>
                                </div>
                                <Input className="h-8 text-sm" placeholder="Straße" value={locationForm.street} onChange={(e) => setLocationForm({ ...locationForm, street: e.target.value })} />
                                <div className="grid grid-cols-3 gap-2">
                                  <Input className="h-8 text-sm" placeholder="PLZ" value={locationForm.zip} onChange={(e) => setLocationForm({ ...locationForm, zip: e.target.value })} />
                                  <Input className="h-8 text-sm col-span-2" placeholder="Stadt" value={locationForm.city} onChange={(e) => setLocationForm({ ...locationForm, city: e.target.value })} />
                                </div>
                                <div className="grid grid-cols-2 gap-2">
                                  <Input className="h-8 text-sm" placeholder="Telefon" value={locationForm.phone} onChange={(e) => setLocationForm({ ...locationForm, phone: e.target.value })} />
                                  <Input className="h-8 text-sm" placeholder="E-Mail" value={locationForm.email} onChange={(e) => setLocationForm({ ...locationForm, email: e.target.value })} />
                                </div>
                                <div className="flex gap-2 justify-end">
                                  <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => { setEditingLocation(null); setLocationForm({ name: "", street: "", zip: "", city: "", contact_person: "", phone: "", email: "" }); }}>Abbrechen</Button>
                                  <Button size="sm" className="h-7 text-xs" onClick={saveLocation} disabled={!locationForm.name}>Speichern</Button>
                                </div>
                              </div>
                            ) : (
                              <div className="flex items-start gap-2">
                                <Navigation className="w-3.5 h-3.5 text-blue-500 mt-0.5 shrink-0" />
                                <div className="flex-1 min-w-0">
                                  <p className="text-sm font-semibold text-gray-800">{loc.name}</p>
                                  {(loc.street || loc.city) && <p className="text-xs text-gray-500">{[loc.street, loc.zip && loc.city ? `${loc.zip} ${loc.city}` : loc.city].filter(Boolean).join(", ")}</p>}
                                  {loc.contact_person && <p className="text-xs text-gray-500">{loc.contact_person}{loc.phone ? ` · ${loc.phone}` : ""}</p>}
                                </div>
                                <div className="flex gap-1 shrink-0">
                                  <button onClick={() => { setEditingLocation(loc); setLocationForm({ name: loc.name, street: loc.street ?? "", zip: loc.zip ?? "", city: loc.city ?? "", contact_person: loc.contact_person ?? "", phone: loc.phone ?? "", email: loc.email ?? "" }); }} className="p-1 text-gray-400 hover:text-blue-600">
                                    <Pencil className="w-3.5 h-3.5" />
                                  </button>
                                  <button onClick={() => deleteLocation(loc.id)} className="p-1 text-gray-400 hover:text-red-600">
                                    <Trash2 className="w-3.5 h-3.5" />
                                  </button>
                                </div>
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Add new location form */}
                    {!editingLocation && (
                      <div className="rounded-lg border border-dashed border-gray-300 p-3 space-y-2 bg-gray-50">
                        <p className="text-xs font-semibold text-gray-600 flex items-center gap-1.5"><Plus className="w-3.5 h-3.5" /> Neuer Standort</p>
                        <div className="grid grid-cols-2 gap-2">
                          <div className="space-y-1">
                            <Label className="text-xs">Standortname *</Label>
                            <Input className="h-8 text-sm" placeholder='z.B. "Neuss" oder "Werk Nord"' value={locationForm.name} onChange={(e) => setLocationForm({ ...locationForm, name: e.target.value })} />
                          </div>
                          <div className="space-y-1">
                            <Label className="text-xs">Ansprechpartner</Label>
                            <Input className="h-8 text-sm" value={locationForm.contact_person} onChange={(e) => setLocationForm({ ...locationForm, contact_person: e.target.value })} />
                          </div>
                        </div>
                        <Input className="h-8 text-sm" placeholder="Straße" value={locationForm.street} onChange={(e) => setLocationForm({ ...locationForm, street: e.target.value })} />
                        <div className="grid grid-cols-3 gap-2">
                          <Input className="h-8 text-sm" placeholder="PLZ" value={locationForm.zip} onChange={(e) => setLocationForm({ ...locationForm, zip: e.target.value })} />
                          <Input className="h-8 text-sm col-span-2" placeholder="Stadt" value={locationForm.city} onChange={(e) => setLocationForm({ ...locationForm, city: e.target.value })} />
                        </div>
                        <div className="grid grid-cols-2 gap-2">
                          <Input className="h-8 text-sm" placeholder="Telefon" value={locationForm.phone} onChange={(e) => setLocationForm({ ...locationForm, phone: e.target.value })} />
                          <Input className="h-8 text-sm" placeholder="E-Mail" value={locationForm.email} onChange={(e) => setLocationForm({ ...locationForm, email: e.target.value })} />
                        </div>
                        <div className="flex justify-end">
                          <Button size="sm" className="h-8" onClick={saveLocation} disabled={!locationForm.name}>
                            <Plus className="w-3.5 h-3.5 mr-1" /> Standort hinzufügen
                          </Button>
                        </div>
                      </div>
                    )}
                  </>
                )}
              </div>
            )}

            {dialogTab === "einstellungen" && (
              <div className="space-y-4">
                {/* Rollkarte settings */}
                <div className="rounded-lg border border-gray-200 p-3 space-y-3 bg-gray-50">
                  <p className="text-xs font-semibold text-gray-600 flex items-center gap-1.5">
                    <Hash className="w-3.5 h-3.5" /> WhatsApp Rollkarte
                  </p>
                  {/* Type toggle */}
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => setForm({ ...form, rollkarte_accepts_text: false })}
                      className={`flex-1 py-1.5 rounded-md text-xs font-medium border transition-colors ${
                        !form.rollkarte_accepts_text
                          ? "bg-blue-600 text-white border-blue-600"
                          : "bg-white text-gray-600 border-gray-300 hover:bg-gray-100"
                      }`}
                    >
                      Nummer
                    </button>
                    <button
                      type="button"
                      onClick={() => setForm({ ...form, rollkarte_accepts_text: true, rollkarte_prefix: "" })}
                      className={`flex-1 py-1.5 rounded-md text-xs font-medium border transition-colors ${
                        form.rollkarte_accepts_text
                          ? "bg-blue-600 text-white border-blue-600"
                          : "bg-white text-gray-600 border-gray-300 hover:bg-gray-100"
                      }`}
                    >
                      Text (Ortsname o.ä.)
                    </button>
                  </div>
                  {/* Prefix — only for number mode */}
                  {!form.rollkarte_accepts_text && (
                    <div className="space-y-1">
                      <Label className="text-xs">Erwarteter Präfix (optional)</Label>
                      <Input
                        placeholder='z.B. "26-" oder "RK"'
                        value={form.rollkarte_prefix}
                        onChange={(e) => setForm({ ...form, rollkarte_prefix: e.target.value })}
                        className="h-8 text-sm"
                      />
                      <p className="text-[11px] text-gray-400">
                        Wenn gesetzt, wird der Fahrer auch ohne explizite Rollkarten-Antwort erkannt — z.B. "... mit der Nummer 26-8365401".
                      </p>
                    </div>
                  )}
                  {form.rollkarte_accepts_text && (
                    <p className="text-[11px] text-gray-400">
                      Der Fahrer kann als Rollkarte auch Orte oder Freitext schicken (z.B. "Werl, Ense, Soest"). Die gesamte Antwort wird gespeichert.
                    </p>
                  )}
                </div>

                {/* Fahrzeugreferenz */}
                <div className="rounded-lg border border-gray-200 p-3 space-y-2 bg-gray-50">
                  <p className="text-xs font-semibold text-gray-600">Fahrzeugreferenz in Gutschriften</p>
                  <div className="flex gap-2">
                    {["Kennzeichen", "LKW-Nr.", "Fahrzeug-ID"].map((opt) => (
                      <button
                        key={opt}
                        type="button"
                        onClick={() => setForm({ ...form, vehicle_ref_label: opt })}
                        className={`flex-1 py-1.5 rounded-md text-xs font-medium border transition-colors ${
                          form.vehicle_ref_label === opt
                            ? "bg-blue-600 text-white border-blue-600"
                            : "bg-white text-gray-600 border-gray-300 hover:bg-gray-100"
                        }`}
                      >
                        {opt}
                      </button>
                    ))}
                  </div>
                  <p className="text-[11px] text-gray-400">
                    Legt fest, wie die Fahrzeugreferenz in Gutschriften dieses Kunden bezeichnet wird (z.B. Kennzeichen oder interne LKW-Nummer).
                  </p>
                </div>

                {/* Gutschrift sign inversion */}
                <div className="rounded-lg border border-gray-200 p-3 space-y-2 bg-gray-50">
                  <p className="text-xs font-semibold text-gray-600">Gutschrift-Beträge</p>
                  <label className="flex items-center gap-3 cursor-pointer">
                    <div
                      onClick={() => setForm({ ...form, invert_gutschrift_sign: !form.invert_gutschrift_sign })}
                      className={`relative w-9 h-5 rounded-full transition-colors ${form.invert_gutschrift_sign ? "bg-blue-600" : "bg-gray-300"}`}
                    >
                      <span className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform ${form.invert_gutschrift_sign ? "translate-x-4" : "translate-x-0"}`} />
                    </div>
                    <span className="text-xs text-gray-700">Beträge invertieren (negative → positiv)</span>
                  </label>
                  <p className="text-[11px] text-gray-400">
                    Aktivieren wenn dieser Kunde Gutschriften mit negativem Vorzeichen ausstellt, die bei dir als Guthaben gelten.
                  </p>
                </div>

                {/* Vehicle alias mapping — only show when editing an existing customer and vehicle_ref_label is not "Kennzeichen" */}
                {editing && form.vehicle_ref_label !== "Kennzeichen" && (
                  <div className="rounded-lg border border-gray-200 p-3 space-y-3 bg-gray-50">
                    <p className="text-xs font-semibold text-gray-600 flex items-center gap-1.5">
                      <ArrowLeftRight className="w-3.5 h-3.5" /> {form.vehicle_ref_label} → Fahrzeug zuordnen
                    </p>

                    {/* existing aliases */}
                    {aliases.length > 0 && (
                      <div className="space-y-1.5">
                        {aliases.map((a) => {
                          const v = vehicles.find((v) => v.id === a.vehicle_id);
                          return (
                            <div key={a.id} className="flex items-center gap-2 text-xs bg-white rounded border border-gray-200 px-2 py-1.5">
                              <span className="font-mono font-semibold text-gray-700 min-w-[60px]">{a.alias}</span>
                              <span className="text-gray-400">→</span>
                              <span className="text-gray-700">{v ? `${v.license_plate}` : <span className="text-gray-400">–</span>}</span>
                              <button onClick={() => deleteAlias(a.id)} className="ml-auto text-red-400 hover:text-red-600">
                                <Trash2 className="w-3 h-3" />
                              </button>
                            </div>
                          );
                        })}
                      </div>
                    )}

                    {/* add new alias row */}
                    <div className="flex gap-2 items-center">
                      <Input
                        placeholder={form.vehicle_ref_label + " z.B. 3803"}
                        value={newAlias.alias}
                        onChange={(e) => setNewAlias({ ...newAlias, alias: e.target.value })}
                        className="h-8 text-xs flex-1"
                      />
                      <span className="text-gray-400 text-xs">→</span>
                      <select
                        value={newAlias.vehicle_id}
                        onChange={(e) => setNewAlias({ ...newAlias, vehicle_id: e.target.value })}
                        className="h-8 text-xs border border-gray-300 rounded-md px-2 flex-1 bg-white"
                      >
                        <option value="">Fahrzeug wählen</option>
                        {vehicles.map((v) => (
                          <option key={v.id} value={v.id}>{v.license_plate}</option>
                        ))}
                      </select>
                      <Button
                        size="sm"
                        className="h-8 px-2"
                        disabled={!newAlias.alias || !newAlias.vehicle_id}
                        onClick={saveAlias}
                      >
                        <Plus className="w-3 h-3" />
                      </Button>
                    </div>
                    <p className="text-[11px] text-gray-400">
                      Zuordnungen werden sofort gespeichert und gelten für alle Gutschriften dieses Kunden.
                    </p>
                  </div>
                )}
              </div>
            )}

            {dialogTab === "preismodell" && (
              <div className="space-y-4">
                {!editing && (
                  <p className="text-sm text-gray-500 text-center py-4">Bitte zuerst den Kunden anlegen, dann Preismodelle hinzufügen.</p>
                )}
                {editing && (
                  <>
                    {/* Existing pricing models grouped by vehicle_type */}
                    {pricingModels.length > 0 && (
                      <div className="space-y-2">
                        {pricingModels.map((m) => {
                          const dieselPct = ((m.diesel_factor / 100) * ((1.7359 - m.diesel_base_price) / m.diesel_base_price) * 100).toFixed(1);
                          const label = m.vehicle_type === "SZM" && m.km_class ? `${m.vehicle_type} (${m.km_class})` : m.vehicle_type;
                          return (
                            <div key={m.id} className="rounded-lg border border-gray-200 bg-white p-3">
                              <div className="flex items-start justify-between gap-2">
                                <div className="flex-1 min-w-0">
                                  <div className="flex items-center gap-2 flex-wrap">
                                    <span className="text-sm font-semibold text-gray-800">{label}</span>
                                    <span className="text-xs bg-blue-100 text-blue-700 rounded px-1.5 py-0.5">ab {m.valid_from}</span>
                                  </div>
                                  <div className="mt-1 grid grid-cols-2 gap-x-4 text-xs text-gray-600">
                                    <span>Tagessatz: <strong>{m.daily_rate_netto.toFixed(2)} €</strong></span>
                                    <span>Maut: <strong>{m.maut_flat.toFixed(2)} €</strong></span>
                                    <span>Diesel-Basis: <strong>{m.diesel_base_price.toFixed(4)} €</strong></span>
                                    <span>Diesel-Faktor: <strong>{m.diesel_factor}%</strong></span>
                                  </div>
                                  {m.notes && <p className="text-xs text-gray-400 mt-1 italic">{m.notes}</p>}
                                </div>
                                <button onClick={() => deletePricingModel(m.id)} className="p-1 text-gray-400 hover:text-red-600 shrink-0">
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}

                    {/* Add new pricing model form */}
                    <div className="rounded-lg border border-dashed border-gray-300 p-3 space-y-3 bg-gray-50">
                      <p className="text-xs font-semibold text-gray-600 flex items-center gap-1.5"><Plus className="w-3.5 h-3.5" /> Neues Preismodell</p>
                      <div className="grid grid-cols-2 gap-2">
                        <div className="space-y-1">
                          <Label className="text-xs">Fahrzeugtyp *</Label>
                          <select
                            value={pricingForm.vehicle_type}
                            onChange={(e) => setPricingForm({ ...pricingForm, vehicle_type: e.target.value, km_class: "" })}
                            className="h-8 text-sm border border-gray-300 rounded-md px-2 w-full bg-white"
                          >
                            <option value="">Typ wählen</option>
                            {["MW 12t", "MW 15t", "MW 18t", "MW 26t", "SZM", "Transporter", "PKW"].map(t => (
                              <option key={t} value={t}>{t}</option>
                            ))}
                          </select>
                        </div>
                        {pricingForm.vehicle_type === "SZM" && (
                          <div className="space-y-1">
                            <Label className="text-xs">Km-Klasse</Label>
                            <select
                              value={pricingForm.km_class}
                              onChange={(e) => setPricingForm({ ...pricingForm, km_class: e.target.value })}
                              className="h-8 text-sm border border-gray-300 rounded-md px-2 w-full bg-white"
                            >
                              <option value="">Nicht festgelegt</option>
                              <option value="300km">300 km</option>
                              <option value="450km">450 km</option>
                            </select>
                          </div>
                        )}
                        <div className="space-y-1">
                          <Label className="text-xs">Gültig ab *</Label>
                          <Input className="h-8 text-sm" type="date" value={pricingForm.valid_from} onChange={(e) => setPricingForm({ ...pricingForm, valid_from: e.target.value })} />
                        </div>
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        <div className="space-y-1">
                          <Label className="text-xs">Tagessatz netto (€) *</Label>
                          <Input className="h-8 text-sm" type="number" step="0.01" placeholder="455.00" value={pricingForm.daily_rate_netto} onChange={(e) => setPricingForm({ ...pricingForm, daily_rate_netto: e.target.value })} />
                        </div>
                        <div className="space-y-1">
                          <Label className="text-xs">Maut-Pauschale (€/Tag)</Label>
                          <Input className="h-8 text-sm" type="number" step="0.01" placeholder="72.59" value={pricingForm.maut_flat} onChange={(e) => setPricingForm({ ...pricingForm, maut_flat: e.target.value })} />
                        </div>
                        <div className="space-y-1">
                          <Label className="text-xs">Diesel-Basis (€/l netto)</Label>
                          <Input className="h-8 text-sm" type="number" step="0.0001" placeholder="1.04" value={pricingForm.diesel_base_price} onChange={(e) => setPricingForm({ ...pricingForm, diesel_base_price: e.target.value })} />
                        </div>
                        <div className="space-y-1">
                          <Label className="text-xs">Diesel-Faktor (%)</Label>
                          <Input className="h-8 text-sm" type="number" step="1" placeholder="20" value={pricingForm.diesel_factor} onChange={(e) => setPricingForm({ ...pricingForm, diesel_factor: e.target.value })} />
                        </div>
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs">Notizen</Label>
                        <Input className="h-8 text-sm" placeholder="z.B. Maut-Anpassung Q2/2026" value={pricingForm.notes} onChange={(e) => setPricingForm({ ...pricingForm, notes: e.target.value })} />
                      </div>

                      {/* Live preview */}
                      {pricingForm.daily_rate_netto && (
                        <div className="rounded-md bg-blue-50 border border-blue-200 p-2.5 text-xs text-blue-700">
                          <p className="font-semibold mb-1">Vorschau (bei akt. Diesel 1,7359 €/l brutto)</p>
                          {(() => {
                            const rate = parseFloat(pricingForm.daily_rate_netto) || 0;
                            const maut = parseFloat(pricingForm.maut_flat) || 0;
                            const base = parseFloat(pricingForm.diesel_base_price) || 1.04;
                            const factor = parseFloat(pricingForm.diesel_factor) || 20;
                            const currentDieselBrutto = 1.7359;
                            const dieselPct = (currentDieselBrutto - base) / base * 100 * factor / 100;
                            const dieselAmt = rate * dieselPct / 100;
                            const total = rate + maut + dieselAmt;
                            return (
                              <div className="space-y-0.5">
                                <div className="flex justify-between"><span>Tagessatz</span><span className="font-mono">{rate.toFixed(2)} €</span></div>
                                <div className="flex justify-between"><span>Diesel-Zuschlag ({dieselPct.toFixed(2)} %)</span><span className="font-mono">+ {dieselAmt.toFixed(2)} €</span></div>
                                <div className="flex justify-between"><span>Maut</span><span className="font-mono">+ {maut.toFixed(2)} €</span></div>
                                <div className="flex justify-between border-t border-blue-300 pt-1 font-bold"><span>Gesamt/Tag</span><span className="font-mono">{total.toFixed(2)} €</span></div>
                              </div>
                            );
                          })()}
                        </div>
                      )}

                      <div className="flex justify-end">
                        <Button size="sm" className="h-8" onClick={savePricingModel} disabled={savingPricing || !pricingForm.vehicle_type || !pricingForm.daily_rate_netto || !pricingForm.valid_from}>
                          <Plus className="w-3.5 h-3.5 mr-1" /> Preismodell hinzufügen
                        </Button>
                      </div>
                    </div>
                    <p className="text-[11px] text-gray-400">
                      Der neueste Eintrag pro Fahrzeugtyp (nach Gültig-ab) ist aktiv. Ältere Einträge dienen als Historik.
                    </p>
                  </>
                )}
              </div>
            )}

            {dialogTab === "preisformel" && (
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <Label>Tagespauschale (€)</Label>
                    <Input
                      type="number"
                      step="0.01"
                      placeholder="510.00"
                      value={form.price_daily_rate ?? ""}
                      onChange={(e) => setForm({ ...form, price_daily_rate: e.target.value ? parseFloat(e.target.value) : undefined })}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Diesel-Zuschlag (%)</Label>
                    <Input
                      type="number"
                      step="0.1"
                      placeholder="8.5"
                      value={form.price_diesel_pct ?? ""}
                      onChange={(e) => setForm({ ...form, price_diesel_pct: e.target.value ? parseFloat(e.target.value) : undefined })}
                    />
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label>Maut-Zuschlag (€/Tag, Pauschale)</Label>
                  <Input
                    type="number"
                    step="0.01"
                    placeholder="34.99"
                    value={form.price_toll_flat ?? ""}
                    onChange={(e) => setForm({ ...form, price_toll_flat: e.target.value ? parseFloat(e.target.value) : undefined })}
                  />
                </div>

                {/* Live preview */}
                {(form.price_daily_rate || form.price_diesel_pct || form.price_toll_flat) && (
                  <div className="rounded-lg bg-blue-50 border border-blue-200 p-4 space-y-2">
                    <p className="text-xs font-semibold text-blue-700">Berechneter Tagespreis</p>
                    <div className="text-xs text-blue-600 space-y-1">
                      <div className="flex justify-between">
                        <span>Tagespauschale</span>
                        <span className="font-mono">{(form.price_daily_rate ?? 0).toFixed(2)} €</span>
                      </div>
                      <div className="flex justify-between">
                        <span>Diesel ({form.price_diesel_pct ?? 0} %)</span>
                        <span className="font-mono">+ {((form.price_daily_rate ?? 0) * (form.price_diesel_pct ?? 0) / 100).toFixed(2)} €</span>
                      </div>
                      <div className="flex justify-between">
                        <span>Maut-Pauschale</span>
                        <span className="font-mono">+ {(form.price_toll_flat ?? 0).toFixed(2)} €</span>
                      </div>
                      <div className="flex justify-between border-t border-blue-300 pt-1 font-bold text-blue-800">
                        <span>Tagespreis gesamt</span>
                        <span className="font-mono">
                          {(
                            (form.price_daily_rate ?? 0) +
                            (form.price_daily_rate ?? 0) * (form.price_diesel_pct ?? 0) / 100 +
                            (form.price_toll_flat ?? 0)
                          ).toFixed(2)} €
                        </span>
                      </div>
                    </div>
                  </div>
                )}
                <p className="text-xs text-gray-400">
                  Der Diesel-Zuschlag wird als Prozentsatz der Tagespauschale berechnet und kann monatlich angepasst werden.
                </p>
              </div>
            )}
          </div>

          {/* Always-visible action buttons */}
          <div className="flex gap-3 justify-end pt-4 border-t border-gray-100 mt-2">
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Abbrechen</Button>
            <Button onClick={handleSave} disabled={saving || !form.company_name}>
              {saving ? "Speichern..." : editing ? "Aktualisieren" : "Hinzufügen"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={!!deleteId} onOpenChange={() => setDeleteId(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Kunde löschen?</DialogTitle></DialogHeader>
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
