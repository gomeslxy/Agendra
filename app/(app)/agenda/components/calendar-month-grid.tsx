"use client";

import { useMemo } from "react";
import { motion } from "framer-motion";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { DOW, GCAL_INDIGO, HEAT_COLOR, MONTHS, type AgendaEvent } from "./agenda-types";

interface CalendarMonthGridProps {
  viewYear: number;
  viewMonth: number;
  selectedDay: number;
  today: Date;
  eventsByDay: Record<number, AgendaEvent[]>;
  onSelectDay: (day: number) => void;
  onNavMonth: (delta: number) => void;
}

export function CalendarMonthGrid({
  viewYear,
  viewMonth,
  selectedDay,
  today,
  eventsByDay,
  onSelectDay,
  onNavMonth,
}: CalendarMonthGridProps) {
  const cells = useMemo(() => {
    const first = new Date(viewYear, viewMonth, 1);
    const startDow = first.getDay();
    const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
    const prevDays = new Date(viewYear, viewMonth, 0).getDate();

    const arr: { d: number; muted: boolean }[] = [];
    for (let i = 0; i < startDow; i++) {
      arr.push({ d: prevDays - startDow + 1 + i, muted: true });
    }
    for (let d = 1; d <= daysInMonth; d++) arr.push({ d, muted: false });
    while (arr.length % 7 !== 0) {
      arr.push({ d: arr.length - daysInMonth - startDow + 1, muted: true });
    }
    return arr;
  }, [viewYear, viewMonth]);

  return (
    <div className="border border-[#E4E4E7] bg-white rounded-xl p-3 sm:p-5 shadow-sm">
      <div className="mb-4 flex items-center gap-3">
        <div className="flex-1 text-base font-semibold text-[#09090B] sm:text-lg">
          {MONTHS[viewMonth]} {viewYear}
        </div>
        <div className="flex gap-1">
          <button
            type="button"
            onClick={() => onNavMonth(-1)}
            className="grid h-8 w-8 place-items-center rounded-lg border border-[#E4E4E7] bg-[#F4F4F5] text-[#71717A] transition hover:bg-[#E4E4E7] hover:text-[#09090B]"
            aria-label="Mês anterior"
          >
            <ChevronLeft size={16} />
          </button>
          <button
            type="button"
            onClick={() => onNavMonth(1)}
            className="grid h-8 w-8 place-items-center rounded-lg border border-[#E4E4E7] bg-[#F4F4F5] text-[#71717A] transition hover:bg-[#E4E4E7] hover:text-[#09090B]"
            aria-label="Próximo mês"
          >
            <ChevronRight size={16} />
          </button>
        </div>
      </div>

      <div className="grid grid-cols-7 gap-1 sm:gap-1.5">
        {DOW.map((d) => (
          <div
            key={d}
            className="py-1 text-center font-mono text-[9px] font-medium uppercase tracking-[0.12em] text-[#A1A1AA] sm:text-[10px] sm:tracking-[0.16em]"
          >
            {d}
          </div>
        ))}
        {cells.map((c, i) => {
          const evs = !c.muted ? eventsByDay[c.d] || [] : [];
          const isToday =
            !c.muted &&
            c.d === today.getDate() &&
            viewMonth === today.getMonth() &&
            viewYear === today.getFullYear();
          const isSel = !c.muted && c.d === selectedDay;
          return (
            <motion.button
              key={i}
              type="button"
              whileHover={c.muted ? undefined : { scale: 1.02 }}
              transition={{ type: "spring", stiffness: 400, damping: 28 }}
              onClick={() => !c.muted && onSelectDay(c.d)}
              className={cn(
                "flex min-h-[60px] cursor-pointer flex-col gap-1 rounded-xl border p-1.5 text-left sm:min-h-[80px] sm:p-2",
                "border-[#E4E4E7] bg-white transition-colors",
                !c.muted && "hover:bg-[#F4F4F5]",
                c.muted && "opacity-30 cursor-default",
                isToday && !isSel && "border-[#BFDBFE] bg-[#EFF6FF]",
                isSel && "border-[#2563EB] bg-[#DBEAFE] shadow-[0_0_0_2px_rgba(37,99,235,0.1)]",
              )}
            >
              <span className={cn("text-[11px] font-semibold sm:text-[13px]", isSel ? "text-[#1D4ED8]" : "text-[#09090B]")}>
                {c.d}
              </span>
              <div className="flex flex-wrap gap-1 mt-auto pb-0.5 select-none max-h-3 overflow-hidden">
                {evs.map((e, j) => {
                  const color = e.source === "gcal" ? GCAL_INDIGO : HEAT_COLOR[e.leads?.status ?? "cold"];
                  return (
                    <span
                      key={j}
                      className="h-1.5 w-1.5 rounded-full shrink-0"
                      style={{ backgroundColor: color }}
                      title={e.title}
                    />
                  );
                })}
              </div>
            </motion.button>
          );
        })}
      </div>
    </div>
  );
}
