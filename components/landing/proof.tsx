"use client";

import Image from "next/image";
import { motion } from "framer-motion";
import { Glass } from "@/components/ui/glass";
import { StaggerGroup } from "@/components/motion/stagger-group";
import { fadeUp } from "@/components/motion/variants";
import { FadeUp } from "@/components/motion/fade-up";
import { InfiniteSlider } from "@/components/ui/infinite-slider";
import { Star } from "lucide-react";

const STATS = [
  { v: "3.2", s: "×", l: "MAIS AGENDAMENTOS", color: "var(--color-brand-orange-400)" },
  { v: "4",   s: "s", l: "RESPOSTA MÉDIA",    color: "var(--color-brand-teal-300)" },
  { v: "38",  s: "%", l: "CONVERSÃO FINAL",   color: "var(--color-brand-blue-400)" },
  { v: "24/7", s: "", l: "DISPONIBILIDADE",   color: "#fff" },
];

const TESTIMONIALS = [
  {
    quote: "A Agendra pagou o plano inteiro no primeiro dia. Três leads do Instagram viraram consultas em menos de 10 minutos — sem eu tocar no celular.",
    name: "Dra. Ana Ferreira",
    role: "Clínica de Estética · São Paulo",
    stars: 5,
  },
  {
    quote: "Antes eu perdia lead porque não respondia rápido. Agora a IA responde em segundos e manda pra mim só os quentes. Agenda lotada há 3 semanas.",
    name: "Rodrigo Melo",
    role: "Academia Fit Prime · Curitiba",
    stars: 5,
  },
  {
    quote: "Integração com o Google Calendar funciona perfeitamente. Zero conflito de horário, zero trabalho manual. Recomendo pra qualquer imobiliária.",
    name: "Juliana Costa",
    role: "Imobiliária Costa & Silva · Rio de Janeiro",
    stars: 5,
  },
];

const LOGOS = [
  { name: "WhatsApp",       url: "https://svgl.app/library/whatsapp.svg" },
  { name: "Google Calendar", url: "https://svgl.app/library/google-calendar.svg" },
  { name: "Stripe",         url: "https://svgl.app/library/stripe.svg" },
  { name: "HubSpot",        url: "https://svgl.app/library/hubspot.svg" },
  { name: "Salesforce",     url: "https://svgl.app/library/salesforce.svg" },
  { name: "Zapier",         url: "https://svgl.app/library/zapier.svg" },
  { name: "Instagram",      url: "https://svgl.app/library/instagram.svg" },
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

        {/* Testimonials */}
        <FadeUp delay={0.2}>
          <div className="mt-16 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {TESTIMONIALS.map((t, i) => (
              <motion.div
                key={t.name}
                variants={fadeUp}
                initial="hidden"
                whileInView="show"
                viewport={{ once: true, margin: "-40px" }}
                transition={{ delay: i * 0.08 }}
              >
                <Glass className="flex h-full flex-col gap-4 p-6">
                  <div className="flex gap-0.5">
                    {Array.from({ length: t.stars }).map((_, j) => (
                      <Star key={j} size={13} className="fill-[#F97316] text-[#F97316]" />
                    ))}
                  </div>
                  <p className="flex-1 text-[14px] leading-relaxed" style={{ color: "var(--color-fg-2)" }}>
                    &ldquo;{t.quote}&rdquo;
                  </p>
                  <div>
                    <div className="text-[13px] font-semibold text-white">{t.name}</div>
                    <div className="text-[12px]" style={{ color: "var(--color-fg-3)" }}>{t.role}</div>
                  </div>
                </Glass>
              </motion.div>
            ))}
          </div>
        </FadeUp>

        {/* Integration logos */}
        <FadeUp delay={0.4}>
          <div className="mt-20 border-t border-white/5 pt-12 text-center">
            <p className="mb-8 text-xs font-medium tracking-[0.2em] text-fg-3 uppercase">
              Integrado com as ferramentas que você já usa
            </p>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 z-10 w-32 bg-gradient-to-r from-bg to-transparent pointer-events-none" />
              <div className="absolute inset-y-0 right-0 z-10 w-32 bg-gradient-to-l from-bg to-transparent pointer-events-none" />

              <InfiniteSlider gap={80} duration={30}>
                {LOGOS.map((logo) => (
                  <div key={logo.name} className="flex items-center gap-3 opacity-40 grayscale transition-all hover:opacity-100 hover:grayscale-0">
                    <Image
                      src={logo.url}
                      alt={logo.name}
                      width={28}
                      height={28}
                      className="h-7 w-auto"
                      unoptimized
                    />
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
