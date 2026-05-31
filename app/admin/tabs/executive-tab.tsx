// app/admin/tabs/executive-tab.tsx
"use client";

import { TrendingUp, TrendingDown, Users, MessageSquare, DollarSign, AlertTriangle, BarChart3, Repeat } from "lucide-react";
import type { Company, SummaryData, UnhealthyChannel } from "../types";

interface Props {
  companies: Company[];
  summary: SummaryData;
  churnRiskCompanyIds: string[];
  unhealthyChannels: UnhealthyChannel[];
}

function MetricCard({
  label,
  value,
  sub,
  icon: Icon,
  iconColor,
  highlight,
}: {
  label: string;
  value: string | number;
  sub?: string;
  icon: React.ElementType;
  iconColor: string;
  highlight?: "green" | "red" | "orange" | "blue";
}) {
  const highlightClasses: Record<string, string> = {
    green:  "border-[#BBF7D0] bg-[#F0FDF4]",
    red:    "border-[#FECACA] bg-[#FFF1F2]",
    orange: "border-[#FED7AA] bg-[#FFF7ED]",
    blue:   "border-[#BFDBFE] bg-[#EFF6FF]",
  };

  return (
    <div className={`border rounded-2xl p-5 shadow-sm ${highlight ? highlightClasses[highlight] : "border-[#E4E4E7] bg-white"}`}>
      <div className="flex justify-between items-start mb-3">
        <span className="text-xs font-semibold uppercase tracking-wider text-[#71717A]">{label}</span>
        <Icon size={16} className={iconColor} />
      </div>
      <div className="text-2xl font-bold font-mono tracking-tight text-[#09090B]">{value}</div>
      {sub && <p className="text-[10px] text-[#71717A] mt-1">{sub}</p>}
    </div>
  );
}

export function ExecutiveTab({ companies, summary, churnRiskCompanyIds, unhealthyChannels }: Props) {
  const planCounts = ["trial", "starter", "pro", "business"].map((p) => ({
    plan: p,
    count: companies.filter((c) => c.plan_type === p).length,
    mrr: companies
      .filter((c) => c.plan_type === p && c.subscription_status === "active")
      .reduce((s, c) => s + c.mrr, 0),
  }));

  const growthPositive = summary.growthWoW >= 0;

  return (
    <div className="flex flex-col gap-6">
      {/* KPI grid — row 1 */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <MetricCard
          label="MRR Estimado"
          value={`R$ ${summary.estimatedMRR.toLocaleString("pt-BR")}`}
          sub="Clientes pagantes ativos"
          icon={DollarSign}
          iconColor="text-[#16A34A]"
          highlight="green"
        />
        <MetricCard
          label="Crescimento WoW"
          value={`${growthPositive ? "+" : ""}${summary.growthWoW}%`}
          sub="vs semana anterior"
          icon={growthPositive ? TrendingUp : TrendingDown}
          iconColor={growthPositive ? "text-[#16A34A]" : "text-[#DC2626]"}
          highlight={growthPositive ? "green" : "red"}
        />
        <MetricCard
          label="Conversão Trial→Paid"
          value={`${summary.trialConversionRate}%`}
          sub="Últimos 30 dias"
          icon={Repeat}
          iconColor="text-[#2563EB]"
          highlight="blue"
        />
        <MetricCard
          label="Risco de Churn"
          value={summary.churnRiskCount}
          sub="0 mensagens em 7d"
          icon={AlertTriangle}
          iconColor="text-[#EA580C]"
          highlight={summary.churnRiskCount > 0 ? "orange" : undefined}
        />
      </div>

      {/* KPI grid — row 2 */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <MetricCard
          label="Novos Clientes (7d)"
          value={`+${summary.newCompanies7d}`}
          sub="Cadastros recentes"
          icon={TrendingUp}
          iconColor="text-[#16A34A]"
        />
        <MetricCard
          label="Total de Leads"
          value={summary.totalLeads.toLocaleString("pt-BR")}
          sub="Todos os tenants"
          icon={Users}
          iconColor="text-[#2563EB]"
        />
        <MetricCard
          label="Conversas (total)"
          value={summary.totalMessages.toLocaleString("pt-BR")}
          sub="Turnos processados pela IA"
          icon={MessageSquare}
          iconColor="text-[#14B8A6]"
        />
      </div>

      {/* Plan distribution with MRR breakdown */}
      <div className="border border-[#E4E4E7] bg-white rounded-2xl p-6 shadow-sm">
        <div className="flex items-center gap-2 mb-5">
          <BarChart3 size={16} className="text-[#2563EB]" />
          <h2 className="text-sm font-semibold text-[#09090B]">Distribuição de Planos & MRR</h2>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {planCounts.map(({ plan, count, mrr }) => (
            <div key={plan} className="bg-[#F4F4F5] rounded-xl p-4 border border-[#E4E4E7]">
              <div className="text-[10px] font-mono font-bold uppercase text-[#71717A] mb-1">{plan}</div>
              <div className="text-2xl font-bold font-mono text-[#09090B]">{count}</div>
              <div className="text-[10px] text-[#71717A] mt-0.5">
                {companies.length > 0 ? Math.round((count / companies.length) * 100) : 0}% do total
              </div>
              {mrr > 0 && (
                <div className="text-[10px] font-semibold text-[#16A34A] mt-1 font-mono">
                  R$ {mrr.toLocaleString("pt-BR")}/mês
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Churn risk panel */}
      {churnRiskCompanyIds.length > 0 && (
        <div className="border border-[#FED7AA] bg-[#FFF7ED] rounded-2xl p-5 shadow-sm">
          <div className="flex items-center gap-2 text-[#EA580C] font-semibold text-sm mb-3">
            <AlertTriangle size={16} />
            Risco de Churn — {churnRiskCompanyIds.length} empresa(s) sem atividade em 7 dias
          </div>
          <div className="flex flex-wrap gap-2">
            {companies
              .filter((c) => churnRiskCompanyIds.includes(c.id))
              .map((c) => (
                <span
                  key={c.id}
                  className="text-xs bg-white border border-[#FED7AA] rounded-full px-3 py-1 text-[#92400E] font-semibold"
                >
                  {c.name} <span className="text-[#D97706] font-mono">({c.plan_type})</span>
                </span>
              ))}
          </div>
        </div>
      )}

      {/* Unhealthy channels alert */}
      {unhealthyChannels.length > 0 && (
        <div className="border border-[#FECACA] bg-[#FFF1F2] rounded-2xl p-5 shadow-sm">
          <div className="flex items-center gap-2 text-[#DC2626] font-semibold text-sm mb-3">
            <AlertTriangle size={16} />
            Canais em Erro ({unhealthyChannels.length})
          </div>
          <div className="flex flex-col gap-2">
            {unhealthyChannels.map((ch) => (
              <div key={ch.id} className="text-xs bg-white border border-[#FECACA] rounded-xl p-3 text-[#3F3F46] flex flex-col md:flex-row md:items-center justify-between gap-2">
                <div>
                  <span className="font-bold text-[#09090B]">{ch.company_name}</span>
                  {" · canal "}
                  <span className="font-mono text-[#2563EB]">{ch.provider}</span>
                </div>
                <div className="text-[#DC2626] font-mono break-all max-w-md">{ch.last_error}</div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
