"use client";

import { cn } from "@/lib/utils";
import { SafeClientOnly } from "@/components/ui/safe-client-only";

function formatSeparatorDate(dateStr: string): string {
  const d = new Date(dateStr);
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const msgDay = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const diffDays = Math.round((today.getTime() - msgDay.getTime()) / 86400000);

  if (diffDays === 0) return "Hoje";
  if (diffDays === 1) return "Ontem";
  if (diffDays < 7) {
    return d.toLocaleDateString("pt-BR", { weekday: "long" });
  }
  if (diffDays <= 365) {
    return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "short" });
  }
  return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "short", year: "numeric" });
}

interface DateSeparatorProps {
  date: string;
  className?: string;
}

export function DateSeparator({ date, className }: DateSeparatorProps) {
  return (
    <div className={cn("flex items-center gap-3 py-2 select-none", className)}>
      <div className="h-px flex-1 bg-[#E4E4E7]" />
      <span className="shrink-0 text-[9px] font-bold uppercase tracking-[0.16em] text-[#A1A1AA]">
        <SafeClientOnly fallback="—">
          {formatSeparatorDate(date)}
        </SafeClientOnly>
      </span>
      <div className="h-px flex-1 bg-[#E4E4E7]" />
    </div>
  );
}
