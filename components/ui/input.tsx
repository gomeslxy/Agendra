import * as React from "react";
import { cn } from "@/lib/utils";

export interface InputProps
  extends React.InputHTMLAttributes<HTMLInputElement> {
  icon?: React.ReactNode;
}

const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, type, icon, ...props }, ref) => {
    return (
      <div className="relative group w-full">
        {icon && (
          <div className="absolute left-3.5 top-1/2 -translate-y-1/2 text-fg-3 transition-colors group-focus-within:text-brand-blue-400">
            {icon}
          </div>
        )}
        <input
          type={type}
          className={cn(
            "input w-full",
            icon && "pl-10",
            className
          )}
          ref={ref}
          {...props}
        />
      </div>
    );
  }
);
Input.displayName = "Input";

export { Input };
