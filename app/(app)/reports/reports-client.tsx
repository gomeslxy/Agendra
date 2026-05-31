"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { motion, AnimatePresence } from "framer-motion";
import dynamic from "next/dynamic";
const RevenueChart = dynamic(
  () => import("./components/RevenueChart").then((m) => m.RevenueChart),
  {
    ssr: false,
    loading: () => (
      <div className="h-full min-h-[220px] animate-pulse rounded-xl bg-[#F4F4F5]" />
    ),
  }
);
import {
  Download, Users, TrendingUp, CalendarCheck, Zap,
  Bot, Activity, ArrowUpRight, ArrowDownRight, Info,
  DollarSign, Sparkles, ChevronRight, BarChart3, Banknote,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { exportReportsXlsx } from "./actions";
import { createClient } from "@/lib/supabase/client";
import { ProviderHealthSection } from "./components/ProviderHealthSection";
import { EmptyState } from "@/components/ui/empty-state";
import { computeFunnel, type FunnelStage } from "./funnel";

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
  revenue: number; transactionCount: number;
  fInteragiu: number; fAgendou: number;
}
interface HeatCell     { weekday: number; hour: number; value: number }
interface RecentTransaction {
  id: string;
  amount: number;
  status: string;
  paid_at: string | null;
  lead_id: string | null;
  lead: { name: string } | null;
}

export interface ProviderStat {
  provider: 'cerebras' | 'groq' | 'sambanova' | 'gemini';
  requests_24h: number;
  requests_7d: number;
  successes_7d: number;
  avg_latency_ms: number;
  total_cost_7d: number;
}

export interface ChainStat {
  chain_kind: 'conv' | 'tools' | 'bg';
  count: number;
}

interface ReportsClientProps {
  dailyDetails: DayBucket[];
  heatmapData: HeatCell[];
  avgHeatScore: number;
  totalRevenue90d: number;
  avgTicket: number;
  recentTransactions: RecentTransaction[];
  companyId: string;
  providerStats: ProviderStat[];
  chainStats: ChainStat[];
  hasAnalytics: boolean;
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
                <span className="rounded-full border border-[#FECACA] bg-[#FFF1F2] px-2 py-0.5 font-mono text-[10px] text-[#DC2626]">
                  -{dropPct}% queda
                </span>
              </div>
            )}
            <motion.div
              initial={{ opacity: 0, x: -16 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: i * 0.08, duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
              className="relative overflow-hidden rounded-xl border border-[#E4E4E7] bg-white"
              style={{ marginInline: `${(i / stages.length) * 8}%` }}
            >
              <motion.div
                initial={{ width: 0 }}
                animate={{ width: `${pct}%` }}
                transition={{ delay: i * 0.08 + 0.2, duration: 0.9, ease: [0.22, 1, 0.36, 1] }}
                className="absolute inset-y-0 left-0 rounded-xl opacity-15"
                style={{ background: s.color }}
              />
              <div className="relative flex items-center justify-between px-4 py-3">
                <div className="flex items-center gap-2">
                  <span className="h-2.5 w-2.5 rounded-full" style={{ background: s.color }} />
                  <span className="text-sm font-medium text-[#3F3F46]">{s.label}</span>
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

  let peak = { weekday: 0, hour: 0, value: 0 };
  for (const cell of data) {
    if (cell.value > peak.value) peak = cell;
  }

  return (
    <div>
      {peak.value > 0 && (
        <div className="mb-4 flex items-start gap-3 rounded-xl border border-[#BFDBFE] bg-[#EFF6FF] px-4 py-3">
          <Info className="mt-0.5 text-[#2563EB]" size={16} />
          <div>
            <p className="text-[13px] font-medium text-[#1D4ED8]">Pico de atividade</p>
            <p className="text-xs text-[#3B82F6]">
              Seu maior volume é <strong>{WEEKDAYS[peak.weekday]} às {peak.hour}h</strong> ({peak.value} leads).
              Garanta que a IA ou seu time estejam prontos para atender nesse horário.
            </p>
          </div>
        </div>
      )}

      <div className="overflow-x-auto pb-4">
        <div className="min-w-[520px] relative">
          <div className="mb-1 ml-10 grid" style={{ gridTemplateColumns: `repeat(24, 1fr)` }}>
            {HOURS.filter((h) => h % 4 === 0).map((h) => (
              <div
                key={h}
                className="font-mono text-[9px] text-center text-[#A1A1AA]"
                style={{ gridColumn: `${h + 1} / span 4` }}
              >
                {h}h
              </div>
            ))}
          </div>
          {WEEKDAYS.map((day, wd) => (
            <div key={day} className="mb-0.5 flex items-center gap-1">
              <span className="w-9 shrink-0 text-right font-mono text-[10px] text-[#A1A1AA]">
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
                          ? "#F4F4F5"
                          : `rgba(37,99,235,${0.1 + intensity * 0.8})`,
                      }}
                    >
                      {tooltip?.weekday === wd && tooltip?.hour === h && (
                        <div className="pointer-events-none absolute bottom-full left-1/2 mb-2 -translate-x-1/2 whitespace-nowrap rounded-lg border border-[#E4E4E7] bg-white px-3 py-1.5 text-xs shadow-xl z-50">
                          <span className="text-[#71717A]">{WEEKDAYS[wd]} às {h}h:</span>
                          <span className="ml-1 font-mono font-semibold text-[#09090B]">{val} lead{val !== 1 ? "s" : ""}</span>
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
      whileHover={{ y: -2, transition: { type: "spring", stiffness: 400, damping: 26 } }}
      className="rounded-2xl border border-[#E4E4E7] bg-white p-5 relative overflow-hidden transition-all duration-200 hover:bg-[#F4F4F5] hover:border-[#D4D4D8] shadow-sm"
    >
      <div className="flex items-start justify-between select-none">
        <span className="font-mono text-[9px] tracking-[0.16em] uppercase text-[#71717A]">
          {label}
        </span>
        <Icon size={13} className="text-[#D4D4D8]" />
      </div>
      <div className="mt-3 text-3xl font-bold leading-none tracking-[-0.03em] text-[#09090B]">
        <AnimatedNumber value={value} suffix={suffix} />
      </div>

      {prevValue !== undefined && (
        <div className="mt-3 flex items-center gap-2 select-none">
          <span
            className={cn(
              "inline-flex items-center gap-0.5 rounded border px-1.5 py-0.5 font-mono text-[9px] font-bold",
              delta > 0 ? "border-[#BBF7D0] bg-[#F0FDF4] text-[#166534]" :
              delta < 0 ? "border-[#FECACA] bg-[#FFF1F2] text-[#DC2626]" :
              "border-[#E4E4E7] bg-[#F4F4F5] text-[#A1A1AA]",
            )}
          >
            {delta > 0 ? <ArrowUpRight size={9} /> : delta < 0 ? <ArrowDownRight size={9} /> : null}
            {delta > 0 ? "+" : ""}{delta}%
          </span>
          <span className="text-[9px] font-medium text-[#A1A1AA]">vs anterior</span>
        </div>
      )}
    </motion.div>
  );
}

/* ─── Currency formatter ─────────────────────────────────────── */
function formatBRL(value: number) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(value);
}

/* ─── ROI Hero Card ──────────────────────────────────────────── */
function RoiHero({
  revenue, timeSaved, converted, totalLeads,
}: {
  revenue: number; timeSaved: number; converted: number; totalLeads: number;
}) {
  const convRate = totalLeads > 0 ? Math.round((converted / totalLeads) * 100) : 0;
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
      className="relative mb-6 overflow-hidden rounded-2xl border border-[#BFDBFE] p-6 lg:p-8"
      style={{
        background: "linear-gradient(135deg, #EFF6FF 0%, #F5F3FF 50%, #F0FDFA 100%)",
      }}
    >
      <div className="relative">
        <div className="mb-1 flex items-center gap-2">
          <div className="flex h-6 w-6 items-center justify-center rounded-full bg-[#DBEAFE]">
            <Sparkles size={12} className="text-[#2563EB]" />
          </div>
          <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-[#3B82F6]">ROI do Período</span>
        </div>

        <div className="mt-4 grid gap-6 md:grid-cols-3">
          {/* Revenue */}
          <div>
            <p className="mb-1 text-[11px] font-medium uppercase tracking-wider text-[#71717A]">Receita Gerada pelo Agendra</p>
            <div className="text-[42px] font-bold leading-none tracking-[-0.03em] text-[#09090B]">
              {revenue > 0
                ? <AnimatedNumber value={Math.round(revenue)} prefix="R$ " />
                : <span className="text-2xl text-[#71717A]">Sem transações ainda</span>
              }
            </div>
            {revenue > 0 && (
              <p className="mt-2 text-[12px] text-[#71717A]">
                em vendas fechadas automaticamente
              </p>
            )}
          </div>

          {/* Time saved */}
          <div>
            <p className="mb-1 text-[11px] font-medium uppercase tracking-wider text-[#71717A]">Horas do Time Economizadas</p>
            <div className="text-[42px] font-bold leading-none tracking-[-0.03em] text-[#0D9488]">
              <AnimatedNumber value={timeSaved} suffix="h" />
            </div>
            <p className="mt-2 text-[12px] text-[#71717A]">
              de atendimento manual evitado
            </p>
          </div>

          {/* Conversion */}
          <div>
            <p className="mb-1 text-[11px] font-medium uppercase tracking-wider text-[#71717A]">Taxa de Conversão Real</p>
            <div className="text-[42px] font-bold leading-none tracking-[-0.03em] text-[#7C3AED]">
              <AnimatedNumber value={convRate} suffix="%" />
            </div>
            <p className="mt-2 text-[12px] text-[#71717A]">
              {converted} de {totalLeads} leads convertidos
            </p>
          </div>
        </div>
      </div>
    </motion.div>
  );
}

/* ─── What-If Simulator ───────────────────────────────────────── */
function WhatIfSimulator({ avgTicket, totalLeads }: { avgTicket: number; totalLeads: number }) {
  const [followUpRate, setFollowUpRate] = useState(30);
  const ticket = avgTicket > 0 ? avgTicket : 350;
  const extraConversions = Math.round((totalLeads * (followUpRate / 100)) * 0.18);
  const extraRevenue = extraConversions * ticket;
  const extraHours = Math.round(extraConversions * 0.8);

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.25, duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
      className="border border-[#E4E4E7] bg-white rounded-xl p-5 mb-4 shadow-sm"
    >
      <div className="mb-4 flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2">
            <BarChart3 size={14} className="text-[#7C3AED]" />
            <h3 className="text-sm font-semibold text-[#09090B]">Simulador de Ganhos — What If?</h3>
          </div>
          <p className="mt-0.5 text-xs text-[#71717A]">
            Arraste o slider para simular o impacto do Follow-up Inteligente (Plano PRO)
          </p>
        </div>
        <span className="rounded-full border border-[#DDD6FE] bg-[#EDE9FE] px-2.5 py-0.5 text-[10px] font-semibold text-[#6D28D9]">
          PRO
        </span>
      </div>

      <div className="mb-5">
        <div className="mb-2 flex items-center justify-between">
          <label className="text-xs font-medium text-[#3F3F46]">
            Leads reativados com follow-up automático
          </label>
          <span className="font-mono text-sm font-bold text-[#7C3AED]">{followUpRate}%</span>
        </div>
        <input
          type="range"
          min={10}
          max={80}
          step={5}
          value={followUpRate}
          onChange={(e) => setFollowUpRate(Number(e.target.value))}
          className="h-2 w-full cursor-pointer appearance-none rounded-full"
          style={{
            background: `linear-gradient(to right, #8B5CF6 0%, #8B5CF6 ${((followUpRate - 10) / 70) * 100}%, #E4E4E7 ${((followUpRate - 10) / 70) * 100}%, #E4E4E7 100%)`,
          }}
        />
        <div className="mt-1 flex justify-between">
          <span className="font-mono text-[10px] text-[#71717A]">10%</span>
          <span className="font-mono text-[10px] text-[#71717A]">80%</span>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <motion.div
          key={`conversions-${extraConversions}`}
          initial={{ opacity: 0.6, scale: 0.97 }}
          animate={{ opacity: 1, scale: 1 }}
          className="rounded-xl border border-[#E4E4E7] bg-[#F4F4F5] p-4"
        >
          <p className="mb-1 text-[10px] uppercase tracking-wider text-[#71717A]">Agendamentos extras</p>
          <p className="font-mono text-2xl font-bold text-[#09090B]">+{extraConversions}</p>
          <p className="mt-1 text-[11px] text-[#71717A]">no próximo mês</p>
        </motion.div>
        <motion.div
          key={`revenue-${extraRevenue}`}
          initial={{ opacity: 0.6, scale: 0.97 }}
          animate={{ opacity: 1, scale: 1 }}
          className="rounded-xl border border-[#DDD6FE] bg-[#EDE9FE] p-4"
        >
          <p className="mb-1 text-[10px] uppercase tracking-wider text-[#7C3AED]">Receita projetada</p>
          <p className="font-mono text-2xl font-bold text-[#6D28D9]">+{formatBRL(extraRevenue)}</p>
          <p className="mt-1 text-[11px] text-[#7C3AED]">estimativa baseada no ticket médio</p>
        </motion.div>
        <motion.div
          key={`hours-${extraHours}`}
          initial={{ opacity: 0.6, scale: 0.97 }}
          animate={{ opacity: 1, scale: 1 }}
          className="rounded-xl border border-[#99F6E4] bg-[#F0FDFA] p-4"
        >
          <p className="mb-1 text-[10px] uppercase tracking-wider text-[#0D9488]">Horas liberadas</p>
          <p className="font-mono text-2xl font-bold text-[#0F766E]">+{extraHours}h</p>
          <p className="mt-1 text-[11px] text-[#0D9488]">do time para foco estratégico</p>
        </motion.div>
      </div>

      <div className="mt-4 flex items-center justify-between rounded-xl border border-[#DDD6FE] bg-[#EDE9FE] px-4 py-3">
        <p className="text-[12px] font-medium text-[#6D28D9]">
          Ative o Follow-up Inteligente no Plano PRO e comece a ver esses resultados
        </p>
        <button className="flex shrink-0 items-center gap-1 rounded-lg bg-[#7C3AED] px-3 py-1.5 text-[11px] font-semibold text-white transition-opacity hover:opacity-90">
          Ver Planos <ChevronRight size={12} />
        </button>
      </div>
    </motion.div>
  );
}

/* ─── Sales Card (Realtime) ──────────────────────────────────── */
function SalesCard({ initial, companyId }: { initial: RecentTransaction[]; companyId: string }) {
  const [txs, setTxs] = useState<RecentTransaction[]>(initial);
  const [flashId, setFlashId] = useState<string | null>(null);

  useEffect(() => {
    const supabase = createClient();
    const channel = supabase
      .channel(`reports-sales-${companyId}`)
      .on(
        'postgres_changes' as any,
        { event: '*', schema: 'public', table: 'transactions', filter: `company_id=eq.${companyId}` },
        (payload: any) => {
          const tx = payload.new as any;
          if (tx?.status === 'paid') {
            setTxs((prev) => {
              if (prev.some((t) => t.id === tx.id)) return prev;
              const next: RecentTransaction = {
                id: tx.id, amount: tx.amount, status: tx.status,
                paid_at: tx.paid_at, lead_id: tx.lead_id, lead: null,
              };
              return [next, ...prev].slice(0, 10);
            });
            setFlashId(tx.id);
            setTimeout(() => setFlashId(null), 2000);
          }
        }
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [companyId]);

  const today = new Date().toISOString().slice(0, 10);
  const todayTxs = txs.filter((t) => (t.paid_at ?? '').slice(0, 10) === today);
  const todayRevenue = todayTxs.reduce((s, t) => s + Number(t.amount), 0);

  function fmtTime(d: string | null) {
    if (!d) return '';
    return new Date(d).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  }
  function fmtDay(d: string | null) {
    if (!d) return '';
    return new Date(d).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.3, duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
      className="border border-[#E4E4E7] bg-white rounded-xl p-5 mb-4 shadow-sm"
    >
      <div className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="relative flex h-2 w-2">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[#22C55E] opacity-75" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-[#22C55E]" />
          </div>
          <h3 className="text-sm font-semibold text-[#09090B]">Vendas Realizadas</h3>
        </div>
        <div className="text-right">
          <p className="font-mono text-[10px] uppercase tracking-wider text-[#71717A]">Hoje</p>
          <p className="font-mono text-lg font-bold text-[#16A34A]">
            {todayRevenue > 0 ? formatBRL(todayRevenue) : <span className="text-sm text-[#71717A]">—</span>}
          </p>
        </div>
      </div>

      {txs.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-8 text-center">
          <DollarSign size={24} className="mb-2 text-[#D4D4D8]" />
          <p className="text-[13px] text-[#71717A]">Nenhuma venda registrada ainda</p>
          <p className="mt-1 text-[11px] text-[#71717A]">Ative Fintech para rastrear pagamentos em tempo real</p>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          <AnimatePresence initial={false}>
            {txs.slice(0, 5).map((tx) => (
              <motion.div
                key={tx.id}
                initial={{ opacity: 0, x: -12 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 12 }}
                transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
                className={cn(
                  "flex items-center justify-between rounded-xl px-4 py-3 transition-colors duration-500",
                  flashId === tx.id
                    ? "border border-[#BBF7D0] bg-[#F0FDF4]"
                    : "border border-[#E4E4E7] bg-[#F4F4F5]",
                )}
              >
                <div className="flex items-center gap-3">
                  <div className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-[#F0FDF4] border border-[#BBF7D0] text-[#16A34A]">
                    <DollarSign size={14} />
                  </div>
                  <div>
                    <p className="text-[13px] font-medium text-[#09090B]">{tx.lead?.name ?? 'Lead'}</p>
                    <p className="text-[11px] text-[#71717A]">
                      {fmtTime(tx.paid_at)}
                      {tx.paid_at && tx.paid_at.slice(0, 10) !== today && (
                        <> · {fmtDay(tx.paid_at)}</>
                      )}
                    </p>
                  </div>
                </div>
                <span className="font-mono text-sm font-bold text-[#16A34A]">
                  {formatBRL(Number(tx.amount))}
                </span>
              </motion.div>
            ))}
          </AnimatePresence>
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
  dailyDetails,
  heatmapData,
  avgHeatScore,
  totalRevenue90d,
  avgTicket,
  recentTransactions,
  companyId,
  providerStats,
  chainStats,
  hasAnalytics,
}: ReportsClientProps) {
  const [period, setPeriod] = useState<Period>("7d");
  const [exportPending, startExport] = useTransition();

  const days = PERIODS.find((p) => p.id === period)?.days || 90;

  const currentSeries = dailyDetails.slice(-days);
  const prevSeries = dailyDetails.slice(-(days * 2), -days);
  // No prior window exists once the period reaches the 90d data horizon (Trimestre).
  // Without this guard KpiCard renders a phantom "0% vs anterior".
  const hasPrev = prevSeries.length > 0;

  // Period-aware funnel — stays aligned with the KPI cards below.
  const funnelStages: FunnelStage[] = computeFunnel(currentSeries);

  const totalLeads = currentSeries.reduce((s, d) => s + d.leads, 0);
  const hotLeads = currentSeries.reduce((s, d) => s + d.hot, 0);
  const converted = currentSeries.reduce((s, d) => s + d.converted, 0);
  const totalEvents = currentSeries.reduce((s, d) => s + d.events, 0);
  const totalMessages = currentSeries.reduce((s, d) => s + d.messages, 0);
  const aiMessages = currentSeries.reduce((s, d) => s + d.aiMessages, 0);

  const aiRatio = totalMessages > 0 ? Math.round((aiMessages / totalMessages) * 100) : 0;
  const periodRevenue = currentSeries.reduce((s, d) => s + d.revenue, 0);
  const periodTransactions = currentSeries.reduce((s, d) => s + d.transactionCount, 0);
  const periodAvgTicket = periodTransactions > 0 ? periodRevenue / periodTransactions : avgTicket;
  // Conservative, defensible estimate: each AI-handled message offsets ~2 min of human
  // attention (read + type + context-switch). Previous 12 min/msg overstated by ~6×.
  const MIN_SAVED_PER_AI_MSG = 2;
  const timeSavedHours = Math.round((aiMessages * MIN_SAVED_PER_AI_MSG) / 60);

  const prevLeads = prevSeries.reduce((s, d) => s + d.leads, 0);
  const prevConverted = prevSeries.reduce((s, d) => s + d.converted, 0);
  const prevEvents = prevSeries.reduce((s, d) => s + d.events, 0);
  const prevRevenue = prevSeries.reduce((s, d) => s + d.revenue, 0);

  const channels = [
    { channel: "whatsapp", label: "WhatsApp", count: currentSeries.reduce((s, d) => s + d.whatsapp, 0) },
    { channel: "instagram", label: "Instagram", count: currentSeries.reduce((s, d) => s + d.instagram, 0) },
    { channel: "form", label: "Formulário", count: currentSeries.reduce((s, d) => s + d.form, 0) },
  ].filter(c => c.count > 0).sort((a, b) => b.count - a.count);

  const totalByChannel = channels.reduce((s, c) => s + c.count, 0) || 1;
  const topChannel = channels[0];

  const chartData = currentSeries.map((d) => ({ ...d, date: formatDate(d.date) }));

  // suppress unused lint
  void avgHeatScore;
  void totalRevenue90d;
  void CHANNEL_COLORS;

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
      <div className="h-full overflow-y-auto px-4 pt-7 pb-[calc(72px+env(safe-area-inset-bottom,12px))] lg:py-7 lg:px-8">
        <h1 className="mb-2 text-[28px] font-bold tracking-[-0.02em] text-[#09090B]">Business Intelligence</h1>
        <div className="mt-12 max-w-xl mx-auto">
          <EmptyState
            icon={Activity}
            title="Nenhum Dado Analítico Ainda"
            description="Seus dashboards, gráficos de receita, qualificação de leads e funil de conversão serão gerados automaticamente assim que seus primeiros leads interagirem."
          />
        </div>
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto px-4 pt-7 pb-[calc(72px+env(safe-area-inset-bottom,12px))] lg:py-7 lg:px-8">
      {/* ── Header ── */}
      <header className="mb-7 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-[28px] font-bold tracking-[-0.02em] text-[#09090B]">Business Intelligence</h1>
          <p className="mt-1 text-sm flex items-center gap-2 text-[#3F3F46]">
            Visão de {days} dias <span className="h-1 w-1 rounded-full bg-[#D4D4D8]" /> {totalLeads} leads totais
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex gap-1 rounded-xl border border-[#E4E4E7] bg-[#F4F4F5] p-1">
            {PERIODS.map((p) => (
              <button
                key={p.id}
                onClick={() => setPeriod(p.id)}
                className={cn(
                  "rounded-lg px-3 py-1 font-mono text-xs font-medium transition-colors",
                  period === p.id
                    ? "bg-white text-[#09090B] shadow-sm"
                    : "text-[#71717A] hover:text-[#09090B]",
                )}
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

      {/* ── ROI Hero ── */}
      <RoiHero
        revenue={periodRevenue}
        timeSaved={timeSavedHours}
        converted={converted}
        totalLeads={totalLeads}
      />

      {/* ── Insights Top Bar ── */}
      <div className="mb-6 grid gap-3 lg:grid-cols-3">
        {topChannel && (
          <div className="border border-[#E4E4E7] bg-white rounded-lg px-4 py-3 flex items-center gap-3 shadow-sm">
            <div className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-[#EFF6FF] text-[#2563EB]">
              <TrendingUp size={16} />
            </div>
            <div>
              <p className="text-[11px] font-medium uppercase tracking-wider text-[#71717A]">Melhor Canal</p>
              <p className="text-sm font-semibold text-[#09090B]">{topChannel.label} ({Math.round(topChannel.count / totalByChannel * 100)}%)</p>
            </div>
          </div>
        )}
        <div className="border border-[#E4E4E7] bg-white rounded-lg px-4 py-3 flex items-center gap-3 shadow-sm">
          <div className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-[#F0FDFA] text-[#14B8A6]">
            <Zap size={16} />
          </div>
          <div>
            <p className="text-[11px] font-medium uppercase tracking-wider text-[#71717A]">Qualificação IA</p>
            <p className="text-sm font-semibold text-[#09090B]">{hotLeads} leads quentes identificados</p>
          </div>
        </div>
        <div className="border border-[#E4E4E7] bg-white rounded-lg px-4 py-3 flex items-center gap-3 shadow-sm">
          <div className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-[#FFFBEB] text-[#D97706]">
            <CalendarCheck size={16} />
          </div>
          <div>
            <p className="text-[11px] font-medium uppercase tracking-wider text-[#71717A]">Taxa de Conversão</p>
            <p className="text-sm font-semibold text-[#09090B]">
              {totalLeads > 0 ? Math.round((converted / totalLeads) * 100) : 0}% de conversão real
            </p>
          </div>
        </div>
      </div>

      {/* ── KPI Bento Grid ── */}
      <motion.div
        initial="hidden" animate="show"
        variants={{ hidden: {}, show: { transition: { staggerChildren: 0.06 } } }}
        className="mb-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6"
      >
        <KpiCard label="NOVOS LEADS" value={totalLeads} icon={Users} color="#60A5FA" prevValue={hasPrev ? prevLeads : undefined} />
        <KpiCard label="CONVERTIDOS" value={converted} icon={TrendingUp} color="#5EEAD4" prevValue={hasPrev ? prevConverted : undefined} />
        <KpiCard label="AGENDAMENTOS" value={totalEvents} icon={CalendarCheck} color="#A78BFA" prevValue={hasPrev ? prevEvents : undefined} />
        <KpiCard label="EFICIÊNCIA IA" value={aiRatio} suffix="%" icon={Bot} color="#FB923C" />

        {/* Revenue special card */}
        <motion.div
          variants={{ hidden: { opacity: 0, y: 14 }, show: { opacity: 1, y: 0 } }}
          whileHover={{ y: -3, transition: { type: "spring", stiffness: 400, damping: 26 } }}
          className="border border-[#E4E4E7] bg-white rounded-xl p-5 sm:col-span-2 xl:col-span-1 shadow-sm hover:bg-[#F4F4F5] transition-colors"
        >
          <div className="flex items-start justify-between">
            <span className="font-mono text-[10px] tracking-[0.16em] text-[#71717A] uppercase">RECEITA GERADA</span>
            <DollarSign size={14} className="text-[#D4D4D8]" />
          </div>
          <div className="mt-3 text-[28px] font-bold leading-none tracking-[-0.03em] text-[#16A34A]">
            {periodRevenue > 0
              ? formatBRL(periodRevenue)
              : <span className="text-base text-[#71717A]">—</span>
            }
          </div>
          {prevRevenue > 0 && periodRevenue > 0 && (() => {
            const delta = Math.round(((periodRevenue - prevRevenue) / prevRevenue) * 100);
            return (
              <div className="mt-3 flex items-center gap-2">
                <span className={cn(
                  "inline-flex items-center gap-0.5 rounded border px-2 py-0.5 font-mono text-[10px] font-medium",
                  delta > 0 ? "border-[#BBF7D0] bg-[#F0FDF4] text-[#166534]" : "border-[#FECACA] bg-[#FFF1F2] text-[#DC2626]",
                )}>
                  {delta > 0 ? <ArrowUpRight size={10} /> : <ArrowDownRight size={10} />}
                  {delta > 0 ? "+" : ""}{delta}%
                </span>
                <span className="text-[10px] text-[#71717A]">vs anterior</span>
              </div>
            );
          })()}
          {periodRevenue === 0 && (
            <p className="mt-2 text-[10px] text-[#71717A]">Ative Fintech para rastrear</p>
          )}
        </motion.div>

        {/* Ticket médio card */}
        <motion.div
          variants={{ hidden: { opacity: 0, y: 14 }, show: { opacity: 1, y: 0 } }}
          whileHover={{ y: -3, transition: { type: "spring", stiffness: 400, damping: 26 } }}
          className="border border-[#E4E4E7] bg-white rounded-xl p-5 sm:col-span-2 xl:col-span-1 shadow-sm hover:bg-[#F4F4F5] transition-colors"
        >
          <div className="flex items-start justify-between">
            <span className="font-mono text-[10px] tracking-[0.16em] text-[#71717A] uppercase">TICKET MÉDIO</span>
            <Banknote size={14} className="text-[#D4D4D8]" />
          </div>
          <div className="mt-3 text-[28px] font-bold leading-none tracking-[-0.03em] text-[#D97706]">
            {periodAvgTicket > 0
              ? formatBRL(periodAvgTicket)
              : <span className="text-base text-[#A1A1AA]">—</span>
            }
          </div>
          <p className="mt-2 text-[10px] text-[#A1A1AA]">por venda fechada no período</p>
        </motion.div>
      </motion.div>

      {/* ── Area Chart + Funnel ── */}
      <div className="mb-4 grid gap-4 xl:grid-cols-[1.5fr_1fr]">
        <motion.div
          initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="border border-[#E4E4E7] bg-white rounded-xl p-5 flex flex-col shadow-sm"
        >
          <div className="mb-4 flex items-center justify-between">
            <div>
              <h3 className="mb-1 text-sm font-semibold text-[#09090B]">Leads vs Agendamentos</h3>
              <p className="text-xs text-[#71717A]">
                Volume diário ao longo de {days} dias
              </p>
            </div>
            <div className="flex gap-4">
              {[{ color: "#3B82F6", label: "Leads" }, { color: "#14B8A6", label: "Agendamentos" }].map((l) => (
                <div key={l.label} className="flex items-center gap-1.5">
                  <span className="h-2 w-2 rounded-full" style={{ background: l.color }} />
                  <span className="text-xs text-[#71717A]">{l.label}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="flex-1 min-h-[220px]">
            <RevenueChart data={chartData} />
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.15 }}
          className="border border-[#E4E4E7] bg-white rounded-xl p-5 shadow-sm"
        >
          <h3 className="mb-1 text-sm font-semibold text-[#09090B]">Funil de Conversão</h3>
          <p className="mb-4 text-xs text-[#71717A]">
            Taxa de queda nos últimos {days} dias
          </p>
          <ConversionFunnel stages={funnelStages} />
        </motion.div>
      </div>

      {/* ── What-If Simulator ── */}
      <WhatIfSimulator avgTicket={periodAvgTicket} totalLeads={totalLeads} />

      {/* ── Sales Realtime Card ── */}
      <SalesCard initial={recentTransactions} companyId={companyId} />

      {/* ── Heatmap ── */}
      <motion.div
        initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2 }}
        className="border border-[#E4E4E7] bg-white rounded-xl p-5 mb-4 shadow-sm"
      >
        <h3 className="mb-1 text-sm font-semibold text-[#09090B]">Densidade de Chegada de Leads</h3>
        <p className="mb-4 text-xs text-[#71717A]">
          Concentração histórica de novos leads por dia da semana e horário. Use para otimizar plantões.
        </p>
        <LeadHeatmap data={heatmapData} />
      </motion.div>

      {hasAnalytics && providerStats.length > 0 && (
        <ProviderHealthSection providerStats={providerStats} chainStats={chainStats} />
      )}
    </div>
  );
}
