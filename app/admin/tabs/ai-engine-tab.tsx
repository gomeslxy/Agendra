// app/admin/tabs/ai-engine-tab.tsx
"use client";

import { useState } from "react";
import { Brain, Database, Zap, Send, ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { useRouter } from "next/navigation";
import { toggleTenantRAG, forceCompanyModel, injectTestMessage } from "../actions";
import type { Company, IntentItem } from "../types";

const MODELS = [
  { value: null,                        label: "Padrão do Plano" },
  { value: "gemini-2.5-flash",          label: "Gemini 2.5 Flash" },
  { value: "gemini-2.0-flash-lite",     label: "Gemini 2.0 Flash Lite" },
  { value: "gemini-1.5-flash",          label: "Gemini 1.5 Flash" },
  { value: "llama-3.3-70b-versatile",   label: "LLaMA 3.3 70B (Groq)" },
  { value: "llama-3.1-8b-instant",      label: "LLaMA 3.1 8B (Cerebras)" },
];

interface Props {
  companies: Company[];
  intentDistribution: IntentItem[];
}

export function AiEngineTab({ companies, intentDistribution }: Props) {
  const router = useRouter();
  const [selectedCompany, setSelectedCompany] = useState<Company | null>(null);
  const [testPhone, setTestPhone]   = useState("");
  const [testMsg, setTestMsg]       = useState("");
  const [sending, setSending]       = useState(false);

  async function handleToggleRAG(company: Company, enabled: boolean) {
    const res = await toggleTenantRAG(company.id, enabled);
    if (res.success) { toast.success(`RAG ${enabled ? "ativado" : "desativado"} para ${company.name}`); router.refresh(); }
    else toast.error(res.error || "Erro ao alterar RAG");
  }

  async function handleForceModel(company: Company, model: string | null) {
    const res = await forceCompanyModel(company.id, model);
    if (res.success) { toast.success(model ? `Modelo forçado: ${model}` : "Override de modelo removido"); router.refresh(); }
    else toast.error(res.error || "Erro ao forçar modelo");
  }

  async function handleInjectMessage() {
    if (!selectedCompany || !testPhone.trim() || !testMsg.trim()) return;
    setSending(true);
    const res = await injectTestMessage(selectedCompany.id, testMsg, testPhone);
    setSending(false);
    if (res.success) { toast.success("Mensagem injetada (sem envio WhatsApp)"); setTestMsg(""); }
    else toast.error(res.error || "Erro ao injetar mensagem");
  }

  const totalIntents = intentDistribution.reduce((s, i) => s + i.count, 0);

  return (
    <div className="flex flex-col gap-6">
      {/* Per-company AI engine controls */}
      <div className="border border-[#E4E4E7] bg-white rounded-2xl shadow-sm overflow-hidden">
        <div className="px-5 py-4 border-b border-[#E4E4E7] bg-[#F4F4F5] flex items-center gap-2">
          <Brain size={15} className="text-[#2563EB]" />
          <h2 className="text-sm font-semibold text-[#09090B]">Controles de Motor IA por Empresa</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-[#F0F0F1] border-b border-[#E4E4E7] text-[10px] font-mono uppercase text-[#71717A]">
                <th className="px-5 py-3 font-semibold">Empresa</th>
                <th className="px-5 py-3 font-semibold">Plano</th>
                <th className="px-5 py-3 font-semibold text-center">RAG</th>
                <th className="px-5 py-3 font-semibold">Modelo Override</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#E4E4E7] text-xs text-[#3F3F46]">
              {companies.map((c) => {
                const ragEnabled = c.rag_override ?? (c.plan_type === "pro" || c.plan_type === "business");
                return (
                  <tr key={c.id} className="hover:bg-[#F4F4F5]">
                    <td className="px-5 py-3 font-semibold text-[#09090B]">{c.name}</td>
                    <td className="px-5 py-3 font-mono text-[10px] uppercase font-bold text-[#71717A]">{c.plan_type}</td>
                    <td className="px-5 py-3 text-center">
                      <button
                        onClick={() => handleToggleRAG(c, !ragEnabled)}
                        className={`relative inline-flex h-5 w-9 rounded-full transition-colors ${ragEnabled ? "bg-[#2563EB]" : "bg-[#E4E4E7]"}`}
                      >
                        <span className={`inline-block h-4 w-4 m-0.5 rounded-full bg-white shadow transition-transform ${ragEnabled ? "translate-x-4" : "translate-x-0"}`} />
                      </button>
                    </td>
                    <td className="px-5 py-3">
                      <div className="relative inline-block">
                        <select
                          value={c.model_override ?? ""}
                          onChange={(e) => handleForceModel(c, e.target.value || null)}
                          className="appearance-none bg-[#F4F4F5] border border-[#E4E4E7] rounded-lg pl-2 pr-7 py-1.5 text-xs font-mono focus:outline-none focus:border-[#2563EB] cursor-pointer"
                        >
                          {MODELS.map((m) => (
                            <option key={m.value ?? "default"} value={m.value ?? ""}>
                              {m.label}
                            </option>
                          ))}
                        </select>
                        <ChevronDown size={10} className="absolute right-2 top-1/2 -translate-y-1/2 text-[#71717A] pointer-events-none" />
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Test message injector */}
      <div className="border border-[#E4E4E7] bg-white rounded-2xl p-6 shadow-sm">
        <div className="flex items-center gap-2 mb-4">
          <Send size={15} className="text-[#2563EB]" />
          <h2 className="text-sm font-semibold text-[#09090B]">Injetar Mensagem de Teste</h2>
          <span className="text-[10px] text-[#71717A] bg-[#F4F4F5] px-2 py-0.5 rounded-full border border-[#E4E4E7]">
            Sem envio WhatsApp
          </span>
        </div>
        <div className="flex flex-col gap-3">
          <div>
            <label className="block text-xs font-semibold text-[#3F3F46] mb-1">Empresa</label>
            <select
              value={selectedCompany?.id ?? ""}
              onChange={(e) => setSelectedCompany(companies.find((c) => c.id === e.target.value) ?? null)}
              className="w-full bg-[#F4F4F5] border border-[#E4E4E7] rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-[#2563EB]"
            >
              <option value="">Selecionar empresa...</option>
              {companies.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-semibold text-[#3F3F46] mb-1">Telefone do Lead</label>
            <input
              type="text"
              placeholder="+5511999999999"
              value={testPhone}
              onChange={(e) => setTestPhone(e.target.value)}
              className="w-full border border-[#E4E4E7] rounded-xl px-3 py-2 text-sm font-mono focus:outline-none focus:border-[#2563EB] bg-[#FAFAFA]"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-[#3F3F46] mb-1">Mensagem</label>
            <textarea
              placeholder="Olá, quero saber mais sobre..."
              value={testMsg}
              onChange={(e) => setTestMsg(e.target.value)}
              rows={3}
              className="w-full border border-[#E4E4E7] rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-[#2563EB] bg-[#FAFAFA] resize-none"
            />
          </div>
          <Button
            variant="primary"
            size="sm"
            className="self-start"
            disabled={!selectedCompany || !testPhone.trim() || !testMsg.trim() || sending}
            onClick={handleInjectMessage}
          >
            <Send size={13} className="mr-1.5" />
            {sending ? "Injetando..." : "Injetar Mensagem"}
          </Button>
        </div>
      </div>

      {/* Intent distribution */}
      <div className="border border-[#E4E4E7] bg-white rounded-2xl p-6 shadow-sm">
        <div className="flex items-center gap-2 mb-4">
          <Database size={15} className="text-[#2563EB]" />
          <h2 className="text-sm font-semibold text-[#09090B]">Distribuição de Intenções (7d)</h2>
          <span className="ml-auto text-[10px] font-mono text-[#71717A]">{totalIntents} registros</span>
        </div>
        {intentDistribution.length === 0 ? (
          <p className="text-xs text-[#71717A]">Sem dados de intenção para o período.</p>
        ) : (
          <div className="flex flex-col gap-2">
            {intentDistribution.map(({ intent, count }) => {
              const pct = totalIntents > 0 ? Math.round((count / totalIntents) * 100) : 0;
              return (
                <div key={intent} className="flex items-center gap-3 text-xs">
                  <span className="w-40 font-mono text-[#3F3F46] truncate">{intent}</span>
                  <div className="flex-1 h-2 bg-[#F4F4F5] rounded-full overflow-hidden">
                    <div className="h-full bg-[#2563EB] rounded-full" style={{ width: `${pct}%` }} />
                  </div>
                  <span className="w-20 text-right font-mono text-[#71717A]">
                    {count.toLocaleString("pt-BR")} ({pct}%)
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
