"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CalendarDays, ChevronLeft, ChevronRight, Check } from "lucide-react";
import { Button } from "@/components/ui/button";

function todayStr() {
  return new Date().toISOString().split("T")[0];
}

function shiftDay(date: string, delta: number) {
  const d = new Date(date + "T00:00:00");
  d.setDate(d.getDate() + delta);
  return d.toISOString().split("T")[0];
}

export function DateSelector({ value }: { value: string }) {
  const router = useRouter();

  // appliedDate = what's actually active (confirmed)
  // draftDate   = what the user has typed but not yet applied
  const [appliedDate, setAppliedDate] = useState(value);
  const [draftDate,   setDraftDate]   = useState(value);

  const isDirty  = draftDate !== appliedDate;
  const isToday  = appliedDate === todayStr();

  function apply(date: string) {
    document.cookie = `app_date=${date}; path=/; max-age=86400`;
    setAppliedDate(date);
    setDraftDate(date);
    router.refresh();
  }

  return (
    <div className="flex items-center gap-1">
      <Button
        variant="ghost" size="icon"
        className="h-8 w-8 text-gray-400 hover:text-gray-700"
        onClick={() => apply(shiftDay(appliedDate, -1))}
      >
        <ChevronLeft className="w-4 h-4" />
      </Button>

      <div className="flex items-center gap-2 px-3 py-1.5 bg-white border border-gray-200 rounded-lg">
        <CalendarDays className="w-4 h-4 text-gray-400 shrink-0" />
        <input
          type="date"
          value={draftDate}
          onChange={e => e.target.value && setDraftDate(e.target.value)}
          onKeyDown={e => e.key === "Enter" && isDirty && apply(draftDate)}
          className="text-sm font-medium text-gray-700 bg-transparent outline-none cursor-pointer"
        />
      </div>

      {isDirty ? (
        <Button size="sm" className="h-8 gap-1.5" onClick={() => apply(draftDate)}>
          <Check className="w-3.5 h-3.5" />
          Übernehmen
        </Button>
      ) : (
        <Button
          variant="ghost" size="icon"
          className="h-8 w-8 text-gray-400 hover:text-gray-700"
          onClick={() => apply(shiftDay(appliedDate, 1))}
        >
          <ChevronRight className="w-4 h-4" />
        </Button>
      )}

      {!isToday && !isDirty && (
        <Button
          variant="ghost" size="sm"
          className="text-xs text-blue-500 hover:text-blue-700"
          onClick={() => apply(todayStr())}
        >
          Heute
        </Button>
      )}
    </div>
  );
}
