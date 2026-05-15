"use client";

import { createContext, useContext } from "react";

export type AccentColor = "blue" | "red" | "green" | "amber";

interface PortalContextValue {
  accentColor: AccentColor;
  portalId: string;
}

const PortalContext = createContext<PortalContextValue>({
  accentColor: "blue",
  portalId: "dispo",
});

export function PortalProvider({
  accentColor,
  portalId,
  children,
}: PortalContextValue & { children: React.ReactNode }) {
  return (
    <PortalContext.Provider value={{ accentColor, portalId }}>
      {children}
    </PortalContext.Provider>
  );
}

export function usePortal() {
  return useContext(PortalContext);
}

// Tailwind class maps — static strings so purge doesn't remove them
export const accentClasses = {
  button: {
    blue:  "bg-blue-600 hover:bg-blue-700 text-white",
    red:   "bg-red-600 hover:bg-red-700 text-white",
    green: "bg-green-600 hover:bg-green-700 text-white",
    amber: "bg-amber-600 hover:bg-amber-700 text-white",
  },
  iconBg: {
    blue:  "bg-blue-100 text-blue-600",
    red:   "bg-red-100 text-red-600",
    green: "bg-green-100 text-green-600",
    amber: "bg-amber-100 text-amber-600",
  },
  tab: {
    blue:  "border-blue-600 text-blue-600",
    red:   "border-red-600 text-red-600",
    green: "border-green-600 text-green-600",
    amber: "border-amber-600 text-amber-600",
  },
  text: {
    blue:  "text-blue-600",
    red:   "text-red-600",
    green: "text-green-600",
    amber: "text-amber-600",
  },
  ring: {
    blue:  "focus:ring-blue-500",
    red:   "focus:ring-red-500",
    green: "focus:ring-green-500",
    amber: "focus:ring-amber-500",
  },
} as const;
