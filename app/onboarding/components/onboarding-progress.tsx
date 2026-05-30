"use client";

import { motion } from "framer-motion";

interface OnboardingProgressProps {
  current: number; // 1-indexed
  total: number;
}

export function OnboardingProgress({ current, total }: OnboardingProgressProps) {
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-1.5 bg-[#F4F4F5] rounded-full overflow-hidden">
        <motion.div
          className="h-full bg-gradient-to-r from-orange-500 to-orange-400 rounded-full"
          animate={{ width: `${(current / total) * 100}%` }}
          transition={{ type: "spring", stiffness: 200, damping: 30 }}
        />
      </div>
      <span className="text-xs text-[#71717A] tabular-nums shrink-0">{current}/{total}</span>
    </div>
  );
}
