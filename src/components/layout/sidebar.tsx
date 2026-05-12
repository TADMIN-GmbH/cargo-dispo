"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import {
  Truck,
  Users,
  Building2,
  LayoutDashboard,
  MapPin,
  MessageSquare,
  Settings,
  UserPlus,
  LogOut,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";
import { UserRole } from "@/lib/types";

const navItems = [
  { href: "/", icon: LayoutDashboard, label: "Dashboard" },
  { href: "/trucks", icon: Truck, label: "Fahrzeuge" },
  { href: "/drivers", icon: Users, label: "Fahrer" },
  { href: "/customers", icon: Building2, label: "Kunden" },
  { href: "/tours", icon: MapPin, label: "Touren" },
  { href: "/whatsapp", icon: MessageSquare, label: "WhatsApp" },
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
  const pathname = usePathname();
  const router = useRouter();
  const [collapsed, setCollapsed] = useState(false);

  async function handleLogout() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/login");
  }

  return (
    <aside
      className={cn(
        "flex flex-col h-screen bg-gray-900 text-white transition-all duration-300 fixed left-0 top-0 z-40",
        collapsed ? "w-16" : "w-60"
      )}
    >
      {/* Logo */}
      <div className="flex items-center justify-between p-4 border-b border-gray-700">
        {!collapsed && (
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-white rounded-lg flex items-center justify-center overflow-hidden">
              <Image src="/ck-logo.png" alt="CK" width={32} height={32} className="object-contain" />
            </div>
            <div>
              <p className="text-sm font-bold text-white leading-tight">Cargo Köhler</p>
              <p className="text-xs text-gray-400">Disposition</p>
            </div>
          </div>
        )}
        {collapsed && (
          <div className="w-8 h-8 bg-white rounded-lg flex items-center justify-center overflow-hidden mx-auto">
            <Image src="/ck-logo.png" alt="CK" width={32} height={32} className="object-contain" />
          </div>
        )}
        <button
          onClick={() => setCollapsed(!collapsed)}
          className={cn(
            "p-1 rounded-md hover:bg-gray-700 text-gray-400 hover:text-white transition-colors",
            collapsed && "mx-auto mt-2"
          )}
        >
          {collapsed ? <ChevronRight className="w-4 h-4" /> : <ChevronLeft className="w-4 h-4" />}
        </button>
      </div>

      {/* Nav */}
      <nav className="flex-1 p-3 space-y-1 overflow-y-auto">
        {navItems.map((item) => {
          const active = pathname === item.href;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-150",
                active
                  ? "bg-blue-600 text-white"
                  : "text-gray-400 hover:bg-gray-800 hover:text-white",
                collapsed && "justify-center"
              )}
              title={collapsed ? item.label : undefined}
            >
              <item.icon className="w-5 h-5 flex-shrink-0" />
              {!collapsed && <span>{item.label}</span>}
            </Link>
          );
        })}

        {userRole === "admin" && (
          <>
            {!collapsed && (
              <div className="pt-4 pb-1 px-3">
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
                  Admin
                </p>
              </div>
            )}
            {collapsed && <div className="border-t border-gray-700 my-2" />}
            {adminItems.map((item) => {
              const active = pathname === item.href;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={cn(
                    "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-150",
                    active
                      ? "bg-blue-600 text-white"
                      : "text-gray-400 hover:bg-gray-800 hover:text-white",
                    collapsed && "justify-center"
                  )}
                  title={collapsed ? item.label : undefined}
                >
                  <item.icon className="w-5 h-5 flex-shrink-0" />
                  {!collapsed && <span>{item.label}</span>}
                </Link>
              );
            })}
          </>
        )}
      </nav>

      {/* User */}
      <div className="p-3 border-t border-gray-700">
        {!collapsed && (
          <div className="px-3 py-2 mb-1">
            <p className="text-sm font-medium text-white truncate">{userName}</p>
            <p className="text-xs text-gray-400 truncate">{userEmail}</p>
            <span className="text-xs font-medium text-blue-400 capitalize">
              {userRole === "admin" ? "Administrator" : "Mitarbeiter"}
            </span>
          </div>
        )}
        <button
          onClick={handleLogout}
          className={cn(
            "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-gray-400 hover:bg-gray-800 hover:text-red-400 transition-all w-full",
            collapsed && "justify-center"
          )}
          title={collapsed ? "Abmelden" : undefined}
        >
          <LogOut className="w-5 h-5 flex-shrink-0" />
          {!collapsed && <span>Abmelden</span>}
        </button>
      </div>
    </aside>
  );
}
