"use client";

import Link from "next/link";
import { Play, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { FadeUp } from "@/components/motion/fade-up";
import { trackEvent } from "@/lib/analytics";

export function FinalCTA() {
  return (
    <section id="precos" className="relative pb-24 pt-12" aria-label="Comece grátis">
      <div className="mx-auto max-w-[1000px] px-6">
        <FadeUp>
          <div 
            className="relative overflow-hidden rounded-[2.5rem] bg-white px-6 py-16 text-center sm:px-12 lg:px-16 shadow-[0_8px_40px_rgba(0,0,0,0.04)] border border-[#E4E4E7]"
          >
            {/* Subtle top glow to replace the old heavy gradient */}
            <div 
              className="absolute left-1/2 top-0 -translate-x-1/2 h-[120px] w-[60%] rounded-[100%] bg-[#2563EB]/8 blur-[50px] pointer-events-none" 
              aria-hidden
            />
            
            <div className="relative z-10">
              <div className="mb-6 inline-flex items-center gap-1.5 rounded-full border border-[#CEEAD6] bg-[#E6F4EA] px-3 py-1.5 shadow-sm">
                <span className="h-1.5 w-1.5 rounded-full bg-[#10B981] animate-pulse" />
                <span className="text-[10px] sm:text-[11px] font-bold uppercase tracking-widest text-[#065F46]">
                  7 DIAS GRÁTIS · SEM CARTÃO DE CRÉDITO
                </span>
              </div>
              
              <h2 className="mb-4 text-balance text-[clamp(32px,4vw,56px)] font-bold leading-[1.1] tracking-[-0.03em] text-[#09090B]">
                Seu primeiro lead agendado no automático em até 15 minutos.
              </h2>
              
              <p className="mx-auto mb-10 max-w-[560px] text-[clamp(16px,1.3vw,19px)] leading-relaxed text-[#71717A]">
                Conecte seu WhatsApp e Instagram hoje mesmo. Assista à IA do Agendra responder seu primeiro cliente em tempo real.
              </p>
              
              <div className="flex flex-wrap justify-center items-center gap-3">
                <Link href="/signup" onClick={() => trackEvent("cta_click", { location: "final_cta", target: "signup" })}>
                  <Button variant="orange" className="h-12 px-8 rounded-full font-bold text-[15px] shadow-[0_4px_14px_rgba(249,115,22,0.25)] hover:shadow-[0_6px_20px_rgba(249,115,22,0.35)] transition-all duration-300 group">
                    Experimentar Grátis
                    <ArrowRight className="ml-2 w-4 h-4 transition-transform group-hover:translate-x-1" />
                  </Button>
                </Link>
                <Button
                  variant="outline"
                  className="h-12 px-8 rounded-full font-semibold text-[#3F3F46] border-[#E4E4E7] hover:bg-[#F4F4F5] hover:text-[#09090B] transition-colors"
                  onClick={() => {
                    trackEvent("cta_click", { location: "final_cta", target: "demo" });
                    document.getElementById("demo")?.scrollIntoView({ behavior: "smooth", block: "start" });
                  }}
                >
                  <Play size={16} className="mr-2.5 text-[#71717A]" />
                  Ver demo
                </Button>
              </div>
            </div>
          </div>
        </FadeUp>
      </div>
    </section>
  );
}
