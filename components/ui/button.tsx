"use client";

import { forwardRef, type ButtonHTMLAttributes, useState, useEffect } from "react";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";

type Variant = "primary" | "secondary" | "ghost" | "blue";
type Size = "sm" | "md" | "lg" | "icon";

interface ButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, "ref"> {
  variant?: Variant;
  size?: Size;
  pulse?: boolean;
}

const VARIANT: Record<Variant, string> = {
  primary:
    "text-white border-white/20 bg-gradient-to-b from-[#FB923C] via-[#F97316] to-[#EA580C] " +
    "[box-shadow:var(--shadow-glow-orange),inset_0_1px_0_rgba(255,255,255,0.35)] " +
    "hover:[box-shadow:var(--shadow-glow-orange),inset_0_1px_0_rgba(255,255,255,0.45),0_18px_50px_rgba(249,115,22,0.5)]",
  secondary:
    "text-white bg-white/[0.06] border-white/[0.14] backdrop-blur-md hover:bg-white/[0.10]",
  ghost: "text-white bg-transparent border-transparent hover:bg-white/[0.04]",
  blue:
    "text-white border-white/20 bg-gradient-to-b from-[#3B82F6] to-[#2563EB] " +
    "[box-shadow:var(--shadow-glow-blue),inset_0_1px_0_rgba(255,255,255,0.30)]",
};

const SIZE: Record<Size, string> = {
  sm: "px-3 py-1.5 text-xs",
  md: "px-5 py-3 text-sm",
  lg: "px-6 py-3.5 text-base",
  icon: "p-0 flex items-center justify-center",
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ variant = "secondary", size = "md", pulse, className, children, ...rest }, ref) => {
    const [mounted, setMounted] = useState(false);

    useEffect(() => {
      setMounted(true);
    }, []);

    const classNames = cn(
      "inline-flex items-center gap-2.5 rounded-full border font-medium leading-none cursor-pointer select-none isolate",
      "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400/60 focus-visible:ring-offset-2 focus-visible:ring-offset-ink-950",
      "transition-[box-shadow,background,filter] duration-200",
      VARIANT[variant],
      SIZE[size],
      pulse && "pulse-cta",
      className,
    );

    if (!mounted) {
      return (
        <button
          ref={ref}
          className={classNames}
          {...rest}
        >
          {children}
        </button>
      );
    }

    return (
      <motion.button
        ref={ref}
        whileHover={{ y: -1, filter: "brightness(1.05)" }}
        whileTap={{ scale: 0.98, y: 0 }}
        transition={{ type: "spring", stiffness: 400, damping: 28 }}
        className={classNames}
        {...(rest as React.ComponentProps<typeof motion.button>)}
      >
        {children}
      </motion.button>
    );
  },
);
Button.displayName = "Button";
