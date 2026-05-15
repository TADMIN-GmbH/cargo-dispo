"use client";

import {
  Truck,
  Users,
  Building2,
  LayoutDashboard,
  MapPin,
  MessageSquare,
  Settings,
  UserPlus,
  Receipt,
  Route,
  Wrench,
} from "lucide-react";
import { SidebarShell } from "./sidebar-shell";
import { UserRole } from "@/lib/types";

const navItems = [
  { href: "/", icon: LayoutDashboard, label: "Dashboard" },
  { href: "/trucks", icon: Truck, label: "Fahrzeuge" },
  { href: "/drivers", icon: Users, label: "Fahrer" },
  { href: "/customers", icon: Building2, label: "Kunden" },
  { href: "/tours", icon: MapPin, label: "Touren" },
  { href: "/whatsapp", icon: MessageSquare, label: "WhatsApp" },
  { href: "/gutschriften", icon: Receipt, label: "Gutschriften" },
  { href: "/km-auswertung", icon: Route, label: "KM-Auswertung" },
  { href: "/reparaturen", icon: Wrench, label: "Reparaturen" },
];

const adminItems = [
  { href: "/team", icon: UserPlus, label: "Team verwalten" },
  { href: "/settings", icon: Settings, label: "Einstellungen" },
];

interface SidebarProps {
  userRole: UserRole;
  userName: string;
  userEmail: string;
}

export function Sidebar({ userRole, userName, userEmail }: SidebarProps) {
  return (
    <SidebarShell
      portalId="dispo"
      accentColor="blue"
      navItems={navItems}
      adminItems={adminItems}
      userRole={userRole}
      userName={userName}
      userEmail={userEmail}
    />
  );
}
