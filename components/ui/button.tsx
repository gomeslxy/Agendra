"use client";

import { forwardRef, type ButtonHTMLAttributes } from "react";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";

type Variant = "primary" | "secondary" | "ghost" | "blue" | "orange";
type Size = "sm" | "md" | "lg" | "icon";

interface ButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, "ref"> {
  variant?: Variant;
  size?: Size;
  pulse?: boolean;
}

const VARIANT: Record<Variant, string> = {
  // Orange = conversion CTA (Assinar, Upgrade, Novo lead)
  orange:
    "text-white bg-[#F97316] border-transparent " +
    "hover:bg-[#EA580C] shadow-[0_2px_8px_rgba(249,115,22,0.22)] " +
    "hover:shadow-[0_4px_16px_rgba(249,115,22,0.30)]",
  // Blue = primary navigation action
  primary:
    "text-white bg-[#2563EB] border-transparent " +
    "hover:bg-[#1D4ED8] shadow-[0_2px_8px_rgba(37,99,235,0.22)] " +
    "hover:shadow-[0_4px_16px_rgba(37,99,235,0.28)]",
  // Secondary = subtle framed button
  secondary:
    "text-[#3F3F46] bg-white border-[#E4E4E7] " +
    "hover:bg-[#F4F4F5] hover:border-[#D4D4D8]",
  // Ghost = icon buttons, contextual actions
  ghost:
    "text-[#71717A] bg-transparent border-transparent " +
    "hover:bg-[#F4F4F5] hover:text-[#3F3F46]",
  // Blue alias kept for backward compat
  blue:
    "text-white bg-[#2563EB] border-transparent " +
    "hover:bg-[#1D4ED8] shadow-[0_2px_8px_rgba(37,99,235,0.22)]",
};

const SIZE: Record<Size, string> = {
  sm: "px-3 py-1.5 text-xs",
  md: "px-4 py-2 text-sm",
  lg: "px-5 py-2.5 text-base",
  icon: "p-0 flex items-center justify-center",
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ variant = "secondary", size = "md", pulse, className, children, ...rest }, ref) => {
    const classNames = cn(
      "inline-flex items-center gap-2 rounded-lg border font-semibold leading-none cursor-pointer select-none isolate",
      "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2563EB]/40 focus-visible:ring-offset-2 focus-visible:ring-offset-white",
      "transition-[box-shadow,background,filter,border-color] duration-150",
      "disabled:opacity-50 disabled:pointer-events-none",
      VARIANT[variant],
      SIZE[size],
      pulse && "pulse-cta",
      className,
    );

    return (
      <motion.button
        ref={ref}
        initial={false}
        whileHover={{ y: -1 }}
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
