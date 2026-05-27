// Server Component — no "use client" directive
// Motion animations are delegated to how-it-works-animations.tsx (client islands)

import { CalendarCheck, Filter, Inbox, MessageCircle, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  HowItWorksWrapper,
  HowItWorksItemMotion,
  ConnectorClient,
} from "./how-it-works-animations";

interface Step {
  n: number;
  title: string;
  sub: string;
  Icon: LucideIcon;
  color: string;
  glow: string;
  bg: string;
  iconBg: string;
}

const STEPS: Step[] = [
  {
    n: 1,
    title: "Lead chega",
    sub: "WhatsApp, Instagram, formulário ou anúncio.",
    Icon: Inbox,
    color: "#5EEAD4",
    glow: "rgba(20,184,166,0.35)",
    bg: "rgba(20,184,166,0.08)",
    iconBg: "rgba(20,184,166,0.15)",
  },
  {
    n: 2,
    title: "Agendra responde",
    sub: "Em 4 segundos, com tom de marca.",
    Icon: MessageCircle,
    color: "#93C5FD",
    glow: "rgba(37,99,235,0.35)",
    bg: "rgba(37,99,235,0.08)",
    iconBg: "rgba(37,99,235,0.15)",
  },
  {
    n: 3,
    title: "Qualifica",
    sub: "5 perguntas-chave, classifica em quente/morno/frio.",
    Icon: Filter,
    color: "#FCD34D",
    glow: "rgba(245,158,11,0.35)",
    bg: "rgba(245,158,11,0.07)",
    iconBg: "rgba(245,158,11,0.14)",
  },
  {
    n: 4,
    title: "Agenda",
    sub: "Cria o evento no seu calendário e confirma.",
    Icon: CalendarCheck,
    color: "#FB923C",
    glow: "rgba(249,115,22,0.35)",
    bg: "rgba(249,115,22,0.08)",
    iconBg: "rgba(249,115,22,0.15)",
  },
];

/* ─── Card (Server Component — purely declarative) ───────────── */
function StepCard({ step }: { step: Step }) {
  return (
    <HowItWorksItemMotion className="group relative flex min-w-0 flex-col">
      {/* Card body */}
      <div
        className={cn(
          "relative flex flex-col gap-4 overflow-hidden rounded-2xl border p-6 transition-all duration-300",
          "border-white/[0.08] bg-gradient-to-b from-white/[0.06] to-white/[0.02]",
          "hover:border-white/[0.14] hover:shadow-[0_16px_40px_rgba(0,0,0,0.4)]",
        )}
        style={{ boxShadow: "0 8px 32px rgba(0,0,0,0.32)" }}
      >
        {/* Subtle accent top-left glow on hover */}
        <div
          className="pointer-events-none absolute -left-8 -top-8 h-32 w-32 rounded-full opacity-0 blur-2xl transition-opacity duration-500 group-hover:opacity-100"
          style={{ background: step.glow }}
          aria-hidden
        />

        {/* Number badge + icon row */}
        <div className="flex items-start justify-between">
          {/* Step number */}
          <div
            className="flex h-8 w-8 items-center justify-center rounded-xl font-mono text-[13px] font-bold"
            style={{
              background: step.iconBg,
              color: step.color,
              boxShadow: `inset 0 0 0 1px ${step.color}33`,
            }}
          >
            {step.n < 10 ? `0${step.n}` : step.n}
          </div>

          {/* Icon */}
          <div
            className="flex h-10 w-10 items-center justify-center rounded-xl transition-transform duration-300 group-hover:scale-110"
            style={{ background: step.iconBg }}
          >
            <step.Icon size={18} style={{ color: step.color }} />
          </div>
        </div>

        {/* Text */}
        <div>
          <div className="mb-1 text-[15px] font-semibold leading-snug text-white">
            {step.title}
          </div>
          <div
            className="text-[13px] leading-relaxed"
            style={{ color: "var(--color-fg-3)" }}
          >
            {step.sub}
          </div>
        </div>

        {/* Bottom accent bar */}
        <div
          className="absolute bottom-0 left-0 right-0 h-[2px] rounded-b-2xl opacity-0 transition-opacity duration-300 group-hover:opacity-100"
          style={{
            background: `linear-gradient(90deg, transparent, ${step.color}, transparent)`,
          }}
          aria-hidden
        />
      </div>
    </HowItWorksItemMotion>
  );
}

/* ─── Export ─────────────────────────────────────────────────── */
export function HowItWorks() {
  return (
    <HowItWorksWrapper>
      <div className="mx-auto max-w-[1200px] px-6">
        {/* Header */}
        <HowItWorksItemMotion>
          <div className="eyebrow mb-3">COMO FUNCIONA</div>
          <h2 className="mb-2 max-w-[720px] text-balance text-[clamp(28px,3vw,40px)] font-bold leading-tight tracking-[-0.02em]">
            Quatro passos. Zero esforço humano.
          </h2>
          <p
            className="mb-14 max-w-[580px] text-pretty text-[clamp(16px,1.3vw,19px)] leading-relaxed"
            style={{ color: "var(--color-fg-2)" }}
          >
            Conecte os canais. A Agendra cuida do resto — do primeiro &quot;oi&quot; à reunião confirmada.
          </p>
        </HowItWorksItemMotion>

        {/* Steps */}
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
          {STEPS.flatMap((step, i) => {
            const els = [
              <div key={`card-${step.n}`} className="min-w-0 flex-1">
                <StepCard step={step} />
              </div>,
            ];
            if (i < STEPS.length - 1) {
              els.push(
                <div key={`conn-${step.n}`} className="hidden w-10 flex-shrink-0 lg:block">
                  <ConnectorClient
                    index={i}
                    total={STEPS.length}
                    fromColor={STEPS[i].color}
                    toColor={STEPS[i + 1].color}
                    toGlow={STEPS[i + 1].glow}
                  />
                </div>,
              );
            }
            return els;
          })}
        </div>

        {/* Mobile: step progress dots */}
        <div className="mt-5 flex items-center justify-center gap-2 lg:hidden">
          {STEPS.map((s) => (
            <div
              key={s.n}
              className="h-1 w-8 rounded-full"
              style={{ background: s.color, opacity: 0.45 }}
            />
          ))}
        </div>
      </div>
    </HowItWorksWrapper>
  );
}
