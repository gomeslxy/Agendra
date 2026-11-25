"use client";

import { useEffect, useRef } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { cn } from "@/lib/utils";

export interface AccessibleDialogProps {
  open: boolean;
  onClose: () => void;
  titleId: string;
  descriptionId?: string;
  variant?: "modal" | "drawer-right" | "sheet-bottom";
  className?: string;
  children: React.ReactNode;
}

export function Dialog({
  open,
  onClose,
  titleId,
  descriptionId,
  variant = "modal",
  className,
  children,
}: AccessibleDialogProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!open) return;

    previousFocusRef.current =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;

    const focusTimer = window.setTimeout(() => {
      const el = containerRef.current;
      if (!el) return;
      const focusable = el.querySelector<HTMLElement>(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
      );
      if (focusable) {
        focusable.focus();
      } else {
        el.focus();
      }
    }, 10);

    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.stopPropagation();
        onClose();
      }
    }

    document.addEventListener("keydown", handleKeyDown);
    return () => {
      window.clearTimeout(focusTimer);
      document.removeEventListener("keydown", handleKeyDown);
      previousFocusRef.current?.focus?.();
    };
  }, [open, onClose]);

  const panelMotion =
    variant === "drawer-right"
      ? {
          initial: { x: "100%" },
          animate: { x: 0 },
          exit: { x: "100%" },
          transition: { type: "spring" as const, stiffness: 380, damping: 38 },
        }
      : variant === "sheet-bottom"
        ? {
            initial: { y: "100%" },
            animate: { y: 0 },
            exit: { y: "100%" },
            transition: { type: "spring" as const, stiffness: 380, damping: 38 },
          }
        : {
            initial: { opacity: 0, scale: 0.96, y: 12 },
            animate: { opacity: 1, scale: 1, y: 0 },
            exit: { opacity: 0, scale: 0.96, y: 12 },
            transition: { type: "spring" as const, stiffness: 420, damping: 34 },
          };

  const positionClass =
    variant === "drawer-right"
      ? "fixed right-0 top-0 bottom-0 z-[71] w-full max-w-md border-l border-[#E4E4E7] bg-white shadow-[-8px_0_32px_rgba(0,0,0,0.08)]"
      : variant === "sheet-bottom"
        ? "fixed bottom-0 left-0 right-0 z-[71] rounded-t-3xl border-t border-[#E4E4E7] bg-white shadow-[0_-8px_32px_rgba(0,0,0,0.10)]"
        : "relative z-[71] w-full max-w-md rounded-2xl border border-[#E4E4E7] bg-white shadow-xl";

  return (
    <AnimatePresence>
      {open && (
        <div
          className={cn(
            variant === "modal"
              ? "fixed inset-0 z-[70] flex items-center justify-center p-4"
              : "fixed inset-0 z-[70]",
          )}
        >
          <motion.div
            key="dialog-backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 bg-black/40 backdrop-blur-[2px]"
            aria-hidden="true"
          />
          <motion.div
            ref={containerRef}
            key="dialog-panel"
            role="dialog"
            aria-modal="true"
            aria-labelledby={titleId}
            aria-describedby={descriptionId}
            tabIndex={-1}
            {...panelMotion}
            className={cn(positionClass, "outline-none", className)}
          >
            {children}
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
