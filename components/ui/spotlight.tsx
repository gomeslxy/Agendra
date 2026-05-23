import { cn } from "@/lib/utils";

interface SpotlightCSSProps {
  className?: string;
}

/** GPU-accelerated spotlight via CSS radial-gradient — replaces the heavy SVG feGaussianBlur version. */
export function SpotlightCSS({ className }: SpotlightCSSProps) {
  return (
    <div
      aria-hidden
      className={cn(
        "pointer-events-none absolute z-[1] h-[60%] w-[80%] opacity-0 animate-spotlight",
        className,
      )}
      style={{
        background:
          "radial-gradient(ellipse 60% 50% at 50% 0%, rgba(59,130,246,0.28), transparent 80%)",
        filter: "blur(40px)",
        willChange: "opacity, transform",
      }}
    />
  );
}

/** @deprecated Use SpotlightCSS instead — SVG feGaussianBlur is CPU-only */
export const Spotlight = SpotlightCSS;
