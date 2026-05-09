"use client";

import { motion, useReducedMotion } from "framer-motion";
import type { ReactNode } from "react";
import { stagger } from "./variants";

interface StaggerGroupProps {
  children: ReactNode;
  className?: string;
  delay?: number;
  staggerChildren?: number;
}

export function StaggerGroup({
  children,
  className,
  delay = 0.05,
  staggerChildren = 0.1,
}: StaggerGroupProps) {
  const reduce = useReducedMotion();
  if (reduce) return <div className={className}>{children}</div>;

  return (
    <motion.div
      className={className}
      variants={stagger(delay, staggerChildren)}
      initial="hidden"
      whileInView="show"
      viewport={{ once: true, margin: "-60px" }}
    >
      {children}
    </motion.div>
  );
}
