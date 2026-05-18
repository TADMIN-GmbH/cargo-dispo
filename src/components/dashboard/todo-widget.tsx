"use client";

import { AlertTriangle, PhoneOff, Truck, UserX, Wrench } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import Link from "next/link";
import { useState } from "react";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type TodoDriver = {
  id: string;
  first_name: string;
  last_name: string;
  phone: string | null;
  current_vehicle_id: string | null;
  status: string;
};

export type TodoVehicle = {
  id: string;
  license_plate: string;
  type: string;
  status: string;
  current_driver_id: string | null;
};

export type TodoWidgetData = {
  drivers: TodoDriver[];
  vehicles: TodoVehicle[];
};

// ---------------------------------------------------------------------------
// Derived issue lists
// ---------------------------------------------------------------------------

type Issue = {
  id: string;
  label: string;
  sub?: string;
  href: string;
  severity: "red" | "amber";
};

function deriveIssues(data: TodoWidgetData): Issue[] {
  const issues: Issue[] = [];

  for (const d of data.drivers) {
    if (!d.phone) {
      issues.push({
        id: `driver-nophone-${d.id}`,
        label: `${d.first_name} ${d.last_name}`,
        sub: "Keine Telefonnummer hinterlegt",
        href: "/drivers",
        severity: "amber",
      });
    }
    if (!d.current_vehicle_id && d.status !== "off" && d.status !== "sick") {
      issues.push({
        id: `driver-novehicle-${d.id}`,
        label: `${d.first_name} ${d.last_name}`,
        sub: "Kein Fahrzeug zugewiesen",
        href: "/drivers",
        severity: "amber",
      });
    }
  }

  for (const v of data.vehicles) {
    if (!v.current_driver_id) {
      issues.push({
        id: `vehicle-nodriver-${v.id}`,
        label: v.license_plate,
        sub: `${v.type} — kein Fahrer zugewiesen`,
        href: "/trucks",
        severity: "amber",
      });
    }
    if (v.status === "inactive" || v.status === "maintenance") {
      issues.push({
        id: `vehicle-status-${v.id}`,
        label: v.license_plate,
        sub: `Status: ${v.status === "maintenance" ? "Werkstatt" : "Inaktiv"} — bitte prüfen`,
        href: "/trucks",
        severity: "red",
      });
    }
  }

  return issues;
}

type Category = {
  key: string;
  label: string;
  icon: React.ElementType;
  issues: Issue[];
};

function categorize(issues: Issue[]): Category[] {
  const noPhone = issues.filter((i) => i.id.startsWith("driver-nophone"));
  const noVehicle = issues.filter((i) => i.id.startsWith("driver-novehicle"));
  const noDriver = issues.filter((i) => i.id.startsWith("vehicle-nodriver"));
  const needsReview = issues.filter((i) => i.id.startsWith("vehicle-status"));

  return [
    { key: "noPhone", label: "Fahrer ohne Telefonnummer", icon: PhoneOff, issues: noPhone },
    { key: "noVehicle", label: "Fahrer ohne Fahrzeug", icon: UserX, issues: noVehicle },
    { key: "noDriver", label: "Fahrzeuge ohne Fahrer", icon: Truck, issues: noDriver },
    { key: "needsReview", label: "Fahrzeuge in Werkstatt / inaktiv", icon: Wrench, issues: needsReview },
  ].filter((c) => c.issues.length > 0);
}

// ---------------------------------------------------------------------------
// Issue row
// ---------------------------------------------------------------------------

function IssueRow({ issue }: { issue: Issue }) {
  const colorClass =
    issue.severity === "red"
      ? "bg-red-50 hover:bg-red-100 border-red-200"
      : "bg-amber-50 hover:bg-amber-100 border-amber-200";
  const textClass = issue.severity === "red" ? "text-red-700" : "text-amber-700";

  return (
    <Link href={issue.href} className="block">
      <div
        className={`flex items-center justify-between px-3 py-2 rounded-lg border ${colorClass} transition-colors gap-3`}
      >
        <div className="min-w-0">
          <p className={`text-sm font-semibold truncate ${textClass}`}>{issue.label}</p>
          {issue.sub && (
            <p className="text-xs text-gray-500 truncate">{issue.sub}</p>
          )}
        </div>
        <Badge
          variant="outline"
          className={`shrink-0 text-xs ${
            issue.severity === "red"
              ? "border-red-300 text-red-600 bg-red-50"
              : "border-amber-300 text-amber-700 bg-amber-50"
          }`}
        >
          {issue.severity === "red" ? "Dringend" : "Offen"}
        </Badge>
      </div>
    </Link>
  );
}

// ---------------------------------------------------------------------------
// Category section (collapsible)
// ---------------------------------------------------------------------------

function CategorySection({ category }: { category: Category }) {
  const [open, setOpen] = useState(category.issues.length <= 4);
  const Icon = category.icon;
  const hasRed = category.issues.some((i) => i.severity === "red");

  return (
    <div
      className={`border rounded-lg overflow-hidden ${
        hasRed ? "border-red-200" : "border-amber-200"
      }`}
    >
      <button
        className={`w-full flex items-center justify-between px-4 py-3 transition-colors ${
          hasRed ? "bg-red-50 hover:bg-red-100" : "bg-amber-50 hover:bg-amber-100"
        }`}
        onClick={() => setOpen((o) => !o)}
      >
        <div className="flex items-center gap-2">
          <Icon
            className={`w-4 h-4 ${hasRed ? "text-red-600" : "text-amber-600"}`}
          />
          <span
            className={`text-sm font-semibold ${
              hasRed ? "text-red-900" : "text-amber-900"
            }`}
          >
            {category.label}
          </span>
          <Badge
            variant="secondary"
            className={`text-xs ${
              hasRed
                ? "bg-red-200 text-red-800"
                : "bg-amber-200 text-amber-800"
            }`}
          >
            {category.issues.length}
          </Badge>
        </div>
        <span className={`text-xs ${hasRed ? "text-red-400" : "text-amber-400"}`}>
          {open ? "▲" : "▼"}
        </span>
      </button>
      {open && (
        <div className="px-3 py-2 space-y-1.5 bg-white">
          {category.issues.map((issue) => (
            <IssueRow key={issue.id} issue={issue} />
          ))}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main widget
// ---------------------------------------------------------------------------

export function TodoWidget({ data }: { data: TodoWidgetData }) {
  const issues = deriveIssues(data);
  const categories = categorize(issues);
  const redCount = issues.filter((i) => i.severity === "red").length;
  const totalCount = issues.length;

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <AlertTriangle
              className={`w-5 h-5 ${redCount > 0 ? "text-red-500" : "text-amber-500"}`}
            />
            <CardTitle>Offene Aufgaben</CardTitle>
          </div>
          {totalCount > 0 ? (
            <div className="flex gap-1.5">
              {redCount > 0 && (
                <Badge className="bg-red-100 text-red-800 border-red-200">
                  {redCount} dringend
                </Badge>
              )}
              <Badge className="bg-amber-100 text-amber-800 border-amber-200">
                {totalCount} gesamt
              </Badge>
            </div>
          ) : (
            <Badge className="bg-green-100 text-green-700 border-green-200">
              Alles OK
            </Badge>
          )}
        </div>
      </CardHeader>
      <CardContent>
        {categories.length === 0 ? (
          <div className="flex items-center gap-3 p-4 bg-green-50 rounded-xl">
            <div className="w-8 h-8 rounded-full bg-green-100 flex items-center justify-center shrink-0">
              <span className="text-green-600 text-lg">✓</span>
            </div>
            <div>
              <p className="font-semibold text-green-800">Keine offenen Aufgaben</p>
              <p className="text-sm text-green-600">
                Alle Fahrer und Fahrzeuge sind vollständig konfiguriert.
              </p>
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            {categories.map((cat) => (
              <CategorySection key={cat.key} category={cat} />
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
