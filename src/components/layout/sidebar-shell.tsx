"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { LogOut, ChevronLeft, ChevronRight, Pencil, type LucideIcon } from "lucide-react";
import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";
import { PortalSwitcher } from "./portal-switcher";
import { UserRole } from "@/lib/types";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";

export interface NavItem {
  href: string;
  icon: LucideIcon;
  label: string;
}

interface SidebarShellProps {
  portalId: string;
  accentColor: string;   // e.g. "blue" | "red"
  navItems: NavItem[];
  adminItems?: NavItem[];
  userRole: UserRole;
  userName: string;
  userEmail: string;
}

const accentActive: Record<string, string> = {
  blue:  "bg-blue-600 text-white",
  red:   "bg-red-600 text-white",
  green: "bg-green-600 text-white",
  amber: "bg-amber-600 text-white",
};

const accentRoleText: Record<string, string> = {
  blue:  "text-blue-400",
  red:   "text-red-400",
  green: "text-green-400",
  amber: "text-amber-400",
};

export function SidebarShell({
  portalId,
  accentColor,
  navItems,
  adminItems = [],
  userRole,
  userName,
  userEmail,
}: SidebarShellProps) {
  const pathname = usePathname();
  const router = useRouter();
  const [collapsed, setCollapsed] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [displayName, setDisplayName] = useState(userName);
  const [nameInput, setNameInput] = useState(userName);
  const [nameSaving, setNameSaving] = useState(false);
  const [nameError, setNameError] = useState("");

  async function handleSaveName(e: React.FormEvent) {
    e.preventDefault();
    setNameSaving(true);
    setNameError("");
    const res = await fetch("/api/profile", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ full_name: nameInput }),
    });
    if (res.ok) {
      setDisplayName(nameInput);
      setProfileOpen(false);
      router.refresh();
    } else {
      const json = await res.json();
      setNameError(json.error ?? "Fehler beim Speichern.");
    }
    setNameSaving(false);
  }

  async function handleLogout() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/login");
  }

  const activeClass = accentActive[accentColor] ?? accentActive.blue;
  const roleClass = accentRoleText[accentColor] ?? accentRoleText.blue;

  return (
    <aside
      className={cn(
        "flex flex-col h-screen bg-gray-900 text-white transition-all duration-300 fixed left-0 top-0 z-40",
        collapsed ? "w-16" : "w-60"
      )}
    >
      {/* Portal Switcher (Logo + Dropdown) */}
      <div className="relative">
        <div className="flex items-center">
          <div className="flex-1 min-w-0">
            <PortalSwitcher currentPortalId={portalId} collapsed={collapsed} />
          </div>
          <button
            onClick={() => setCollapsed(!collapsed)}
            className="p-1 mr-3 rounded-md hover:bg-gray-700 text-gray-400 hover:text-white transition-colors flex-shrink-0"
          >
            {collapsed ? <ChevronRight className="w-4 h-4" /> : <ChevronLeft className="w-4 h-4" />}
          </button>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 p-3 space-y-1 overflow-y-auto">
        {navItems.map((item) => {
          const active = item.href === "/"
            ? pathname === "/"
            : pathname.startsWith(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-150",
                active ? activeClass : "text-gray-400 hover:bg-gray-800 hover:text-white",
                collapsed && "justify-center"
              )}
              title={collapsed ? item.label : undefined}
            >
              <item.icon className="w-5 h-5 flex-shrink-0" />
              {!collapsed && <span>{item.label}</span>}
            </Link>
          );
        })}

        {userRole === "admin" && adminItems.length > 0 && (
          <>
            {!collapsed ? (
              <div className="pt-4 pb-1 px-3">
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Admin</p>
              </div>
            ) : (
              <div className="border-t border-gray-700 my-2" />
            )}
            {adminItems.map((item) => {
              const active = pathname.startsWith(item.href);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={cn(
                    "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-150",
                    active ? activeClass : "text-gray-400 hover:bg-gray-800 hover:text-white",
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
          <div className="px-3 py-2 mb-1 flex items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="text-sm font-medium text-white truncate">{displayName}</p>
              <p className="text-xs text-gray-400 truncate">{userEmail}</p>
              <span className={cn("text-xs font-medium capitalize", roleClass)}>
                {userRole === "admin" ? "Administrator" : "Mitarbeiter"}
              </span>
            </div>
            <button
              onClick={() => { setNameInput(displayName); setProfileOpen(true); }}
              className="text-gray-500 hover:text-gray-300 flex-shrink-0 mt-0.5"
              title="Name bearbeiten"
            >
              <Pencil className="w-3.5 h-3.5" />
            </button>
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

      {/* Profile dialog */}
      <Dialog open={profileOpen} onOpenChange={setProfileOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Mein Profil</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSaveName} className="space-y-4 mt-2">
            <div className="space-y-1.5">
              <Label>Vollständiger Name</Label>
              <Input
                value={nameInput}
                onChange={(e) => setNameInput(e.target.value)}
                placeholder="Max Mustermann"
                autoFocus
                required
              />
            </div>
            <div className="space-y-1.5">
              <Label>E-Mail</Label>
              <Input value={userEmail} disabled className="text-gray-500" />
            </div>
            {nameError && (
              <p className="text-sm text-red-600">{nameError}</p>
            )}
            <div className="flex gap-3 justify-end">
              <Button type="button" variant="outline" onClick={() => setProfileOpen(false)}>Abbrechen</Button>
              <Button type="submit" disabled={nameSaving}>
                {nameSaving ? "Speichern..." : "Speichern"}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </aside>
  );
}
