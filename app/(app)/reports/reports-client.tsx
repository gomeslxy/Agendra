"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer,
} from "recharts";
import {
  Download, Users, TrendingUp, CalendarCheck, Zap,
  MessageCircle, Star, Bot, Activity, ArrowUpRight, ArrowDownRight, Info
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { exportReportsXlsx } from "./actions";

/* ─── helpers ─────────────────────────────────────────────── */
function AnimatedNumber({ value, suffix = "", prefix = "" }: { value: number; suffix?: string; prefix?: string }) {
  const [display, setDisplay] = useState(0);
  const raf = useRef<number>(0);
  useEffect(() => {
    const start = Date.now();
    const dur = 900;
    const tick = () => {
      const t = Math.min((Date.now() - start) / dur, 1);
      const eased = 1 - Math.pow(1 - t, 3);
      setDisplay(Math.round(value * eased));
      if (t < 1) raf.current = requestAnimationFrame(tick);
    };
    raf.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf.current);
  }, [value]);
  return <>{prefix}{display}{suffix}</>;
}

function formatDate(dateStr: string) {
  const [, m, d] = dateStr.split("-");
  return `${d}/${m}`;
}

const WEEKDAYS = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
const HOURS = Array.from({ length: 24 }, (_, i) => i);

/* ─── types ────────────────────────────────────────────────── */
interface DayBucket {
  date: string; leads: number; hot: number; warm: number;
  cold: number; converted: number; events: number;
  messages: number; aiMessages: number;
  whatsapp: number; instagram: number; form: number;
}
interface HeatCell     { weekday: number; hour: number; value: number }
interface FunnelStage  { label: string; value: number; color: string }

interface ReportsClientProps {
  dailyDetails: DayBucket[];
  funnelStages: FunnelStage[]; // This is still 90d snapshot as before, we'll recompute later if needed
  heatmapData: HeatCell[];
  avgHeatScore: number;
}

/* ─── Custom tooltip for area chart ──────────────────────────── */
function AreaTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="glass relative z-50 rounded-xl px-4 py-3 text-xs shadow-xl">
      <p className="mb-2 font-semibold text-white">{label}</p>
      {payload.map((p: any) => (
        <div key={p.name} className="flex items-center gap-2">
          <span className="h-2 w-2 rounded-full" style={{ background: p.color }} />
          <span style={{ color: "var(--color-fg-2)" }}>{p.name === "leads" ? "Leads" : "Agendamentos"}:</span>
          <span className="font-mono font-semibold text-white">{p.value}</span>
        </div>
      ))}
    </div>
  );
}

/* ─── Funnel Component ────────────────────────────────────────── */
function ConversionFunnel({ stages }: { stages: FunnelStage[] }) {
  const max = stages[0]?.value || 1;
  return (
    <div className="flex flex-col gap-2">
      {stages.map((s, i) => {
        const pct = max > 0 ? (s.value / max) * 100 : 0;
        const dropPct = i > 0 && stages[i - 1].value > 0
          ? Math.round((1 - s.value / stages[i - 1].value) * 100)
          : null;
        return (
          <div key={s.label}>
            {dropPct !== null && (
              <div className="mb-1 flex justify-end">
                <span className="rounded-full border border-red-500/20 bg-red-500/10 px-2 py-0.5 font-mono text-[10px] text-red-400">
                  -{dropPct}% queda
                </span>
              </div>
            )}
            <motion.div
              initial={{ opacity: 0, x: -16 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: i * 0.08, duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
              className="relative overflow-hidden rounded-xl border border-white/[0.07] bg-white/[0.03]"
              style={{ marginInline: `${(i / stages.length) * 8}%` }}
            >
              <motion.div
                initial={{ width: 0 }}
                animate={{ width: `${pct}%` }}
                transition={{ delay: i * 0.08 + 0.2, duration: 0.9, ease: [0.22, 1, 0.36, 1] }}
                className="absolute inset-y-0 left-0 rounded-xl opacity-20"
                style={{ background: s.color }}
              />
              <div className="relative flex items-center justify-between px-4 py-3">
                <div className="flex items-center gap-2">
                  <span className="h-2.5 w-2.5 rounded-full" style={{ background: s.color }} />
                  <span className="text-sm font-medium" style={{ color: "var(--color-fg-2)" }}>{s.label}</span>
                </div>
                <span className="font-mono text-base font-bold" style={{ color: s.color }}>
                  {s.value}
                </span>
              </div>
            </motion.div>
          </div>
        );
      })}
    </div>
  );
}

/* ─── Heatmap Component ───────────────────────────────────────── */
function LeadHeatmap({ data }: { data: HeatCell[] }) {
  const [tooltip, setTooltip] = useState<{ weekday: number; hour: number; value: number } | null>(null);
  const maxVal = Math.max(...data.map((d) => d.value), 1);
  const grid = new Map(data.map((d) => [`${d.weekday}-${d.hour}`, d.value]));

  // Find peak hour
  let peak = { weekday: 0, hour: 0, value: 0 };
  for (const cell of data) {
    if (cell.value > peak.value) peak = cell;
  }

  return (
    <div>
      {peak.value > 0 && (
        <div className="mb-4 flex items-start gap-3 rounded-xl border border-blue-500/20 bg-blue-500/10 px-4 py-3">
          <Info className="mt-0.5 text-blue-400" size={16} />
          <div>
            <p className="text-[13px] font-medium text-blue-100">Pico de atividade</p>
            <p className="text-xs text-blue-200/70">
              Seu maior volume é <strong>{WEEKDAYS[peak.weekday]} às {peak.hour}h</strong> ({peak.value} leads).
              Garanta que a IA ou seu time estejam prontos para atender nesse horário.
            </p>
          </div>
        </div>
      )}
      
      <div className="overflow-x-auto pb-4">
        <div className="min-w-[520px] relative">
          {/* Hour labels */}
          <div className="mb-1 ml-10 grid" style={{ gridTemplateColumns: `repeat(24, 1fr)` }}>
            {HOURS.filter((h) => h % 4 === 0).map((h) => (
              <div
                key={h}
                className="font-mono text-[9px] text-center"
                style={{ color: "var(--color-fg-3)", gridColumn: `${h + 1} / span 4` }}
              >
                {h}h
              </div>
            ))}
          </div>
          {WEEKDAYS.map((day, wd) => (
            <div key={day} className="mb-0.5 flex items-center gap-1">
              <span className="w-9 shrink-0 text-right font-mono text-[10px]" style={{ color: "var(--color-fg-3)" }}>
                {day}
              </span>
              <div className="grid flex-1 gap-0.5" style={{ gridTemplateColumns: `repeat(24, 1fr)` }}>
                {HOURS.map((h) => {
                  const val = grid.get(`${wd}-${h}`) ?? 0;
                  const intensity = val / maxVal;
                  return (
                    <motion.div
                      key={h}
                      whileHover={{ scale: 1.3, zIndex: 10 }}
                      onHoverStart={() => setTooltip({ weekday: wd, hour: h, value: val })}
                      onHoverEnd={() => setTooltip(null)}
                      className="aspect-square cursor-pointer rounded-sm relative"
                      style={{
                        background: val === 0
                          ? "rgba(255,255,255,0.04)"
                          : `rgba(59,130,246,${0.15 + intensity * 0.85})`,
                      }}
                    >
                      {tooltip?.weekday === wd && tooltip?.hour === h && (
                        <div className="pointer-events-none absolute bottom-full left-1/2 mb-2 -translate-x-1/2 whitespace-nowrap rounded-lg border border-white/[0.08] bg-[#1a1a1a]/95 px-3 py-1.5 text-xs shadow-xl backdrop-blur-md z-50">
                          <span style={{ color: "var(--color-fg-3)" }}>{WEEKDAYS[wd]} às {h}h:</span>
                          <span className="ml-1 font-mono font-semibold text-white">{val} lead{val !== 1 ? "s" : ""}</span>
                        </div>
                      )}
                    </motion.div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ─── KPI Card Component ─────────────────────────────────────── */
function KpiCard({ 
  label, value, suffix = "", icon: Icon, color, prevValue 
}: { 
  label: string; value: number; suffix?: string; icon: any; color: string; prevValue?: number 
}) {
  const delta = prevValue !== undefined && prevValue > 0 
    ? Math.round(((value - prevValue) / prevValue) * 100) 
    : 0;
    
  return (
    <motion.div
      variants={{ hidden: { opacity: 0, y: 14 }, show: { opacity: 1, y: 0 } }}
      whileHover={{ y: -3, transition: { type: "spring", stiffness: 400, damping: 26 } }}
      className="glass rounded-2xl p-5"
    >
      <div className="flex items-start justify-between">
        <span className="font-mono text-[10px] tracking-[0.16em]" style={{ color: "var(--color-fg-3)" }}>
          {label}
        </span>
        <Icon size={14} style={{ color: "var(--color-fg-3)" }} />
      </div>
      <div className="mt-3 text-[34px] font-bold leading-none tracking-[-0.03em]" style={{ color }}>
        <AnimatedNumber value={value} suffix={suffix} />
      </div>
      
      {prevValue !== undefined && (
        <div className="mt-3 flex items-center gap-2">
          <span 
            className={cn(
              "inline-flex items-center gap-0.5 rounded-full px-2 py-0.5 font-mono text-[10px] font-medium",
              delta > 0 ? "bg-emerald-500/10 text-emerald-400" : 
              delta < 0 ? "bg-red-500/10 text-red-400" : 
              "bg-white/[0.06] text-white/60"
            )}
          >
            {delta > 0 ? <ArrowUpRight size={10} /> : delta < 0 ? <ArrowDownRight size={10} /> : null}
            {delta > 0 ? "+" : ""}{delta}%
          </span>
          <span className="text-[10px]" style={{ color: "var(--color-fg-3)" }}>vs período anterior</span>
        </div>
      )}
    </motion.div>
  );
}

/* ─── Main component ──────────────────────────────────────────── */
type Period = "7d" | "30d" | "all";
const PERIODS: { id: Period; label: string; days: number }[] = [
  { id: "7d", label: "7 Dias", days: 7 },
  { id: "30d", label: "30 Dias", days: 30 },
  { id: "all", label: "Trimestre", days: 90 },
];

const CHANNEL_COLORS: Record<string, string> = {
  whatsapp: "#14B8A6",
  instagram: "#F97316",
  form: "#3B82F6",
};

export function ReportsClient({
  dailyDetails, funnelStages, heatmapData, avgHeatScore,
}: ReportsClientProps) {
  const [period, setPeriod] = useState<Period>("7d");
  const [exportPending, startExport] = useTransition();

  const days = PERIODS.find((p) => p.id === period)?.days || 90;
  
  // Current period slice
  const currentSeries = dailyDetails.slice(-days);
  
  // Previous period slice (for comparison)
  const prevSeries = dailyDetails.slice(-(days * 2), -days);

  // Recompute KPIs for current period
  const totalLeads = currentSeries.reduce((s, d) => s + d.leads, 0);
  const hotLeads = currentSeries.reduce((s, d) => s + d.hot, 0);
  const converted = currentSeries.reduce((s, d) => s + d.converted, 0);
  const totalEvents = currentSeries.reduce((s, d) => s + d.events, 0);
  const totalMessages = currentSeries.reduce((s, d) => s + d.messages, 0);
  const aiMessages = currentSeries.reduce((s, d) => s + d.aiMessages, 0);
  
  const aiRatio = totalMessages > 0 ? Math.round((aiMessages / totalMessages) * 100) : 0;
  
  // Recompute KPIs for previous period
  const prevLeads = prevSeries.reduce((s, d) => s + d.leads, 0);
  const prevConverted = prevSeries.reduce((s, d) => s + d.converted, 0);
  const prevEvents = prevSeries.reduce((s, d) => s + d.events, 0);
  
  // By Channel & Status for current period
  const channels = [
    { channel: "whatsapp", label: "WhatsApp", count: currentSeries.reduce((s, d) => s + d.whatsapp, 0) },
    { channel: "instagram", label: "Instagram", count: currentSeries.reduce((s, d) => s + d.instagram, 0) },
    { channel: "form", label: "Formulário", count: currentSeries.reduce((s, d) => s + d.form, 0) },
  ].filter(c => c.count > 0).sort((a, b) => b.count - a.count);
  
  const totalByChannel = channels.reduce((s, c) => s + c.count, 0) || 1;
  const topChannel = channels[0];

  const chartData = currentSeries.map((d) => ({ ...d, date: formatDate(d.date) }));

  function handleExport() {
    startExport(async () => {
      try {
        const base64Str = await exportReportsXlsx();
        const byteCharacters = atob(base64Str);
        const byteNumbers = new Array(byteCharacters.length);
        for (let i = 0; i < byteCharacters.length; i++) {
          byteNumbers[i] = byteCharacters.charCodeAt(i);
        }
        const byteArray = new Uint8Array(byteNumbers);
        const blob = new Blob([byteArray], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `agendra_bi_${new Date().toISOString().slice(0, 10)}.xlsx`;
        a.click();
        URL.revokeObjectURL(url);
      } catch (e) {
        alert((e as Error).message);
      }
    });
  }

  if (dailyDetails.reduce((s, d) => s + d.leads, 0) === 0) {
    return (
      <div className="h-full overflow-y-auto px-6 py-7 lg:px-8">
        <h1 className="mb-2 text-[28px] font-bold tracking-[-0.02em]">Business Intelligence</h1>
        <div className="mt-12 flex flex-col items-center justify-center rounded-2xl border border-white/[0.08] bg-white/[0.04] py-20 text-center">
          <div className="mb-3 grid h-14 w-14 place-items-center rounded-2xl bg-white/[0.06]">
            <Activity size={24} style={{ color: "var(--color-fg-3)" }} />
          </div>
          <p className="text-sm font-semibold">Nenhum dado analítico ainda</p>
          <p className="mt-1 max-w-xs text-[13px]" style={{ color: "var(--color-fg-3)" }}>
            Seus dashboards serão gerados automaticamente assim que seus primeiros leads interagirem.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto px-6 py-7 lg:px-8">
      {/* ── Header ── */}
      <header className="mb-7 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-[28px] font-bold tracking-[-0.02em]">Business Intelligence</h1>
          <p className="mt-1 text-sm flex items-center gap-2" style={{ color: "var(--color-fg-2)" }}>
            Visão de {days} dias <span className="h-1 w-1 rounded-full bg-white/20" /> {totalLeads} leads totais
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
                  period === p.id ? "bg-white/[0.1] text-white" : "hover:text-white",
                )}
                style={period !== p.id ? { color: "var(--color-fg-3)" } : undefined}
              >
                {p.label}
              </button>
            ))}
          </div>
          <Button variant="secondary" size="sm" disabled={exportPending} onClick={handleExport} className="h-8">
            <Download size={14} className="mr-1" />
            {exportPending ? "Gerando..." : "Exportar Dados"}
          </Button>
        </div>
      </header>
      
      {/* ── Insights Top Bar ── */}
      <div className="mb-6 grid gap-3 lg:grid-cols-3">
        {topChannel && (
          <div className="glass rounded-xl px-4 py-3 flex items-center gap-3">
            <div className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-blue-500/10 text-blue-400">
              <TrendingUp size={16} />
            </div>
            <div>
              <p className="text-[11px] font-medium uppercase tracking-wider text-white/50">Melhor Canal</p>
              <p className="text-sm font-semibold">{topChannel.label} ({Math.round(topChannel.count / totalByChannel * 100)}%)</p>
            </div>
          </div>
        )}
        <div className="glass rounded-xl px-4 py-3 flex items-center gap-3">
          <div className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-teal-500/10 text-teal-400">
            <Zap size={16} />
          </div>
          <div>
            <p className="text-[11px] font-medium uppercase tracking-wider text-white/50">Qualificação IA</p>
            <p className="text-sm font-semibold">{hotLeads} leads quentes identificados</p>
          </div>
        </div>
        <div className="glass rounded-xl px-4 py-3 flex items-center gap-3">
          <div className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-amber-500/10 text-amber-400">
            <CalendarCheck size={16} />
          </div>
          <div>
            <p className="text-[11px] font-medium uppercase tracking-wider text-white/50">Taxa de Conversão</p>
            <p className="text-sm font-semibold">
              {totalLeads > 0 ? Math.round((converted / totalLeads) * 100) : 0}% de conversão real
            </p>
          </div>
        </div>
      </div>

      {/* ── KPI Bento Grid ── */}
      <motion.div
        initial="hidden" animate="show"
        variants={{ hidden: {}, show: { transition: { staggerChildren: 0.06 } } }}
        className="mb-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4"
      >
        <KpiCard 
          label="NOVOS LEADS" 
          value={totalLeads} 
          icon={Users} 
          color="#60A5FA" 
          prevValue={prevLeads} 
        />
        <KpiCard 
          label="CONVERTIDOS" 
          value={converted} 
          icon={TrendingUp} 
          color="#5EEAD4" 
          prevValue={prevConverted} 
        />
        <KpiCard 
          label="AGENDAMENTOS" 
          value={totalEvents} 
          icon={CalendarCheck} 
          color="#A78BFA" 
          prevValue={prevEvents} 
        />
        <KpiCard 
          label="EFICIÊNCIA IA" 
          value={aiRatio} 
          suffix="%"
          icon={Bot} 
          color="#FB923C" 
        />
      </motion.div>

      {/* ── Area Chart + Funnel ── */}
      <div className="mb-4 grid gap-4 xl:grid-cols-[1.5fr_1fr]">
        {/* Multi-series Area Chart */}
        <motion.div
          initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="glass rounded-2xl p-5 flex flex-col"
        >
          <div className="mb-4 flex items-center justify-between">
            <div>
              <h3 className="mb-1 text-sm font-semibold">Leads vs Agendamentos</h3>
              <p className="text-xs" style={{ color: "var(--color-fg-3)" }}>
                Volume diário ao longo de {days} dias
              </p>
            </div>
            <div className="flex gap-4">
              {[{ color: "#3B82F6", label: "Leads" }, { color: "#14B8A6", label: "Agendamentos" }].map((l) => (
                <div key={l.label} className="flex items-center gap-1.5">
                  <span className="h-2 w-2 rounded-full" style={{ background: l.color }} />
                  <span className="text-xs" style={{ color: "var(--color-fg-3)" }}>{l.label}</span>
                </div>
              ))}
            </div>
          </div>
          
          <div className="flex-1 min-h-[220px]">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={chartData} margin={{ top: 10, right: 0, left: -20, bottom: 0 }}>
                <defs>
                  <linearGradient id="gradLeads" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#3B82F6" stopOpacity={0.4} />
                    <stop offset="95%" stopColor="#3B82F6" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="gradEvents" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#14B8A6" stopOpacity={0.4} />
                    <stop offset="95%" stopColor="#14B8A6" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(255,255,255,0.05)" />
                <XAxis 
                  dataKey="date" 
                  tick={{ fontSize: 10, fill: "var(--color-fg-3)" }} 
                  tickLine={false} 
                  axisLine={false} 
                  tickMargin={10}
                  interval="preserveStartEnd" 
                  minTickGap={20}
                />
                <YAxis 
                  tick={{ fontSize: 10, fill: "var(--color-fg-3)" }} 
                  tickLine={false} 
                  axisLine={false} 
                  allowDecimals={false} 
                />
                <Tooltip content={<AreaTooltip />} cursor={{ stroke: "rgba(255,255,255,0.1)", strokeWidth: 2 }} />
                <Area 
                  type="monotone" 
                  dataKey="leads" 
                  stroke="#3B82F6" 
                  strokeWidth={2} 
                  fill="url(#gradLeads)" 
                  dot={false} 
                  activeDot={{ r: 4, fill: "#3B82F6", stroke: "#fff", strokeWidth: 2 }} 
                />
                <Area 
                  type="monotone" 
                  dataKey="events" 
                  stroke="#14B8A6" 
                  strokeWidth={2} 
                  fill="url(#gradEvents)" 
                  dot={false} 
                  activeDot={{ r: 4, fill: "#14B8A6", stroke: "#fff", strokeWidth: 2 }} 
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </motion.div>

        {/* Conversion Funnel */}
        <motion.div
          initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.15 }}
          className="glass rounded-2xl p-5"
        >
          <h3 className="mb-1 text-sm font-semibold">Funil Histórico</h3>
          <p className="mb-4 text-xs" style={{ color: "var(--color-fg-3)" }}>
            Taxa de queda (all-time snapshot)
          </p>
          <ConversionFunnel stages={funnelStages} />
        </motion.div>
      </div>

      {/* ── Heatmap ── */}
      <motion.div
        initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2 }}
        className="glass mb-4 rounded-2xl p-5"
      >
        <h3 className="mb-1 text-sm font-semibold">Densidade de Chegada de Leads</h3>
        <p className="mb-4 text-xs" style={{ color: "var(--color-fg-3)" }}>
          Concentração histórica de novos leads por dia da semana e horário. Use para otimizar plantões.
        </p>
        <LeadHeatmap data={heatmapData} />
      </motion.div>
    </div>
  );
}
