"use client";

import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { ChevronDown, FileText } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import type { AuditLogRow } from "../types";

const ACTION_LABELS: Record<string, { label: string; color: string }> = {
  "persona.update": { label: "Instruções de IA Atualizadas", color: "bg-purple-50 text-purple-700 border-purple-200" },
  "channel.connect": { label: "Canal Conectado", color: "bg-teal-50 text-teal-700 border-teal-200" },
  "channel.disconnect": { label: "Canal Desconectado", color: "bg-red-50 text-red-700 border-red-200" },
  "company.update": { label: "Dados da Empresa Alterados", color: "bg-blue-50 text-blue-700 border-blue-200" },
  "automation.update": { label: "Regras de Automação Salvas", color: "bg-indigo-50 text-indigo-700 border-indigo-200" },
  "member.invite": { label: "Convite Enviado", color: "bg-amber-50 text-amber-700 border-amber-200" },
  "member.accept_invite": { label: "Convite Aceito", color: "bg-emerald-50 text-emerald-700 border-emerald-200" },
  "member.decline_invite": { label: "Convite Recusado", color: "bg-orange-50 text-orange-700 border-orange-200" },
  "member.cancel_invite": { label: "Convite Cancelado", color: "bg-zinc-50 text-zinc-700 border-zinc-200" },
  "member.resend_invite": { label: "Convite Reenviado", color: "bg-pink-50 text-pink-700 border-pink-200" },
  "webhook.save": { label: "Webhook Configurado", color: "bg-cyan-50 text-cyan-700 border-cyan-200" },
  "webhook.delete": { label: "Webhook Excluído", color: "bg-red-50 text-red-700 border-red-200" },
  "reactivation.update": { label: "Reativação de Leads Salva", color: "bg-violet-50 text-violet-700 border-violet-200" },
  "service.create": { label: "Serviço Criado", color: "bg-emerald-50 text-emerald-700 border-emerald-200" },
  "service.update": { label: "Serviço Editado", color: "bg-blue-50 text-blue-700 border-blue-200" },
  "service.delete": { label: "Serviço Removido", color: "bg-red-50 text-red-700 border-red-200" },
  "service.toggle": { label: "Pausa de Serviço Alterada", color: "bg-amber-50 text-amber-700 border-amber-200" },
};

const ITEMS_PER_PAGE = 10;

export function AuditLogsSection({ auditLogs = [] }: { auditLogs: AuditLogRow[] }) {
  const [search, setSearch] = useState("");
  const [filterAction, setFilterAction] = useState("all");
  const [currentPage, setCurrentPage] = useState(1);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const filtered = auditLogs.filter((log) => {
    const matchesSearch =
      (log.actor_email?.toLowerCase().includes(search.toLowerCase()) ?? false) ||
      log.action.toLowerCase().includes(search.toLowerCase());
    const matchesAction =
      filterAction === "all" ||
      (filterAction === "channels" && log.action.startsWith("channel.")) ||
      (filterAction === "members" && log.action.startsWith("member.")) ||
      (filterAction === "services" && log.action.startsWith("service.")) ||
      (filterAction === "ia" &&
        (log.action === "persona.update" ||
          log.action === "automation.update" ||
          log.action === "reactivation.update")) ||
      (filterAction === "webhooks" && log.action.startsWith("webhook."));

    return matchesSearch && matchesAction;
  });

  const totalPages = Math.ceil(filtered.length / ITEMS_PER_PAGE);
  const paginated = filtered.slice((currentPage - 1) * ITEMS_PER_PAGE, currentPage * ITEMS_PER_PAGE);

  useEffect(() => {
    setCurrentPage(1);
  }, [search, filterAction]);

  return (
    <Card className="border border-[#E4E4E7] bg-white rounded-xl mt-2">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <FileText size={18} className="text-[#2563EB]" />
          Auditoria Administrativa (SOC2)
        </CardTitle>
        <CardDescription>
          Registro imutável de todas as ações administrativas realizadas nesta empresa.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div className="flex flex-col sm:flex-row gap-2.5">
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar por e-mail ou ação..."
            className="flex-1 text-xs"
          />
          <select
            value={filterAction}
            onChange={(e) => setFilterAction(e.target.value)}
            className="rounded-xl border border-[#E4E4E7] bg-white px-3.5 py-2 text-xs text-[#09090B] outline-none focus:border-[#2563EB] sm:w-48"
          >
            <option value="all">Todas as ações</option>
            <option value="channels">Canais</option>
            <option value="members">Membros & Convites</option>
            <option value="services">Serviços</option>
            <option value="ia">IA & Regras</option>
            <option value="webhooks">Webhooks</option>
          </select>
        </div>

        {paginated.length > 0 ? (
          <div className="flex flex-col gap-2">
            {paginated.map((log) => {
              const meta = ACTION_LABELS[log.action] ?? {
                label: log.action,
                color: "bg-[#FAFAFA] text-[#3F3F46] border-[#E4E4E7]",
              };
              const isExpanded = expandedId === log.id;
              return (
                <div key={log.id} className="rounded-xl border border-[#E4E4E7] bg-white overflow-hidden">
                  <button
                    type="button"
                    onClick={() => setExpandedId(isExpanded ? null : log.id)}
                    className="w-full text-left flex items-center justify-between p-3.5 hover:bg-[#FAFAFA] transition-colors gap-3 flex-wrap sm:flex-nowrap"
                  >
                    <div className="flex flex-col sm:flex-row sm:items-center gap-2 min-w-0 flex-1">
                      <Badge
                        variant="neutral"
                        className={cn("text-[9px] uppercase tracking-wider px-2 py-0.5 border font-semibold", meta.color)}
                      >
                        {meta.label}
                      </Badge>
                      <span className="text-[12px] font-medium text-[#09090B] truncate">
                        {log.actor_email ?? "Integração"}
                      </span>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="text-[10px] text-[#71717A] whitespace-nowrap">
                        {new Date(log.created_at).toLocaleString("pt-BR", {
                          day: "2-digit",
                          month: "short",
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </span>
                      <ChevronDown
                        size={14}
                        className={cn("text-[#71717A] transition-transform duration-200", isExpanded && "rotate-180")}
                      />
                    </div>
                  </button>

                  <AnimatePresence initial={false}>
                    {isExpanded && (
                      <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: "auto", opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.2 }}
                        className="border-t border-[#E4E4E7] bg-white p-3.5 flex flex-col gap-3.5"
                      >
                        <div className="grid grid-cols-2 gap-4 text-[10px]">
                          <div>
                            <span className="block text-[#A1A1AA] uppercase tracking-widest font-mono">Endereço IP</span>
                            <span className="block mt-0.5 text-[#3F3F46] font-mono">
                              {log.ip_address ?? "Não disponível"}
                            </span>
                          </div>
                          <div>
                            <span className="block text-[#A1A1AA] uppercase tracking-widest font-mono">ID do Registro</span>
                            <span className="block mt-0.5 text-[#71717A] font-mono truncate">{log.id}</span>
                          </div>
                          <div className="col-span-2">
                            <span className="block text-[#A1A1AA] uppercase tracking-widest font-mono">
                              Dispositivo (User Agent)
                            </span>
                            <span className="block mt-0.5 text-[#3F3F46] font-mono truncate sm:max-w-xl" title={log.user_agent ?? undefined}>
                              {log.user_agent ?? "Não disponível"}
                            </span>
                          </div>
                        </div>

                        <div>
                          <span className="block text-[10px] text-[#A1A1AA] uppercase tracking-widest font-mono mb-1.5">
                            Metadados da Ação (Payload)
                          </span>
                          <pre className="text-[10px] font-mono p-3 rounded-lg border border-[#E4E4E7] bg-[#09090B] text-[#14B8A6] overflow-x-auto max-h-48 leading-relaxed">
                            {JSON.stringify(log.payload, null, 2)}
                          </pre>
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              );
            })}

            {totalPages > 1 && (
              <div className="flex items-center justify-between mt-3 px-1 text-xs text-[#71717A]">
                <span>
                  Página {currentPage} de {totalPages} ({filtered.length} logs)
                </span>
                <div className="flex gap-2">
                  <Button
                    variant="secondary"
                    size="sm"
                    className="h-8 px-3 font-semibold text-[#3F3F46]"
                    disabled={currentPage === 1}
                    onClick={() => setCurrentPage((prev) => prev - 1)}
                  >
                    Anterior
                  </Button>
                  <Button
                    variant="secondary"
                    size="sm"
                    className="h-8 px-3 font-semibold text-[#3F3F46]"
                    disabled={currentPage === totalPages}
                    onClick={() => setCurrentPage((prev) => prev + 1)}
                  >
                    Próximo
                  </Button>
                </div>
              </div>
            )}
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center py-10 gap-2 text-center border border-dashed border-[#E4E4E7] rounded-xl bg-white">
            <p className="text-[12px] text-[#71717A] font-semibold">Nenhuma ação administrativa encontrada</p>
            <p className="text-[11px] text-[#A1A1AA] leading-relaxed max-w-xs px-4">
              Tente redefinir os filtros ou buscar por outro termo.
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
