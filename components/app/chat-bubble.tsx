"use client";

import { motion } from "framer-motion";
import { Bot, User } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

type Variant = "lead" | "ai" | "agent" | "note";

interface ChatBubbleProps {
  variant: Variant;
  children: ReactNode;
  timestamp?: string;
  className?: string;
  isFirst?: boolean;
  isLast?: boolean;
  hideLabel?: boolean;
  hideTime?: boolean;
}

const ANIM_X: Record<Variant, number> = {
  lead: -10, ai: 10, agent: 10, note: 0,
};

const META: Record<Variant, { label: string; align: "start" | "end" | "center" }> = {
  lead:  { label: "Lead",       align: "start"  },
  ai:    { label: "Agendra IA", align: "end"    },
  agent: { label: "Você",       align: "end"    },
  note:  { label: "",           align: "center" },
};

function formatTime(dateStr?: string) {
  if (!dateStr) return "";
  return new Date(dateStr).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
}

export function ChatBubble({
  variant,
  children,
  timestamp,
  className,
  isFirst = true,
  isLast = true,
  hideLabel = false,
  hideTime = false,
}: ChatBubbleProps) {
  const x = ANIM_X[variant];
  const { label, align } = META[variant];

  // System note — centered pill
  if (variant === "note") {
    return (
      <motion.div
        initial={{ opacity: 0, y: 4 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex items-center gap-3 py-3 px-4"
      >
        <div className="h-px flex-1 bg-[#E4E4E7]" />
        <span className="shrink-0 text-[9px] font-bold uppercase tracking-[0.16em] text-[#71717A] bg-[#FEFCE8] px-3 py-1 rounded-full border border-[#FDE68A]">
          {children}
        </span>
        <div className="h-px flex-1 bg-[#E4E4E7]" />
      </motion.div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, x, scale: 0.97 }}
      animate={{ opacity: 1, x: 0, scale: 1 }}
      transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
      className={cn(
        "flex max-w-[85%] sm:max-w-[72%] flex-col gap-1",
        align === "end" ? "self-end items-end" : "self-start items-start",
        !isFirst && "-mt-2"
      )}
    >
      {/* Sender label */}
      {!hideLabel && (
        <div className="flex items-center gap-1.5 px-1.5 mb-0.5">
          {variant === "ai" && <Bot size={10} className="text-[#2563EB]" />}
          {variant === "agent" && <User size={10} className="text-[#71717A]" />}
          <span className="text-[9px] font-bold uppercase tracking-[0.14em] text-[#A1A1AA]">
            {label}
          </span>
        </div>
      )}

      {/* Bubble — soft card */}
      <div
        className={cn(
          "relative px-4 py-2.5 text-[13px] leading-relaxed transition-all duration-150",
          // Lead: white card, gray border, shadow
          variant === "lead" && [
            "bg-white text-[#09090B]",
            "border border-[#E4E4E7]",
            "shadow-[0_1px_4px_rgba(0,0,0,0.06)]",
            "rounded-[14px] rounded-tl-[3px]",
            !isLast && "rounded-bl-[3px]",
          ],
          // Agent (human): blue card
          variant === "agent" && [
            "bg-[#2563EB] text-white",
            "shadow-[0_2px_8px_rgba(37,99,235,0.22)]",
            "rounded-[14px] rounded-tr-[3px]",
            !isLast && "rounded-br-[3px]",
          ],
          // AI auto-sent: slightly lighter blue
          variant === "ai" && [
            "bg-[#3B82F6] text-white",
            "shadow-[0_2px_8px_rgba(59,130,246,0.20)]",
            "rounded-[14px] rounded-tr-[3px]",
            !isLast && "rounded-br-[3px]",
          ],
          className,
        )}
      >
        <div className="flex flex-col gap-1">
          <div>{children}</div>
          {timestamp && !hideTime && (
            <div className={cn(
              "self-end text-[9px] font-medium mt-1",
              variant === "lead" ? "text-[#A1A1AA]" : "text-white/60"
            )}>
              {formatTime(timestamp)}
            </div>
          )}
        </div>
      </div>
    </motion.div>
  );
}
