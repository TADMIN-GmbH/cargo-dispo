"use client";

import { useState, useRef, useEffect } from "react";
import Link from "next/link";
import Image from "next/image";
import { ChevronDown, Check } from "lucide-react";
import { portals, type Portal } from "@/lib/portals";
import { cn } from "@/lib/utils";

interface PortalSwitcherProps {
  currentPortalId: string;
  collapsed: boolean;
}

const accentBg: Record<string, string> = {
  blue:  "bg-blue-600",
  red:   "bg-red-600",
  green: "bg-green-600",
  amber: "bg-amber-600",
};

const accentText: Record<string, string> = {
  blue:  "text-blue-400",
  red:   "text-red-400",
  green: "text-green-400",
  amber: "text-amber-400",
};

const accentBorder: Record<string, string> = {
  blue:  "border-blue-500",
  red:   "border-red-500",
  green: "border-green-500",
  amber: "border-amber-500",
};

export function PortalSwitcher({ currentPortalId, collapsed }: PortalSwitcherProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const current = portals.find((p) => p.id === currentPortalId) ?? portals[0];

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, []);

  return (
    <div ref={ref} className="relative">
      {/* Trigger */}
      <div className="flex items-center justify-between p-4 border-b border-gray-700">
        {!collapsed ? (
          <button
            onClick={() => setOpen(!open)}
            className="flex items-center gap-2 flex-1 min-w-0 group"
          >
            <div className="w-8 h-8 bg-white rounded-lg flex items-center justify-center overflow-hidden flex-shrink-0">
              <Image src="/ck-logo.png" alt="CK" width={32} height={32} className="object-contain" />
            </div>
            <div className="flex-1 min-w-0 text-left">
              <p className="text-sm font-bold text-white leading-tight truncate">Cargo Köhler</p>
              <p className={cn("text-xs font-medium truncate flex items-center gap-1", accentText[current.accentColor])}>
                {current.label}
                <ChevronDown className={cn("w-3 h-3 transition-transform", open && "rotate-180")} />
              </p>
            </div>
          </button>
        ) : (
          <button
            onClick={() => setOpen(!open)}
            className="w-8 h-8 bg-white rounded-lg flex items-center justify-center overflow-hidden mx-auto"
          >
            <Image src="/ck-logo.png" alt="CK" width={32} height={32} className="object-contain" />
          </button>
        )}
      </div>

      {/* Dropdown */}
      {open && (
        <div className={cn(
          "absolute top-full left-0 z-50 mt-1 bg-gray-800 border border-gray-700 rounded-xl shadow-xl overflow-hidden",
          collapsed ? "left-14 -top-2 w-48" : "w-56 mx-2 left-0 right-0"
        )}>
          <div className="p-1.5">
            <p className="px-2 py-1 text-xs text-gray-500 font-medium uppercase tracking-wider">
              Portal wechseln
            </p>
            {portals.map((portal: Portal) => {
              const isActive = portal.id === currentPortalId;
              const Icon = portal.icon;
              return (
                <Link
                  key={portal.id}
                  href={portal.href}
                  onClick={() => setOpen(false)}
                  className={cn(
                    "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all",
                    isActive
                      ? cn("text-white", accentBg[portal.accentColor])
                      : "text-gray-300 hover:bg-gray-700 hover:text-white"
                  )}
                >
                  <Icon className="w-4 h-4 flex-shrink-0" />
                  <span className="flex-1">{portal.label}</span>
                  {isActive && <Check className="w-4 h-4" />}
                </Link>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
