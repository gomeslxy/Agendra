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

export function EmptyState({ icon: Icon, title, description, action, className }: EmptyStateProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 10, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
      className={cn(
        "flex flex-col items-center justify-center p-8 text-center max-w-sm mx-auto my-6",
        className
      )}
    >
      <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-xl border border-[#E4E4E7] bg-[#F4F4F5] text-[#A1A1AA]">
        <Icon size={22} />
      </div>
      <h3 className="text-[15px] font-bold tracking-tight text-[#09090B] mb-2">
        {title}
      </h3>
      <p className="text-[13px] leading-relaxed text-[#71717A] mb-5 max-w-xs">
        {description}
      </p>
      {action && <div>{action}</div>}
    </motion.div>
  );
}
