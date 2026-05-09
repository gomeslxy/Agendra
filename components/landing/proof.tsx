"use client";

import { motion } from "framer-motion";
import { Glass } from "@/components/ui/glass";
import { StaggerGroup } from "@/components/motion/stagger-group";
import { fadeUp } from "@/components/motion/variants";
import { FadeUp } from "@/components/motion/fade-up";
import { InfiniteSlider } from "@/components/ui/infinite-slider";

const STATS = [
  { v: "3.2", s: "×", l: "MAIS AGENDAMENTOS", color: "var(--color-brand-orange-400)" },
  { v: "4",   s: "s", l: "RESPOSTA MÉDIA",    color: "var(--color-brand-teal-300)" },
  { v: "38",  s: "%", l: "CONVERSÃO FINAL",   color: "var(--color-brand-blue-400)" },
  { v: "24/7", s: "", l: "DISPONIBILIDADE",   color: "#fff" },
];

const LOGOS = [
  { name: "WhatsApp", url: "https://svgl.app/library/whatsapp.svg" },
  { name: "Google Calendar", url: "https://svgl.app/library/google-calendar.svg" },
  { name: "Stripe", url: "https://svgl.app/library/stripe.svg" },
  { name: "HubSpot", url: "https://svgl.app/library/hubspot.svg" },
  { name: "Salesforce", url: "https://svgl.app/library/salesforce.svg" },
  { name: "Zapier", url: "https://svgl.app/library/zapier.svg" },
  { name: "Supabase", url: "https://svgl.app/library/supabase.svg" },
];

export function Proof() {
  return (
    <section className="relative pb-24 pt-12">
      <div className="mx-auto max-w-[1200px] px-6">
        <FadeUp>
          <div className="eyebrow mb-3">RESULTADOS</div>
          <h2 className="mb-9 max-w-[720px] text-balance text-[clamp(28px,3vw,40px)] font-bold leading-tight tracking-[-0.02em]">
            Números <em>reais</em> de quem já está usando.
          </h2>
        </FadeUp>

        <StaggerGroup className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {STATS.map((s) => (
            <motion.div
              key={s.l}
              variants={fadeUp}
              whileHover={{ y: -3 }}
              transition={{ type: "spring", stiffness: 400, damping: 28 }}
            >
              <Glass className="p-6">
                <div
                  className="text-[48px] font-bold leading-none tracking-[-0.03em]"
                  style={{ color: s.color }}
                >
                  {s.v}
                  <span className="text-2xl" style={{ color: "var(--color-fg-3)" }}>{s.s}</span>
                </div>
                <div className="mt-2 text-xs tracking-wider" style={{ color: "var(--color-fg-3)" }}>
                  {s.l}
                </div>
              </Glass>
            </motion.div>
          ))}
        </StaggerGroup>

        <FadeUp delay={0.4}>
          <div className="mt-20 border-t border-white/5 pt-12 text-center">
            <p className="mb-8 text-xs font-medium tracking-[0.2em] text-fg-3 uppercase">
              Integrado com as ferramentas que você já usa
            </p>
            <div className="relative">
              {/* Left/Right fading shadows */}
              <div className="absolute inset-y-0 left-0 z-10 w-32 bg-gradient-to-r from-bg to-transparent pointer-events-none" />
              <div className="absolute inset-y-0 right-0 z-10 w-32 bg-gradient-to-l from-bg to-transparent pointer-events-none" />
              
              <InfiniteSlider gap={80} duration={30}>
                {LOGOS.map((logo) => (
                  <div key={logo.name} className="flex items-center gap-3 opacity-40 grayscale transition-all hover:opacity-100 hover:grayscale-0">
                    <img src={logo.url} alt={logo.name} className="h-7 w-auto" loading="lazy" decoding="async" />
                    <span className="text-sm font-semibold tracking-tight text-white">{logo.name}</span>
                  </div>
                ))}
              </InfiniteSlider>
            </div>
          </div>
        </FadeUp>
      </div>
    </section>
  );
}
