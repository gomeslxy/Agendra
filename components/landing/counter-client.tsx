"use client";

import { useEffect, useRef } from "react";

export function CounterClient({
  to,
  duration = 1200,
  suffix = "",
}: {
  to: number;
  duration?: number;
  suffix?: string;
}) {
  const ref = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    // Native reduced-motion detection — avoids pulling framer-motion into the bundle
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const useInt = to >= 10;
    if (reduce) {
      node.textContent = `${useInt ? Math.round(to) : to.toFixed(1)}${suffix}`;
      return;
    }
    let raf: number;
    const start = performance.now();
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - t, 3);
      const v = to * eased;
      node.textContent = `${useInt ? Math.round(v) : v.toFixed(1)}${suffix}`;
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [to, duration, suffix]);

  return <span ref={ref}>{to >= 10 ? Math.round(to) : to.toFixed(1)}{suffix}</span>;
}
