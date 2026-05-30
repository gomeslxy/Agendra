"use client";

import { useEffect, useState } from "react";

/**
 * Per-route template — re-mounts on every navigation inside (app).
 * Pure-CSS opacity fade (replaces the former framer-motion wrapper) so
 * framer is no longer on the critical path of EVERY app navigation —
 * cuts main-thread work and improves INP across the whole dashboard.
 *
 * No exit variant: with templates, Next unmounts the previous tree as soon
 * as navigation commits, so we only animate the entrance of the new route.
 */
export default function AppTemplate({ children }: { children: React.ReactNode }) {
  const [shown, setShown] = useState(false);

  useEffect(() => {
    const raf = requestAnimationFrame(() => setShown(true));
    return () => cancelAnimationFrame(raf);
  }, []);

  return (
    <div
      className={`absolute inset-0 overflow-hidden transition-opacity duration-150 ease-[cubic-bezier(0.22,1,0.36,1)] ${
        shown ? "opacity-100" : "opacity-0"
      }`}
    >
      {children}
    </div>
  );
}
