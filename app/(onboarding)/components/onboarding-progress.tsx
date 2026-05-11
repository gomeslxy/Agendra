"use client";

import { motion } from "framer-motion";

interface OnboardingProgressProps {
  current: number; // 1-indexed (current step number, e.g. 1 out of 5)
  total: number;   // 5
}

export function OnboardingProgress({ current, total }: OnboardingProgressProps) {
  return (
    <div className="w-full h-1.5 bg-white/10 rounded-full overflow-hidden">
      <motion.div
        className="h-full bg-gradient-to-r from-orange-500 to-orange-400 rounded-full"
        animate={{ width: `${(current / total) * 100}%` }}
        transition={{ type: "spring", stiffness: 200, damping: 30 }}
      />
    </div>
  );
}
