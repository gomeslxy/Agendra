// app/admin/tabs/security-logs-tab.tsx
"use client";

import { useState, useMemo } from "react";
import { FileText, Eye, Search } from "lucide-react";
import { JsonModal } from "../components/json-modal";
import type { AuditLog } from "../types";

interface Props {
  auditLogs: AuditLog[];
}

const PAGE_SIZE = 25;

export function SecurityLogsTab({ auditLogs }: Props) {
  const [modalPayload, setModalPayload] = useState<{ data: unknown; title: string } | null>(null);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<"all" | "admin" | "failure">("all");
  const [page, setPage] = useState(0);

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return auditLogs.filter((log) => {
      const isFailure = log.action.includes("failed") || log.action.includes("error");
      if (filter === "admin" && !log.action.startsWith("admin_")) return false;
      if (filter === "failure" && !isFailure) return false;
      if (!q) return true;
      return (
        log.actor_email.toLowerCase().includes(q) ||
        log.action.toLowerCase().includes(q) ||
        log.ip_address.toLowerCase().includes(q)
      );
    });
  }, [auditLogs, search, filter]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, pageCount - 1);
  const pageRows = filtered.slice(safePage * PAGE_SIZE, safePage * PAGE_SIZE + PAGE_SIZE);

  return (
    <div className="flex flex-col gap-6">
      {/* Filters */}
      <div className="flex flex-wrap gap-3">
        <div className="flex items-center gap-2 bg-white border border-[#E4E4E7] rounded-xl px-3.5 py-2 shadow-sm flex-1 min-w-[200px]">
          <Search size={14} className="text-[#71717A] shrink-0" />
          <input
            type="text"
            placeholder="Buscar por agente, ação ou IP..."
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(0); }}
            className="w-full text-sm bg-transparent focus:outline-none text-[#09090B] placeholder:text-[#A1A1AA]"
          />
        </div>
        <select
          value={filter}
          onChange={(e) => { setFilter(e.target.value as typeof filter); setPage(0); }}
          className="bg-white border border-[#E4E4E7] rounded-xl px-3 py-2 text-sm focus:outline-none text-[#3F3F46]"
        >
          <option value="all">Todas ações</option>
          <option value="admin">Ações admin</option>
          <option value="failure">Falhas</option>
        </select>
        <span className="text-xs text-[#71717A] self-center font-mono">
          {filtered.length} de {auditLogs.length}
        </span>
      </div>

      <div className="border border-[#E4E4E7] bg-white rounded-2xl shadow-sm overflow-hidden">
        <div className="px-5 py-4 border-b border-[#E4E4E7] bg-[#F4F4F5] flex items-center gap-2 text-[#2563EB]">
          <FileText size={15} />
          <h2 className="text-sm font-semibold text-[#09090B]">
            Logs de Auditoria Administrativa
          </h2>
          <span className="ml-auto text-[10px] font-mono text-[#71717A]">página {safePage + 1}/{pageCount}</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-[#F0F0F1] border-b border-[#E4E4E7] text-[10px] font-mono uppercase text-[#71717A]">
                <th className="px-5 py-3 font-semibold">Data / Hora</th>
                <th className="px-5 py-3 font-semibold">Agente</th>
                <th className="px-5 py-3 font-semibold">Ação</th>
                <th className="px-5 py-3 font-semibold">IP / UA</th>
                <th className="px-5 py-3 font-semibold text-right">Payload</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#E4E4E7] text-xs text-[#3F3F46] font-mono">
              {pageRows.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-5 py-8 text-center text-[#A1A1AA]">
                    Nenhum log de auditoria encontrado.
                  </td>
                </tr>
              ) : (
                pageRows.map((log) => {
                  const isFailure = log.action.includes("failed") || log.action.includes("error");
                  const isAdmin   = log.action.startsWith("admin_");
                  return (
                    <tr key={log.id} className="hover:bg-[#F4F4F5]">
                      <td className="px-5 py-3 text-[10px] text-[#71717A] whitespace-nowrap">
                        {new Date(log.created_at).toLocaleString("pt-BR")}
                      </td>
                      <td className="px-5 py-3 font-sans font-semibold text-[#09090B] max-w-[160px] truncate">
                        {log.actor_email}
                      </td>
                      <td className="px-5 py-3">
                        <span
                          className={`inline-flex px-2 py-0.5 rounded-full text-[9px] font-bold border ${
                            isFailure
                              ? "bg-[#FFF1F2] text-[#DC2626] border-[#FECACA]"
                              : isAdmin
                              ? "bg-[#EFF6FF] text-[#1D4ED8] border-[#BFDBFE]"
                              : "bg-[#F0FDF4] text-[#166534] border-[#BBF7D0]"
                          }`}
                        >
                          {log.action}
                        </span>
                      </td>
                      <td className="px-5 py-3 max-w-[140px]">
                        <div className="text-[10px] text-[#71717A]">{log.ip_address}</div>
                        <div className="truncate text-[9px] text-[#A1A1AA] mt-0.5">{log.user_agent}</div>
                      </td>
                      <td className="px-5 py-3 text-right">
                        <button
                          className="inline-flex items-center gap-1 text-[10px] text-[#2563EB] hover:underline transition-colors"
                          onClick={() => setModalPayload({ data: log.payload, title: `${log.action} — ${log.actor_email}` })}
                        >
                          <Eye size={11} /> Ver
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
        {pageCount > 1 && (
          <div className="px-5 py-3 border-t border-[#E4E4E7] bg-[#F9F9F9] flex items-center justify-between text-xs">
            <button
              onClick={() => setPage((p) => Math.max(0, p - 1))}
              disabled={safePage === 0}
              className="font-mono text-[#2563EB] disabled:text-[#D4D4D8] disabled:cursor-not-allowed hover:underline"
            >
              ← Anterior
            </button>
            <span className="font-mono text-[#71717A]">{safePage + 1} / {pageCount}</span>
            <button
              onClick={() => setPage((p) => Math.min(pageCount - 1, p + 1))}
              disabled={safePage >= pageCount - 1}
              className="font-mono text-[#2563EB] disabled:text-[#D4D4D8] disabled:cursor-not-allowed hover:underline"
            >
              Próxima →
            </button>
          </div>
        )}
      </div>

      <JsonModal
        open={!!modalPayload}
        title={modalPayload?.title}
        data={modalPayload?.data}
        onClose={() => setModalPayload(null)}
      />
    </div>
  );
}
