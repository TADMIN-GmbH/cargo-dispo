"use client";

import { CalendarDays, ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";

interface DateSelectorProps {
  value: string; // YYYY-MM-DD
}

function todayStr() {
  return new Date().toISOString().split("T")[0];
}

function navigate(date: string) {
  document.cookie = `app_date=${date}; path=/; max-age=86400`;
  window.location.reload();
}

function shiftDay(current: string, delta: number) {
  const d = new Date(current + "T00:00:00");
  d.setDate(d.getDate() + delta);
  return d.toISOString().split("T")[0];
}

export function DateSelector({ value }: DateSelectorProps) {
  const isToday = value === todayStr();

  const label = new Date(value + "T00:00:00").toLocaleDateString("de-DE", {
    weekday: "short",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });

  return (
    <div className="flex items-center gap-1">
      <Button
        variant="ghost" size="icon"
        className="h-8 w-8 text-gray-400 hover:text-gray-700"
        onClick={() => navigate(shiftDay(value, -1))}
      >
        <ChevronLeft className="w-4 h-4" />
      </Button>

      <div className="relative flex items-center gap-2 px-3 py-1.5 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors cursor-pointer">
        <CalendarDays className="w-4 h-4 text-gray-400 pointer-events-none" />
        <span className="text-sm font-medium text-gray-700 pointer-events-none">
          {isToday ? "Heute" : label}
        </span>
        <input
          type="date"
          defaultValue={value}
          onChange={e => e.target.value && navigate(e.target.value)}
          className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
        />
      </div>

      <Button
        variant="ghost" size="icon"
        className="h-8 w-8 text-gray-400 hover:text-gray-700"
        onClick={() => navigate(shiftDay(value, 1))}
      >
        <ChevronRight className="w-4 h-4" />
      </Button>

      {!isToday && (
        <Button
          variant="ghost" size="sm"
          className="text-xs text-blue-500 hover:text-blue-700"
          onClick={() => navigate(todayStr())}
        >
          Heute
        </Button>
      )}
    </div>
  );
}
