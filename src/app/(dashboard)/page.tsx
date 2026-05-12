import { createClient } from "@/lib/supabase/server";
import { Truck, Users, Building2, MapPin, TrendingUp, Clock } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatDate } from "@/lib/utils";

export default async function DashboardPage() {
  const supabase = await createClient();

  const [
    { count: vehicleCount },
    { count: driverCount },
    { count: customerCount },
    { data: todayTours },
    { data: availableVehicles },
    { data: onTourDrivers },
  ] = await Promise.all([
    supabase.from("vehicles").select("*", { count: "exact", head: true }),
    supabase.from("drivers").select("*", { count: "exact", head: true }),
    supabase.from("customers").select("*", { count: "exact", head: true }),
    supabase
      .from("tours")
      .select("*, driver:drivers(first_name,last_name), vehicle:vehicles(license_plate), customer:customers(company_name)")
      .eq("tour_date", new Date().toISOString().split("T")[0])
      .order("created_at", { ascending: false })
      .limit(5),
    supabase.from("vehicles").select("id").eq("status", "available"),
    supabase.from("drivers").select("id").eq("status", "on_tour"),
  ]);

  const today = new Date().toLocaleDateString("de-DE", {
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
      sub: formatDate(new Date()),
      icon: MapPin,
      color: "text-orange-600",
      bg: "bg-orange-50",
    },
  ];

  const tourStatusMap: Record<string, { label: string; variant: "success" | "default" | "warning" | "destructive" | "secondary" }> = {
    planned: { label: "Geplant", variant: "default" },
    active: { label: "Aktiv", variant: "success" },
    completed: { label: "Abgeschlossen", variant: "secondary" },
    cancelled: { label: "Abgesagt", variant: "destructive" },
  };

  return (
    <div className="p-8">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
        <p className="text-gray-500 mt-1 flex items-center gap-1.5">
          <Clock className="w-4 h-4" />
          {today}
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
            {!todayTours || todayTours.length === 0 ? (
              <div className="text-center py-8 text-gray-400">
                <MapPin className="w-8 h-8 mx-auto mb-2 opacity-40" />
                <p className="text-sm">Keine Touren für heute</p>
              </div>
            ) : (
              <div className="space-y-3">
                {todayTours.map((tour: any) => {
                  const status = tourStatusMap[tour.status] ?? { label: tour.status, variant: "secondary" };
                  return (
                    <div key={tour.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                      <div>
                        <p className="text-sm font-medium text-gray-900">
                          {tour.customer?.company_name ?? "–"}
                        </p>
                        <p className="text-xs text-gray-500 mt-0.5">
                          {tour.driver
                            ? `${tour.driver.first_name} ${tour.driver.last_name}`
                            : "Kein Fahrer"}
                          {tour.vehicle ? ` · ${tour.vehicle.license_plate}` : ""}
                        </p>
                      </div>
                      <Badge variant={status.variant}>{status.label}</Badge>
                    </div>
                  );
                })}
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
    </div>
  );
}
