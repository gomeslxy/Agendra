"use client";

import React, { useRef } from "react";
import { motion, useInView } from "framer-motion";
import { cn } from "@/lib/utils";

export interface BentoItemProps {
  title: string;
  description: string;
  icon: React.ReactNode;
  className?: string;
  index?: number;
}

export function BentoGrid({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={cn("grid grid-cols-1 md:grid-cols-6 gap-4", className)}>
      {children}
    </div>
  );
}

export function BentoCard({ title, description, icon, className, index = 0 }: BentoItemProps) {
  const ref = useRef<HTMLDivElement>(null);
  const isInView = useInView(ref, { once: true, amount: 0.2 });

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    const el = ref.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    el.style.setProperty("--bento-x", `${e.clientX - rect.left}px`);
    el.style.setProperty("--bento-y", `${e.clientY - rect.top}px`);
  };

  return (
    <motion.div
      ref={ref}
      onMouseMove={handleMouseMove}
      initial={{ opacity: 0, y: 20 }}
      animate={isInView ? { opacity: 1, y: 0 } : { opacity: 0, y: 20 }}
      transition={{ duration: 0.5, delay: index * 0.1 }}
      className={cn(
        "group relative overflow-hidden rounded-3xl border border-[#E4E4E7] bg-white p-8",
        "shadow-sm transition-all duration-300 hover:shadow-md hover:border-[#D4D4D8]",
        className
      )}
    >
      {/* Radial highlight via CSS vars — no getBoundingClientRect on every event */}
      <div
        className="pointer-events-none absolute -inset-px opacity-0 transition duration-300 group-hover:opacity-100"
        style={{
          background: "radial-gradient(600px circle at var(--bento-x, 50%) var(--bento-y, 50%), rgba(37,99,235,0.05), transparent 40%)",
        }}
      />
      <div className="relative z-10">
        <div className="mb-4 inline-flex h-12 w-12 items-center justify-center rounded-2xl border border-[#E4E4E7] bg-[#F4F4F5] text-brand-blue-600 transition-colors group-hover:border-brand-blue-500/50 group-hover:bg-[#EFF6FF]">
          {icon}
        </div>
        <h3 className="mb-2 text-xl font-bold tracking-tight text-[#09090B]">{title}</h3>
        <p className="text-sm leading-relaxed text-fg-2">{description}</p>
      </div>

      <div className="pointer-events-none absolute -right-12 -top-12 h-64 w-64 rounded-full bg-brand-blue-600/5 blur-[80px] transition-opacity group-hover:opacity-100" />
    </motion.div>
  );
}
