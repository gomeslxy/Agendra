"use client";

import { motion } from "framer-motion";

/**
 * Per-route template — re-mounts on every navigation inside (app).
 * Replaces the prior AnimatePresence wrapper in AppShell, which used
 * `mode="wait"` and could block new content from appearing while the
 * old route's exit animation was running.
 *
 * No `exit` variant here on purpose: with templates, Next unmounts
 * the previous tree as soon as navigation commits, so we only animate
 * the entrance of the new route.
 */
export default function AppTemplate({ children }: { children: React.ReactNode }) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.12, ease: [0.22, 1, 0.36, 1] }}
      className="absolute inset-0 overflow-hidden"
    >
      {children}
    </motion.div>
  );
}
