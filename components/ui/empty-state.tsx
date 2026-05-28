"use client";

import { motion } from "framer-motion";
import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

interface EmptyStateProps {
  icon: LucideIcon;
  title: string;
  description: string;
  action?: ReactNode;
  className?: string;
}

export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  className,
}: EmptyStateProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 12, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: -12, scale: 0.98 }}
      transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
      className={cn(
        "glass flex flex-col items-center justify-center p-8 text-center max-w-lg mx-auto my-6 relative overflow-hidden",
        className
      )}
    >
      {/* Decorative Aurora Glow behind icon */}
      <div className="absolute -top-12 left-1/2 -translate-x-1/2 w-32 h-32 rounded-full opacity-20 blur-2xl pointer-events-none bg-radial from-brand-blue-500 to-transparent" />
      <div className="absolute -top-12 left-1/2 -translate-x-1/2 w-24 h-24 rounded-full opacity-15 blur-xl pointer-events-none bg-radial from-brand-teal-500 to-transparent" />

      {/* Pulsing automation DNA style accent line */}
      <div className="absolute top-0 inset-x-10 h-[1px] bg-gradient-to-r from-transparent via-brand-teal-500/40 to-transparent animate-pulse" />

      <div className="relative mb-5 flex h-14 w-14 items-center justify-center rounded-2xl border border-white/[0.08] bg-white/[0.03] text-brand-blue-400 shadow-inner">
        <Icon size={26} className="relative z-10 text-brand-blue-400" />
      </div>

      <h3 className="relative z-10 text-[16px] font-bold tracking-tight text-white mb-2 leading-none">
        {title}
      </h3>
      
      <p className="relative z-10 text-[13px] leading-relaxed max-w-xs mb-6 text-white/50">
        {description}
      </p>

      {action && (
        <div className="relative z-10 flex justify-center">
          {action}
        </div>
      )}
    </motion.div>
  );
}
