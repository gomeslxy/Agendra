"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import { Download, UserPlus, X, Plus, Loader2, Phone, Mail, MapPin, MessageSquare, MessageCircle, Instagram } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { HEAT_GRADIENT, HEAT_LABEL } from "@/lib/constants";
import { cn } from "@/lib/utils";
import type { LeadWithLastMessage } from "@/lib/types/database";
import { createLead, exportLeads } from "./actions";
import { EmptyState } from "@/components/ui/empty-state";
import { ShinyButton } from "@/components/ui/shiny-button";

type Filter = "all" | "hot" | "warm" | "cold" | "success";

const FILTERS: { id: Filter; label: string }[] = [
  { id: "all",     label: "Todos" },
  { id: "hot",     label: "Quente" },
  { id: "warm",    label: "Morno" },
  { id: "cold",    label: "Frio" },
  { id: "success", label: "Convertidos" },
];

function initials(name: string) {
  return name
    .split(" ")
    .slice(0, 2)
    .map((w) => w[0])
    .join("")
    .toUpperCase();
}

function relativeTime(dateStr: string) {
  const diff = Date.now() - new Date(dateStr).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return "agora";
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  const d = Math.floor(h / 24);
  if (d === 1) return "ontem";
  return `${d} dias`;
}

function formatDate(dateStr: string) {
  return new Date(dateStr).toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function LeadsClient({ leads }: { leads: LeadWithLastMessage[] }) {
  const [filter, setFilter] = useState<Filter>("all");
  const [showNewModal, setShowNewModal] = useState(false);
  const [selectedLead, setSelectedLead] = useState<LeadWithLastMessage | null>(null);
  const [isPending, startTransition] = useTransition();
  const [formError, setFormError] = useState<string | null>(null);
  const [exportPending, startExport] = useTransition();

  function handleExport() {
    startExport(async () => {
      try {
        const csv = await exportLeads();
        const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `leads_${new Date().toISOString().slice(0, 10)}.csv`;
        a.click();
        URL.revokeObjectURL(url);
      } catch (e) {
        alert((e as Error).message);
      }
    });
  }

  const statusCounts = useMemo(() => {
    const c: Record<string, number> = { hot: 0, warm: 0, cold: 0, success: 0 };
    for (const l of leads) c[l.status] = (c[l.status] ?? 0) + 1;
    return c;
  }, [leads]);

  const visible = useMemo(
    () => (filter === "all" ? leads : leads.filter((l) => l.status === filter)),
    [leads, filter],
  );

  const handleCreate = (formData: FormData) => {
    setFormError(null);
    startTransition(async () => {
      try {
        await createLead(formData);
        setShowNewModal(false);
      } catch (e) {
        setFormError(e instanceof Error ? e.message : "Erro ao criar lead");
      }
    });
  };

  return (
    <div className="mobile-scroll-area h-full overflow-y-auto px-4 pt-7 pb-[calc(72px+env(safe-area-inset-bottom,12px))] lg:px-8 lg:py-7">
      <header className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-[28px] font-bold tracking-[-0.02em]">Leads</h1>
          <p className="mt-1 text-sm" style={{ color: "var(--color-fg-2)" }}>
            {visible.length} leads {filter === "all" ? "no total" : `· filtro: ${HEAT_LABEL[filter] || filter}`}
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="secondary" size="sm" disabled={exportPending} onClick={handleExport}>
            <Download size={14} />
            {exportPending ? "…" : "Exportar"}
          </Button>
          <ShinyButton onClick={() => setShowNewModal(true)} className="shiny-cta pulse-cta bg-[#F97316] hover:bg-[#EA580C] !px-4 !py-2 shrink-0">
            <span className="flex items-center gap-1.5 font-bold">
              <UserPlus size={14} />
              Novo lead
            </span>
          </ShinyButton>
        </div>
      </header>

      <div className="mb-6 flex gap-4 border-b border-white/[0.04] pb-1 select-none">
        {FILTERS.map((f) => {
          const count = f.id === "all" ? leads.length : (statusCounts[f.id] ?? 0);
          const active = f.id === filter;
          return (
            <button
              key={f.id}
              onClick={() => setFilter(f.id)}
              className={cn(
                "relative pb-2 text-xs font-bold uppercase tracking-wider transition-colors duration-150 flex items-center gap-1.5 cursor-pointer",
                active
                  ? "text-brand-blue-400"
                  : "text-white/30 hover:text-white/60"
              )}
            >
              <span>{f.label}</span>
              <span className={cn(
                "font-mono text-[9px] px-1 py-0.5 rounded bg-white/[0.04] text-white/40",
                active && "text-brand-blue-400 bg-[#2563EB]/10 border border-[#2563EB]/25"
              )}>{count}</span>
              {active && (
                <motion.div
                  layoutId="active-leads-filter"
                  className="absolute bottom-0 inset-x-0 h-[1.5px] bg-brand-blue-400"
                  transition={{ type: "spring", stiffness: 400, damping: 30 }}
                />
              )}
            </button>
          );
        })}
      </div>

      <div className="overflow-x-auto rounded-2xl border border-white/[0.04] bg-white/[0.005] shadow-xl relative">
        
        {visible.length === 0 ? (
          <div className="p-12 text-center">
            <EmptyState
              icon={UserPlus}
              title="Sem Leads Encontrados"
              description={
                filter === "all"
                  ? "Nenhum lead foi cadastrado ainda. Conecte o WhatsApp ou adicione manualmente."
                  : `Não encontramos leads com a qualificação ${HEAT_LABEL[filter] || filter} no momento.`
              }
              action={
                filter === "all" ? (
                  <Button
                    onClick={() => setShowNewModal(true)}
                    variant="ghost"
                    className="text-xs text-[#2563EB] hover:text-blue-400 hover:bg-white/5 underline underline-offset-4"
                  >
                    Adicionar lead manualmente
                  </Button>
                ) : undefined
              }
            />
          </div>
        ) : (
          <table className="w-full border-collapse">
            <thead>
              <tr>
                {["Lead", "Heat · Score", "Canal", "Origem", "Status", "Última msg"].map((h) => (
                  <th
                    key={h}
                    className="border-b border-white/[0.08] px-4 py-3.5 text-left font-mono text-[11px] font-semibold uppercase tracking-[0.12em]"
                    style={{ color: "var(--color-fg-3)" }}
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {visible.map((l, idx) => {
                const rowContent = (
                  <>
                    <td className="px-4 py-3.5 text-[13px]">
                      <div className="flex items-center gap-2.5">
                        <div
                          className="grid h-8 w-8 shrink-0 place-items-center rounded-full text-[11px] font-bold text-white"
                          style={{ background: HEAT_GRADIENT[l.status] ?? HEAT_GRADIENT.cold }}
                        >
                          {initials(l.name)}
                        </div>
                        <div>
                          <div className="text-[13px] font-semibold">{l.name}</div>
                          {l.city && (
                            <div className="text-[11px]" style={{ color: "var(--color-fg-3)" }}>{l.city}</div>
                          )}
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3.5">
                      <div className="flex items-center gap-1.5 text-xs font-semibold select-none">
                        <span className={cn(
                          "h-1.5 w-1.5 rounded-full shrink-0",
                          l.status === 'hot' ? 'bg-orange-500 shadow-[0_0_6px_rgba(249,115,22,0.4)]' :
                          l.status === 'warm' ? 'bg-yellow-500' :
                          l.status === 'success' ? 'bg-teal-500' : 'bg-blue-400'
                        )} />
                        <span>{HEAT_LABEL[l.status]}</span>
                        <span className="font-mono text-[10px] text-white/30">({l.heat_score})</span>
                      </div>
                    </td>
                    <td className="px-4 py-3.5">
                      <div className="flex items-center gap-1.5 font-mono text-xs">
                        {l.channel === "whatsapp" && (
                          <MessageCircle size={14} className="text-teal-400 shrink-0" />
                        )}
                        {l.channel === "instagram" && (
                          <Instagram size={14} className="text-pink-400 shrink-0" />
                        )}
                        <span className="capitalize">{l.channel}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3.5 text-sm" style={{ color: "var(--color-fg-2)" }}>
                      {l.source ?? "—"}
                    </td>
                    <td className="px-4 py-3.5 text-sm capitalize">{l.status}</td>
                    <td className="px-4 py-3.5 font-mono text-xs" style={{ color: "var(--color-fg-3)" }}>
                      {l.last_message ? relativeTime(l.last_message.created_at) : relativeTime(l.created_at)}
                    </td>
                  </>
                );

                return idx < 8 ? (
                  <motion.tr
                    key={l.id}
                    initial={{ opacity: 0, y: 4 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.2, delay: idx * 0.02 }}
                    whileHover={{ backgroundColor: "rgba(255,255,255,0.03)" }}
                    onClick={() => setSelectedLead(l)}
                    className="cursor-pointer border-b border-white/[0.08] last:border-b-0"
                  >
                    {rowContent}
                  </motion.tr>
                ) : (
                  <tr
                    key={l.id}
                    onClick={() => setSelectedLead(l)}
                    className="cursor-pointer border-b border-white/[0.08] last:border-b-0 hover:bg-white/[0.03]"
                  >
                    {rowContent}
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* Modal — Novo Lead */}
      <AnimatePresence>
        {showNewModal && (
          <>
            <motion.div
              key="backdrop"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowNewModal(false)}
              className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm"
            />
            <motion.div
              key="modal"
              initial={{ opacity: 0, scale: 0.96, y: 16 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.96, y: 16 }}
              transition={{ duration: 0.18 }}
              className="fixed inset-0 z-50 flex items-center justify-center p-4"
            >
              <div className="w-full max-w-md max-h-[85vh] flex flex-col rounded-2xl border border-white/[0.1] bg-[rgba(11,18,34,0.95)] p-6 shadow-2xl backdrop-blur-xl">
                <div className="mb-5 flex shrink-0 items-center justify-between">
                  <h2 className="text-lg font-semibold">Novo lead</h2>
                  <button
                    onClick={() => setShowNewModal(false)}
                    className="grid h-8 w-8 place-items-center rounded-lg text-fg-3 transition hover:bg-white/[0.08] hover:text-white"
                  >
                    <X size={16} />
                  </button>
                </div>

                <div className="overflow-y-auto px-1 -mx-1 flex-1">
                  <form action={handleCreate} className="flex flex-col gap-4 pb-2">
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                      <div className="col-span-1 sm:col-span-2 flex flex-col gap-1.5">
                        <label className="font-mono text-[11px] uppercase tracking-wider" style={{ color: "var(--color-fg-3)" }}>
                          Nome completo *
                        </label>
                        <input
                          name="name"
                          required
                          placeholder="João da Silva"
                          className="rounded-xl border border-white/[0.08] bg-white/[0.04] px-3.5 py-2.5 text-sm outline-none transition placeholder:text-fg-3 focus:border-[#2563EB]/50 focus:bg-white/[0.06]"
                        />
                      </div>

                      <div className="col-span-1 sm:col-span-2 flex flex-col gap-1.5">
                        <label className="font-mono text-[11px] uppercase tracking-wider" style={{ color: "var(--color-fg-3)" }}>
                          Telefone * (com DDI)
                        </label>
                        <input
                          name="phone"
                          required
                          placeholder="+5511999999999"
                          className="rounded-xl border border-white/[0.08] bg-white/[0.04] px-3.5 py-2.5 text-sm outline-none transition placeholder:text-fg-3 focus:border-[#2563EB]/50 focus:bg-white/[0.06]"
                        />
                      </div>

                      <div className="col-span-1 sm:col-span-2 flex flex-col gap-1.5">
                        <label className="font-mono text-[11px] uppercase tracking-wider" style={{ color: "var(--color-fg-3)" }}>
                          Canal *
                        </label>
                        <select
                          name="channel"
                          required
                          defaultValue="whatsapp"
                          className="rounded-xl border border-white/[0.08] bg-[rgba(11,18,34,0.9)] px-3.5 py-2.5 text-sm outline-none transition focus:border-[#2563EB]/50"
                        >
                          <option value="whatsapp">WhatsApp</option>
                          <option value="instagram">Instagram</option>
                          <option value="form">Formulário</option>
                        </select>
                      </div>

                      <div className="flex flex-col gap-1.5">
                        <label className="font-mono text-[11px] uppercase tracking-wider" style={{ color: "var(--color-fg-3)" }}>
                          Origem
                        </label>
                        <input
                          name="source"
                          placeholder="Ex: Google Ads"
                          className="rounded-xl border border-white/[0.08] bg-white/[0.04] px-3.5 py-2.5 text-sm outline-none transition placeholder:text-fg-3 focus:border-[#2563EB]/50 focus:bg-white/[0.06]"
                        />
                      </div>

                      <div className="flex flex-col gap-1.5">
                        <label className="font-mono text-[11px] uppercase tracking-wider" style={{ color: "var(--color-fg-3)" }}>
                          Cidade
                        </label>
                        <input
                          name="city"
                          placeholder="São Paulo"
                          className="rounded-xl border border-white/[0.08] bg-white/[0.04] px-3.5 py-2.5 text-sm outline-none transition placeholder:text-fg-3 focus:border-[#2563EB]/50 focus:bg-white/[0.06]"
                        />
                      </div>

                      <div className="col-span-1 sm:col-span-2 flex flex-col gap-1.5">
                        <label className="font-mono text-[11px] uppercase tracking-wider" style={{ color: "var(--color-fg-3)" }}>
                          E-mail
                        </label>
                        <input
                          name="email"
                          type="email"
                          placeholder="joao@exemplo.com"
                          className="rounded-xl border border-white/[0.08] bg-white/[0.04] px-3.5 py-2.5 text-sm outline-none transition placeholder:text-fg-3 focus:border-[#2563EB]/50 focus:bg-white/[0.06]"
                        />
                      </div>
                    </div>

                    {formError && (
                      <p className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-400">
                        {formError}
                      </p>
                    )}

                    <div className="mt-2 flex gap-2 shrink-0">
                      <Button
                        type="button"
                        variant="secondary"
                        size="sm"
                        className="flex-1 justify-center"
                        onClick={() => setShowNewModal(false)}
                      >
                        Cancelar
                      </Button>
                      <ShinyButton
                        type="submit"
                        disabled={isPending}
                        className="shiny-cta flex-1 justify-center bg-[#F97316] hover:bg-[#EA580C] !py-2 shadow-glow-orange/30 shrink-0"
                      >
                        <span className="flex items-center justify-center gap-1.5 font-bold">
                          {isPending ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
                          {isPending ? "Salvando..." : "Criar lead"}
                        </span>
                      </ShinyButton>
                    </div>
                  </form>
                </div>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* Drawer — Detalhe do Lead */}
      <AnimatePresence>
        {selectedLead && (
          <>
            <motion.div
              key="drawer-backdrop"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setSelectedLead(null)}
              className="fixed inset-0 z-40 bg-black/40 backdrop-blur-sm"
            />
            <motion.aside
              key="drawer"
              initial={{ x: "100%" }}
              animate={{ x: 0 }}
              exit={{ x: "100%" }}
              transition={{ type: "spring", stiffness: 380, damping: 38 }}
              className="glass glass-strong fixed inset-y-0 right-0 z-50 flex w-full max-w-sm flex-col !rounded-none !border-y-0 !border-r-0 border-l border-white/[0.08] bg-[rgba(11,18,34,0.65)] shadow-2xl"
            >
              <div className="flex items-center gap-3 border-b border-white/[0.08] p-5">
                <div
                  className="grid h-11 w-11 shrink-0 place-items-center rounded-full text-sm font-bold text-white"
                  style={{ background: HEAT_GRADIENT[selectedLead.status] ?? HEAT_GRADIENT.cold }}
                >
                  {initials(selectedLead.name)}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="truncate text-[15px] font-semibold">{selectedLead.name}</div>
                  <div className="font-mono text-[11px]" style={{ color: "var(--color-fg-3)" }}>
                    criado {formatDate(selectedLead.created_at)}
                  </div>
                </div>
                <button
                  onClick={() => setSelectedLead(null)}
                  className="grid h-8 w-8 place-items-center rounded-lg text-fg-3 transition hover:bg-white/[0.08] hover:text-white"
                >
                  <X size={16} />
                </button>
              </div>

              <div className="flex-1 overflow-y-auto p-5 flex flex-col gap-4">
                {/* Heat */}
                <div className="glass rounded-xl border border-white/[0.08] bg-white/[0.02] p-4 shadow-lg relative overflow-hidden">
                  <div className="absolute top-0 inset-x-4 h-[1px] bg-gradient-to-r from-transparent via-[#14B8A6]/20 to-transparent" />
                  <div className="eyebrow mb-3" style={{ color: "var(--color-brand-teal-300)" }}>
                    QUALIFICAÇÃO · IA
                  </div>
                  <div className="flex items-center gap-2 mb-2">
                    <Badge variant={selectedLead.status as "hot" | "warm" | "cold" | "success"}>
                      {HEAT_LABEL[selectedLead.status]}
                    </Badge>
                    <span className="font-mono text-sm font-semibold">{selectedLead.heat_score}/100</span>
                  </div>
                  {selectedLead.summary && (
                    <p className="mt-2 text-[13px] leading-relaxed" style={{ color: "var(--color-fg-2)" }}>
                      {selectedLead.summary}
                    </p>
                  )}
                </div>

                {/* Contato */}
                <div className="glass rounded-xl border border-white/[0.08] bg-white/[0.02] p-4 shadow-lg">
                  <div className="eyebrow mb-3">CONTATO</div>
                  <div className="flex flex-col gap-2.5">
                    <div className="flex items-center gap-2.5 text-[13px]">
                      <Phone size={13} style={{ color: "var(--color-fg-3)" }} />
                      <span>{selectedLead.phone}</span>
                    </div>
                    {selectedLead.email && (
                      <div className="flex items-center gap-2.5 text-[13px]">
                        <Mail size={13} style={{ color: "var(--color-fg-3)" }} />
                        <span>{selectedLead.email}</span>
                      </div>
                    )}
                    {selectedLead.city && (
                      <div className="flex items-center gap-2.5 text-[13px]">
                        <MapPin size={13} style={{ color: "var(--color-fg-3)" }} />
                        <span>{selectedLead.city}</span>
                      </div>
                    )}
                    <div className="flex items-center gap-2.5 text-[13px]">
                      <MessageSquare size={13} style={{ color: "var(--color-fg-3)" }} />
                      <span className="capitalize">{selectedLead.channel}</span>
                      {selectedLead.source && (
                        <span style={{ color: "var(--color-fg-3)" }}>· {selectedLead.source}</span>
                      )}
                    </div>
                  </div>
                </div>

                {/* Última mensagem */}
                {selectedLead.last_message && (
                  <div className="glass rounded-xl border border-white/[0.08] bg-white/[0.02] p-4 shadow-lg">
                    <div className="eyebrow mb-3">ÚLTIMA MENSAGEM</div>
                    <p className="text-[13px] leading-relaxed" style={{ color: "var(--color-fg-2)" }}>
                      "{selectedLead.last_message.content}"
                    </p>
                    <p className="mt-2 font-mono text-[11px]" style={{ color: "var(--color-fg-3)" }}>
                      {formatDate(selectedLead.last_message.created_at)} · {selectedLead.last_message.role}
                    </p>
                  </div>
                )}

                {/* Ações */}
                <div className="flex gap-2 mt-auto">
                  <Link
                    href="/inbox"
                    onClick={() => setSelectedLead(null)}
                    className="flex flex-1 items-center justify-center gap-1.5 rounded-xl border border-white/[0.08] bg-white/[0.04] px-3 py-2 text-xs font-medium transition hover:bg-white/[0.08] hover:text-white"
                    style={{ color: "var(--color-fg-2)" }}
                  >
                    Ver conversa no inbox
                  </Link>
                </div>
              </div>
            </motion.aside>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}
