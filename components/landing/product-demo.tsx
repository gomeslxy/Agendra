"use client";

import { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  CalendarCheck,
  CheckCheck,
  Clock,
  Flame,
  RefreshCw,
  Thermometer,
  Zap,
} from "lucide-react";
import { FadeUp } from "@/components/motion/fade-up";
import { cn } from "@/lib/utils";

/* ─── Script de conversa ─────────────────────────────────────── */
const SCRIPT: { who: "lead" | "ai"; text: string; delay: number }[] = [
  { who: "lead", text: "Oi! Vi o anúncio do clareamento. Quanto custa?",            delay: 600  },
  { who: "ai",   text: "Oi! Sou a Agendra 👋 Sai por R$ 890. Posso marcar uma avaliação grátis?", delay: 2200 },
  { who: "lead", text: "Pode ser quinta?",                                            delay: 1400 },
  { who: "ai",   text: "Quinta às 14h ou sexta às 10h, qual prefere?",               delay: 1800 },
  { who: "lead", text: "Quinta 14h ✅",                                              delay: 1200 },
  { who: "ai",   text: "Marcado! Te confirmo no dia anterior. Até quinta, Carla 💙", delay: 2000 },
];

/* ─── Dados dos cards laterais ───────────────────────────────── */
const HEAT = [
  { label: "Quente", n: 18, pct: 72, color: "#F97316", bgColor: "rgba(249,115,22,0.12)", dotColor: "#F97316" },
  { label: "Morno",  n: 9,  pct: 36, color: "#F59E0B", bgColor: "rgba(245,158,11,0.10)", dotColor: "#F59E0B" },
  { label: "Frio",   n: 4,  pct: 16, color: "#60A5FA", bgColor: "rgba(96,165,250,0.10)", dotColor: "#60A5FA" },
];

const AGENDA = [
  { t: "09:00", name: "Lucas A.",   label: "Aval. inicial", heat: "cold" as const },
  { t: "11:30", name: "Beatriz M.", label: "Retorno",       heat: "warm" as const },
  { t: "14:00", name: "Carla R.",   label: "Clareamento",   heat: "hot"  as const, active: true },
  { t: "16:30", name: "Diego F.",   label: "Aval. inicial", heat: "warm" as const },
];

const HEAT_COLORS = {
  hot:  { dot: "#F97316", bg: "rgba(249,115,22,0.12)", text: "#FB923C" },
  warm: { dot: "#F59E0B", bg: "rgba(245,158,11,0.10)", text: "#FCD34D" },
  cold: { dot: "#60A5FA", bg: "rgba(96,165,250,0.10)", text: "#93C5FD" },
};

/* ─── Sub-componentes ────────────────────────────────────────── */

function TypingDots({ align }: { align: "left" | "right" }) {
  return (
    <div className={cn("flex items-end gap-1.5", align === "right" ? "justify-end" : "justify-start")}>
      <div
        className={cn(
          "flex items-center gap-1 rounded-2xl px-3.5 py-2.5",
          align === "right"
            ? "bg-gradient-to-br from-[#2563EB] to-[#1D4ED8]"
            : "bg-white/[0.07] border border-white/[0.08]",
        )}
      >
        {[0, 0.18, 0.36].map((d, i) => (
          <motion.span
            key={i}
            className="block h-1.5 w-1.5 rounded-full bg-white/70"
            animate={{ y: [0, -4, 0], opacity: [0.4, 1, 0.4] }}
            transition={{ duration: 1, repeat: Infinity, delay: d, ease: "easeInOut" }}
          />
        ))}
      </div>
    </div>
  );
}

function Bubble({ who, text }: { who: "lead" | "ai"; text: string }) {
  const isAi = who === "ai";
  return (
    <motion.div
      initial={{ opacity: 0, y: 10, scale: 0.96 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
      className={cn("flex", isAi ? "justify-end" : "justify-start")}
    >
      <div
        className={cn(
          "max-w-[78%] rounded-2xl px-3.5 py-2.5 text-[13.5px] leading-[1.5]",
          isAi
            ? "rounded-br-sm bg-gradient-to-br from-[#2563EB] to-[#1D4ED8] text-white shadow-[0_4px_16px_rgba(37,99,235,0.35)]"
            : "rounded-bl-sm border border-white/[0.08] bg-white/[0.07] text-white/90",
        )}
      >
        {text}
      </div>
    </motion.div>
  );
}

function HeatDot({ heat }: { heat: keyof typeof HEAT_COLORS }) {
  const c = HEAT_COLORS[heat];
  return (
    <span
      className="inline-block h-2 w-2 flex-shrink-0 rounded-full"
      style={{ background: c.dot, boxShadow: `0 0 6px ${c.dot}` }}
    />
  );
}

/* ─── Chat panel ─────────────────────────────────────────────── */
function ChatPanel() {
  const [shown, setShown] = useState(0);
  const [typing, setTyping] = useState(false);
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (shown >= SCRIPT.length) return;
    setTyping(true);
    const t = setTimeout(() => {
      setTyping(false);
      setShown((s) => s + 1);
    }, SCRIPT[shown]?.delay ?? 1500);
    return () => clearTimeout(t);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shown]);

  useEffect(() => {
    const el = scrollContainerRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [shown, typing]);

  const confirmed = shown >= SCRIPT.length;

  function handleReplay() {
    setShown(0);
    setTyping(false);
  }

  return (
    <div className="flex h-full flex-col overflow-hidden rounded-[20px] border border-white/[0.10] bg-gradient-to-b from-[rgba(255,255,255,0.06)] to-[rgba(255,255,255,0.03)] shadow-[0_20px_60px_rgba(0,0,0,0.5)]">
      {/* Header do chat */}
      <div className="flex items-center gap-3 border-b border-white/[0.07] px-4 py-3.5">
        <div className="relative">
          <div className="h-9 w-9 rounded-full bg-gradient-to-br from-[#3B82F6] to-[#14B8A6]" />
          <span className="absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full border-2 border-[#0B1222] bg-emerald-400" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-[13px] font-semibold leading-none text-white">Carla Ribeiro</div>
          <div className="mt-0.5 text-[11px]" style={{ color: "var(--color-fg-3)" }}>
            WhatsApp · ativa agora
          </div>
        </div>
        <div className="flex items-center gap-1.5 rounded-full border border-[#F97316]/30 bg-[#F97316]/10 px-2.5 py-1">
          <Flame size={10} className="text-[#F97316]" />
          <span className="text-[11px] font-semibold text-[#FB923C]">Quente</span>
        </div>
      </div>

      {/* Mensagens */}
      <div ref={scrollContainerRef} className="flex flex-1 flex-col gap-2.5 overflow-y-auto px-4 py-4 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {SCRIPT.slice(0, shown).map((m, i) => (
          <Bubble key={i} who={m.who} text={m.text} />
        ))}
        <AnimatePresence>
          {typing && shown < SCRIPT.length && (
            <motion.div
              key="typing"
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 6 }}
              transition={{ duration: 0.2 }}
            >
              <TypingDots align={SCRIPT[shown]?.who === "ai" ? "right" : "left"} />
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Confirmação agendada */}
      <AnimatePresence>
        {confirmed && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
            className="mx-4 mb-4 flex items-center gap-3 rounded-xl border border-[#14B8A6]/25 bg-gradient-to-r from-[rgba(20,184,166,0.12)] to-[rgba(20,184,166,0.06)] px-3.5 py-3"
          >
            <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg bg-[#14B8A6]/20">
              <CalendarCheck size={16} className="text-[#5EEAD4]" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-[12px] font-semibold text-[#5EEAD4]">Agendado automaticamente</div>
              <div className="mt-0.5 text-[11px]" style={{ color: "var(--color-fg-3)" }}>
                Quinta, 14:00 · Dra. Maria · Sala 02
              </div>
            </div>
            <div className="flex items-center gap-2">
              <CheckCheck size={14} className="flex-shrink-0 text-[#5EEAD4]" />
              <button
                onClick={handleReplay}
                aria-label="Reiniciar demo"
                className="flex h-6 w-6 items-center justify-center rounded-full border border-white/10 bg-white/[0.06] text-white/40 transition-colors hover:bg-white/[0.12] hover:text-white/80"
              >
                <RefreshCw size={11} />
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

/* ─── Sidebar direita ────────────────────────────────────────── */
function SidePanel() {
  return (
    <div className="flex flex-col gap-4">
      {/* Classificação */}
      <div className="rounded-[20px] border border-white/[0.10] bg-gradient-to-b from-[rgba(255,255,255,0.06)] to-[rgba(255,255,255,0.03)] p-5 shadow-[0_20px_60px_rgba(0,0,0,0.4)]">
        <div className="mb-4 flex items-center gap-2">
          <Thermometer size={14} className="text-brand-teal-400" />
          <span className="eyebrow text-[10px]">Classificação de Leads</span>
        </div>
        <div className="flex flex-col gap-3">
          {HEAT.map((h) => (
            <div key={h.label} className="flex flex-col gap-1.5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span
                    className="h-2 w-2 rounded-full"
                    style={{ background: h.color, boxShadow: `0 0 6px ${h.color}` }}
                  />
                  <span className="text-[12px] font-medium text-white/80">{h.label}</span>
                </div>
                <span className="font-mono text-[12px] font-semibold" style={{ color: h.color }}>
                  {h.n}
                </span>
              </div>
              <div className="h-1.5 overflow-hidden rounded-full bg-white/[0.06]">
                <motion.div
                  className="h-full rounded-full"
                  style={{ background: `linear-gradient(90deg, ${h.color}, ${h.color}cc)` }}
                  initial={{ width: 0 }}
                  whileInView={{ width: `${h.pct}%` }}
                  viewport={{ once: true, margin: "-40px" }}
                  transition={{ duration: 1.1, ease: [0.22, 1, 0.36, 1], delay: 0.1 }}
                />
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Agenda hoje */}
      <div className="rounded-[20px] border border-white/[0.10] bg-gradient-to-b from-[rgba(255,255,255,0.06)] to-[rgba(255,255,255,0.03)] p-5 shadow-[0_20px_60px_rgba(0,0,0,0.4)]">
        <div className="mb-4 flex items-center gap-2">
          <Clock size={14} className="text-brand-blue-400" />
          <span className="eyebrow text-[10px]">Agenda · Hoje</span>
        </div>
        <div className="flex flex-col gap-1.5">
          {AGENDA.map((slot) => {
            const c = HEAT_COLORS[slot.heat];
            return (
              <div
                key={slot.t}
                className={cn(
                  "flex items-center gap-3 rounded-xl px-3 py-2.5 transition-colors",
                  slot.active
                    ? "border border-[#F97316]/25 bg-[#F97316]/08"
                    : "border border-transparent hover:bg-white/[0.03]",
                )}
              >
                <span className="w-10 flex-shrink-0 font-mono text-[11px]" style={{ color: "var(--color-fg-3)" }}>
                  {slot.t}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[12px] font-semibold text-white/90">{slot.name}</div>
                  <div className="text-[11px]" style={{ color: "var(--color-fg-3)" }}>{slot.label}</div>
                </div>
                <div
                  className="flex flex-shrink-0 items-center gap-1.5 rounded-full px-2 py-0.5"
                  style={{ background: c.bg }}
                >
                  <HeatDot heat={slot.heat} />
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Stat highlight */}
      <div className="flex items-center gap-3 rounded-[20px] border border-[#14B8A6]/20 bg-gradient-to-r from-[rgba(20,184,166,0.08)] to-[rgba(37,99,235,0.06)] p-4">
        <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl bg-[#14B8A6]/15">
          <Zap size={16} className="text-[#5EEAD4]" />
        </div>
        <div>
          <div className="text-[13px] font-bold text-white">4s resposta média</div>
          <div className="text-[11px]" style={{ color: "var(--color-fg-3)" }}>
            Agendra nunca dorme, nunca demora
          </div>
        </div>
      </div>
    </div>
  );
}

/* ─── Export ─────────────────────────────────────────────────── */
export function ProductDemo() {
  return (
    <section id="demo" className="relative pb-24 pt-16">
      <div className="mx-auto max-w-[1200px] px-6">
        <FadeUp>
          <div className="eyebrow mb-3">PRODUTO</div>
          <h2 className="mb-2 max-w-[720px] text-balance text-[clamp(28px,3vw,40px)] font-bold leading-tight tracking-[-0.02em]">
            Você vê tudo. Agendra faz tudo.
          </h2>
          <p
            className="mb-10 max-w-[580px] text-[clamp(16px,1.3vw,19px)] leading-relaxed"
            style={{ color: "var(--color-fg-2)" }}
          >
            Conversas, classificação por temperatura e agenda — num painel só.
          </p>
        </FadeUp>

        <div className="grid gap-5 lg:grid-cols-[1.15fr_0.85fr]">
          <FadeUp>
            <div className="h-full min-h-[500px]">
              <ChatPanel />
            </div>
          </FadeUp>

          <FadeUp delay={0.1}>
            <SidePanel />
          </FadeUp>
        </div>
      </div>
    </section>
  );
}
