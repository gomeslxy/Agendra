// app/admin/tabs/tenants-tab.tsx
"use client";

import { useState, useTransition, Fragment, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Search, Power, ChevronUp, ChevronDown, Download, Trash2, RefreshCw, Bell, Wand2, Plus, Play,
  Eye, X, Activity, DollarSign, Key, FileText, BarChart3, AlertCircle
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { useRouter } from "next/navigation";
import {
  updateTenantPlan, toggleCompanyAI, generateTenantMagicLink,
  resetTenantOnboarding, sendTenantNotification, extendTenantMessageLimit,
  exportTenantDataCSV, deleteTenant, forceBypassOnboarding,
  getTenantActivityTimeline, getTenantStripeInvoices, getTenantAuthLogs,
  getTenantDailyUsage, triggerTenantAnomalyAlert
} from "../actions";
import { ConfirmModal } from "../components/confirm-modal";
import type { Company } from "../types";

type SortKey = "name" | "plan_type" | "mrr" | "msgs_7d" | "leads_active" | "last_activity";
type SortDir = "asc" | "desc";

interface Props {
  companies: Company[];
  churnRiskIds: string[];
}

export function TenantsTab({ companies: initial, churnRiskIds }: Props) {
  const router = useRouter();
  const [companies, setCompanies] = useState<Company[]>(initial);
  const [isPending, startTransition] = useTransition();
  const [search, setSearch]         = useState("");
  const [filterPlan, setFilterPlan] = useState("all");
  const [filterStatus, setFilterStatus] = useState("all");
  const [sortKey, setSortKey]       = useState<SortKey>("name");
  const [sortDir, setSortDir]       = useState<SortDir>("asc");
  const [expandedId, setExpandedId] = useState<string | null>(null);

  // Modal state
  const [deleteTarget, setDeleteTarget] = useState<Company | null>(null);
  const [impersonateTarget, setImpersonateTarget] = useState<Company | null>(null);
  const [exportTarget, setExportTarget] = useState<Company | null>(null);
  const [notifTarget,  setNotifTarget]  = useState<Company | null>(null);
  const [notifTitle,   setNotifTitle]   = useState("");
  const [notifBody,    setNotifBody]    = useState("");
  const [drillCompany, setDrillCompany] = useState<Company | null>(null);

  function toggleSort(key: SortKey) {
    if (sortKey === key) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else { setSortKey(key); setSortDir("asc"); }
  }

  const filtered = companies
    .filter((c) => c.name.toLowerCase().includes(search.toLowerCase()))
    .filter((c) => filterPlan === "all" || c.plan_type === filterPlan)
    .filter((c) => {
      if (filterStatus === "all") return true;
      if (filterStatus === "churn") return churnRiskIds.includes(c.id);
      if (filterStatus === "paused") return c.ai_paused;
      if (filterStatus === "error") return c.channel_status === "error";
      return true;
    })
    .sort((a, b) => {
      const dir = sortDir === "asc" ? 1 : -1;
      if (sortKey === "name")          return dir * a.name.localeCompare(b.name);
      if (sortKey === "plan_type")     return dir * a.plan_type.localeCompare(b.plan_type);
      if (sortKey === "mrr")           return dir * (a.mrr - b.mrr);
      if (sortKey === "msgs_7d")       return dir * (a.msgs_7d - b.msgs_7d);
      if (sortKey === "leads_active")  return dir * (a.leads_active - b.leads_active);
      if (sortKey === "last_activity") {
        const ta = a.last_activity ? new Date(a.last_activity).getTime() : 0;
        const tb = b.last_activity ? new Date(b.last_activity).getTime() : 0;
        return dir * (ta - tb);
      }
      return 0;
    });

  function SortIcon({ k }: { k: SortKey }) {
    if (sortKey !== k) return <ChevronUp size={10} className="text-[#D4D4D8]" />;
    return sortDir === "asc"
      ? <ChevronUp size={10} className="text-[#2563EB]" />
      : <ChevronDown size={10} className="text-[#2563EB]" />;
  }

  async function handlePlanChange(id: string, plan: string) {
    const prev = companies.find((c) => c.id === id)?.plan_type;
    setCompanies((p) => p.map((c) => c.id === id ? { ...c, plan_type: plan } : c));
    const res = await updateTenantPlan(id, plan);
    if (res.success) { toast.success("Plano atualizado"); router.refresh(); }
    else {
      if (prev) setCompanies((p) => p.map((c) => c.id === id ? { ...c, plan_type: prev } : c));
      toast.error(res.error || "Erro ao atualizar plano");
    }
  }

  async function handleToggleAI(id: string, paused: boolean) {
    setCompanies((p) => p.map((c) => c.id === id ? { ...c, ai_paused: !paused } : c));
    const res = await toggleCompanyAI(id, !paused);
    if (res.success) { toast.success(paused ? "IA reativada" : "IA pausada"); router.refresh(); }
    else {
      setCompanies((p) => p.map((c) => c.id === id ? { ...c, ai_paused: paused } : c));
      toast.error(res.error || "Erro ao alternar IA");
    }
  }

  async function handleMagicLink(company: Company) {
    toast.info("Gerando magic link...");
    const res = await generateTenantMagicLink(company.id);
    if (res.success && res.link) {
      await navigator.clipboard.writeText(res.link);
      toast.success("Magic link copiado para a área de transferência!", { duration: 5000 });
    } else {
      toast.error(res.error || "Erro ao gerar magic link");
    }
  }

  async function handleResetOnboarding(company: Company) {
    const res = await resetTenantOnboarding(company.id);
    if (res.success) { toast.success(`Onboarding resetado para ${company.name}`); router.refresh(); }
    else toast.error(res.error || "Erro ao resetar onboarding");
  }

  async function handleSendNotif() {
    if (!notifTarget || !notifTitle.trim() || !notifBody.trim()) return;
    const res = await sendTenantNotification(notifTarget.id, notifTitle, notifBody);
    if (res.success) {
      toast.success(`Notificação enviada para ${notifTarget.name}`);
      setNotifTarget(null); setNotifTitle(""); setNotifBody("");
    } else {
      toast.error(res.error || "Erro ao enviar notificação");
    }
  }

  async function handleExtend(company: Company) {
    const res = await extendTenantMessageLimit(company.id, 500);
    if (res.success) { toast.success(`+500 leads adicionados para ${company.name}`); router.refresh(); }
    else toast.error(res.error || "Erro ao estender limite");
  }

  async function handleExport(company: Company) {
    toast.info("Gerando CSV...");
    const res = await exportTenantDataCSV(company.id);
    if (res.success && res.csv) {
      const blob = new Blob([res.csv], { type: "text/csv" });
      const url  = URL.createObjectURL(blob);
      const a    = document.createElement("a");
      a.href = url; a.download = `leads-${company.name.replace(/\s+/g, "-")}.csv`;
      a.click(); URL.revokeObjectURL(url);
      toast.success("CSV exportado!");
    } else {
      toast.error(res.error || "Erro ao exportar CSV");
    }
  }

  async function handleBypassOnboarding(company: Company) {
    toast.info("Resetando onboarding e gerando link...");
    const res = await forceBypassOnboarding(company.id);
    if (res.success && res.link) {
      await navigator.clipboard.writeText(res.link);
      toast.success("Onboarding resetado! Magic link copiado — cole no navegador para testar.", { duration: 8000 });
    } else {
      toast.error(res.error || "Erro ao gerar link de onboarding");
    }
  }

  async function handleDelete() {
    if (!deleteTarget) return;
    const res = await deleteTenant(deleteTarget.id, deleteTarget.name);
    if (res.success) {
      setCompanies((p) => p.filter((c) => c.id !== deleteTarget.id));
      toast.success(`${deleteTarget.name} deletado com sucesso`);
      setDeleteTarget(null);
      router.refresh();
    } else {
      toast.error(res.error || "Erro ao deletar tenant");
    }
  }

  const channelStatusColor: Record<string, string> = {
    active: "bg-[#14B8A6]", paused: "bg-[#FBBF24]", error: "bg-[#DC2626]", none: "bg-[#D4D4D8]",
  };

  return (
    <div className="flex flex-col gap-5">
      {/* Filters bar */}
      <div className="flex flex-wrap gap-3">
        <div className="flex items-center gap-2 bg-white border border-[#E4E4E7] rounded-xl px-3.5 py-2 shadow-sm flex-1 min-w-[200px]">
          <Search size={14} className="text-[#71717A] shrink-0" />
          <input
            type="text"
            placeholder="Buscar empresa..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full text-sm bg-transparent focus:outline-none text-[#09090B] placeholder:text-[#A1A1AA]"
          />
        </div>
        <select
          value={filterPlan}
          onChange={(e) => setFilterPlan(e.target.value)}
          className="bg-white border border-[#E4E4E7] rounded-xl px-3 py-2 text-sm font-mono focus:outline-none text-[#3F3F46]"
        >
          <option value="all">Todos Planos</option>
          <option value="trial">TRIAL</option>
          <option value="starter">STARTER</option>
          <option value="pro">PRO</option>
          <option value="business">BUSINESS</option>
        </select>
        <select
          value={filterStatus}
          onChange={(e) => setFilterStatus(e.target.value)}
          className="bg-white border border-[#E4E4E7] rounded-xl px-3 py-2 text-sm focus:outline-none text-[#3F3F46]"
        >
          <option value="all">Todos Status</option>
          <option value="churn">Risco Churn</option>
          <option value="paused">IA Pausada</option>
          <option value="error">Canal em Erro</option>
        </select>
        <span className="text-xs text-[#71717A] self-center font-mono">
          {filtered.length} de {companies.length}
        </span>
      </div>

      {/* Table */}
      <div className="border border-[#E4E4E7] bg-white rounded-2xl shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-[#F4F4F5] border-b border-[#E4E4E7] text-[10px] font-mono uppercase text-[#71717A]">
                {(
                  [
                    ["name",          "Empresa"],
                    ["plan_type",     "Plano"],
                    ["mrr",           "MRR"],
                    ["msgs_7d",       "Msgs 7d"],
                    ["leads_active",  "Leads Ativos"],
                    ["last_activity", "Última Atividade"],
                  ] as [SortKey, string][]
                ).map(([key, label]) => (
                  <th
                    key={key}
                    className="px-4 py-3 font-semibold cursor-pointer select-none hover:text-[#09090B] transition-colors"
                    onClick={() => toggleSort(key)}
                  >
                    <span className="flex items-center gap-1">
                      {label} <SortIcon k={key} />
                    </span>
                  </th>
                ))}
                <th className="px-4 py-3 font-semibold text-center">Canal</th>
                <th className="px-4 py-3 font-semibold text-right">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#E4E4E7] text-xs text-[#3F3F46]">
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-5 py-10 text-center text-[#A1A1AA]">
                    Nenhuma empresa encontrada.
                  </td>
                </tr>
              ) : (
                filtered.map((c) => {
                  const isChurnRisk = churnRiskIds.includes(c.id);
                  const expanded = expandedId === c.id;
                  return (
                    <Fragment key={c.id}>
                      <tr
                        className={`transition-colors cursor-pointer ${expanded ? "bg-[#F4F4F5]" : "hover:bg-[#FAFAFA]"} ${isChurnRisk ? "border-l-2 border-l-[#EA580C]" : ""}`}
                        onClick={() => setExpandedId(expanded ? null : c.id)}
                      >
                        <td className="px-4 py-3">
                          <div className="font-semibold text-[#09090B]">{c.name}</div>
                          {isChurnRisk && (
                            <span className="text-[9px] bg-[#FFF7ED] text-[#EA580C] border border-[#FED7AA] rounded-full px-1.5 py-0.5 font-bold">
                              CHURN RISK
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          <select
                            value={c.plan_type}
                            onClick={(e) => e.stopPropagation()}
                            onChange={(e) => handlePlanChange(c.id, e.target.value)}
                            className="bg-[#F4F4F5] border border-[#E4E4E7] rounded-lg px-2 py-1 font-mono font-bold text-[10px] focus:outline-none uppercase"
                          >
                            <option value="trial">TRIAL</option>
                            <option value="starter">STARTER</option>
                            <option value="pro">PRO</option>
                            <option value="business">BUSINESS</option>
                          </select>
                        </td>
                        <td className="px-4 py-3 font-mono font-semibold text-[#16A34A]">
                          {c.mrr > 0 ? `R$${c.mrr}` : "—"}
                        </td>
                        <td className="px-4 py-3 font-mono">
                          <span className={`${c.msgs_7d === 0 ? "text-[#DC2626]" : "text-[#09090B]"} font-semibold`}>
                            {c.msgs_7d}
                          </span>
                        </td>
                        <td className="px-4 py-3 font-mono">{c.leads_active}</td>
                        <td className="px-4 py-3 text-[#71717A] font-mono">
                          {c.last_activity
                            ? new Date(c.last_activity).toLocaleDateString("pt-BR")
                            : <span className="text-[#DC2626]">Nunca</span>
                          }
                        </td>
                        <td className="px-4 py-3 text-center">
                          <span
                            className={`inline-block h-2.5 w-2.5 rounded-full ${channelStatusColor[c.channel_status] ?? "bg-[#D4D4D8]"}`}
                            title={c.channel_status}
                          />
                        </td>
                        <td className="px-4 py-3 text-right">
                          <Button
                            variant={c.ai_paused ? "primary" : "secondary"}
                            size="sm"
                            className="text-[10px] px-2 py-1"
                            onClick={(e) => { e.stopPropagation(); handleToggleAI(c.id, c.ai_paused); }}
                          >
                            <Power size={10} className="mr-1" />
                            {c.ai_paused ? "Ativar" : "Pausar"}
                          </Button>
                        </td>
                      </tr>

                      {/* Expanded row: actions */}
                      {expanded && (
                        <tr className="bg-[#F4F4F5] border-t border-[#E4E4E7]">
                          <td colSpan={8} className="px-4 py-3">
                            <div className="flex flex-wrap gap-2 items-center">
                              <span className="text-[10px] font-mono text-[#71717A] mr-1">Ações rápidas →</span>
                              <Button size="sm" variant="secondary" className="text-[10px] gap-1 text-[#2563EB] hover:bg-[#EFF6FF] hover:border-[#BFDBFE]" onClick={() => setDrillCompany(c)}>
                                <Eye size={11} /> Ver Detalhes
                              </Button>
                              <Button size="sm" variant="secondary" className="text-[10px] gap-1" onClick={() => setImpersonateTarget(c)}>
                                <Wand2 size={11} /> Impersonar
                              </Button>
                              <Button size="sm" variant="secondary" className="text-[10px] gap-1" onClick={() => handleResetOnboarding(c)}>
                                <RefreshCw size={11} /> Resetar Onboarding
                              </Button>
                              <Button size="sm" variant="secondary" className="text-[10px] gap-1 text-[#7C3AED] hover:bg-[#F5F3FF] hover:border-[#DDD6FE]" onClick={() => handleBypassOnboarding(c)}>
                                <Play size={11} /> Testar Onboarding
                              </Button>
                              <Button size="sm" variant="secondary" className="text-[10px] gap-1" onClick={() => setNotifTarget(c)}>
                                <Bell size={11} /> Notificação
                              </Button>
                              <Button size="sm" variant="secondary" className="text-[10px] gap-1" onClick={() => handleExtend(c)}>
                                <Plus size={11} /> +500 leads
                              </Button>
                              <Button size="sm" variant="secondary" className="text-[10px] gap-1" onClick={() => setExportTarget(c)}>
                                <Download size={11} /> Exportar CSV
                              </Button>
                              <Button
                                size="sm"
                                variant="secondary"
                                className="text-[10px] gap-1 text-[#DC2626] hover:bg-[#FFF1F2] hover:border-[#FECACA]"
                                onClick={() => setDeleteTarget(c)}
                              >
                                <Trash2 size={11} /> Deletar
                              </Button>
                              {c.extra_leads > 0 && (
                                <span className="text-[9px] bg-[#EFF6FF] border border-[#BFDBFE] text-[#1D4ED8] rounded-full px-2 py-0.5 font-mono">
                                  +{c.extra_leads} leads extras
                                </span>
                              )}
                            </div>
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Delete confirm modal */}
      <ConfirmModal
        open={!!deleteTarget}
        title={`Deletar ${deleteTarget?.name}`}
        description="Esta ação é IRREVERSÍVEL. Todos os dados do tenant serão removidos permanentemente (leads, mensagens, canais, configurações)."
        confirmText={deleteTarget?.name}
        confirmLabel="Deletar permanentemente"
        danger
        onConfirm={handleDelete}
        onClose={() => setDeleteTarget(null)}
      />

      {/* Impersonate confirm modal — generates a login link as the tenant owner */}
      <ConfirmModal
        open={!!impersonateTarget}
        title={`Impersonar ${impersonateTarget?.name}`}
        description="Gera um magic link de login como o DONO desta empresa, dando acesso total aos dados dele. A ação é auditada. Use apenas para suporte legítimo."
        confirmLabel="Gerar link de acesso"
        danger
        onConfirm={() => { if (impersonateTarget) handleMagicLink(impersonateTarget); setImpersonateTarget(null); }}
        onClose={() => setImpersonateTarget(null)}
      />

      {/* Export confirm modal — exfiltrates lead PII */}
      <ConfirmModal
        open={!!exportTarget}
        title={`Exportar leads de ${exportTarget?.name}`}
        description="Exporta dados pessoais (nome, telefone, email) dos leads em CSV. Trate o arquivo conforme a LGPD. A ação é auditada."
        confirmLabel="Exportar CSV"
        onConfirm={() => { if (exportTarget) handleExport(exportTarget); setExportTarget(null); }}
        onClose={() => setExportTarget(null)}
      />

      {/* Send notification modal */}
      {notifTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={() => setNotifTarget(null)}>
          <div className="absolute inset-0 bg-black/30 backdrop-blur-sm" />
          <div
            className="relative bg-white border border-[#E4E4E7] rounded-2xl shadow-2xl w-full max-w-md p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="font-bold text-[#09090B] mb-1">Enviar Notificação</h3>
            <p className="text-xs text-[#71717A] mb-4">Para todos os usuários de <span className="font-semibold text-[#09090B]">{notifTarget.name}</span></p>
            <input
              type="text"
              placeholder="Título da notificação"
              value={notifTitle}
              onChange={(e) => setNotifTitle(e.target.value)}
              className="w-full border border-[#E4E4E7] rounded-xl px-3 py-2 text-sm mb-2 focus:outline-none focus:border-[#2563EB]"
            />
            <textarea
              placeholder="Corpo da notificação..."
              value={notifBody}
              onChange={(e) => setNotifBody(e.target.value)}
              rows={3}
              className="w-full border border-[#E4E4E7] rounded-xl px-3 py-2 text-sm mb-4 focus:outline-none focus:border-[#2563EB] resize-none"
            />
            <div className="flex justify-end gap-2">
              <Button variant="secondary" size="sm" onClick={() => setNotifTarget(null)}>Cancelar</Button>
              <Button variant="primary" size="sm" onClick={handleSendNotif} disabled={!notifTitle.trim() || !notifBody.trim()}>
                Enviar
              </Button>
            </div>
          </div>
        </div>
      )}
      {/* Drill-down Drawer */}
      <AnimatePresence>
        {drillCompany && (
          <DrillDownDrawer company={drillCompany} onClose={() => setDrillCompany(null)} />
        )}
      </AnimatePresence>
    </div>
  );
}

// ── Drill-down Drawer Component ──────────────────────────────────────────────

import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip as ChartTooltip, ResponsiveContainer
} from "recharts";

function DrillDownDrawer({
  company,
  onClose,
}: {
  company: Company;
  onClose: () => void;
}) {
  const [activeTab, setActiveTab] = useState<"usage" | "auth" | "billing" | "activity">("usage");
  const [loading, setLoading] = useState(true);
  const [dailyUsage, setDailyUsage] = useState<{ day: string; count: number }[]>([]);
  const [authLogs, setAuthLogs] = useState<any[]>([]);
  const [invoices, setInvoices] = useState<any[]>([]);
  const [activity, setActivity] = useState<any[]>([]);
  
  const [sendingAlert, setSendingAlert] = useState(false);

  useEffect(() => {
    async function loadAll() {
      setLoading(true);
      const [usageRes, authRes, invRes, actRes] = await Promise.all([
        getTenantDailyUsage(company.id),
        getTenantAuthLogs(company.id),
        getTenantStripeInvoices(company.id),
        getTenantActivityTimeline(company.id),
      ]);
      setLoading(false);
      
      if (usageRes.success && usageRes.usage) setDailyUsage(usageRes.usage);
      if (authRes.success && authRes.logs) setAuthLogs(authRes.logs);
      if (invRes.success && invRes.invoices) setInvoices(invRes.invoices);
      if (actRes.success && actRes.logs) setActivity(actRes.logs);
    }
    loadAll();
  }, [company.id]);

  async function handleTriggerAlert() {
    const reason = window.prompt("Digite o motivo do alerta (será enviado por email aos admins/owner):");
    if (!reason?.trim()) return;
    setSendingAlert(true);
    const res = await triggerTenantAnomalyAlert(company.id, "Anomalia Operacional", reason.trim());
    setSendingAlert(false);
    if (res.success) {
      toast.success("Alerta proativo enviado por e-mail!");
      const actRes = await getTenantActivityTimeline(company.id);
      if (actRes.success && actRes.logs) setActivity(actRes.logs);
    } else {
      toast.error(res.error || "Erro ao disparar alerta");
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      {/* Backdrop */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onClose}
        className="absolute inset-0 bg-black/15 backdrop-blur-sm"
      />
      
      {/* Drawer */}
      <motion.div
        initial={{ x: "100%" }}
        animate={{ x: 0 }}
        exit={{ x: "100%" }}
        transition={{ type: "spring", damping: 30, stiffness: 300 }}
        className="relative z-10 w-full max-w-2xl bg-white h-full shadow-2xl flex flex-col border-l border-[#E4E4E7]"
      >
        {/* Header */}
        <div className="px-6 py-5 border-b border-[#E4E4E7] bg-[#FAFAFA] flex justify-between items-center">
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-base font-bold text-[#09090B]">{company.name}</h2>
              <span className="text-[10px] font-mono font-bold uppercase bg-[#EFF6FF] border border-[#BFDBFE] text-[#2563EB] px-2 py-0.5 rounded-full">
                {company.plan_type}
              </span>
            </div>
            <p className="text-[11px] text-[#71717A] font-mono mt-0.5">ID: {company.id}</p>
          </div>
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              variant="secondary"
              className="text-[10px] h-8 px-2.5 gap-1 text-[#DC2626] hover:bg-[#FFF1F2] hover:border-[#FECACA]"
              onClick={handleTriggerAlert}
              disabled={sendingAlert}
            >
              <AlertCircle size={12} />
              Enviar Alerta
            </Button>
            <button
              onClick={onClose}
              className="p-1.5 rounded-lg border border-[#E4E4E7] bg-white hover:bg-[#FAFAFA] text-[#71717A] hover:text-[#09090B] transition-colors"
            >
              <X size={15} />
            </button>
          </div>
        </div>

        {/* Navigation Tabs */}
        <div className="flex border-b border-[#E4E4E7] bg-[#FAFAFA] px-4">
          {[
            { id: "usage", label: "Uso Diário", icon: BarChart3 },
            { id: "auth", label: "Acessos", icon: Key },
            { id: "billing", label: "Financeiro", icon: DollarSign },
            { id: "activity", label: "Atividades", icon: Activity },
          ].map((tab) => {
            const Icon = tab.icon;
            const active = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as any)}
                className={`flex items-center gap-1.5 px-4 py-3 text-xs font-semibold border-b-2 transition-all relative ${
                  active
                    ? "border-[#2563EB] text-[#2563EB]"
                    : "border-transparent text-[#71717A] hover:text-[#09090B]"
                }`}
              >
                <Icon size={13} />
                {tab.label}
              </button>
            );
          })}
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6 bg-white">
          {loading ? (
            <div className="h-64 flex flex-col items-center justify-center gap-2 text-xs text-[#71717A]">
              <RefreshCw size={20} className="animate-spin text-[#2563EB]" />
              <span>Carregando detalhes do Tenant...</span>
            </div>
          ) : (
            <AnimatePresence mode="wait">
              {activeTab === "usage" && (
                <motion.div
                  key="usage"
                  initial={{ opacity: 0, y: 5 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -5 }}
                  className="space-y-4"
                >
                  <div className="border border-[#E4E4E7] rounded-2xl p-4 bg-[#FAFAFA]">
                    <h3 className="text-xs font-bold text-[#09090B] mb-4">Volume de Mensagens (Últimos 30 dias)</h3>
                    <div className="h-56 w-full">
                      {dailyUsage.length === 0 ? (
                        <div className="h-full flex items-center justify-center text-xs text-[#A1A1AA]">
                          Nenhum dado de uso registrado.
                        </div>
                      ) : (
                        <ResponsiveContainer width="100%" height="100%">
                          <AreaChart data={dailyUsage} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                            <defs>
                              <linearGradient id="usageGrad" x1="0" y1="0" x2="0" y2="1">
                                <stop offset="5%" stopColor="#2563EB" stopOpacity={0.2} />
                                <stop offset="95%" stopColor="#2563EB" stopOpacity={0} />
                              </linearGradient>
                            </defs>
                            <CartesianGrid strokeDasharray="3 3" stroke="#E4E4E7" vertical={false} />
                            <XAxis
                              dataKey="day"
                              tick={{ fontSize: 9, fill: "#71717A" }}
                              tickLine={false}
                              axisLine={false}
                            />
                            <YAxis
                              tick={{ fontSize: 9, fill: "#71717A" }}
                              tickLine={false}
                              axisLine={false}
                            />
                            <ChartTooltip
                              content={({ active, payload, label }) => {
                                if (!active || !payload?.length) return null;
                                return (
                                  <div className="rounded-xl border border-[#E4E4E7] bg-white px-3 py-2 text-[11px] shadow-lg">
                                    <p className="font-semibold text-[#09090B] mb-1">{label}</p>
                                    <p className="text-[#71717A] flex items-center gap-1">
                                      <span className="h-1.5 w-1.5 rounded-full bg-[#2563EB]" />
                                      Mensagens: <span className="font-bold text-[#09090B]">{payload[0].value}</span>
                                    </p>
                                  </div>
                                );
                              }}
                            />
                            <Area
                              type="monotone"
                              dataKey="count"
                              stroke="#2563EB"
                              strokeWidth={2}
                              fill="url(#usageGrad)"
                              dot={false}
                            />
                          </AreaChart>
                        </ResponsiveContainer>
                      )}
                    </div>
                  </div>
                </motion.div>
              )}

              {activeTab === "auth" && (
                <motion.div
                  key="auth"
                  initial={{ opacity: 0, y: 5 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -5 }}
                  className="space-y-3"
                >
                  <div className="border border-[#E4E4E7] bg-white rounded-2xl overflow-hidden shadow-sm">
                    <table className="w-full text-left border-collapse text-xs">
                      <thead>
                        <tr className="bg-[#F4F4F5] border-b border-[#E4E4E7] text-[10px] font-mono uppercase text-[#71717A]">
                          <th className="px-4 py-2.5">Data/Hora</th>
                          <th className="px-4 py-2.5">Ação</th>
                          <th className="px-4 py-2.5">IP</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-[#E4E4E7] text-[#3F3F46]">
                        {authLogs.length === 0 ? (
                          <tr>
                            <td colSpan={3} className="px-4 py-8 text-center text-[#A1A1AA]">
                              Nenhum log de acesso encontrado.
                            </td>
                          </tr>
                        ) : (
                          authLogs.map((l) => (
                            <tr key={l.id} className="hover:bg-[#FAFAFA]">
                              <td className="px-4 py-2.5 font-mono text-[10px] text-[#71717A]">
                                {new Date(l.created_at).toLocaleString("pt-BR")}
                              </td>
                              <td className="px-4 py-2.5">
                                <span className={`font-mono text-[10px] font-bold px-1.5 py-0.5 rounded ${
                                  l.action.includes("success")
                                    ? "bg-[#EFF6FF] text-[#2563EB]"
                                    : "bg-[#FFF1F2] text-[#DC2626]"
                                }`}>
                                  {l.action}
                                </span>
                              </td>
                              <td className="px-4 py-2.5 font-mono text-[10px] text-[#3F3F46]">
                                {l.ip_address}
                              </td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>
                </motion.div>
              )}

              {activeTab === "billing" && (
                <motion.div
                  key="billing"
                  initial={{ opacity: 0, y: 5 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -5 }}
                  className="space-y-3"
                >
                  <div className="border border-[#E4E4E7] bg-white rounded-2xl overflow-hidden shadow-sm">
                    <table className="w-full text-left border-collapse text-xs">
                      <thead>
                        <tr className="bg-[#F4F4F5] border-b border-[#E4E4E7] text-[10px] font-mono uppercase text-[#71717A]">
                          <th className="px-4 py-2.5">Fatura ID</th>
                          <th className="px-4 py-2.5">Evento</th>
                          <th className="px-4 py-2.5">Valor</th>
                          <th className="px-4 py-2.5 text-right">Data</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-[#E4E4E7] text-[#3F3F46]">
                        {invoices.length === 0 ? (
                          <tr>
                            <td colSpan={4} className="px-4 py-8 text-center text-[#A1A1AA]">
                              Nenhuma fatura encontrada.
                            </td>
                          </tr>
                        ) : (
                          invoices.map((inv) => (
                            <tr key={inv.id} className="hover:bg-[#FAFAFA]">
                              <td className="px-4 py-2.5 font-mono text-[10px] font-semibold text-[#09090B]">
                                {inv.invoice_id}
                              </td>
                              <td className="px-4 py-2.5">
                                <span className={`text-[10px] px-1.5 py-0.5 rounded font-mono font-bold ${
                                  inv.event_type.includes("paid")
                                    ? "bg-[#EFC3C3]/15 text-[#16A34A]"
                                    : "bg-[#FFF1F2] text-[#DC2626]"
                                }`}>
                                  {inv.event_type}
                                </span>
                              </td>
                              <td className="px-4 py-2.5 font-mono text-[#09090B] font-bold">
                                R${inv.amount.toFixed(2)}
                              </td>
                              <td className="px-4 py-2.5 text-right font-mono text-[10px] text-[#71717A]">
                                {new Date(inv.created_at).toLocaleDateString("pt-BR")}
                              </td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>
                </motion.div>
              )}

              {activeTab === "activity" && (
                <motion.div
                  key="activity"
                  initial={{ opacity: 0, y: 5 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -5 }}
                  className="space-y-4"
                >
                  <div className="relative border-l-2 border-[#E4E4E7] ml-3 pl-5 space-y-4">
                    {activity.length === 0 ? (
                      <p className="text-xs text-[#A1A1AA] text-center ml-[-20px] py-8">
                        Nenhuma atividade de auditoria registrada.
                      </p>
                    ) : (
                      activity.map((l) => (
                        <div key={l.id} className="relative">
                          <span className="absolute -left-[27px] top-1.5 h-3.5 w-3.5 rounded-full border-2 border-white bg-[#2563EB]" />
                          <div className="text-xs font-bold text-[#09090B]">{l.action}</div>
                          <div className="text-[10px] text-[#71717A] font-mono mt-0.5">
                            {new Date(l.created_at).toLocaleString("pt-BR")} &bull; Por: {l.actor_email}
                          </div>
                          {l.payload && Object.keys(l.payload).length > 0 && (
                            <pre className="mt-1.5 p-2 bg-[#FAFAFA] border border-[#E4E4E7] rounded-lg text-[9px] font-mono text-[#52525B] max-h-24 overflow-y-auto">
                              {JSON.stringify(l.payload, null, 2)}
                            </pre>
                          )}
                        </div>
                      ))
                    )}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          )}
        </div>
      </motion.div>
    </div>
  );
}
