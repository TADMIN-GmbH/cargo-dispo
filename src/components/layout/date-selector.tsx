"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { CalendarDays, ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";

interface DateSelectorProps {
  value: string; // YYYY-MM-DD
}

const todayStr = () => new Date().toISOString().split("T")[0];

export function DateSelector({ value }: DateSelectorProps) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [localDate, setLocalDate] = useState(value);

  function applyDate(date: string) {
    if (!date) return;
    document.cookie = `app_date=${date}; path=/; max-age=86400`;
    router.refresh();
  }

  function changeDay(delta: number) {
    const d = new Date(localDate + "T00:00:00");
    d.setDate(d.getDate() + delta);
    const next = d.toISOString().split("T")[0];
    setLocalDate(next);
    applyDate(next);
  }

  function openPicker() {
    try {
      (inputRef.current as any)?.showPicker();
    } catch {
      inputRef.current?.click();
    }
  }

  const isToday = localDate === todayStr();

  const displayLabel = new Date(localDate + "T00:00:00").toLocaleDateString("de-DE", {
    weekday: "short",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });

  return (
    <div className="flex items-center gap-1">
      <Button variant="ghost" size="icon" className="h-8 w-8 text-gray-400 hover:text-gray-700" onClick={() => changeDay(-1)}>
        <ChevronLeft className="w-4 h-4" />
      </Button>

      <button
        onClick={openPicker}
        className="flex items-center gap-2 px-3 py-1.5 text-sm font-medium text-gray-700 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors min-w-[160px] justify-center"
      >
        <CalendarDays className="w-4 h-4 text-gray-400 shrink-0" />
        {isToday ? "Heute" : displayLabel}
      </button>

      {/* hidden native date input – opened via showPicker() */}
      <input
        ref={inputRef}
        type="date"
        value={localDate}
        onChange={e => {
          if (!e.target.value) return;
          setLocalDate(e.target.value);
          applyDate(e.target.value);
        }}
        className="sr-only"
      />

      <Button variant="ghost" size="icon" className="h-8 w-8 text-gray-400 hover:text-gray-700" onClick={() => changeDay(1)}>
        <ChevronRight className="w-4 h-4" />
      </Button>

      {!isToday && (
        <Button
          variant="ghost" size="sm"
          className="text-xs text-blue-500 hover:text-blue-700 ml-1"
          onClick={() => { setLocalDate(todayStr()); applyDate(todayStr()); }}
        >
          Heute
        </Button>
      )}
    </div>
  );
}
