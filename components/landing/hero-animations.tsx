"use client";

import React from "react";
import Link from "next/link";
import { ArrowRight, Play } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ShinyButton } from "@/components/ui/shiny-button";
import { trackEvent } from "@/lib/analytics";

// CSS-driven fade-up — zero hydration cost, h1 (LCP element) visible immediately
export function HeroLeftAnimation({ children }: { children: React.ReactNode }) {
  return <div className="animate-hero-left">{children}</div>;
}

// CSS-driven scale-in — replaces former motion.div to remove framer-motion from Hero LCP path
export function HeroRightAnimation({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={`animate-hero-right ${className ?? ""}`}>{children}</div>
  );
}

export function HeroButtons() {
  const handleDemoClick = () => {
    trackEvent("cta_click", { location: "hero", target: "demo" });
    const demoEl = document.getElementById("demo");
    if (demoEl) {
      demoEl.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  };

  return (
    <div className="mt-7 flex flex-wrap gap-3">
      <Link
        href="/signup"
        onClick={() =>
          trackEvent("cta_click", { location: "hero", target: "signup" })
        }
      >
        <ShinyButton className="px-8 group">
          Começar grátis
          <ArrowRight
            size={18}
            className="ml-2 inline-block transition-transform group-hover:translate-x-1"
          />
        </ShinyButton>
      </Link>
      <Button
        variant="secondary"
        className="px-6 rounded-full border-[#E4E4E7] bg-white hover:bg-[#F4F4F5] text-[#3F3F46] hover:text-[#09090B]"
        onClick={handleDemoClick}
      >
        <Play size={14} className="mr-2" />
        Ver demo de 2 min
      </Button>
    </div>
  );
}
