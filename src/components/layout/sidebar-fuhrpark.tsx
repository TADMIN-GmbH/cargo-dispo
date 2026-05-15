"use client";

import { Fuel, Receipt, BarChart3, Settings, UserPlus } from "lucide-react";
import { SidebarShell } from "./sidebar-shell";
import { UserRole } from "@/lib/types";

const navItems = [
  { href: "/fuhrpark", icon: Fuel, label: "Kraftstoff & Maut" },
  { href: "/fuhrpark/kosten", icon: BarChart3, label: "Kostenanalyse" },
  { href: "/fuhrpark/reparaturen", icon: Receipt, label: "Reparaturen" },
];

const adminItems = [
  { href: "/team", icon: UserPlus, label: "Team verwalten" },
  { href: "/settings", icon: Settings, label: "Einstellungen" },
];

interface SidebarFuhrparkProps {
  userRole: UserRole;
  userName: string;
  userEmail: string;
}

export function SidebarFuhrpark({ userRole, userName, userEmail }: SidebarFuhrparkProps) {
  return (
    <SidebarShell
      portalId="fuhrpark"
      accentColor="red"
      navItems={navItems}
      adminItems={adminItems}
      userRole={userRole}
      userName={userName}
      userEmail={userEmail}
    />
  );
}
