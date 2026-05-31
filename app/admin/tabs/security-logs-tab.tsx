// app/admin/tabs/security-logs-tab.tsx
"use client";

import { useState } from "react";
import { FileText, Eye } from "lucide-react";
import { JsonModal } from "../components/json-modal";
import type { AuditLog } from "../types";

interface Props {
  auditLogs: AuditLog[];
}

export function SecurityLogsTab({ auditLogs }: Props) {
  const [modalPayload, setModalPayload] = useState<{ data: unknown; title: string } | null>(null);

  return (
    <div className="flex flex-col gap-6">
      <div className="border border-[#E4E4E7] bg-white rounded-2xl shadow-sm overflow-hidden">
        <div className="px-5 py-4 border-b border-[#E4E4E7] bg-[#F4F4F5] flex items-center gap-2 text-[#2563EB]">
          <FileText size={15} />
          <h2 className="text-sm font-semibold text-[#09090B]">
            Logs de Auditoria Administrativa
          </h2>
          <span className="ml-auto text-[10px] font-mono text-[#71717A]">{auditLogs.length} entradas</span>
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
              {auditLogs.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-5 py-8 text-center text-[#A1A1AA]">
                    Nenhum log de auditoria encontrado.
                  </td>
                </tr>
              ) : (
                auditLogs.map((log) => {
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
