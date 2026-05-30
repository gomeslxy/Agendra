"use client";

import { useEffect, useState } from "react";
import { Zap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { createBrowserClient } from "@supabase/ssr";
import type { PlanType } from "@/lib/billing/plans";

interface AiDecisionLog {
  id: string;
  lead_id: string;
  intent_detected: string | null;
  sentiment_score: number | null;
  urgency_detected: boolean | null;
  objection_handled: string | null;
  rationale: string | null;
  created_at: string;
  leads: { name: string }[] | null;
}

function formatTimeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const min = Math.floor(diff / 60000);
  if (min < 1) return 'Agora';
  if (min < 60) return `Há ${min} min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `Há ${h}h`;
  return `Há ${Math.floor(h / 24)} dias`;
}

export function LogsView({ logs, companyId, planType }: { logs: AiDecisionLog[]; companyId: string | null; planType?: PlanType | null }) {
  const isBusiness = planType === "business";
  const initialLimit = isBusiness ? 15 : 10;
  const [visibleCount, setVisibleCount] = useState(initialLimit);
  const [liveLogs, setLiveLogs] = useState<AiDecisionLog[]>(logs);
  const [pulseId, setPulseId] = useState<string | null>(null);

  // Realtime subscription — enabled for both Pro and Business tiers!
  // (Starter/Trial are already blocked by the outer FeatureGate wrapper).
  useEffect(() => {
    if (!companyId) return;

    const supabase = createBrowserClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    );

    const channel = supabase
      .channel(`mente-da-ia-${companyId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "ai_decision_logs", filter: `company_id=eq.${companyId}` },
        (payload) => {
          const row = payload.new as AiDecisionLog & { company_id?: string };
          // Defensive: drop anything that slipped past the RLS/filter
          if ((row as any).company_id && (row as any).company_id !== companyId) return;

          setLiveLogs((prev) => {
            if (prev.some((l) => l.id === row.id)) return prev;

            // Resolve name from existing state if available
            const existingLeadName = prev.find((l) => l.lead_id === row.lead_id)?.leads?.[0]?.name;
            const leadsObj = existingLeadName ? [{ name: existingLeadName }] : null;

            const newLog: AiDecisionLog = {
              ...row,
              leads: leadsObj
            };

            // If name is not cached, fetch asynchronously from Supabase
            if (!leadsObj) {
              supabase
                .from('leads')
                .select('name')
                .eq('id', row.lead_id)
                .single()
                .then(({ data, error }) => {
                  if (error) {
                    console.error("[LogsView] Failed to resolve lead name:", error);
                    return;
                  }
                  if (data?.name) {
                    setLiveLogs((current) =>
                      current.map((l) =>
                        l.id === row.id ? { ...l, leads: [{ name: data.name }] } : l
                      )
                    );
                  }
                });
            }

            return [newLog, ...prev].slice(0, 100);
          });

          setPulseId(row.id);
          setTimeout(() => setPulseId(null), 1500);
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [companyId]);

  const visibleLogs = liveLogs.slice(0, visibleCount);
  const triggerHint = isBusiness
    ? "Logs gerados a cada 5 respostas da IA + sempre em agendamentos, cancelamentos, mudanças de status e primeira interação."
    : "Logs gerados a cada 10 respostas da IA + sempre em agendamentos, cancelamentos, mudanças de status e primeira interação. Upgrade para Business desbloqueia atualização em tempo real e logs a cada 5 respostas.";

  return (
    <div className="flex flex-col gap-5">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Mente da IA (Explainability)</CardTitle>
              <CardDescription>Audite as decisões da IA{isBusiness ? " em tempo real" : ""}.</CardDescription>
            </div>
            <Badge variant="hot" className="text-[10px]">BETA</Badge>
          </div>
          <p className="text-[11px] text-[#71717A] mt-2 leading-relaxed">{triggerHint}</p>
        </CardHeader>
        <CardContent>
          {liveLogs.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 gap-3 text-center">
              <div className="h-12 w-12 rounded-full bg-[#F4F4F5] flex items-center justify-center">
                <Zap size={22} className="text-[#D4D4D8]" />
              </div>
              <p className="text-sm font-medium text-[#71717A]">Nenhuma decisão registrada ainda</p>
              <p className="text-[12px] text-[#D4D4D8] max-w-xs leading-relaxed">
                Os logs aparecem em interações relevantes: primeira mensagem, agendamento, cancelamento, mudança de status e a cada {isBusiness ? "5" : "10"} respostas da IA.
              </p>
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              {visibleLogs.map(log => {
                const isPositive = (log.sentiment_score ?? 0) >= 0;
                const leadName = log.leads?.[0]?.name ?? 'Lead';
                const timeAgo = formatTimeAgo(log.created_at);
                const isPulsing = pulseId === log.id;
                return (
                  <div
                    key={log.id}
                    className={cn(
                      "p-4 rounded-xl border border-[#E4E4E7] bg-white transition-all relative overflow-hidden group/log shadow-md",
                      isPulsing
                        ? "border-brand-teal-400/40 bg-brand-teal-500/[0.02]"
                        : "hover:border-[#E4E4E7] hover:bg-white"
                    )}
                  >
                    <div className="flex justify-between items-start mb-2">
                      <div className="flex items-center gap-2">
                        <div className={cn(
                          "h-2 w-2 rounded-full",
                          log.urgency_detected ? "bg-brand-orange-400" : isPositive ? "bg-brand-teal-400" : "bg-white/20"
                        )} />
                        <span className="text-[13px] font-bold text-[#09090B]">{leadName}</span>
                        {log.intent_detected && (
                          <Badge variant="neutral" className="text-[9px] bg-[#FAFAFA] border-[#E4E4E7]">{log.intent_detected}</Badge>
                        )}
                      </div>
                      <span className="text-[11px] text-[#71717A]">{timeAgo}</span>
                    </div>
                    {log.rationale && (
                      <p className="text-[12px] text-[#3F3F46] leading-relaxed mb-3">{log.rationale}</p>
                    )}
                    <div className="flex items-center gap-4 border-t border-[#F4F4F5] pt-3 mt-1">
                      <div className="flex flex-col">
                        <span className="text-[9px] uppercase tracking-wider text-[#A1A1AA] font-bold mb-0.5">Sentimento</span>
                        <span className={cn("text-[12px] font-mono", isPositive ? "text-[#0D9488]" : "text-[#C2410C]")}>
                          {log.sentiment_score != null ? (log.sentiment_score >= 0 ? '+' : '') + log.sentiment_score.toFixed(2) : '—'}
                        </span>
                      </div>
                      {log.objection_handled && (
                        <div className="flex flex-col">
                          <span className="text-[9px] uppercase tracking-wider text-[#A1A1AA] font-bold mb-0.5">Objeção tratada</span>
                          <span className="text-[12px] font-mono text-[#09090B] truncate max-w-[180px]">{log.objection_handled}</span>
                        </div>
                      )}
                      {log.urgency_detected && (
                        <div className="flex flex-col">
                          <span className="text-[9px] uppercase tracking-wider text-[#A1A1AA] font-bold mb-0.5">Urgência</span>
                          <span className="text-[12px] font-mono text-[#C2410C]">Detectada</span>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}

              {liveLogs.length > visibleCount && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="w-full text-[#71717A] hover:text-[#3F3F46] mt-1"
                  onClick={() => setVisibleCount((v) => v + 10)}
                >
                  Ver mais ({liveLogs.length - visibleCount} restantes)
                </Button>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
