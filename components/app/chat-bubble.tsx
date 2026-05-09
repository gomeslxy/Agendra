"use client";

import { motion } from "framer-motion";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

type Variant = "lead" | "ai" | "note";

interface ChatBubbleProps {
  variant: Variant;
  children: ReactNode;
  className?: string;
}

const STYLES: Record<Variant, string> = {
  lead:
    "self-start max-w-[60%] border border-white/[0.08] bg-white/[0.06] rounded-bl-md",
  ai:
    "self-end max-w-[60%] border border-white/20 bg-gradient-to-b from-[#2563EB] to-[#1D4ED8] text-white rounded-br-md shadow-[0_6px_18px_rgba(37,99,235,0.30)]",
  note:
    "self-stretch max-w-full text-center border border-[#14B8A6]/30 bg-[#14B8A6]/10 text-brand-teal-300 text-xs",
};

const BUBBLE_ANIM: Record<Variant, { x: number }> = {
  lead: { x: -10 },
  ai: { x: 10 },
  note: { x: 0 },
};

export function ChatBubble({ variant, children, className }: ChatBubbleProps) {
  const { x } = BUBBLE_ANIM[variant];
  return (
    <motion.div
      initial={{ opacity: 0, x, scale: 0.97 }}
      animate={{ opacity: 1, x: 0, scale: 1 }}
      transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
      className={cn(
        "rounded-[18px] px-3.5 py-2.5 text-sm leading-snug",
        STYLES[variant],
        className,
      )}
    >
      {children}
    </motion.div>
  );
}
