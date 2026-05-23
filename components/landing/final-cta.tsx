"use client";

import Link from "next/link";
import { Play } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Glass } from "@/components/ui/glass";
import { FadeUp } from "@/components/motion/fade-up";
import { trackEvent } from "@/lib/analytics";

export function FinalCTA() {
  return (
    <section id="precos" className="relative pb-24 pt-12">
      <div className="mx-auto max-w-[1200px] px-6">
        <FadeUp>
          <Glass
            strong
            className="px-6 py-12 text-center sm:px-12 lg:px-16"
            style={{
              borderRadius: "2.25rem",
              background: "linear-gradient(180deg, rgba(37,99,235,0.18), rgba(20,184,166,0.10))",
            }}
          >
            <div className="eyebrow mb-3.5" style={{ color: "var(--color-brand-teal-300)" }}>
              14 DIAS GRÁTIS · SEM CARTÃO
            </div>
            <h2 className="mb-3.5 text-balance text-[clamp(36px,4.6vw,64px)] font-bold leading-tight tracking-[-0.03em]">
              Lead novo, <em>reunião marcada</em> — em segundos.
            </h2>
            <p className="mx-auto mb-7 max-w-[560px] text-[clamp(17px,1.4vw,20px)] leading-relaxed"
               style={{ color: "var(--color-fg-2)" }}>
              Conecte WhatsApp e Instagram em 2 minutos. Veja a Agendra responder no primeiro lead que chegar.
            </p>
            <div className="flex flex-wrap justify-center gap-3">
              <Link href="/signup" onClick={() => trackEvent("cta_click", { location: "final_cta", target: "signup" })}>
                <Button variant="primary" pulse>Começar grátis →</Button>
              </Link>
              <Button
                variant="secondary"
                onClick={() => {
                  trackEvent("cta_click", { location: "final_cta", target: "demo" });
                  document.getElementById("demo")?.scrollIntoView({ behavior: "smooth", block: "start" });
                }}
              >
                <Play size={14} />
                Ver demo
              </Button>
            </div>
          </Glass>
        </FadeUp>
      </div>
    </section>
  );
}
