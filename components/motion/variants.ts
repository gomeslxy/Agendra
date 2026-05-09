import type { Variants, Transition } from "framer-motion";

// Detect reduced-motion preference once at module load (SSR-safe)
const prefersReducedMotion =
  typeof window !== "undefined" &&
  window.matchMedia("(prefers-reduced-motion: reduce)").matches;

export const easeOutExpo: Transition["ease"] = [0.22, 1, 0.36, 1];
export const easeSoft: Transition["ease"] = [0.4, 0, 0.2, 1];

export const fadeUp: Variants = {
  hidden: { opacity: 0, y: 16 },
  show: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.7, ease: easeOutExpo },
  },
};

export const fadeIn: Variants = {
  hidden: { opacity: 0 },
  show: { opacity: 1, transition: { duration: 0.5, ease: easeSoft } },
};

export const slideRight: Variants = {
  hidden: { opacity: 0, x: -20 },
  show: { opacity: 1, x: 0, transition: { duration: 0.6, ease: easeOutExpo } },
};

export const stagger = (delay = 0.04, staggerChildren = 0.06): Variants => ({
  hidden: {},
  show: {
    transition: {
      delayChildren: delay,
      staggerChildren,
    },
  },
});

// Pure opacity — no Y movement = zero perceived delay on route change
export const pageTransition: Variants = prefersReducedMotion
  ? {
      hidden: { opacity: 0 },
      show: { opacity: 1, transition: { duration: 0.01 } },
      exit: { opacity: 0, transition: { duration: 0.01 } },
    }
  : {
      hidden: { opacity: 0 },
      show: { opacity: 1, transition: { duration: 0.1, ease: easeOutExpo } },
      exit: { opacity: 0, transition: { duration: 0.06, ease: easeSoft } },
    };

export const slideFromLeft: Variants = {
  hidden: { opacity: 0, x: -12 },
  show: { opacity: 1, x: 0, transition: { duration: 0.22, ease: easeOutExpo } },
  exit: { opacity: 0, x: -12, transition: { duration: 0.1, ease: easeSoft } },
};

export const slideFromRight: Variants = {
  hidden: { opacity: 0, x: 12 },
  show: { opacity: 1, x: 0, transition: { duration: 0.22, ease: easeOutExpo } },
  exit: { opacity: 0, x: 12, transition: { duration: 0.1, ease: easeSoft } },
};

export const scaleIn: Variants = {
  hidden: { opacity: 0, scale: 0.96 },
  show: { opacity: 1, scale: 1, transition: { duration: 0.18, ease: easeOutExpo } },
  exit: { opacity: 0, scale: 0.96, transition: { duration: 0.1, ease: easeSoft } },
};

export const hoverLift = {
  whileHover: { y: -2 },
  whileTap: { scale: 0.98 },
  transition: { type: "spring" as const, stiffness: 400, damping: 28 },
};
