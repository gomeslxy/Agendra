"use client";

import React from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import { ArrowRight, Play } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ShinyButton } from "@/components/ui/shiny-button";
import { fadeUp } from "@/components/motion/variants";
import { trackEvent } from "@/lib/analytics";

export function HeroLeftAnimation({ children }: { children: React.ReactNode }) {
  return (
    <motion.div variants={fadeUp} initial="hidden" animate="show">
      {children}
    </motion.div>
  );
}

export function HeroRightAnimation({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.96 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.9, ease: [0.22, 1, 0.36, 1], delay: 0.15 }}
      className={className}
    >
      {children}
    </motion.div>
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
      <Link href="/signup" onClick={() => trackEvent("cta_click", { location: "hero", target: "signup" })}>
        <ShinyButton className="px-8 group">
          Começar grátis
          <ArrowRight size={18} className="ml-2 inline-block transition-transform group-hover:translate-x-1" />
        </ShinyButton>
      </Link>
      <Button
        variant="secondary"
        className="px-6 rounded-full border-white/10 bg-white/5 backdrop-blur-md hover:bg-white/10"
        onClick={handleDemoClick}
      >
        <Play size={14} className="mr-2" />
        Ver demo de 2 min
      </Button>
    </div>
  );
}
