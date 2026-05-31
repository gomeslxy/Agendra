import React from "react";
import { CalendarCheck } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Glass } from "@/components/ui/glass";
import { SpotlightCSS } from "@/components/ui/spotlight";
import { GridBeam } from "@/components/ui/grid-beam";
import { CounterClient } from "@/components/landing/counter-client";
import { HeroLeftAnimation, HeroRightAnimation, HeroButtons } from "./hero-animations";

export function Hero() {
  return (
    <section className="relative overflow-hidden pb-24 pt-40 sm:pt-48" aria-label="Hero — proposta de valor">
      <SpotlightCSS className="-top-40 left-0 md:left-60 md:-top-20" />
      <GridBeam className="absolute inset-0 pointer-events-none" />
      
      <div className="mx-auto grid max-w-[1200px] items-center gap-12 px-6 lg:grid-cols-[1.05fr_1fr]">
        {/* Left column - text content */}
        <HeroLeftAnimation>
          <div className="inline-flex items-center gap-2 rounded-full border border-[#E4E4E7] bg-[#F4F4F5] px-3 py-1.5 backdrop-blur">
            <span className="h-1.5 w-1.5 rounded-full bg-brand-teal-500 shadow-[0_0_10px_var(--color-brand-teal-500)] animate-pulse" />
            <span className="eyebrow" style={{ color: "var(--color-fg-2)" }}>
              ⚡ IA PARA WHATSAPP & INSTAGRAM · CERTIFICADA E SEGURA
            </span>
          </div>

          <h1 className="mt-5 text-[#09090B] text-balance text-[clamp(40px,5.5vw,78px)] font-bold leading-[1.05] tracking-[-0.03em]">
            Transforme leads em
            <br />
            <span className="grad-text">reuniões marcadas.</span>
          </h1>

          <p className="mt-5 max-w-xl text-pretty text-[clamp(16px,1.3vw,19px)] leading-relaxed text-fg-2"
             style={{ color: "var(--color-fg-2)" }}>
            A IA do Agendra atende seus leads de anúncios do WhatsApp e Instagram 24 horas por dia. Ela responde em 4 segundos, qualifica o interesse e agenda no seu calendário automaticamente. Sem esforço manual.
          </p>

          <HeroButtons />

          <div className="mt-7 flex flex-wrap items-center gap-3.5 font-mono text-xs text-fg-3"
               style={{ color: "var(--color-fg-3)" }}>
            <span>⏱️ 4s resposta média</span>
            <span className="opacity-40">·</span>
            <span>📈 3.2× mais agendamentos</span>
            <span className="opacity-40">·</span>
            <span>🔒 Dentro das regras da Meta</span>
          </div>
        </HeroLeftAnimation>

        {/* Right column - interactive mockup */}
        <HeroRightAnimation className="relative aspect-[1.05/1] float">
          {/* Main chat preview card */}
          <Glass className="absolute inset-x-0 top-0 p-5">
            <div className="flex items-center gap-2.5 border-b border-[#E4E4E7] pb-3">
              <div className="h-8 w-8 rounded-full bg-gradient-to-br from-[#3B82F6] to-[#14B8A6]" />
              <div>
                <div className="text-[13px] font-semibold text-[#09090B]">Carla Ribeiro</div>
                <div className="font-mono text-[11px] font-medium" style={{ color: "var(--color-fg-3)" }}>
                  WhatsApp · agora
                </div>
              </div>
              <Badge variant="hot" className="ml-auto">Quente</Badge>
            </div>

            <div className="mt-3 flex flex-col gap-2">
              <div className="max-w-[78%] self-start rounded-2xl border border-[#E4E4E7] bg-[#F4F4F5] px-3 py-2.5 text-[13px] text-[#09090B]">
                Posso marcar avaliação para quinta?
              </div>
              <div className="max-w-[78%] self-end rounded-2xl border border-white/20 bg-gradient-to-b from-[#2563EB] to-[#1D4ED8] px-3 py-2.5 text-[13px] text-white shadow-[0_8px_20px_rgba(37,99,235,0.3)]">
                Quinta às 14h ou sexta às 10h?
              </div>
              <div className="max-w-[78%] self-start rounded-2xl border border-[#E4E4E7] bg-[#F4F4F5] px-3 py-2.5 text-[13px] text-[#09090B]">
                Quinta 14h ✅
              </div>
            </div>

            <div className="mt-3 flex items-center gap-2 rounded-xl border border-[#99F6E4] bg-[#F0FDFA] p-2.5 text-xs font-medium text-[#0D9488]">
              <CalendarCheck size={16} />
              <span>Agendado · qui 14:00 · Maria (atendente)</span>
            </div>
          </Glass>

          {/* Agenda floating card */}
          <Glass className="absolute -right-6 bottom-4 w-[62%] p-4 float [animation-duration:8s]">
            <div className="eyebrow mb-2" style={{ color: "var(--color-brand-teal-600)" }}>AGENDA · QUI</div>
            <div className="flex flex-col gap-1.5">
              {[
                { t: "09:00", n: "Lucas A.",   v: "cold" as const },
                { t: "14:00", n: "Carla R.",   v: "hot" as const, active: true },
                { t: "16:30", n: "Beatriz M.", v: "warm" as const },
              ].map((s) => (
                <div
                  key={s.t}
                  className={`flex items-center gap-2.5 rounded-lg border px-2.5 py-2 ${
                    s.active
                      ? "border-[#F97316]/30 bg-[#F97316]/10 text-[#09090B]"
                      : "border-transparent text-[#3F3F46]"
                  }`}
                >
                  <span className="w-10 font-mono text-xs" style={{ color: "var(--color-fg-3)" }}>{s.t}</span>
                  <span className="text-[13px] font-medium">{s.n}</span>
                  <Badge variant={s.v} className="ml-auto px-2 py-0.5" />
                </div>
              ))}
            </div>
          </Glass>

          {/* Response time floating card */}
          <Glass className="absolute -left-7 top-[36%] w-[200px] p-3.5 float [animation-direction:reverse] [animation-duration:7s]">
            <div className="eyebrow" style={{ color: "var(--color-brand-teal-600)" }}>RESPOSTA</div>
            <div className="my-1 text-4xl font-bold tracking-[-0.03em] text-[#09090B]">
              <CounterClient to={4} />
              <span className="text-base" style={{ color: "var(--color-fg-3)" }}>s</span>
            </div>
            <svg viewBox="0 0 120 28" width="100%" height="22" fill="none">
              <path d="M0 22 L20 18 L40 19 L60 12 L80 14 L100 8 L120 6" stroke="#14B8A6" strokeWidth="1.6" />
            </svg>
          </Glass>
        </HeroRightAnimation>
      </div>
    </section>
  );
}
