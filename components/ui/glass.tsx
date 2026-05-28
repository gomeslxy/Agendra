import type { HTMLAttributes, ReactNode } from "react";
import { cn } from "@/lib/utils";

interface GlassProps extends HTMLAttributes<HTMLDivElement> {
  children?: ReactNode;
  strong?: boolean;
}

export function Glass({ children, className, strong, ...rest }: GlassProps) {
  return (
    <div className={cn("card", strong && "card-elevated", className)} {...rest}>
      {children}
    </div>
  );
}
