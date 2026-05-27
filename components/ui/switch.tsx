"use client";

import { motion } from "framer-motion";
import { cn } from "@/lib/utils";

interface SwitchProps {
  checked: boolean;
  onChange: (v: boolean) => void;
  label?: string;
  disabled?: boolean;
}

export function Switch({ checked, onChange, label, disabled }: SwitchProps) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => !disabled && onChange(!checked)}
      className={cn(
        "relative h-5 w-9 rounded-full border transition-colors",
        disabled ? "opacity-50 cursor-not-allowed" : "cursor-pointer",
        checked
          ? "border-[#2563EB]/50 bg-gradient-to-b from-[#2563EB] to-[#1D4ED8]"
          : "border-white/10 bg-white/[0.08]",
      )}
    >
      <motion.span
        layout
        transition={{ type: "spring", stiffness: 500, damping: 30 }}
        className="absolute top-1/2 h-3.5 w-3.5 -translate-y-1/2 rounded-full bg-white"
        style={{ left: checked ? 18 : 2 }}
      />
    </button>
  );
}
