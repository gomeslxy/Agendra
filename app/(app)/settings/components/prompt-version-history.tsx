"use client";

import { useState } from "react";
import { Loader2, RotateCcw } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { SafeClientOnly } from "@/components/ui/safe-client-only";
import { rollbackPromptVersion } from "../actions";
import type { PromptVersion } from "../types";

export function PromptVersionHistory({
  promptVersions = [],
  isReadOnly = false,
}: {
  promptVersions?: PromptVersion[];
  isReadOnly?: boolean;
}) {
  const [restoringId, setRestoringId] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  async function handleRollback(versionId: string, versionNum: number) {
    if (!confirm(`Deseja restaurar as orientações da Versão v${versionNum}? Uma nova versão com a restauração será criada.`)) {
      return;
    }
    setRestoringId(versionId);
    try {
      const res = await rollbackPromptVersion(versionId);
      if (res.success) {
        toast.success(`Versão v${versionNum} restaurada com sucesso! (Criada a versão v${res.restoredVersion})`);
      }
    } catch (err) {
      toast.error("Erro ao restaurar versão: " + (err instanceof Error ? err.message : "Falha inesperada"));
    } finally {
      setRestoringId(null);
    }
  }

  if (!promptVersions.length) return null;

  return (
    <Card className="mt-6 border border-[#E4E4E7] bg-white shadow-sm rounded-2xl">
      <CardHeader className="pb-3 border-b border-[#F4F4F5]">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2.5">
            <div className="h-9 w-9 rounded-xl bg-[#2563EB]/10 flex items-center justify-center text-[#2563EB] shrink-0">
              <RotateCcw size={18} />
            </div>
            <div>
              <CardTitle className="text-sm font-bold text-[#09090B]">
                Histórico de Versões do Prompt (Cognitive Control)
              </CardTitle>
              <CardDescription className="text-xs text-[#71717A]">
                Acompanhe evoluções e restaure comportamentos anteriores da IA com 1 clique.
              </CardDescription>
            </div>
          </div>
          <Badge variant="cold" className="text-[10px] px-2.5 py-1 shrink-0">
            {promptVersions.length} {promptVersions.length === 1 ? "versão" : "versões"}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="flex flex-col gap-3 pt-4">
        {promptVersions.map((v) => {
          const isExpanded = expandedId === v.id;
          const isRestoring = restoringId === v.id;

          return (
            <div
              key={v.id}
              className="flex flex-col rounded-xl border border-[#E4E4E7] bg-[#FAFAFA] p-3.5 transition-all duration-200 hover:border-[#D4D4D8]"
            >
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2.5 min-w-0">
                  <span className="flex h-7 px-2.5 items-center justify-center rounded-lg bg-[#2563EB] text-white font-mono text-xs font-bold shrink-0">
                    v{v.version}
                  </span>
                  <div className="min-w-0">
                    <p className="text-xs font-semibold text-[#09090B] truncate">
                      {v.ai_name} • <span className="font-normal text-[#71717A]">{v.ai_tone}</span>
                    </p>
                    <p className="text-[10px] text-[#A1A1AA]">
                      <SafeClientOnly fallback="—">
                        {new Date(v.created_at).toLocaleString("pt-BR", {
                          day: "2-digit",
                          month: "2-digit",
                          year: "numeric",
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </SafeClientOnly>
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-8 text-xs font-medium text-[#3F3F46]"
                    onClick={() => setExpandedId(isExpanded ? null : v.id)}
                  >
                    {isExpanded ? "Ocultar" : "Ver Detalhes"}
                  </Button>

                  {!isReadOnly && (
                    <Button
                      type="button"
                      variant="secondary"
                      size="sm"
                      className="h-8 text-xs gap-1 font-bold text-[#2563EB] hover:bg-[#2563EB]/10"
                      disabled={isRestoring}
                      onClick={() => handleRollback(v.id, v.version)}
                    >
                      {isRestoring ? <Loader2 size={12} className="animate-spin" /> : <RotateCcw size={12} />}
                      Restaurar
                    </Button>
                  )}
                </div>
              </div>

              {isExpanded && (
                <div className="mt-3 pt-3 border-t border-[#E4E4E7] flex flex-col gap-2.5 text-xs text-[#3F3F46]">
                  {v.system_instructions ? (
                    <div>
                      <p className="text-[10px] font-bold uppercase tracking-wider text-[#71717A] mb-1">
                        Instruções Adicionais
                      </p>
                      <div className="p-2.5 rounded-lg bg-white border border-[#E4E4E7] font-mono text-[11px] whitespace-pre-wrap text-[#09090B]">
                        {v.system_instructions}
                      </div>
                    </div>
                  ) : (
                    <p className="text-[11px] italic text-[#A1A1AA]">Sem instruções adicionais nesta versão.</p>
                  )}

                  {v.ai_forbidden && (
                    <div>
                      <p className="text-[10px] font-bold uppercase tracking-wider text-red-600 mb-1">
                        Expressões Proibidas
                      </p>
                      <p className="p-2 rounded-lg bg-red-50 border border-red-200 text-red-700 text-[11px]">
                        {v.ai_forbidden}
                      </p>
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}
