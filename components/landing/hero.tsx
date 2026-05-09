"use client";

import Link from "next/link";
import { motion, useReducedMotion } from "framer-motion";
import { ArrowRight, CalendarCheck, Play } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Glass } from "@/components/ui/glass";
import { fadeUp } from "@/components/motion/variants";
import { useEffect, useRef } from "react";
import { Spotlight } from "@/components/ui/spotlight";
import { GridBeam } from "@/components/ui/grid-beam";
import { ShinyButton } from "@/components/ui/shiny-button";
import { trackEvent } from "@/lib/analytics";

function Counter({ to, duration = 1200, suffix = "" }: { to: number; duration?: number; suffix?: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  const reduce = useReducedMotion();

  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    if (reduce) {
      const useInt = to >= 10;
      node.textContent = `${useInt ? Math.round(to) : to.toFixed(1)}${suffix}`;
      return;
    }

    let raf: number;
    const start = performance.now();
    const useInt = to >= 10;
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - t, 3);
      const v = to * eased;
      node.textContent = `${useInt ? Math.round(v) : v.toFixed(1)}${suffix}`;
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [to, duration, suffix, reduce]);
  return <span ref={ref}>0{suffix}</span>;
}

export function Hero() {
  const reduce = useReducedMotion();

  return (
    <section className="relative overflow-hidden pb-24 pt-40 sm:pt-48">
      <Spotlight className="-top-40 left-0 md:left-60 md:-top-20" fill="#3b82f6" />
      <GridBeam className="absolute inset-0 pointer-events-none" />
      <div className="mx-auto grid max-w-[1200px] items-center gap-12 px-6 lg:grid-cols-[1.05fr_1fr]">
        <motion.div variants={fadeUp} initial="hidden" animate="show">
          <div className="inline-flex items-center gap-2 rounded-full border border-white/[0.14] bg-white/[0.04] px-3 py-1.5 backdrop-blur">
            <span className="h-1.5 w-1.5 rounded-full bg-brand-teal-400 shadow-[0_0_10px_var(--color-brand-teal-400)] animate-pulse" />
            <span className="eyebrow" style={{ color: "var(--color-fg-2)" }}>
              IA EM TEMPO REAL · WHATSAPP · INSTAGRAM
            </span>
          </div>

          <h1 className="mt-5 text-balance text-[clamp(48px,6.4vw,88px)] font-bold leading-[1.05] tracking-[-0.03em]">
            Lead novo,
            <br />
            <span className="grad-text">reunião marcada.</span>
          </h1>

          <p className="mt-5 max-w-xl text-pretty text-[clamp(17px,1.4vw,20px)] leading-relaxed text-fg-2"
             style={{ color: "var(--color-fg-2)" }}>
            Agendra responde, qualifica e agenda — em segundos, 24/7, em todos os canais.
            Sem fila, sem espera, sem lead perdido.
          </p>

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
              onClick={() => trackEvent("cta_click", { location: "hero", target: "demo" })}
            >
              <Play size={14} className="mr-2" />
              Ver demo de 2 min
            </Button>
          </div>

          <div className="mt-7 flex flex-wrap items-center gap-3.5 font-mono text-xs text-fg-3"
               style={{ color: "var(--color-fg-3)" }}>
            <span>4s resposta média</span>
            <span className="opacity-40">·</span>
            <span>3.2× agendamentos</span>
            <span className="opacity-40">·</span>
            <span>+1.200 negócios</span>
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, scale: 0.96 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.9, ease: [0.22, 1, 0.36, 1], delay: 0.15 }}
          className={`relative aspect-[1.05/1] ${reduce ? "" : "float"}`}
        >
          <Glass className="absolute inset-x-0 top-0 p-5">
            <div className="flex items-center gap-2.5 border-b border-white/[0.08] pb-3">
              <div className="h-8 w-8 rounded-full bg-gradient-to-br from-[#3B82F6] to-[#14B8A6]" />
              <div>
                <div className="text-[13px] font-semibold">Carla Ribeiro</div>
                <div className="font-mono text-[11px] font-medium" style={{ color: "var(--color-fg-3)" }}>
                  WhatsApp · agora
                </div>
              </div>
              <Badge variant="hot" className="ml-auto">Quente</Badge>
            </div>

            <div className="mt-3 flex flex-col gap-2">
              <div className="max-w-[78%] self-start rounded-2xl border border-white/[0.08] bg-white/[0.06] px-3 py-2.5 text-[13px]">
                Posso marcar avaliação para quinta?
              </div>
              <div className="max-w-[78%] self-end rounded-2xl border border-white/20 bg-gradient-to-b from-[#2563EB] to-[#1D4ED8] px-3 py-2.5 text-[13px] text-white shadow-[0_8px_20px_rgba(37,99,235,0.3)]">
                Quinta às 14h ou sexta às 10h?
              </div>
              <div className="max-w-[78%] self-start rounded-2xl border border-white/[0.08] bg-white/[0.06] px-3 py-2.5 text-[13px]">
                Quinta 14h ✅
              </div>
            </div>

            <div className="mt-3 flex items-center gap-2 rounded-xl border border-[#14B8A6]/30 bg-[#14B8A6]/10 p-2.5 text-xs font-medium text-brand-teal-300">
              <CalendarCheck size={16} />
              <span>Agendado · qui 14:00 · Maria (atendente)</span>
            </div>
          </Glass>

          <Glass className="absolute -right-6 bottom-4 w-[62%] p-4 float [animation-duration:8s]">
            <div className="eyebrow mb-2" style={{ color: "var(--color-brand-teal-300)" }}>AGENDA · QUI</div>
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
                      ? "border-[#F97316]/30 bg-[#F97316]/10"
                      : "border-transparent"
                  }`}
                >
                  <span className="w-10 font-mono text-xs" style={{ color: "var(--color-fg-3)" }}>{s.t}</span>
                  <span className="text-[13px]">{s.n}</span>
                  <Badge variant={s.v} className="ml-auto px-2 py-0.5" />
                </div>
              ))}
            </div>
          </Glass>

          <Glass className="absolute -left-7 top-[36%] w-[200px] p-3.5 float [animation-direction:reverse] [animation-duration:7s]">
            <div className="eyebrow" style={{ color: "var(--color-brand-teal-300)" }}>RESPOSTA</div>
            <div className="my-1 text-4xl font-bold tracking-[-0.03em]">
              <Counter to={4} suffix="" />
              <span className="text-base" style={{ color: "var(--color-fg-3)" }}>s</span>
            </div>
            <svg viewBox="0 0 120 28" width="100%" height="22" fill="none">
              <path d="M0 22 L20 18 L40 19 L60 12 L80 14 L100 8 L120 6" stroke="#14B8A6" strokeWidth="1.6" />
            </svg>
          </Glass>
        </motion.div>
      </div>
    </section>
  );
}
