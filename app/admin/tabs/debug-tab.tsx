// app/admin/tabs/debug-tab.tsx
"use client";

import { useState } from "react";
import {
  Bug, Search, Activity, Database, CheckCircle2, XCircle,
  RefreshCw, ChevronDown, ChevronRight, AlertTriangle, Layers, Wifi, Clock,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import {
  checkEnvHealth, checkDependencyHealth, getCronJobsHealth,
  inspectLeadByPhone, getLatestMigrations,
  getCompanyChannelDetails, getCompanyQuotaStatus, forceUnlockStaleLead,
} from "../actions";
import type { Company } from "../types";
import type { DepResult, CronJobStatus } from "../actions";

interface Props {
  companies: Company[];
}

// ── Dependency Ping ──────────────────────────────────────────────────────────

function DependencyHealthCard() {
  const [results, setResults] = useState<DepResult[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [checkedAt, setCheckedAt] = useState<Date | null>(null);

  async function run() {
    setLoading(true);
    const res = await checkDependencyHealth();
    setLoading(false);
    if (res.success && res.results) {
      setResults(res.results);
      setCheckedAt(new Date());
    } else {
      toast.error(res.error || "Erro ao verificar dependências");
    }
  }

  const allOk = results?.every((r) => r.status === "ok");
  const errorCount = results?.filter((r) => r.status === "error").length ?? 0;

  const statusIcon = (r: DepResult) => {
    if (r.status === "ok")          return <CheckCircle2 size={14} className="text-[#16A34A] shrink-0" />;
    if (r.status === "missing_env") return <AlertTriangle size={14} className="text-[#D97706] shrink-0" />;
    return <XCircle size={14} className="text-[#DC2626] shrink-0" />;
  };

  const latencyColor = (ms: number | null) => {
    if (ms === null) return "text-[#A1A1AA]";
    if (ms < 300)    return "text-[#16A34A]";
    if (ms < 800)    return "text-[#D97706]";
    return "text-[#DC2626]";
  };

  return (
    <div className="border border-[#E4E4E7] bg-white rounded-2xl shadow-sm overflow-hidden">
      <div className="px-5 py-4 border-b border-[#E4E4E7] bg-[#F4F4F5] flex justify-between items-center">
        <div className="flex items-center gap-2">
          <Wifi size={15} className={errorCount > 0 ? "text-[#DC2626]" : allOk ? "text-[#16A34A]" : "text-[#2563EB]"} />
          <h2 className="text-sm font-semibold text-[#09090B]">Dependências Externas — Ping Vivo</h2>
          {checkedAt && (
            <span className="text-[10px] font-mono text-[#A1A1AA]">
              às {checkedAt.toLocaleTimeString("pt-BR")}
            </span>
          )}
        </div>
        <Button size="sm" variant="secondary" className="text-[10px] gap-1" onClick={run} disabled={loading}>
          {loading ? <RefreshCw size={11} className="animate-spin" /> : <RefreshCw size={11} />}
          {loading ? "Verificando…" : "Verificar agora"}
        </Button>
      </div>

      {!results ? (
        <div className="px-5 py-8 text-center text-sm text-[#A1A1AA]">
          Clique em "Verificar agora" para pingar todas as dependências externas em tempo real.
        </div>
      ) : (
        <div className="p-4">
          {errorCount > 0 && (
            <div className="mb-3 flex items-center gap-2 bg-[#FFF1F2] border border-[#FECACA] rounded-xl px-3 py-2 text-xs text-[#DC2626] font-semibold">
              <XCircle size={13} />
              {errorCount} dependência(s) com erro
            </div>
          )}
          {allOk && (
            <div className="mb-3 flex items-center gap-2 bg-[#F0FDF4] border border-[#BBF7D0] rounded-xl px-3 py-2 text-xs text-[#166534] font-semibold">
              <CheckCircle2 size={13} />
              Todas as dependências respondendo normalmente
            </div>
          )}
          <div className="flex flex-col divide-y divide-[#F4F4F5]">
            {results.map((r) => (
              <div key={r.name} className="flex items-center gap-3 py-2.5 px-1">
                {statusIcon(r)}
                <span className="flex-1 text-xs font-semibold text-[#09090B]">{r.name}</span>
                {r.latency_ms !== null && (
                  <span className={`text-[10px] font-mono font-bold tabular-nums ${latencyColor(r.latency_ms)}`}>
                    {r.latency_ms}ms
                  </span>
                )}
                <span className={`text-[9px] font-bold font-mono px-2 py-0.5 rounded-full ${
                  r.status === "ok"          ? "bg-[#F0FDF4] text-[#166534] border border-[#BBF7D0]"
                  : r.status === "missing_env" ? "bg-[#FFFBEB] text-[#92400E] border border-[#FDE68A]"
                  : "bg-[#FFF1F2] text-[#DC2626] border border-[#FECACA]"
                }`}>
                  {r.status === "ok" ? "OK" : r.status === "missing_env" ? "ENV" : "ERRO"}
                </span>
                {r.detail && (
                  <span className="text-[10px] text-[#71717A] font-mono truncate max-w-[200px]" title={r.detail}>
                    {r.detail}
                  </span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Env Health ───────────────────────────────────────────────────────────────

function EnvHealthCard() {
  const [envs, setEnvs]     = useState<{ name: string; set: boolean; note?: string }[] | null>(null);
  const [loading, setLoading] = useState(false);

  async function run() {
    setLoading(true);
    const res = await checkEnvHealth();
    setLoading(false);
    if (res.success && res.envs) setEnvs(res.envs);
    else toast.error(res.error || "Erro ao checar envs");
  }

  const missing = envs?.filter((e) => !e.set) ?? [];

  return (
    <div className="border border-[#E4E4E7] bg-white rounded-2xl shadow-sm overflow-hidden">
      <div className="px-5 py-4 border-b border-[#E4E4E7] bg-[#F4F4F5] flex justify-between items-center">
        <div className="flex items-center gap-2">
          <Activity size={15} className="text-[#2563EB]" />
          <h2 className="text-sm font-semibold text-[#09090B]">Env Vars Health</h2>
        </div>
        <Button size="sm" variant="secondary" className="text-[10px] gap-1" onClick={run} disabled={loading}>
          {loading ? <RefreshCw size={11} className="animate-spin" /> : <RefreshCw size={11} />}
          Checar
        </Button>
      </div>

      {!envs ? (
        <div className="px-5 py-8 text-center text-sm text-[#A1A1AA]">
          Clique em "Checar" para inspecionar variáveis de ambiente.
        </div>
      ) : (
        <div className="p-4">
          {missing.length > 0 && (
            <div className="mb-3 flex items-center gap-2 bg-[#FFF7ED] border border-[#FED7AA] rounded-xl px-3 py-2 text-xs text-[#EA580C] font-semibold">
              <AlertTriangle size={13} />
              {missing.length} variável(is) ausente(s): {missing.map((e) => e.name).join(", ")}
            </div>
          )}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
            {envs.map((e) => (
              <div key={e.name} className="flex items-center gap-2 text-xs px-3 py-2 rounded-lg bg-[#FAFAFA] border border-[#E4E4E7]">
                {e.set
                  ? <CheckCircle2 size={12} className="text-[#16A34A] shrink-0" />
                  : <XCircle size={12} className="text-[#DC2626] shrink-0" />
                }
                <span className={`font-mono font-semibold truncate ${e.set ? "text-[#09090B]" : "text-[#DC2626]"}`}>
                  {e.name}
                </span>
                {e.note && (
                  <span className="text-[#A1A1AA] hidden sm:inline truncate">{e.note}</span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Lead Inspector ───────────────────────────────────────────────────────────

function LeadInspectorCard({ companies }: { companies: Company[] }) {
  const [companyId, setCompanyId] = useState(companies[0]?.id ?? "");
  const [phone, setPhone]         = useState("");
  const [loading, setLoading]     = useState(false);
  const [result, setResult]       = useState<{
    lead?: Record<string, unknown>;
    messages?: Record<string, unknown>[];
    stuckMessages?: Record<string, unknown>[];
  } | null>(null);
  const [expandMsg, setExpandMsg] = useState(false);
  const [unlocking, setUnlocking] = useState(false);

  async function handleUnlock() {
    if (!result?.lead) return;
    setUnlocking(true);
    const res = await forceUnlockStaleLead(result.lead.id as string, result.lead.company_id as string);
    setUnlocking(false);
    if (res.success) {
      toast.success("Lead destravado com sucesso!");
      await run();
    } else {
      toast.error(res.error || "Erro ao destravar lead");
    }
  }

  async function run() {
    if (!phone.trim()) { toast.error("Informe o telefone"); return; }
    setLoading(true);
    const res = await inspectLeadByPhone(companyId, phone.trim());
    setLoading(false);
    if (res.success) {
      setResult({ lead: res.lead, messages: res.messages, stuckMessages: res.stuckMessages });
    } else {
      toast.error(res.error || "Lead não encontrado");
      setResult(null);
    }
  }

  return (
    <div className="border border-[#E4E4E7] bg-white rounded-2xl shadow-sm overflow-hidden">
      <div className="px-5 py-4 border-b border-[#E4E4E7] bg-[#F4F4F5] flex items-center gap-2">
        <Search size={15} className="text-[#2563EB]" />
        <h2 className="text-sm font-semibold text-[#09090B]">Lead Inspector</h2>
      </div>

      <div className="p-4 flex flex-wrap gap-2">
        <select
          value={companyId}
          onChange={(e) => setCompanyId(e.target.value)}
          className="bg-white border border-[#E4E4E7] rounded-xl px-3 py-2 text-sm focus:outline-none text-[#3F3F46] flex-shrink-0"
        >
          {companies.map((c) => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </select>
        <input
          type="text"
          placeholder="Telefone (+5511999999999)"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && run()}
          className="flex-1 min-w-[200px] border border-[#E4E4E7] rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-[#2563EB]"
        />
        <Button size="sm" variant="secondary" className="gap-1 text-xs" onClick={run} disabled={loading}>
          {loading ? <RefreshCw size={11} className="animate-spin" /> : <Search size={11} />}
          Inspecionar
        </Button>
      </div>

      {result?.lead && (
        <div className="px-4 pb-4 flex flex-col gap-3">
          {/* Lead state */}
          <div className="rounded-xl border border-[#E4E4E7] overflow-hidden">
            <div className="px-3 py-2 bg-[#F4F4F5] text-[10px] font-mono font-bold uppercase tracking-wider text-[#71717A]">
              Estado do Lead
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-0 divide-y sm:divide-y-0 sm:divide-x divide-[#E4E4E7]">
              {[
                ["ID", result.lead.id as string],
                ["Nome", result.lead.name as string],
                ["Status", result.lead.status as string],
                ["Intent", (result.lead.intent as string) || "—"],
                ["Score", String(result.lead.lead_score ?? "—")],
                ["is_processing", result.lead.is_processing ? "🔴 LOCKED" : "✅ free"],
                ["Criado", new Date(result.lead.created_at as string).toLocaleString("pt-BR")],
                ["Última msg", result.lead.last_message_at ? new Date(result.lead.last_message_at as string).toLocaleString("pt-BR") : "—"],
                ["Atualizado", new Date(result.lead.updated_at as string).toLocaleString("pt-BR")],
              ].map(([label, val]) => {
                const value = String(val);
                return (
                  <div key={label} className="px-3 py-2 text-xs flex flex-col justify-between min-h-[50px]">
                    <div>
                      <div className="text-[10px] text-[#71717A] font-mono mb-0.5">{label}</div>
                      <div className={`font-semibold font-mono truncate ${label === "is_processing" && value === "🔴 LOCKED" ? "text-[#DC2626]" : "text-[#09090B]"}`}>
                        {value}
                      </div>
                    </div>
                    {label === "is_processing" && !!result.lead!.is_processing && (
                      <Button
                        size="sm"
                        variant="secondary"
                        className="mt-1 text-[10px] h-6 px-2 gap-1 text-[#DC2626] hover:bg-[#FFF1F2] hover:border-[#FECACA] self-start"
                        onClick={handleUnlock}
                        disabled={unlocking}
                      >
                        {unlocking ? <RefreshCw size={9} className="animate-spin" /> : null}
                        Destravar
                      </Button>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Stuck messages */}
          {(result.stuckMessages?.length ?? 0) > 0 && (
            <div className="flex items-center gap-2 bg-[#FFF1F2] border border-[#FECACA] rounded-xl px-3 py-2 text-xs text-[#DC2626] font-semibold">
              <AlertTriangle size={12} />
              {result.stuckMessages!.length} mensagem(ns) travada(s) em status &quot;processing&quot;
            </div>
          )}

          {/* Messages */}
          <div className="rounded-xl border border-[#E4E4E7] overflow-hidden">
            <button
              className="w-full px-3 py-2 bg-[#F4F4F5] text-[10px] font-mono font-bold uppercase tracking-wider text-[#71717A] flex items-center justify-between hover:bg-[#ECECEC] transition-colors"
              onClick={() => setExpandMsg((v) => !v)}
            >
              <span>Últimas {result.messages?.length ?? 0} Mensagens</span>
              {expandMsg ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
            </button>
            {expandMsg && (
              <div className="max-h-[320px] overflow-y-auto divide-y divide-[#E4E4E7]">
                {result.messages?.length === 0 ? (
                  <div className="px-4 py-4 text-xs text-[#A1A1AA] text-center">Sem mensagens</div>
                ) : (
                  result.messages?.map((m, i) => (
                    <div key={i} className={`px-3 py-2 text-xs ${m.role === "assistant" ? "bg-[#EFF6FF]" : ""}`}>
                      <div className="flex items-center gap-2 mb-0.5">
                        <span className={`text-[9px] font-bold font-mono px-1.5 py-0.5 rounded ${m.role === "assistant" ? "bg-[#2563EB] text-white" : "bg-[#E4E4E7] text-[#3F3F46]"}`}>
                          {m.role as string}
                        </span>
                        <span className="text-[#A1A1AA] text-[10px] font-mono">
                          {new Date(m.created_at as string).toLocaleString("pt-BR")}
                        </span>
                      </div>
                      <p className="text-[#3F3F46] line-clamp-3">{m.content as string}</p>
                    </div>
                  ))
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Cron Health ──────────────────────────────────────────────────────────────

function CronHealthCard() {
  const [jobs, setJobs] = useState<CronJobStatus[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [checkedAt, setCheckedAt] = useState<Date | null>(null);

  async function run() {
    setLoading(true);
    const res = await getCronJobsHealth();
    setLoading(false);
    if (res.success && res.jobs) { setJobs(res.jobs); setCheckedAt(new Date()); }
    else toast.error(res.error || "Erro ao buscar status dos crons");
  }

  const failedCount = jobs?.filter((j) => j.last_status === "failed").length ?? 0;
  const allOk = jobs && failedCount === 0;

  // Time ago helper
  function timeAgo(ts: string | null): string {
    if (!ts) return "nunca";
    const ms = Date.now() - new Date(ts).getTime();
    const m = Math.floor(ms / 60_000);
    if (m < 1)   return "agora";
    if (m < 60)  return `${m}min atrás`;
    const h = Math.floor(m / 60);
    if (h < 24)  return `${h}h atrás`;
    return `${Math.floor(h / 24)}d atrás`;
  }

  // Stale = job hasn't run recently relative to its schedule
  function isStale(job: CronJobStatus): boolean {
    if (!job.last_run) return true;
    const ms = Date.now() - new Date(job.last_run).getTime();
    // "*/5 * * * *" → 5min interval; "0 * * * *" → 60min; etc.
    const schedule = job.schedule;
    if (schedule.startsWith("*/1 ") || schedule === "* * * * *") return ms > 3 * 60_000;
    if (/^\*\/(\d+) \* \* \* \*$/.test(schedule)) {
      const interval = parseInt(schedule.match(/^\*\/(\d+)/)![1]);
      return ms > interval * 2 * 60_000;
    }
    if (/^0 \* \* \* \*$/.test(schedule)) return ms > 90 * 60_000;
    // Daily jobs: 6h grace
    return ms > 30 * 60 * 60_000;
  }

  return (
    <div className="border border-[#E4E4E7] bg-white rounded-2xl shadow-sm overflow-hidden">
      <div className="px-5 py-4 border-b border-[#E4E4E7] bg-[#F4F4F5] flex justify-between items-center">
        <div className="flex items-center gap-2">
          <Clock size={15} className={failedCount > 0 ? "text-[#DC2626]" : allOk ? "text-[#16A34A]" : "text-[#2563EB]"} />
          <h2 className="text-sm font-semibold text-[#09090B]">pg_cron — Saúde dos Jobs</h2>
          {checkedAt && (
            <span className="text-[10px] font-mono text-[#A1A1AA]">às {checkedAt.toLocaleTimeString("pt-BR")}</span>
          )}
          {jobs && (
            <span className={`text-[9px] font-bold font-mono px-2 py-0.5 rounded-full ${failedCount > 0 ? "bg-[#FFF1F2] text-[#DC2626] border border-[#FECACA]" : "bg-[#F0FDF4] text-[#166534] border border-[#BBF7D0]"}`}>
              {failedCount > 0 ? `${failedCount} falha(s)` : `${jobs.length} OK`}
            </span>
          )}
        </div>
        <Button size="sm" variant="secondary" className="text-[10px] gap-1" onClick={run} disabled={loading}>
          {loading ? <RefreshCw size={11} className="animate-spin" /> : <RefreshCw size={11} />}
          {loading ? "Carregando…" : "Carregar"}
        </Button>
      </div>

      {!jobs ? (
        <div className="px-5 py-8 text-center text-sm text-[#A1A1AA]">
          Clique em "Carregar" para ver o status de todos os {18} cron jobs em tempo real.
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-[#F0F0F1] border-b border-[#E4E4E7] text-[10px] font-mono uppercase text-[#71717A]">
                <th className="px-4 py-2.5 font-semibold">Job</th>
                <th className="px-4 py-2.5 font-semibold">Schedule</th>
                <th className="px-4 py-2.5 font-semibold">Último Run</th>
                <th className="px-4 py-2.5 font-semibold">Status</th>
                <th className="px-4 py-2.5 font-semibold">Duração</th>
                <th className="px-4 py-2.5 font-semibold">Retorno</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#E4E4E7] text-xs text-[#3F3F46] font-mono">
              {jobs.map((j) => {
                const failed = j.last_status === "failed";
                const stale = isStale(j);
                return (
                  <tr key={j.jobid} className={`hover:bg-[#F4F4F5] ${failed ? "bg-[#FFF1F2]" : ""}`}>
                    <td className="px-4 py-2.5 max-w-[200px]">
                      <div className="flex items-center gap-1.5">
                        <span className={`h-1.5 w-1.5 rounded-full shrink-0 ${failed ? "bg-[#DC2626] animate-pulse" : stale ? "bg-[#FBBF24]" : "bg-[#14B8A6]"}`} />
                        <span className={`truncate text-[10px] ${failed ? "text-[#DC2626] font-bold" : "text-[#09090B]"}`}>
                          {j.jobname}
                        </span>
                      </div>
                    </td>
                    <td className="px-4 py-2.5 text-[10px] text-[#71717A] whitespace-nowrap">{j.schedule}</td>
                    <td className="px-4 py-2.5 text-[10px] whitespace-nowrap">
                      <span className={stale && !failed ? "text-[#D97706]" : "text-[#71717A]"}>
                        {timeAgo(j.last_run)}
                      </span>
                    </td>
                    <td className="px-4 py-2.5">
                      <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full ${
                        failed ? "bg-[#FFF1F2] text-[#DC2626] border border-[#FECACA]" : "bg-[#F0FDF4] text-[#166534] border border-[#BBF7D0]"
                      }`}>
                        {j.last_status ?? "?"}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 text-[10px] text-[#71717A] whitespace-nowrap">
                      {j.duration_ms != null ? `${j.duration_ms}ms` : "—"}
                    </td>
                    <td className="px-4 py-2.5 text-[10px] text-[#71717A] max-w-[180px] truncate" title={j.last_message ?? ""}>
                      {j.last_message ?? "—"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ── Migrations ───────────────────────────────────────────────────────────────

function MigrationsCard() {
  const [migrations, setMigrations] = useState<{ name: string; executed_at: string }[] | null>(null);
  const [loading, setLoading]       = useState(false);

  async function run() {
    setLoading(true);
    const res = await getLatestMigrations();
    setLoading(false);
    if (res.success && res.migrations) setMigrations(res.migrations);
    else toast.error(res.error || "Erro ao buscar migrations");
  }

  return (
    <div className="border border-[#E4E4E7] bg-white rounded-2xl shadow-sm overflow-hidden">
      <div className="px-5 py-4 border-b border-[#E4E4E7] bg-[#F4F4F5] flex justify-between items-center">
        <div className="flex items-center gap-2">
          <Layers size={15} className="text-[#2563EB]" />
          <h2 className="text-sm font-semibold text-[#09090B]">Migrations Aplicadas (últimas 30)</h2>
        </div>
        <Button size="sm" variant="secondary" className="text-[10px] gap-1" onClick={run} disabled={loading}>
          {loading ? <RefreshCw size={11} className="animate-spin" /> : <Database size={11} />}
          Carregar
        </Button>
      </div>

      {!migrations ? (
        <div className="px-5 py-8 text-center text-sm text-[#A1A1AA]">
          Clique em "Carregar" para ver migrations aplicadas em produção.
        </div>
      ) : (
        <div className="max-h-[340px] overflow-y-auto divide-y divide-[#E4E4E7]">
          {migrations.length === 0 ? (
            <div className="px-5 py-6 text-center text-xs text-[#A1A1AA]">Nenhuma migration encontrada.</div>
          ) : (
            migrations.map((m, i) => (
              <div key={i} className="px-4 py-2.5 flex items-center justify-between hover:bg-[#FAFAFA] text-xs">
                <span className="font-mono text-[#09090B] truncate max-w-[70%]">{m.name}</span>
                <span className="text-[#71717A] font-mono text-[10px] shrink-0">
                  {m.executed_at ? new Date(m.executed_at).toLocaleString("pt-BR") : "—"}
                </span>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}

// ── Channel Debugger ─────────────────────────────────────────────────────────

function ChannelDebugCard({ companies }: { companies: Company[] }) {
  const [companyId, setCompanyId] = useState(companies[0]?.id ?? "");
  const [channels, setChannels]   = useState<Record<string, unknown>[] | null>(null);
  const [quota, setQuota]         = useState<Record<string, unknown> | null>(null);
  const [loading, setLoading]     = useState(false);

  async function run() {
    setLoading(true);
    const [chRes, qRes] = await Promise.all([
      getCompanyChannelDetails(companyId),
      getCompanyQuotaStatus(companyId),
    ]);
    setLoading(false);
    if (chRes.success) setChannels(chRes.channels ?? []);
    else toast.error(chRes.error || "Erro ao buscar canais");
    if (qRes.success) setQuota(qRes.quota as unknown as Record<string, unknown>);
  }

  const statusColors: Record<string, string> = {
    active: "bg-[#14B8A6] text-white",
    error:  "bg-[#DC2626] text-white",
    paused: "bg-[#FBBF24] text-[#09090B]",
    inactive: "bg-[#D4D4D8] text-[#71717A]",
  };

  return (
    <div className="border border-[#E4E4E7] bg-white rounded-2xl shadow-sm overflow-hidden">
      <div className="px-5 py-4 border-b border-[#E4E4E7] bg-[#F4F4F5] flex items-center gap-2">
        <Database size={15} className="text-[#2563EB]" />
        <h2 className="text-sm font-semibold text-[#09090B]">Channel &amp; Quota Inspector</h2>
      </div>

      <div className="p-4 flex flex-wrap gap-2">
        <select
          value={companyId}
          onChange={(e) => setCompanyId(e.target.value)}
          className="bg-white border border-[#E4E4E7] rounded-xl px-3 py-2 text-sm focus:outline-none text-[#3F3F46] flex-1"
        >
          {companies.map((c) => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </select>
        <Button size="sm" variant="secondary" className="gap-1 text-xs" onClick={run} disabled={loading}>
          {loading ? <RefreshCw size={11} className="animate-spin" /> : <Search size={11} />}
          Inspecionar
        </Button>
      </div>

      {quota && (
        <div className="px-4 pb-3 grid grid-cols-2 sm:grid-cols-4 gap-2">
          {[
            ["Plano", String(quota.plan_type).toUpperCase()],
            ["Leads",  `${quota.lead_count} / ${quota.plan_max_leads}`],
            ["Msgs",   String(quota.message_count)],
            ["Extra",  `+${quota.extra_leads}`],
          ].map(([label, value]) => (
            <div key={label} className="bg-[#FAFAFA] border border-[#E4E4E7] rounded-xl px-3 py-2 text-center">
              <div className="text-[10px] text-[#71717A] font-mono mb-0.5">{label}</div>
              <div className="font-bold font-mono text-[#09090B] text-sm">{value}</div>
            </div>
          ))}
        </div>
      )}

      {channels && (
        channels.length === 0 ? (
          <div className="px-5 pb-6 text-center text-xs text-[#A1A1AA]">Nenhum canal para esta empresa.</div>
        ) : (
          <div className="divide-y divide-[#E4E4E7]">
            {channels.map((ch, i) => (
              <div key={i} className="px-4 py-3 text-xs flex flex-col gap-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className={`text-[9px] font-bold font-mono px-2 py-0.5 rounded-full ${statusColors[ch.status as string] ?? "bg-[#D4D4D8] text-[#71717A]"}`}>
                    {ch.status as string}
                  </span>
                  <span className="font-semibold text-[#09090B]">{ch.display_name as string || "Sem nome"}</span>
                  <span className="text-[#71717A] font-mono">[{ch.provider as string}]</span>
                  {ch.phone_number != null && (
                    <span className="text-[#A1A1AA] font-mono">{String(ch.phone_number)}</span>
                  )}
                  <span className="ml-auto text-[#A1A1AA] font-mono text-[10px]">
                    updated: {ch.updated_at ? new Date(ch.updated_at as string).toLocaleString("pt-BR") : "—"}
                  </span>
                </div>
                {ch.last_error != null && (
                  <div className="flex items-start gap-1 bg-[#FFF1F2] border border-[#FECACA] rounded-lg px-2 py-1 text-[#DC2626]">
                    <AlertTriangle size={10} className="mt-0.5 shrink-0" />
                    <span className="font-mono break-all">{String(ch.last_error)}</span>
                  </div>
                )}
              </div>
            ))}
          </div>
        )
      )}
    </div>
  );
}

// ── Main ─────────────────────────────────────────────────────────────────────

export function DebugTab({ companies }: Props) {
  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center gap-2 mb-1">
        <Bug size={16} className="text-[#EA580C]" />
        <h2 className="text-base font-bold text-[#09090B]">Debug &amp; Diagnóstico</h2>
        <span className="text-[10px] font-mono bg-[#FFF7ED] text-[#EA580C] border border-[#FED7AA] px-2 py-0.5 rounded-full">
          ADMIN ONLY
        </span>
      </div>

      <DependencyHealthCard />
      <EnvHealthCard />
      <CronHealthCard />
      <LeadInspectorCard companies={companies} />
      <ChannelDebugCard companies={companies} />
      <MigrationsCard />
    </div>
  );
}
