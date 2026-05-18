import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { cookies } from "next/headers";
import { Truck, Users, Building2, MapPin, TrendingUp, Clock } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatDate } from "@/lib/utils";
import { ActionRecommendations } from "@/components/dashboard/action-recommendations";
import { TodoWidget } from "@/components/dashboard/todo-widget";

export default async function DashboardPage() {
  const supabase = await createClient();
  const adminSupabase = createAdminClient();
  const cookieStore = await cookies();
  const selectedDate = cookieStore.get("app_date")?.value ?? new Date().toISOString().split("T")[0];
  const today = new Date().toISOString().split("T")[0];

  const [
    { count: vehicleCount },
    { count: driverCount },
    { count: customerCount },
    { data: todayTours },
    { data: availableVehicles },
    { data: onTourDrivers },
    { data: toursForRecommendations },
    { data: todoDrivers },
    { data: todoVehicles },
  ] = await Promise.all([
    supabase.from("vehicles").select("*", { count: "exact", head: true }),
    supabase.from("drivers").select("*", { count: "exact", head: true }),
    supabase.from("customers").select("*", { count: "exact", head: true }),
    supabase
      .from("tours")
      .select("*, driver:drivers(first_name,last_name), vehicle:vehicles(license_plate), customer:customers(company_name)")
      .eq("tour_date", selectedDate)
      .order("created_at", { ascending: false }),
    supabase.from("vehicles").select("id").eq("status", "available"),
    supabase.from("drivers").select("id").eq("status", "on_tour"),
    adminSupabase
      .from("tours")
      .select(
        "id, tour_date, status, driver_id, vehicle_id, customer_id, billing_ref, rollkarte_status, soll_netto, actual_km, driver:drivers(id,first_name,last_name), vehicle:vehicles(id,license_plate,type), customer:customers(id,company_name)"
      )
      .gte("tour_date", new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split("T")[0])
      .neq("status", "cancelled"),
    adminSupabase
      .from("drivers")
      .select("id, first_name, last_name, phone, current_vehicle_id, status")
      .neq("status", "off"),
    adminSupabase
      .from("vehicles")
      .select("id, license_plate, type, status, current_driver_id"),
  ]);

  const todayFormatted = new Date(selectedDate + "T00:00:00").toLocaleDateString("de-DE", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  const stats = [
    {
      label: "Fahrzeuge gesamt",
      value: vehicleCount ?? 0,
      sub: `${availableVehicles?.length ?? 0} verfügbar`,
      icon: Truck,
      color: "text-blue-600",
      bg: "bg-blue-50",
    },
    {
      label: "Fahrer gesamt",
      value: driverCount ?? 0,
      sub: `${onTourDrivers?.length ?? 0} auf Tour`,
      icon: Users,
      color: "text-green-600",
      bg: "bg-green-50",
    },
    {
      label: "Kunden",
      value: customerCount ?? 0,
      sub: "Aktive Kunden",
      icon: Building2,
      color: "text-purple-600",
      bg: "bg-purple-50",
    },
    {
      label: "Touren heute",
      value: todayTours?.length ?? 0,
      sub: new Date(selectedDate + "T00:00:00").toLocaleDateString("de-DE"),
      icon: MapPin,
      color: "text-orange-600",
      bg: "bg-orange-50",
    },
  ];

  // Group tours by customer
  type TourEntry = { customer_name: string; count: number; vehicles: string[] };
  const toursPerCustomer: TourEntry[] = [];
  if (todayTours) {
    const grouped: Record<string, TourEntry> = {};
    for (const t of todayTours as any[]) {
      const name = t.customer?.company_name ?? "Ohne Kunde";
      if (!grouped[name]) grouped[name] = { customer_name: name, count: 0, vehicles: [] };
      grouped[name].count++;
      if (t.vehicle?.license_plate) grouped[name].vehicles.push(t.vehicle.license_plate);
    }
    toursPerCustomer.push(...Object.values(grouped).sort((a, b) => b.count - a.count));
  }

  return (
    <div className="p-8">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
        <p className="text-gray-500 mt-1 flex items-center gap-1.5">
          <Clock className="w-4 h-4" />
          {todayFormatted}
        </p>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5 mb-8">
        {stats.map((stat) => (
          <Card key={stat.label}>
            <CardContent className="pt-6">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-500">{stat.label}</p>
                  <p className="text-3xl font-bold text-gray-900 mt-1">{stat.value}</p>
                  <p className="text-xs text-gray-400 mt-1">{stat.sub}</p>
                </div>
                <div className={`w-12 h-12 rounded-xl ${stat.bg} flex items-center justify-center`}>
                  <stat.icon className={`w-6 h-6 ${stat.color}`} />
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Touren heute */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <MapPin className="w-5 h-5 text-blue-600" />
              <CardTitle>Touren heute</CardTitle>
            </div>
          </CardHeader>
          <CardContent>
            {toursPerCustomer.length === 0 ? (
              <div className="text-center py-8 text-gray-400">
                <MapPin className="w-8 h-8 mx-auto mb-2 opacity-40" />
                <p className="text-sm">Keine Touren für heute</p>
              </div>
            ) : (
              <div className="space-y-2">
                {toursPerCustomer.map((entry) => (
                  <div key={entry.customer_name} className="flex items-center justify-between px-4 py-3 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-8 h-8 rounded-lg bg-blue-100 flex items-center justify-center shrink-0">
                        <Building2 className="w-4 h-4 text-blue-600" />
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-gray-900 truncate">{entry.customer_name}</p>
                        <p className="text-xs text-gray-400 truncate">{entry.vehicles.join(" · ") || "–"}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0 ml-3">
                      <Truck className="w-4 h-4 text-gray-400" />
                      <span className="text-sm font-bold text-gray-700">{entry.count}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <TrendingUp className="w-5 h-5 text-green-600" />
              <CardTitle>Schnellübersicht</CardTitle>
            </div>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div className="flex justify-between items-center">
                <span className="text-sm text-gray-600">Fahrzeuge verfügbar</span>
                <span className="text-sm font-semibold text-green-600">
                  {availableVehicles?.length ?? 0} / {vehicleCount ?? 0}
                </span>
              </div>
              <div className="w-full bg-gray-200 rounded-full h-2">
                <div
                  className="bg-green-500 h-2 rounded-full"
                  style={{
                    width: vehicleCount
                      ? `${((availableVehicles?.length ?? 0) / vehicleCount) * 100}%`
                      : "0%",
                  }}
                />
              </div>

              <div className="flex justify-between items-center mt-4">
                <span className="text-sm text-gray-600">Fahrer auf Tour</span>
                <span className="text-sm font-semibold text-blue-600">
                  {onTourDrivers?.length ?? 0} / {driverCount ?? 0}
                </span>
              </div>
              <div className="w-full bg-gray-200 rounded-full h-2">
                <div
                  className="bg-blue-500 h-2 rounded-full"
                  style={{
                    width: driverCount
                      ? `${((onTourDrivers?.length ?? 0) / driverCount) * 100}%`
                      : "0%",
                  }}
                />
              </div>

              <div className="mt-6 p-4 bg-blue-50 rounded-xl">
                <p className="text-xs font-semibold text-blue-700 mb-1">WhatsApp Sprachbefehl</p>
                <p className="text-xs text-blue-600 italic">
                  "Fahrer Mustermann mit Kennzeichen HH-XY 123 fährt morgen zu Kunde Müller GmbH"
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Handlungsempfehlungen */}
      <div className="mt-8">
        <ActionRecommendations
          tours={(toursForRecommendations ?? []) as any}
          onTourDate={today}
        />
      </div>

      {/* Offene Aufgaben (Fahrer / Fahrzeuge) */}
      <div className="mt-6">
        <TodoWidget
          data={{
            drivers: (todoDrivers ?? []) as any,
            vehicles: (todoVehicles ?? []) as any,
          }}
        />
      </div>
    </div>
  );
}
