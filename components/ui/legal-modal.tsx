"use client";

import { useEffect, type ReactNode } from "react";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

interface LegalModalProps {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
}

export function LegalModal({ open, onClose, title, children }: LegalModalProps) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center sm:items-center"
      role="dialog"
      aria-modal="true"
      aria-label={title}
    >
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Panel */}
      <div
        className={cn(
          "relative z-10 flex max-h-[85vh] w-full flex-col overflow-hidden",
          "sm:max-w-2xl sm:rounded-2xl sm:shadow-xl",
          "rounded-t-2xl",
          "bg-white border border-[#E4E4E7]",
        )}
      >
        {/* Header */}
        <div className="flex shrink-0 items-center justify-between border-b border-[#E4E4E7] px-6 py-4">
          <h2 className="text-base font-semibold text-[#09090B]">{title}</h2>
          <button
            onClick={onClose}
            className="rounded-lg p-1 text-[#71717A] transition-colors hover:bg-[#F4F4F5] hover:text-[#09090B]"
            aria-label="Fechar"
          >
            <X size={18} />
          </button>
        </div>

        {/* Scrollable content */}
        <div className="overflow-y-auto px-6 py-5 text-sm leading-relaxed text-[#3F3F46]">
          {children}
        </div>
      </div>
    </div>
  );
}
