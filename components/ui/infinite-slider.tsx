import { cn } from "@/lib/utils";
import type { ReactNode } from "react";

type InfiniteSliderProps = {
  children: ReactNode;
  gap?: number;
  duration?: number;
  className?: string;
};

export function InfiniteSlider({
  children,
  gap = 16,
  duration = 25,
  className,
}: InfiniteSliderProps) {
  return (
    <div className={cn("overflow-hidden", className)}>
      <div
        className="flex w-max animate-ticker"
        style={{
          gap: `${gap}px`,
          animationDuration: `${duration}s`,
        }}
      >
        {children}
        {children}
      </div>
    </div>
  );
}
