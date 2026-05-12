"use client";

import { useRouter } from "next/navigation";
import { CalendarDays } from "lucide-react";
import { Button } from "@/components/ui/button";

interface DateSelectorProps {
  value: string; // YYYY-MM-DD
}

const today = () => new Date().toISOString().split("T")[0];

export function DateSelector({ value }: DateSelectorProps) {
  const router = useRouter();

  function setDate(date: string) {
    document.cookie = `app_date=${date}; path=/; max-age=86400`;
    router.refresh();
  }

  const isToday = value === today();

  const displayLabel = isToday
    ? "Heute"
    : new Date(value + "T00:00:00").toLocaleDateString("de-DE", {
        weekday: "short",
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
      });

  return (
    <div className="flex items-center gap-2">
      {!isToday && (
        <Button variant="ghost" size="sm" className="text-xs text-gray-400 hover:text-gray-700" onClick={() => setDate(today())}>
          Heute
        </Button>
      )}
      <div className="flex items-center gap-2 bg-white border border-gray-200 rounded-lg px-3 py-1.5 hover:bg-gray-50 transition-colors">
        <CalendarDays className="w-4 h-4 text-gray-400 shrink-0 pointer-events-none" />
        <input
          type="date"
          value={value}
          onChange={e => e.target.value && setDate(e.target.value)}
          className="text-sm font-medium text-gray-700 bg-transparent outline-none cursor-pointer"
        />
      </div>
    </div>
  );
}
