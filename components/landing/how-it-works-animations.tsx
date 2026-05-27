"use client";

import { motion } from "framer-motion";

/* ─── Container stagger variants ────────────────────────────── */
const containerVariants = {
  hidden: {},
  show: {
    transition: {
      staggerChildren: 0.12,
    },
  },
};

/** Wraps the entire HowItWorks section with a whileInView motion.section */
export function HowItWorksWrapper({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <motion.section
      id="como-funciona"
      className="relative py-24"
      aria-label="Como funciona"
      variants={containerVariants}
      initial="hidden"
      whileInView="show"
      viewport={{ once: true, margin: "-100px" }}
    >
      {children}
    </motion.section>
  );
}

/** Item fade-up variant wrapper — used by header block and StepCard */
const itemVariants = {
  hidden: { opacity: 0, y: 22 },
  show: {
    opacity: 1,
    y: 0,
    transition: {
      duration: 0.55,
      ease: [0.22, 1, 0.36, 1] as [number, number, number, number],
    },
  },
};

export function HowItWorksItemMotion({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <motion.div variants={itemVariants} className={className}>
      {children}
    </motion.div>
  );
}

/** Animated connector beam between step cards (desktop only) */
interface ConnectorProps {
  index: number;
  total: number;
  fromColor: string;
  toColor: string;
  toGlow: string;
}

export function ConnectorClient({
  index,
  total,
  fromColor,
  toColor,
  toGlow,
}: ConnectorProps) {
  if (index >= total - 1) return null;

  return (
    <div className="relative h-[2px] w-full self-center overflow-hidden" aria-hidden>
      <div className="absolute inset-0 rounded-full bg-gradient-to-r from-white/[0.08] to-white/[0.04]" />
      <motion.div
        className="absolute inset-y-0 left-0 rounded-full"
        style={{
          background: `linear-gradient(90deg, ${fromColor}, ${toColor})`,
        }}
        initial={{ width: "0%" }}
        whileInView={{ width: "100%" }}
        viewport={{ once: true, margin: "-60px" }}
        transition={{ duration: 0.9, ease: [0.22, 1, 0.36, 1], delay: 0.3 + index * 0.18 }}
      />
      <motion.div
        className="absolute top-1/2 h-2.5 w-2.5 -translate-y-1/2 rounded-full will-change-transform"
        style={{
          background: toColor,
          boxShadow: `0 0 10px ${toGlow}`,
          left: 0,
        }}
        initial={{ x: 0, opacity: 0 }}
        whileInView={{
          x: [0, 30],
          opacity: [0, 1, 1, 0],
        }}
        viewport={{ once: true, amount: 0.4 }}
        transition={{
          duration: 2,
          ease: "linear",
          repeat: 3,
          delay: 1.2 + index * 0.6,
          repeatDelay: 1.5,
        }}
      />
    </div>
  );
}
