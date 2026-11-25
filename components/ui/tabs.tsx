"use client";

import { useRef } from "react";
import { cn } from "@/lib/utils";

export interface TabItem<T extends string = string> {
  id: T;
  label: string;
  badge?: string | number;
  disabled?: boolean;
}

interface TabsProps<T extends string = string> {
  items: TabItem<T>[];
  value: T;
  onChange: (value: T) => void;
  ariaLabel?: string;
  className?: string;
}

export function Tabs<T extends string = string>({
  items,
  value,
  onChange,
  ariaLabel = "Abas",
  className,
}: TabsProps<T>) {
  const listRef = useRef<HTMLDivElement>(null);

  function handleKeyDown(e: React.KeyboardEvent<HTMLButtonElement>, index: number) {
    const enabled = items.filter((item) => !item.disabled);
    if (enabled.length === 0) return;

    let nextIndex = -1;
    if (e.key === "ArrowRight") {
      nextIndex = (index + 1) % items.length;
    } else if (e.key === "ArrowLeft") {
      nextIndex = (index - 1 + items.length) % items.length;
    } else if (e.key === "Home") {
      nextIndex = 0;
    } else if (e.key === "End") {
      nextIndex = items.length - 1;
    }

    if (nextIndex >= 0 && !items[nextIndex]?.disabled) {
      e.preventDefault();
      onChange(items[nextIndex].id);
      const buttons = listRef.current?.querySelectorAll<HTMLButtonElement>('[role="tab"]');
      buttons?.[nextIndex]?.focus();
    }
  }

  return (
    <div
      ref={listRef}
      role="tablist"
      aria-label={ariaLabel}
      className={cn(
        "flex items-center gap-1 overflow-x-auto rounded-xl border border-[#E4E4E7] bg-[#F4F4F5] p-1 scrollbar-none",
        className,
      )}
    >
      {items.map((item, idx) => {
        const selected = item.id === value;
        return (
          <button
            key={item.id}
            type="button"
            role="tab"
            id={`tab-${item.id}`}
            aria-selected={selected}
            aria-controls={`tabpanel-${item.id}`}
            tabIndex={selected ? 0 : -1}
            disabled={item.disabled}
            onClick={() => onChange(item.id)}
            onKeyDown={(e) => handleKeyDown(e, idx)}
            className={cn(
              "flex shrink-0 items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-all outline-none focus-visible:ring-2 focus-visible:ring-[#2563EB]/40",
              selected
                ? "bg-white text-[#09090B] shadow-xs"
                : "text-[#71717A] hover:text-[#09090B]",
              item.disabled && "cursor-not-allowed opacity-50",
            )}
          >
            <span>{item.label}</span>
            {item.badge !== undefined && (
              <span
                className={cn(
                  "rounded-full px-1.5 py-0.5 font-mono text-[10px] font-semibold",
                  selected ? "bg-[#EFF6FF] text-[#2563EB]" : "bg-[#E4E4E7] text-[#52525B]",
                )}
              >
                {item.badge}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
