// app/admin/admin-client.tsx
"use client";

import { useState, useEffect, useTransition, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useRouter } from "next/navigation";
import {
  TrendingUp, Building2, Activity, FileText, LogOut,
  Brain, DollarSign, Command, Search, X, RefreshCw, Bug,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { logoutAdmin, updateTenantPlan, toggleCompanyAI } from "./actions";
import { toast } from "sonner";

// Tab components
import { ExecutiveTab }      from "./tabs/executive-tab";
import { TenantsTab }        from "./tabs/tenants-tab";
import { SystemHealthTab }   from "./tabs/system-health-tab";
import { AiEngineTab }       from "./tabs/ai-engine-tab";
import { BillingTab }        from "./tabs/billing-tab";
import { SecurityLogsTab }   from "./tabs/security-logs-tab";
import { DebugTab }          from "./tabs/debug-tab";

import type {
  Company, User, UnhealthyChannel, ProviderStat, RecentAiError,
  AuditLog, StaleLead, StaleMessage, TokenConsumer, IntentItem,
  SummaryData, Tab, DailyPoint,
} from "./types";

interface AdminDashboardClientProps {
  companies: Company[];
  users: User[];
  unhealthyChannels: UnhealthyChannel[];
  providerStats: ProviderStat[];
  recentAiErrors: RecentAiError[];
  auditLogs: AuditLog[];
  staleLeads: StaleLead[];
  staleMessages: StaleMessage[];
  topTokenConsumers: TokenConsumer[];
  intentDistribution: IntentItem[];
  aiErrorDaily: DailyPoint[];
  churnRiskCompanies: string[];
  summary: SummaryData;
}

const TABS: { id: Tab; label: string; icon: React.ElementType; badge?: (s: SummaryData, stale: StaleLead[]) => number | null }[] = [
  { id: "executive",     label: "Sumário Executivo",  icon: TrendingUp },
  { id: "tenants",       label: "Tenants",             icon: Building2 },
  { id: "system_health", label: "Saúde do Sistema",    icon: Activity,
    badge: (s, stale) => (s.churnRiskCount + stale.length) || null },
  { id: "ai_engine",     label: "Motor de IA",         icon: Brain },
  { id: "billing",       label: "Billing",             icon: DollarSign },
  { id: "security_logs", label: "Logs de Segurança",   icon: FileText },
  { id: "debug",         label: "Debug",               icon: Bug },
];

// ── Command palette ──────────────────────────────────────────────────────────

function CommandPalette({
  open,
  onClose,
  companies,
  onTabChange,
}: {
  open: boolean;
  onClose: () => void;
  companies: Company[];
  onTabChange: (tab: Tab) => void;
}) {
  const [q, setQ] = useState("");
  const router = useRouter();

  useEffect(() => { if (!open) setQ(""); }, [open]);

  const planActions = companies.slice(0, 5).map((c) => ({
    label: `${c.ai_paused ? "Reativar" : "Pausar"} IA — ${c.name}`,
    group: "Ações Rápidas",
    action: async () => {
      const res = await toggleCompanyAI(c.id, !c.ai_paused);
      if (res.success) { toast.success(c.ai_paused ? "IA reativada" : "IA pausada"); router.refresh(); }
      else toast.error(res.error || "Erro ao alternar IA");
    },
  }));

  const tabActions: { label: string; group: string; action: () => void }[] = TABS.map((t) => ({
    label: `Ir para ${t.label}`,
    group: "Navegação",
    action: () => { onTabChange(t.id); onClose(); },
  }));

  const companySearch: { label: string; group: string; action: () => void }[] = companies
    .filter((c) => c.name.toLowerCase().includes(q.toLowerCase()))
    .slice(0, 6)
    .map((c) => ({
      label: `${c.name} — ${c.plan_type.toUpperCase()} · ${c.subscription_status}`,
      group: "Empresas",
      action: () => { onTabChange("tenants"); onClose(); },
    }));

  const allItems = q.length > 0
    ? [...companySearch, ...tabActions.filter((a) => a.label.toLowerCase().includes(q.toLowerCase()))]
    : [...tabActions, ...planActions];

  const groups = Array.from(new Set(allItems.map((i) => i.group)));

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-50 flex items-start justify-center pt-[15vh] px-4"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
        >
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" />
          <motion.div
            className="relative w-full max-w-xl bg-white border border-[#E4E4E7] rounded-2xl shadow-2xl overflow-hidden"
            initial={{ opacity: 0, scale: 0.96, y: -8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: -8 }}
            transition={{ duration: 0.18 }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Search input */}
            <div className="flex items-center gap-3 px-4 py-3 border-b border-[#E4E4E7]">
              <Search size={15} className="text-[#71717A] shrink-0" />
              <input
                autoFocus
                type="text"
                placeholder="Buscar empresa, ação ou navegar..."
                value={q}
                onChange={(e) => setQ(e.target.value)}
                className="flex-1 text-sm bg-transparent focus:outline-none text-[#09090B] placeholder:text-[#A1A1AA]"
                onKeyDown={(e) => e.key === "Escape" && onClose()}
              />
              <button onClick={onClose} className="p-1 rounded text-[#A1A1AA] hover:text-[#09090B]">
                <X size={13} />
              </button>
            </div>

            {/* Results */}
            <div className="max-h-[400px] overflow-y-auto py-2">
              {allItems.length === 0 && (
                <div className="px-4 py-8 text-center text-sm text-[#A1A1AA]">
                  Nenhum resultado encontrado.
                </div>
              )}
              {groups.map((group) => (
                <div key={group}>
                  <div className="px-4 py-1.5 text-[10px] font-mono font-bold uppercase tracking-wider text-[#A1A1AA]">
                    {group}
                  </div>
                  {allItems
                    .filter((i) => i.group === group)
                    .map((item, idx) => (
                      <button
                        key={idx}
                        className="w-full text-left px-4 py-2.5 text-sm text-[#3F3F46] hover:bg-[#F4F4F5] hover:text-[#09090B] transition-colors"
                        onClick={item.action}
                      >
                        {item.label}
                      </button>
                    ))}
                </div>
              ))}
            </div>

            <div className="px-4 py-2 border-t border-[#E4E4E7] flex items-center gap-3 bg-[#F9F9F9]">
              <span className="text-[10px] text-[#A1A1AA]">
                <kbd className="font-mono bg-white border border-[#E4E4E7] px-1.5 py-0.5 rounded text-[9px]">↵</kbd> selecionar
              </span>
              <span className="text-[10px] text-[#A1A1AA]">
                <kbd className="font-mono bg-white border border-[#E4E4E7] px-1.5 py-0.5 rounded text-[9px]">esc</kbd> fechar
              </span>
              <span className="ml-auto text-[10px] text-[#A1A1AA] font-mono">⌘K</span>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

// ── Main dashboard ───────────────────────────────────────────────────────────

export function AdminDashboardClient({
  companies,
  users,
  unhealthyChannels,
  providerStats,
  recentAiErrors,
  auditLogs,
  staleLeads,
  staleMessages,
  topTokenConsumers,
  intentDistribution,
  aiErrorDaily,
  churnRiskCompanies,
  summary,
}: AdminDashboardClientProps) {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<Tab>("executive");
  const [cmdOpen, setCmdOpen]     = useState(false);
  const [refreshing, startRefresh] = useTransition();

  // Cmd+K / Ctrl+K shortcut
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setCmdOpen((o) => !o);
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  async function handleLogout() {
    await logoutAdmin();
    toast.info("Sessão administrativa encerrada");
    router.push("/admin/login");
    router.refresh();
  }

  const alertCount = summary.churnRiskCount + staleLeads.length + unhealthyChannels.length;

  return (
    <div className="max-w-7xl mx-auto px-6 py-10">
      {/* Header */}
      <div className="flex flex-col md:flex-row items-start md:items-center justify-between border-b border-[#E4E4E7] pb-6 mb-8 gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="h-2 w-2 rounded-full bg-[#14B8A6] animate-pulse" />
            <span className="font-mono text-xs uppercase tracking-widest text-[#71717A]">
              Agendra SaaS Command Center
            </span>
            {alertCount > 0 && (
              <span className="bg-[#DC2626] text-white text-[9px] font-bold rounded-full px-1.5 py-0.5 font-mono">
                {alertCount}
              </span>
            )}
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-[#09090B] font-display">
            Painel Secreto do Proprietário
          </h1>
        </div>

        <div className="flex items-center gap-2 self-stretch md:self-auto">
          {/* Command palette trigger */}
          <button
            onClick={() => setCmdOpen(true)}
            className="flex items-center gap-2 bg-white border border-[#E4E4E7] rounded-xl px-3 py-2 text-xs text-[#71717A] hover:border-[#D4D4D8] hover:text-[#09090B] transition-colors"
          >
            <Command size={13} />
            <span className="hidden sm:inline">Buscar</span>
            <kbd className="hidden sm:inline font-mono text-[9px] bg-[#F4F4F5] border border-[#E4E4E7] px-1.5 py-0.5 rounded">⌘K</kbd>
          </button>

          <button
            onClick={() => startRefresh(() => router.refresh())}
            disabled={refreshing}
            title="Atualizar dados"
            className="flex items-center gap-2 bg-white border border-[#E4E4E7] rounded-xl px-3 py-2 text-xs text-[#71717A] hover:border-[#D4D4D8] hover:text-[#09090B] transition-colors disabled:opacity-50"
          >
            <RefreshCw size={13} className={refreshing ? "animate-spin" : ""} />
            <span className="hidden sm:inline">{refreshing ? "Atualizando…" : "Atualizar"}</span>
          </button>

          <div className="text-right hidden sm:block">
            <p className="text-xs font-semibold text-[#09090B]">Super Admin</p>
            <p className="text-[10px] font-mono text-[#71717A]">
              {new Date(summary.generatedAt).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
            </p>
          </div>

          <Button
            variant="secondary"
            size="sm"
            onClick={handleLogout}
            className="text-xs text-[#DC2626] hover:bg-[#FFF1F2] hover:border-[#FECACA]"
          >
            <LogOut size={13} className="mr-1" />
            Sair
          </Button>
        </div>
      </div>

      {/* Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
        {/* Sidebar */}
        <div className="lg:col-span-1 flex flex-col gap-1">
          {TABS.map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            const badgeCount = tab.badge?.(summary, staleLeads) ?? null;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-semibold transition-all duration-150 text-left border ${
                  isActive
                    ? "bg-[#2563EB]/10 border-[#2563EB]/30 text-[#2563EB]"
                    : "bg-white border-[#E4E4E7] hover:bg-[#F4F4F5] text-[#3F3F46] hover:text-[#09090B]"
                }`}
              >
                <Icon size={16} className={isActive ? "text-[#2563EB]" : "text-[#71717A]"} />
                <span className="flex-1">{tab.label}</span>
                {badgeCount !== null && (
                  <span className={`text-[9px] font-bold rounded-full px-1.5 py-0.5 font-mono ${
                    isActive ? "bg-[#2563EB] text-white" : "bg-[#DC2626] text-white"
                  }`}>
                    {badgeCount}
                  </span>
                )}
              </button>
            );
          })}

          {/* Sidebar info card */}
          <div className="mt-6 border border-[#E4E4E7] bg-white rounded-2xl p-5 shadow-sm">
            <h3 className="text-[10px] font-mono uppercase tracking-wider text-[#71717A] mb-3">
              Visão Global
            </h3>
            <div className="flex flex-col gap-2 text-xs text-[#3F3F46]">
              {[
                ["Tenants",      summary.totalCompanies.toString()],
                ["Usuários",     summary.totalUsers.toString()],
                ["Leads totais", summary.totalLeads.toLocaleString("pt-BR")],
                ["Msgs totais",  summary.totalMessages.toLocaleString("pt-BR")],
                ["MRR estimado", `R$${summary.estimatedMRR.toLocaleString("pt-BR")}`],
                ["Novos (7d)",   `+${summary.newCompanies7d}`],
              ].map(([label, value]) => (
                <div key={label} className="flex justify-between">
                  <span>{label}:</span>
                  <span className="font-semibold text-[#09090B] font-mono">{value}</span>
                </div>
              ))}
              {summary.churnRiskCount > 0 && (
                <div className="flex justify-between text-[#EA580C] font-semibold bg-[#FFF7ED] px-2 py-1 rounded border border-[#FED7AA]">
                  <span>Churn Risk:</span>
                  <span className="font-mono">{summary.churnRiskCount}</span>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Content */}
        <div className="lg:col-span-3">
          <AnimatePresence mode="popLayout">
            <motion.div
              key={activeTab}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
            >
              {activeTab === "executive" && (
                <ExecutiveTab
                  companies={companies}
                  summary={summary}
                  churnRiskCompanyIds={churnRiskCompanies}
                  unhealthyChannels={unhealthyChannels}
                />
              )}
              {activeTab === "tenants" && (
                <TenantsTab
                  companies={companies}
                  churnRiskIds={churnRiskCompanies}
                />
              )}
              {activeTab === "system_health" && (
                <SystemHealthTab
                  providerStats={providerStats}
                  recentAiErrors={recentAiErrors}
                  staleLeads={staleLeads}
                  staleMessages={staleMessages}
                  topTokenConsumers={topTokenConsumers}
                  aiErrorDaily={aiErrorDaily}
                />
              )}
              {activeTab === "ai_engine" && (
                <AiEngineTab
                  companies={companies}
                  intentDistribution={intentDistribution}
                />
              )}
              {activeTab === "billing" && (
                <BillingTab
                  companies={companies}
                  summary={summary}
                />
              )}
              {activeTab === "security_logs" && (
                <SecurityLogsTab auditLogs={auditLogs} />
              )}
              {activeTab === "debug" && (
                <DebugTab companies={companies} />
              )}
            </motion.div>
          </AnimatePresence>
        </div>
      </div>

      {/* Command palette */}
      <CommandPalette
        open={cmdOpen}
        onClose={() => setCmdOpen(false)}
        companies={companies}
        onTabChange={(tab) => { setActiveTab(tab); setCmdOpen(false); }}
      />
    </div>
  );
}
