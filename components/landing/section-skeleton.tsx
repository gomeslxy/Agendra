// components/landing/section-skeleton.tsx
import React from "react";

/**
 * Placeholder shown during hydration of lazy-loaded landing sections.
 * min-height aligned to typical section height to prevent CLS.
 */
export function SectionSkeleton({ minHeight = 350 }: { minHeight?: number }) {
  return (
    <div
      className="w-full flex items-center justify-center opacity-10"
      style={{ minHeight: `${minHeight}px` }}
      aria-hidden="true"
    >
      <div className="h-6 w-6 rounded-full border-2 border-white/20 border-t-white animate-spin" />
    </div>
  );
}
