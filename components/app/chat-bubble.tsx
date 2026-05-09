"use client";

import { motion } from "framer-motion";
import { Bot, User } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

type Variant = "lead" | "ai" | "agent" | "note";

interface ChatBubbleProps {
  variant: Variant;
  children: ReactNode;
  className?: string;
}

const ANIM_X: Record<Variant, number> = {
  lead:  -12,
  ai:     12,
  agent:  12,
  note:    0,
};

const META: Record<Variant, { label: string; align: "start" | "end" | "center" }> = {
  lead:  { label: "Lead",       align: "start"  },
  ai:    { label: "Agendra IA", align: "end"    },
  agent: { label: "Você",       align: "end"    },
  note:  { label: "",           align: "center" },
};

export function ChatBubble({ variant, children, className }: ChatBubbleProps) {
  const x = ANIM_X[variant];
  const { label, align } = META[variant];

  if (variant === "note") {
    return (
      <motion.div
        initial={{ opacity: 0, scale: 0.96 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.18 }}
        className="flex items-center gap-3 py-1"
      >
        <div className="h-px flex-1 bg-white/[0.06]" />
        <span className="shrink-0 text-[11px] font-medium italic text-white/30">
          {children}
        </span>
        <div className="h-px flex-1 bg-white/[0.06]" />
      </motion.div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, x, scale: 0.96 }}
      animate={{ opacity: 1, x: 0, scale: 1 }}
      transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
      className={cn(
        "flex max-w-[72%] flex-col gap-1",
        align === "end" ? "self-end items-end" : "self-start items-start",
      )}
    >
      {/* sender label */}
      <div className="flex items-center gap-1.5 px-1">
        {variant === "ai" && (
          <Bot size={10} className="text-blue-400 opacity-70" />
        )}
        {variant === "agent" && (
          <User size={10} className="text-emerald-400 opacity-70" />
        )}
        <span className="text-[10px] font-medium uppercase tracking-widest opacity-40">
          {label}
        </span>
      </div>

      {/* bubble */}
      <div
        className={cn(
          "rounded-[18px] px-4 py-2.5 text-sm leading-relaxed",
          variant === "lead" && [
            "rounded-tl-sm",
            "bg-white/[0.07] text-white/90",
            "border border-white/[0.09]",
            "shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]",
          ],
          variant === "ai" && [
            "rounded-tr-sm",
            "bg-gradient-to-br from-[#2563EB] to-[#1A3FA6] text-white",
            "border border-blue-400/20",
            "shadow-[0_4px_20px_rgba(37,99,235,0.35),inset_0_1px_0_rgba(255,255,255,0.15)]",
          ],
          variant === "agent" && [
            "rounded-tr-sm",
            "bg-gradient-to-br from-[#059669] to-[#065F46] text-white",
            "border border-emerald-400/20",
            "shadow-[0_4px_20px_rgba(5,150,105,0.30),inset_0_1px_0_rgba(255,255,255,0.12)]",
          ],
          className,
        )}
      >
        {children}
      </div>
    </motion.div>
  );
}
