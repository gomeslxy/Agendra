import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

type Heat = "hot" | "warm" | "cold" | "success" | "neutral";

const HEAT_CLS: Record<Heat, string> = {
  hot:     "text-[#C2410C] border-[#FED7AA] bg-[#FFF7ED]",
  warm:    "text-[#854D0E] border-[#FDE68A] bg-[#FEFCE8]",
  cold:    "text-[#1D4ED8] border-[#BFDBFE] bg-[#EFF6FF]",
  success: "text-[#166534] border-[#BBF7D0] bg-[#F0FDF4]",
  neutral: "text-[#71717A] border-[#E4E4E7] bg-[#F4F4F5]",
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
        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-semibold",
        HEAT_CLS[variant],
        className,
      )}
    >
      {withDot && (
        <span className="h-1.5 w-1.5 rounded-full" style={{ background: "currentColor" }} />
      )}
      {children}
    </span>
  );
}
