"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { motion } from "framer-motion";
import { Download, Users, TrendingUp, CalendarCheck, Zap, MessageCircle, Star } from "lucide-react";
import { Button } from "@/components/ui/button";
import { stagger } from "@/components/motion/variants";
import { FadeUp } from "@/components/motion/fade-up";
import { cn } from "@/lib/utils";
import { exportReportsCsv } from "./actions";

function AnimatedNumber({ value }: { value: number }) {
  const [display, setDisplay] = useState(0);
  const rafRef = useRef<number>(0);
  useEffect(() => {
    const start = Date.now();
    const duration = 900;
    const from = 0;
    const tick = () => {
      const elapsed = Date.now() - start;
      const t = Math.min(elapsed / duration, 1);
      const eased = 1 - Math.pow(1 - t, 3);
      setDisplay(Math.round(from + (value - from) * eased));
      if (t < 1) rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
  }, [value]);
  return <>{display}</>;
}

interface ChannelStat {
  channel: string;
  label: string;
  count: number;
}

interface StatusStat {
  label: string;
  status: string;
  count: number;
  color: string;
}

interface DailyLeads {
  date: string;
  count: number;
}

interface ReportsClientProps {
  totalLeads: number;
  hotLeads: number;
  warmLeads: number;
  coldLeads: number;
  converted: number;
  conversionRate: number;
  totalEvents: number;
  totalMessages: number;
  aiMessages: number;
  avgHeatScore: number;
  byChannel: ChannelStat[];
  byStatus: StatusStat[];
  dailyLeads: DailyLeads[];
}

const CHANNEL_COLORS: Record<string, string> = {
  whatsapp: "#14B8A6",
  instagram: "#F97316",
  form: "#3B82F6",
};

function buildTrendPath(points: number[]) {
  if (points.length < 2) return { d: "", f: "" };
  const W = 600;
  const H = 140;
  const xs = points.map((_, i) => (i / (points.length - 1)) * W);
  const min = Math.min(...points);
  const max = Math.max(...points);
  const range = max - min || 1;
  const ys = points.map((v) => H - ((v - min) / range) * (H - 24) - 12);
  let d = `M ${xs[0]} ${ys[0]}`;
  for (let i = 1; i < xs.length; i++) {
    const cpx = (xs[i - 1] + xs[i]) / 2;
    d += ` C ${cpx} ${ys[i - 1]}, ${cpx} ${ys[i]}, ${xs[i]} ${ys[i]}`;
  }
  const f = d + ` L ${W} ${H} L 0 ${H} Z`;
  return { d, f };
}

function formatDateShort(dateStr: string) {
  const [, m, day] = dateStr.split("-");
  return `${day}/${m}`;
}

type Period = "7d" | "30d" | "90d" | "all";

const PERIODS: { id: Period; label: string }[] = [
  { id: "7d",  label: "7d" },
  { id: "30d", label: "30d" },
  { id: "90d", label: "90d" },
  { id: "all", label: "Tudo" },
];

export function ReportsClient({
  totalLeads,
  hotLeads,
  converted,
  conversionRate,
  totalEvents,
  totalMessages,
  aiMessages,
  avgHeatScore,
  byChannel,
  byStatus,
  dailyLeads,
}: ReportsClientProps) {
  const [period, setPeriod] = useState<Period>("all");
  const [exportPending, startExport] = useTransition();
  const trend = buildTrendPath(dailyLeads.map((d) => d.count));

  function handleExport() {
    startExport(async () => {
      try {
        const csv = await exportReportsCsv();
        const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `relatorio_${new Date().toISOString().slice(0, 10)}.csv`;
        a.click();
        URL.revokeObjectURL(url);
      } catch (e) {
        alert((e as Error).message);
      }
    });
  }

  const kpis = [
    {
      label: "TOTAL DE LEADS",
      value: String(totalLeads),
      suffix: "",
      icon: Users,
      color: "var(--color-brand-orange-400)",
      delta: totalLeads > 0 ? "cadastrados" : "nenhum ainda",
    },
    {
      label: "CONVERTIDOS",
      value: String(converted),
      suffix: "",
      icon: TrendingUp,
      color: "var(--color-brand-teal-300)",
      delta: `${conversionRate}% taxa de conversão`,
    },
    {
      label: "AGENDAMENTOS",
      value: String(totalEvents),
      suffix: "",
      icon: CalendarCheck,
      color: "var(--color-brand-blue-400)",
      delta: totalEvents > 0 ? "criados" : "nenhum ainda",
    },
    {
      label: "LEADS QUENTES",
      value: String(hotLeads),
      suffix: "",
      icon: Zap,
      color: "#FB7185",
      delta: `heat médio: ${avgHeatScore}/100`,
    },
  ];

  const totalByChannel = byChannel.reduce((s, c) => s + c.count, 0) || 1;
  const totalByStatus = byStatus.reduce((s, c) => s + c.count, 0) || 1;

  if (totalLeads === 0) {
    return (
      <div className="mobile-scroll-area h-full overflow-y-auto px-8 py-7">
        <header className="mb-6">
          <h1 className="text-[28px] font-bold tracking-[-0.02em]">Relatórios</h1>
          <p className="mt-1 text-sm" style={{ color: "var(--color-fg-2)" }}>
            Dados em tempo real · sua conta
          </p>
        </header>
        <div className="flex flex-col items-center justify-center rounded-2xl border border-white/[0.08] bg-white/[0.04] py-20 text-center">
          <div className="mb-3 grid h-14 w-14 place-items-center rounded-2xl bg-white/[0.06]">
            <Star size={24} style={{ color: "var(--color-fg-3)" }} />
          </div>
          <p className="text-sm font-semibold">Nenhum dado ainda</p>
          <p className="mt-1 max-w-xs text-[13px]" style={{ color: "var(--color-fg-3)" }}>
            Os relatórios aparecem assim que leads chegarem via WhatsApp, Instagram ou formulário.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto px-8 py-7">
      <header className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-[28px] font-bold tracking-[-0.02em]">Relatórios</h1>
          <p className="mt-1 text-sm" style={{ color: "var(--color-fg-2)" }}>
            Dados em tempo real · sua conta · {totalMessages} mensagens ({aiMessages} IA)
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex gap-1 rounded-xl border border-white/[0.08] bg-white/[0.03] p-1">
            {PERIODS.map((p) => (
              <button
                key={p.id}
                onClick={() => setPeriod(p.id)}
                className={cn(
                  "rounded-lg px-3 py-1 font-mono text-xs font-medium transition-colors",
                  period === p.id
                    ? "bg-white/[0.1] text-white"
                    : "text-fg-3 hover:text-white",
                )}
                style={period === p.id ? undefined : { color: "var(--color-fg-3)" }}
              >
                {p.label}
              </button>
            ))}
          </div>
          <Button variant="secondary" size="sm" disabled={exportPending} onClick={handleExport}>
            <Download size={14} />
            {exportPending ? "…" : "Exportar CSV"}
          </Button>
        </div>
      </header>

      {/* KPI Cards */}
      <motion.div
        variants={stagger(0.05, 0.08)}
        initial="hidden"
        animate="show"
        className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4"
      >
        {kpis.map((k) => (
          <motion.div
            key={k.label}
            variants={{ hidden: { opacity: 0, y: 12 }, show: { opacity: 1, y: 0 } }}
            whileHover={{ y: -3 }}
            transition={{ type: "spring", stiffness: 400, damping: 28 }}
            className="rounded-2xl border border-white/[0.08] bg-white/[0.04] p-5"
          >
            <div className="flex items-start justify-between">
              <div className="font-mono text-[10px] tracking-[0.16em]" style={{ color: "var(--color-fg-3)" }}>
                {k.label}
              </div>
              <k.icon size={14} style={{ color: "var(--color-fg-3)" }} />
            </div>
            <div
              className="mt-2 text-[32px] font-bold leading-none tracking-[-0.03em]"
              style={{ color: k.color }}
            >
              <AnimatedNumber value={Number(k.value)} />
              {k.suffix && (
                <span className="ml-0.5 text-base" style={{ color: "var(--color-fg-3)" }}>
                  {k.suffix}
                </span>
              )}
            </div>
            <span
              className="mt-3 inline-flex items-center gap-1 rounded-full border border-[#14B8A6]/30 bg-[#14B8A6]/10 px-2 py-0.5 font-mono text-[11px] font-medium text-brand-teal-300"
            >
              {k.delta}
            </span>
          </motion.div>
        ))}
      </motion.div>

      <div className="mb-4 grid gap-4 lg:grid-cols-[1.4fr_1fr]">
        {/* Trend: leads por dia */}
        <FadeUp>
          <div className="rounded-2xl border border-white/[0.08] bg-white/[0.04] p-5">
            <h3 className="text-sm font-semibold">Leads por dia · últimos 14 dias</h3>
            <p className="mb-4 text-xs" style={{ color: "var(--color-fg-3)" }}>Novos leads diários</p>
            {dailyLeads.every((d) => d.count === 0) ? (
              <div className="flex h-[140px] items-center justify-center text-xs" style={{ color: "var(--color-fg-3)" }}>
                Nenhum lead nos últimos 14 dias
              </div>
            ) : (
              <>
                <svg viewBox="0 0 600 140" width="100%" height="140" preserveAspectRatio="none">
                  <defs>
                    <linearGradient id="grad-leads" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#3B82F6" stopOpacity="0.35" />
                      <stop offset="100%" stopColor="#3B82F6" stopOpacity="0" />
                    </linearGradient>
                  </defs>
                  <motion.path
                    d={trend.f}
                    fill="url(#grad-leads)"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ duration: 0.8, delay: 0.2 }}
                  />
                  <motion.path
                    d={trend.d}
                    fill="none"
                    stroke="#3B82F6"
                    strokeWidth={2.5}
                    initial={{ pathLength: 0 }}
                    animate={{ pathLength: 1 }}
                    transition={{ duration: 1.2, ease: [0.22, 1, 0.36, 1] }}
                  />
                </svg>
                <div className="mt-2 flex justify-between">
                  {dailyLeads
                    .filter((_, i) => i % 2 === 0)
                    .map((d) => (
                      <span key={d.date} className="font-mono text-[9px]" style={{ color: "var(--color-fg-3)" }}>
                        {formatDateShort(d.date)}
                      </span>
                    ))}
                </div>
              </>
            )}
          </div>
        </FadeUp>

        {/* Distribuição por status */}
        <FadeUp delay={0.1}>
          <div className="rounded-2xl border border-white/[0.08] bg-white/[0.04] p-5">
            <h3 className="text-sm font-semibold">Distribuição por temperatura</h3>
            <p className="mb-3 text-xs" style={{ color: "var(--color-fg-3)" }}>Leads classificados por IA</p>
            {byStatus.map((s) => (
              <div
                key={s.label}
                className="my-2.5 grid items-center gap-3"
                style={{ gridTemplateColumns: "90px 1fr 36px" }}
              >
                <span className="text-xs font-medium" style={{ color: "var(--color-fg-2)" }}>{s.label}</span>
                <div className="h-2 overflow-hidden rounded-full bg-white/[0.06]">
                  <motion.div
                    initial={{ width: 0 }}
                    whileInView={{ width: `${Math.round((s.count / totalByStatus) * 100)}%` }}
                    viewport={{ once: true }}
                    transition={{ duration: 1, ease: [0.22, 1, 0.36, 1] }}
                    className="h-full rounded-full"
                    style={{ background: s.color }}
                  />
                </div>
                <span className="text-right font-mono text-xs">{s.count}</span>
              </div>
            ))}
          </div>
        </FadeUp>
      </div>

      <div className="grid gap-4 lg:grid-cols-[1.4fr_1fr]">
        {/* Por canal */}
        <FadeUp>
          <div className="rounded-2xl border border-white/[0.08] bg-white/[0.04] p-5">
            <h3 className="text-sm font-semibold">Leads por canal</h3>
            <p className="mb-3 text-xs" style={{ color: "var(--color-fg-3)" }}>Origem dos contatos</p>
            {byChannel.map((c) => (
              <div
                key={c.channel}
                className="my-2.5 grid items-center gap-3"
                style={{ gridTemplateColumns: "90px 1fr 36px" }}
              >
                <span className="text-xs font-medium" style={{ color: "var(--color-fg-2)" }}>{c.label}</span>
                <div className="h-2 overflow-hidden rounded-full bg-white/[0.06]">
                  <motion.div
                    initial={{ width: 0 }}
                    whileInView={{ width: `${Math.round((c.count / totalByChannel) * 100)}%` }}
                    viewport={{ once: true }}
                    transition={{ duration: 1, ease: [0.22, 1, 0.36, 1] }}
                    className="h-full rounded-full"
                    style={{ background: CHANNEL_COLORS[c.channel] ?? "#60A5FA" }}
                  />
                </div>
                <span className="text-right font-mono text-xs">{c.count}</span>
              </div>
            ))}
          </div>
        </FadeUp>

        {/* Resumo geral */}
        <FadeUp delay={0.1}>
          <div className="rounded-2xl border border-white/[0.08] bg-white/[0.04] p-5">
            <h3 className="text-sm font-semibold">Resumo geral</h3>
            <p className="mb-4 text-xs" style={{ color: "var(--color-fg-3)" }}>Métricas acumuladas da conta</p>
            <div className="flex flex-col gap-3">
              {[
                { icon: Users, label: "Total de leads", value: String(totalLeads) },
                { icon: Zap, label: "Leads quentes", value: String(hotLeads) },
                { icon: TrendingUp, label: "Convertidos", value: `${converted} (${conversionRate}%)` },
                { icon: CalendarCheck, label: "Agendamentos", value: String(totalEvents) },
                { icon: MessageCircle, label: "Mensagens IA", value: String(aiMessages) },
                { icon: Star, label: "Heat score médio", value: `${avgHeatScore}/100` },
              ].map((row) => (
                <div
                  key={row.label}
                  className="flex items-center gap-3 rounded-xl border border-white/[0.08] bg-white/[0.03] px-3 py-2.5"
                >
                  <div className="grid h-7 w-7 place-items-center rounded-lg bg-white/[0.06]">
                    <row.icon size={13} style={{ color: "var(--color-fg-3)" }} />
                  </div>
                  <div className="flex-1 text-[13px]" style={{ color: "var(--color-fg-2)" }}>{row.label}</div>
                  <span className="font-mono text-xs font-semibold">{row.value}</span>
                </div>
              ))}
            </div>
          </div>
        </FadeUp>
      </div>
    </div>
  );
}
