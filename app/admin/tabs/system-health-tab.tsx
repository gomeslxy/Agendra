// app/admin/tabs/system-health-tab.tsx
"use client";

import { useState } from "react";
import { ShieldAlert, Lock, Zap, Cpu, Activity } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { useRouter } from "next/navigation";
import { forceUnlockStaleLead } from "../actions";
import type { ProviderStat, RecentAiError, StaleLead, StaleMessage, TokenConsumer, DailyPoint } from "../types";

interface Props {
  providerStats: ProviderStat[];
  recentAiErrors: RecentAiError[];
  staleLeads: StaleLead[];
  staleMessages: StaleMessage[];
  topTokenConsumers: TokenConsumer[];
  aiErrorDaily: DailyPoint[];
}

function LatencyBar({ value, max, color }: { value: number; max: number; color: string }) {
  const pct = max > 0 ? Math.min(100, (value / max) * 100) : 0;
  return (
    <div className="flex items-center gap-2">
      <span className="w-16 text-right font-mono text-[10px] text-[#3F3F46]">{value}ms</span>
      <div className="flex-1 h-1.5 bg-[#F4F4F5] rounded-full overflow-hidden">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

export function SystemHealthTab({
  providerStats, recentAiErrors, staleLeads, staleMessages, topTokenConsumers, aiErrorDaily,
}: Props) {
  const router = useRouter();
  const maxP99 = Math.max(...providerStats.map((p) => p.p99_ms), 1);
  const maxDayTotal = Math.max(...aiErrorDaily.map((d) => d.total), 1);
  const totalReq7d = aiErrorDaily.reduce((s, d) => s + d.total, 0);
  const totalErr7d = aiErrorDaily.reduce((s, d) => s + d.errors, 0);
  const errRate7d = totalReq7d > 0 ? Math.round((totalErr7d / totalReq7d) * 1000) / 10 : 0;

  async function handleUnlock(lead: StaleLead) {
    const res = await forceUnlockStaleLead(lead.id, lead.company_id);
    if (res.success) { toast.success(`Lead "${lead.name}" desbloqueado`); router.refresh(); }
    else toast.error(res.error || "Erro ao desbloquear lead");
  }

  return (
    <div className="flex flex-col gap-6">
      {/* Provider latency P50/P90/P99 */}
      <div className="border border-[#E4E4E7] bg-white rounded-2xl shadow-sm overflow-hidden">
        <div className="px-5 py-4 border-b border-[#E4E4E7] bg-[#F4F4F5] flex justify-between items-center">
          <div className="flex items-center gap-2">
            <Zap size={15} className="text-[#2563EB]" />
            <h2 className="text-sm font-semibold text-[#09090B]">Provedores de IA — Latência (7d)</h2>
          </div>
          <span className="text-[10px] font-mono text-[#71717A]">P50 / P90 / P99</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-[#F0F0F1] border-b border-[#E4E4E7] text-[10px] font-mono uppercase text-[#71717A]">
                <th className="px-5 py-3 font-semibold">Provedor</th>
                <th className="px-5 py-3 font-semibold">Reqs (24h / 7d)</th>
                <th className="px-5 py-3 font-semibold">Sucesso</th>
                <th className="px-5 py-3 font-semibold">P50</th>
                <th className="px-5 py-3 font-semibold">P90</th>
                <th className="px-5 py-3 font-semibold">P99</th>
                <th className="px-5 py-3 font-semibold text-right">Custo (7d)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#E4E4E7] text-xs text-[#3F3F46] font-mono">
              {providerStats.map((p) => {
                const successRate = p.requests_7d > 0 ? Math.round((p.successes_7d / p.requests_7d) * 100) : 100;
                const healthy = successRate >= 95;
                return (
                  <tr key={p.provider} className="hover:bg-[#F4F4F5]">
                    <td className="px-5 py-4 font-sans font-bold text-[#09090B] capitalize">
                      <div className="flex items-center gap-2">
                        <span className={`h-2 w-2 rounded-full ${healthy ? "bg-[#14B8A6]" : "bg-[#DC2626] animate-pulse"}`} />
                        {p.provider}
                      </div>
                    </td>
                    <td className="px-5 py-4">{p.requests_24h} / {p.requests_7d}</td>
                    <td className={`px-5 py-4 font-bold ${healthy ? "text-[#16A34A]" : "text-[#DC2626]"}`}>
                      {successRate}%
                    </td>
                    <td className="px-5 py-4">
                      <LatencyBar value={p.p50_ms} max={maxP99} color="bg-[#14B8A6]" />
                    </td>
                    <td className="px-5 py-4">
                      <LatencyBar value={p.p90_ms} max={maxP99} color="bg-[#FBBF24]" />
                    </td>
                    <td className="px-5 py-4">
                      <LatencyBar value={p.p99_ms} max={maxP99} color={p.p99_ms > 5000 ? "bg-[#DC2626]" : "bg-[#EA580C]"} />
                    </td>
                    <td className="px-5 py-4 text-right font-bold text-[#09090B]">
                      ${p.total_cost_7d.toFixed(4)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* AI error rate trend (7d) */}
      <div className="border border-[#E4E4E7] bg-white rounded-2xl shadow-sm overflow-hidden">
        <div className="px-5 py-4 border-b border-[#E4E4E7] bg-[#F4F4F5] flex items-center gap-2">
          <Activity size={15} className="text-[#2563EB]" />
          <h2 className="text-sm font-semibold text-[#09090B]">Taxa de Erro de IA (7d)</h2>
          <span className={`ml-auto text-[10px] font-mono font-bold px-2 py-0.5 rounded-full ${errRate7d >= 5 ? "bg-[#DC2626] text-white" : "bg-[#F0FDF4] text-[#166534]"}`}>
            {errRate7d}% ({totalErr7d}/{totalReq7d})
          </span>
        </div>
        {aiErrorDaily.length === 0 ? (
          <div className="px-5 py-6 text-xs text-[#71717A] text-center">Sem requisições de IA no período.</div>
        ) : (
          <div className="p-4 flex items-end gap-1.5 h-32">
            {aiErrorDaily.map((d) => {
              const totalH = Math.max(4, (d.total / maxDayTotal) * 100);
              const errH = d.total > 0 ? (d.errors / d.total) * totalH : 0;
              const dayErrRate = d.total > 0 ? Math.round((d.errors / d.total) * 100) : 0;
              return (
                <div key={d.day} className="flex-1 flex flex-col items-center gap-1 group relative">
                  <div className="w-full flex flex-col justify-end rounded-t bg-[#E4E4E7] overflow-hidden" style={{ height: `${totalH}%` }}>
                    <div className="w-full bg-[#DC2626]" style={{ height: `${(errH / totalH) * 100}%` }} />
                  </div>
                  <span className="text-[8px] font-mono text-[#A1A1AA]">
                    {new Date(d.day).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" })}
                  </span>
                  <div className="absolute -top-8 hidden group-hover:block bg-[#09090B] text-white text-[9px] font-mono px-2 py-1 rounded whitespace-nowrap z-10">
                    {d.total} reqs · {d.errors} erros ({dayErrRate}%)
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Stale processing locks */}
      <div className={`border bg-white rounded-2xl shadow-sm overflow-hidden ${staleLeads.length > 0 ? "border-[#FECACA]" : "border-[#E4E4E7]"}`}>
        <div className={`px-5 py-4 border-b flex items-center gap-2 ${staleLeads.length > 0 ? "border-[#FECACA] bg-[#FFF1F2]" : "border-[#E4E4E7] bg-[#F4F4F5]"}`}>
          <Lock size={15} className={staleLeads.length > 0 ? "text-[#DC2626]" : "text-[#71717A]"} />
          <h2 className="text-sm font-semibold text-[#09090B]">
            Stale Locks — Leads Travados (&gt;10 min)
          </h2>
          <span className={`ml-auto text-[10px] font-mono font-bold px-2 py-0.5 rounded-full ${staleLeads.length > 0 ? "bg-[#DC2626] text-white" : "bg-[#F4F4F5] text-[#71717A]"}`}>
            {staleLeads.length}
          </span>
        </div>
        {staleLeads.length === 0 ? (
          <div className="px-5 py-6 text-xs text-[#71717A] text-center">
            Nenhum lead travado. Tudo fluindo. ✓
          </div>
        ) : (
          <div className="p-4 flex flex-col gap-2">
            {staleLeads.map((lead) => (
              <div key={lead.id} className="flex items-center justify-between bg-[#FFF1F2] border border-[#FECACA] rounded-xl px-4 py-3 text-xs gap-3">
                <div>
                  <span className="font-bold text-[#09090B]">{lead.name}</span>
                  <span className="text-[#71717A] ml-2 font-mono">{lead.phone}</span>
                  <span className="block text-[#71717A] mt-0.5">{lead.company_name}</span>
                </div>
                <div className="text-right">
                  <div className="text-[10px] font-mono text-[#DC2626]">
                    Travado desde {new Date(lead.locked_since).toLocaleString("pt-BR")}
                  </div>
                  <Button
                    size="sm"
                    variant="secondary"
                    className="mt-1.5 text-[10px] text-[#DC2626] hover:bg-white border-[#FECACA]"
                    onClick={() => handleUnlock(lead)}
                  >
                    Force Unlock
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Stale processed_messages */}
      {staleMessages.length > 0 && (
        <div className="border border-[#FED7AA] bg-[#FFF7ED] rounded-2xl p-5 shadow-sm">
          <div className="flex items-center gap-2 text-[#D97706] font-semibold text-sm mb-3">
            <ShieldAlert size={15} />
            Mensagens Presas em &apos;processing&apos; (&gt;5 min) — {staleMessages.length}
          </div>
          <div className="flex flex-col gap-2">
            {staleMessages.map((m) => (
              <div key={m.id} className="bg-white border border-[#FED7AA] rounded-xl px-3 py-2 text-xs font-mono text-[#3F3F46]">
                <span className="text-[#09090B] font-bold">{m.company_name}</span>
                <span className="text-[#A1A1AA] ml-2">{m.id.substring(0, 20)}…</span>
                <span className="ml-2 text-[#D97706]">desde {new Date(m.stuck_since).toLocaleString("pt-BR")}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Top 10 token consumers */}
      <div className="border border-[#E4E4E7] bg-white rounded-2xl shadow-sm overflow-hidden">
        <div className="px-5 py-4 border-b border-[#E4E4E7] bg-[#F4F4F5] flex items-center gap-2">
          <Cpu size={15} className="text-[#2563EB]" />
          <h2 className="text-sm font-semibold text-[#09090B]">Top 10 Consumidores de Tokens (7d)</h2>
        </div>
        {topTokenConsumers.length === 0 ? (
          <div className="px-5 py-6 text-xs text-[#71717A] text-center">Sem dados de tokens para o período.</div>
        ) : (
          <div className="p-4 flex flex-col gap-2">
            {topTokenConsumers.map((t, i) => {
              const maxTok = topTokenConsumers[0].tokens_7d;
              const pct = maxTok > 0 ? (t.tokens_7d / maxTok) * 100 : 0;
              return (
                <div key={t.company_id} className="flex items-center gap-3 text-xs">
                  <span className="w-4 text-center font-mono text-[#A1A1AA] text-[10px]">{i + 1}</span>
                  <span className="w-40 font-semibold text-[#09090B] truncate">{t.company_name}</span>
                  <div className="flex-1 h-2 bg-[#F4F4F5] rounded-full overflow-hidden">
                    <div
                      className="h-full bg-[#2563EB] rounded-full"
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                  <span className="w-24 text-right font-mono text-[#3F3F46]">
                    {t.tokens_7d.toLocaleString("pt-BR")} tok
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Recent AI errors */}
      <div className="border border-[#E4E4E7] bg-white rounded-2xl shadow-sm overflow-hidden">
        <div className="px-5 py-4 border-b border-[#E4E4E7] bg-[#F4F4F5] flex items-center gap-2">
          <ShieldAlert size={15} className="text-[#DC2626]" />
          <h2 className="text-sm font-semibold text-[#09090B]">Falhas Recentes de IA</h2>
        </div>
        <div className="p-4 flex flex-col gap-3">
          {recentAiErrors.length === 0 ? (
            <div className="text-xs text-[#71717A] text-center py-4">Operações estáveis. Nenhuma falha recente.</div>
          ) : (
            recentAiErrors.map((err) => (
              <div key={err.id} className="border border-[#FECACA] bg-[#FFF1F2] rounded-xl p-3.5 text-xs text-[#3F3F46]">
                <div className="flex justify-between text-[10px] text-[#71717A] mb-1.5">
                  <span>Empresa: <strong className="text-[#09090B]">{err.company_name}</strong></span>
                  <span className="font-mono">{new Date(err.created_at).toLocaleString("pt-BR")}</span>
                </div>
                <div className="flex items-center gap-2 mb-1.5">
                  <span className="text-[9px] bg-[#FECACA] px-1.5 py-0.5 rounded uppercase font-bold text-[#DC2626]">
                    {err.provider}
                  </span>
                </div>
                <div className="font-mono text-[#DC2626] bg-white border border-[#FECACA] p-2 rounded-lg break-all">
                  {err.error}
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
