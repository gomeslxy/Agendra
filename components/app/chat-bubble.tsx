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

function formatTime(dateStr?: string) {
  if (!dateStr) return "";
  const date = new Date(dateStr);
  return date.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
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

  if (variant === "note") {
    return (
      <motion.div
        initial={{ opacity: 0, y: 4 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex items-center gap-3 py-4 px-6"
      >
        <div className="h-px flex-1 bg-white/[0.03]" />
        <span className="shrink-0 text-[9px] font-black uppercase tracking-[0.2em] text-white/20 bg-white/[0.03] px-3 py-1 rounded-full border border-white/[0.05]">
          {children}
        </span>
        <div className="h-px flex-1 bg-white/[0.03]" />
      </motion.div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, x, scale: 0.96 }}
      animate={{ opacity: 1, x: 0, scale: 1 }}
      transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
      className={cn(
        "flex max-w-[85%] sm:max-w-[72%] flex-col gap-1 transition-all duration-300",
        align === "end" ? "self-end items-end" : "self-start items-start",
        !isFirst && "-mt-2"
      )}
    >
      {/* sender label */}
      {!hideLabel && (
        <div className="flex items-center gap-1.5 px-1.5 mb-0.5">
          {variant === "ai" && (
            <Bot size={10} className="text-blue-400 opacity-70" />
          )}
          {variant === "agent" && (
            <User size={10} className="text-emerald-400 opacity-70" />
          )}
          <span className="text-[9px] font-bold uppercase tracking-[0.15em] opacity-30">
            {label}
          </span>
        </div>
      )}

      {/* bubble */}
      <div
        className={cn(
          "relative group overflow-hidden px-4 py-2.5 text-[13px] leading-relaxed transition-all duration-300",
          "rounded-[1.25rem]", // Default rounded
          
          variant === "lead" && [
            "bg-white/[0.05] text-white/90",
            "border border-white/[0.08]",
            "shadow-lg shadow-black/10",
            "rounded-tl-sm", // Always sharp top-left to connect or be the tail
            !isLast && "rounded-bl-sm", // Sharp bottom-left if not last
            isLast && "rounded-bl-[1.25rem]", // Rounded bottom-left if last
          ],
          
          (variant === "ai" || variant === "agent") && [
            "text-white border border-white/10",
            "rounded-tr-sm", // Always sharp top-right to connect or be the tail
            !isLast && "rounded-br-sm", // Sharp bottom-right if not last
            isLast && "rounded-br-[1.25rem]", // Rounded bottom-right if last
          ],

          variant === "ai" && [
            "bg-gradient-to-br from-brand-blue-600 to-brand-blue-800",
            "shadow-xl shadow-brand-blue-900/20",
          ],
          
          variant === "agent" && [
            "bg-gradient-to-br from-emerald-600 to-emerald-800",
            "shadow-xl shadow-emerald-900/20",
          ],

          className,
        )}
      >
        <div className="flex flex-col gap-1">
          <div>{children}</div>
          {timestamp && !hideTime && (
            <div className={cn(
              "self-end text-[9px] font-medium opacity-40 mt-1",
              (variant === "ai" || variant === "agent") && "opacity-70"
            )}>
              {formatTime(timestamp)}
            </div>
          )}
        </div>
      </div>
    </motion.div>
  );
}
