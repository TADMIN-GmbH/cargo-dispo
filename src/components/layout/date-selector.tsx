"use client";

import { useState, useEffect } from "react";
import { useRouter, usePathname } from "next/navigation";
import { CalendarDays, ChevronLeft, ChevronRight, Check } from "lucide-react";
import { Button } from "@/components/ui/button";

interface DateSelectorProps {
  value: string; // YYYY-MM-DD
}

function todayStr() {
  return new Date().toISOString().split("T")[0];
}

function shiftDay(current: string, delta: number) {
  const d = new Date(current + "T00:00:00");
  d.setDate(d.getDate() + delta);
  return d.toISOString().split("T")[0];
}

export function DateSelector({ value }: DateSelectorProps) {
  const router = useRouter();
  const pathname = usePathname();
  const [localDate, setLocalDate] = useState(value);
  const isDirty = localDate !== value;

  useEffect(() => {
    setLocalDate(value);
  }, [value]);
  const isToday = value === todayStr();

  function applyDate(date: string) {
    document.cookie = `app_date=${date}; path=/; max-age=86400`;
    router.push(pathname);
    router.refresh();
  }

  return (
    <div className="flex items-center gap-1">
      <Button
        variant="ghost" size="icon"
        className="h-8 w-8 text-gray-400 hover:text-gray-700"
        onClick={() => applyDate(shiftDay(value, -1))}
      >
        <ChevronLeft className="w-4 h-4" />
      </Button>

      <div className="flex items-center gap-2 px-3 py-1.5 bg-white border border-gray-200 rounded-lg">
        <CalendarDays className="w-4 h-4 text-gray-400 shrink-0" />
        <input
          type="date"
          value={localDate}
          onChange={e => e.target.value && setLocalDate(e.target.value)}
          className="text-sm font-medium text-gray-700 bg-transparent outline-none cursor-pointer"
        />
      </div>

      {isDirty ? (
        <Button size="sm" className="h-8 gap-1.5" onClick={() => applyDate(localDate)}>
          <Check className="w-3.5 h-3.5" />
          Übernehmen
        </Button>
      ) : (
        <Button
          variant="ghost" size="icon"
          className="h-8 w-8 text-gray-400 hover:text-gray-700"
          onClick={() => applyDate(shiftDay(value, 1))}
        >
          <ChevronRight className="w-4 h-4" />
        </Button>
      )}

      {!isToday && !isDirty && (
        <Button
          variant="ghost" size="sm"
          className="text-xs text-blue-500 hover:text-blue-700"
          onClick={() => applyDate(todayStr())}
        >
          Heute
        </Button>
      )}
    </div>
  );
}
