"use client";

import React, { useRef, useEffect, useState } from "react";
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
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [opacity, setOpacity] = useState(0);

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!ref.current) return;

    const div = ref.current;
    const rect = div.getBoundingClientRect();

    setPosition({ x: e.clientX - rect.left, y: e.clientY - rect.top });
  };

  const handleMouseEnter = () => {
    setOpacity(1);
  };

  const handleMouseLeave = () => {
    setOpacity(0);
  };

  return (
    <motion.div
      ref={ref}
      onMouseMove={handleMouseMove}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      initial={{ opacity: 0, y: 20 }}
      animate={isInView ? { opacity: 1, y: 0 } : { opacity: 0, y: 20 }}
      transition={{ duration: 0.5, delay: index * 0.1 }}
      className={cn(
        "group relative overflow-hidden rounded-3xl border border-white/5 bg-white/[0.02] p-8",
        "after:absolute after:inset-0 after:rounded-[inherit] after:border after:border-white/10 after:content-['']",
        "shadow-[0_8px_32px_0_rgba(0,0,0,0.36)] backdrop-blur-md transition-all duration-300",
        className
      )}
    >
      <div
        className="pointer-events-none absolute -inset-px opacity-0 transition duration-300"
        style={{
          opacity,
          background: `radial-gradient(600px circle at ${position.x}px ${position.y}px, rgba(59, 130, 246, 0.1), transparent 40%)`,
        }}
      />
      <div className="relative z-10">
        <div className="mb-4 inline-flex h-12 w-12 items-center justify-center rounded-2xl border border-white/10 bg-white/5 text-brand-blue-400 transition-colors group-hover:border-brand-blue-400/50 group-hover:bg-brand-blue-400/10">
          {icon}
        </div>
        <h3 className="mb-2 text-xl font-bold tracking-tight text-white">{title}</h3>
        <p className="text-sm leading-relaxed text-fg-2">{description}</p>
      </div>

      {/* Decorative gradient */}
      <div className="pointer-events-none absolute -right-12 -top-12 h-64 w-64 rounded-full bg-brand-blue-600/5 blur-[80px] transition-opacity group-hover:opacity-100" />
    </motion.div>
  );
}
