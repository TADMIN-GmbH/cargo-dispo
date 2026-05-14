"use client";

import {
  AlertTriangle,
  UserX,
  Truck,
  Building2,
  Hash,
  Receipt,
  Euro,
  Route,
  CheckCircle2,
  Pencil,
  ChevronDown,
  ChevronRight,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { useState } from "react";

type Driver = { id: string; first_name: string; last_name: string } | null;
type Vehicle = { id: string; license_plate: string; type: string } | null;
type Customer = { id: string; company_name: string } | null;

export type TourForRecommendations = {
  id: string;
  tour_date: string;
  status: string;
  driver_id: string | null;
  vehicle_id: string | null;
  customer_id: string | null;
  billing_ref: string | null;
  rollkarte_status: string | null;
  soll_netto: number | null;
  actual_km: number | null;
  driver: Driver;
  vehicle: Vehicle;
  customer: Customer;
};

type Category = {
  label: string;
  icon: React.ElementType;
  tours: TourForRecommendations[];
};

function TourRow({ tour }: { tour: TourForRecommendations }) {
  const date = new Date(tour.tour_date + "T00:00:00").toLocaleDateString("de-DE", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
  const customerName = tour.customer?.company_name ?? "–";
  const driverName = tour.driver
    ? `${tour.driver.first_name} ${tour.driver.last_name}`
    : "–";
  const plate = tour.vehicle?.license_plate ?? "–";

  return (
    <div className="flex items-center justify-between py-2 px-3 rounded-lg bg-amber-50 hover:bg-amber-100 transition-colors gap-3">
      <div className="flex items-center gap-3 min-w-0 text-sm text-gray-700">
        <span className="text-gray-400 shrink-0 font-mono text-xs">{date}</span>
        <span className="font-semibold truncate">{customerName}</span>
        <span className="text-gray-400 hidden sm:inline truncate">{driverName}</span>
        <span className="text-gray-400 hidden md:inline font-mono text-xs">{plate}</span>
      </div>
      <Link href="/tours">
        <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0 text-gray-400 hover:text-amber-700">
          <Pencil className="w-3.5 h-3.5" />
        </Button>
      </Link>
    </div>
  );
}

function CategorySection({ category }: { category: Category }) {
  const defaultOpen = category.tours.length <= 3;
  const [open, setOpen] = useState(defaultOpen);
  const Icon = category.icon;

  return (
    <div className="border border-amber-200 rounded-lg overflow-hidden">
      <button
        className="w-full flex items-center justify-between px-4 py-3 bg-amber-50 hover:bg-amber-100 transition-colors"
        onClick={() => setOpen((o) => !o)}
      >
        <div className="flex items-center gap-2">
          <Icon className="w-4 h-4 text-amber-600" />
          <span className="text-sm font-semibold text-amber-900">{category.label}</span>
          <Badge variant="secondary" className="bg-amber-200 text-amber-800 text-xs">
            {category.tours.length}
          </Badge>
        </div>
        {open ? (
          <ChevronDown className="w-4 h-4 text-amber-500" />
        ) : (
          <ChevronRight className="w-4 h-4 text-amber-500" />
        )}
      </button>
      {open && (
        <div className="px-3 py-2 space-y-1.5 bg-white">
          {category.tours.map((t) => (
            <TourRow key={t.id} tour={t} />
          ))}
        </div>
      )}
    </div>
  );
}

export function ActionRecommendations({
  tours,
  onTourDate,
}: {
  tours: TourForRecommendations[];
  onTourDate: string;
}) {
  const categories: Category[] = [
    {
      label: "Touren ohne Fahrer",
      icon: UserX,
      tours: tours.filter((t) => t.driver_id === null),
    },
    {
      label: "Touren ohne Fahrzeug",
      icon: Truck,
      tours: tours.filter((t) => t.vehicle_id === null),
    },
    {
      label: "Touren ohne Kunde",
      icon: Building2,
      tours: tours.filter((t) => t.customer_id === null),
    },
    {
      label: "Rollkarte ausstehend",
      icon: Hash,
      tours: tours.filter(
        (t) => t.rollkarte_status === "pending" && t.status === "active"
      ),
    },
    {
      label: "Fehlende GU/RE-Nr.",
      icon: Receipt,
      tours: tours.filter(
        (t) =>
          (t.billing_ref === null || t.billing_ref === "") &&
          t.status === "completed"
      ),
    },
    {
      label: "Kein Soll berechnet",
      icon: Euro,
      tours: tours.filter((t) => t.soll_netto === null && t.customer_id !== null),
    },
    {
      label: "Ist-km fehlt",
      icon: Route,
      // Only flag missing actual_km for completed tours (not all tours — too noisy)
      tours: tours.filter((t) => t.actual_km === null && t.status === "completed"),
    },
  ].filter((c) => c.tours.length > 0);

  const totalIssues = categories.reduce((acc, c) => acc + c.tours.length, 0);

  // Summary stat bar values
  const toursOnDate = tours.length;
  const driversOnTour = tours.filter((t) => t.driver_id !== null).length;
  const withoutRollkarte = tours.filter(
    (t) => t.rollkarte_status === "pending" && t.status === "active"
  ).length;

  return (
    <div className="space-y-4">
      {/* Summary stat bar */}
      <div className="flex flex-wrap gap-3 text-sm text-gray-600">
        <span className="px-3 py-1.5 bg-gray-100 rounded-lg font-medium">
          Letzte 30 Tage: <span className="font-bold text-gray-900">{toursOnDate}</span> Touren
        </span>
        <span className="px-3 py-1.5 bg-blue-50 rounded-lg font-medium text-blue-700">
          <span className="font-bold">{driversOnTour}</span> Fahrer auf Tour
        </span>
        {withoutRollkarte > 0 && (
          <span className="px-3 py-1.5 bg-amber-50 rounded-lg font-medium text-amber-700">
            <span className="font-bold">{withoutRollkarte}</span> ohne Rollkarte
          </span>
        )}
      </div>

      {/* Action recommendations card */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-amber-500" />
              <CardTitle>Handlungsempfehlungen</CardTitle>
            </div>
            {totalIssues > 0 ? (
              <Badge className="bg-amber-100 text-amber-800 border-amber-200">
                {totalIssues} {totalIssues === 1 ? "Problem" : "Probleme"}
              </Badge>
            ) : (
              <Badge className="bg-green-100 text-green-700 border-green-200">Alles OK</Badge>
            )}
          </div>
        </CardHeader>
        <CardContent>
          {totalIssues === 0 ? (
            <div className="flex items-center gap-3 p-4 bg-green-50 rounded-xl">
              <CheckCircle2 className="w-6 h-6 text-green-500 shrink-0" />
              <div>
                <p className="font-semibold text-green-800">Alle Touren vollständig ✓</p>
                <p className="text-sm text-green-600">
                  In den letzten 30 Tagen sind keine offenen Punkte vorhanden.
                </p>
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              {categories.map((cat) => (
                <CategorySection key={cat.label} category={cat} />
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
