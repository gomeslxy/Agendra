import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

type Heat = "hot" | "warm" | "cold" | "success" | "neutral";

const HEAT_CLS: Record<Heat, string> = {
  hot:     "text-[#F97316] border-[#F97316]/40 bg-[#F97316]/10",
  warm:    "text-[#F59E0B] border-[#F59E0B]/40 bg-[#F59E0B]/10",
  cold:    "text-[#60A5FA] border-[#60A5FA]/40 bg-[#60A5FA]/10",
  success: "text-brand-teal-300 border-brand-teal-500/40 bg-brand-teal-500/10",
  neutral: "text-fg-2 border-white/10 bg-white/[0.04]",
};

interface BadgeProps {
  variant?: Heat;
  children?: ReactNode;
  className?: string;
  withDot?: boolean;
}

export function Badge({
  variant = "neutral",
  children,
  className,
  withDot = true,
}: BadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium",
        HEAT_CLS[variant],
        className,
      )}
    >
      {withDot && (
        <span
          className="h-1.5 w-1.5 rounded-full"
          style={{ background: "currentColor" }}
        />
      )}
      {children}
    </span>
  );
}
