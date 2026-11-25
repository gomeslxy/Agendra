"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { AnimatePresence, motion } from "framer-motion";
import { Bell, Check, ChevronDown, Clock, MessageCircle, RefreshCw, Zap } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { saveAutomationConfig, saveReactivationConfig } from "../actions";
import { ReadOnlyBanner } from "../components/settings-shared";
import { WebhooksSection } from "../components/webhooks-section";
import type { AutomationEvent, AutomationStats, SettingsCompany, WebhookSubscription } from "../types";

function formatTimeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const min = Math.floor(diff / 60000);
  if (min < 1) return "Agora";
  if (min < 60) return `Há ${min} min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `Há ${h}h`;
  return `Há ${Math.floor(h / 24)} dias`;
}

function ActiveBadge() {
  return (
    <Badge variant="neutral" className="text-[10px] px-2 py-0.5 bg-brand-teal-500/10 text-[#0D9488] border-brand-teal-500/20 flex items-center gap-1 shrink-0">
      <span className="h-1.5 w-1.5 rounded-full bg-brand-teal-400 animate-pulse" />
      Ativo
    </Badge>
  );
}

export function AutomationTab({
  company,
  automationStats,
  automationEvents,
  webhooks,
  isReadOnly = false,
}: {
  company: SettingsCompany | null;
  automationStats: AutomationStats;
  automationEvents: AutomationEvent[];
  webhooks: WebhookSubscription[];
  isReadOnly?: boolean;
}) {
  const plan = company?.plan_type ?? "trial";
  const isBusiness = plan === "business";
  const isPro = plan === "pro" || plan === "business";
  const pc = company?.persona_config ?? {};

  const [reminderAdvance, setReminderAdvance] = useState<number>(pc.reminder_advance_hours ?? 2);
  const [reminderExpanded, setReminderExpanded] = useState(false);
  const [followupDelay, setFollowupDelay] = useState<number>(pc.followup_delay_hours ?? 24);
  const [followupRetries, setFollowupRetries] = useState<number>(pc.followup_max_retries ?? 2);
  const [followupExpanded, setFollowupExpanded] = useState(false);
  const [reactivationDays, setReactivationDays] = useState<number>(pc.reactivation_days ?? 30);
  const [reactivationHook, setReactivationHook] = useState<string>(pc.reactivation_hook ?? "");
  const [reactivationExpanded, setReactivationExpanded] = useState(false);

  const [pending, startTransition] = useTransition();
  const [savedField, setSavedField] = useState<string | null>(null);

  function saveConfig(field: string, data: Record<string, number>) {
    startTransition(async () => {
      try {
        await saveAutomationConfig(data);
        setSavedField(field);
        toast.success("Configuração salva!");
        setTimeout(() => setSavedField(null), 2000);
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Erro ao salvar configuração");
      }
    });
  }

  function handleSaveReactivation() {
    startTransition(async () => {
      try {
        await saveReactivationConfig({ reactivation_days: reactivationDays, reactivation_hook: reactivationHook });
        setSavedField("reactivation");
        setTimeout(() => setSavedField(null), 2000);
        toast.success("Configuração de reativação salva com sucesso! 🚀");
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Erro ao salvar reativação");
      }
    });
  }

  const wh = pc.working_hours;
  const activeDaysCount = wh ? Object.keys(wh).length : 5;
  const firstDay = wh ? Object.values(wh)[0] : (["09:00", "18:00"] as [string, string]);

  return (
    <div className="flex flex-col gap-5">
      {isReadOnly && <ReadOnlyBanner />}

      <div className="relative overflow-hidden rounded-2xl border border-brand-blue-500/20 bg-brand-blue-500/5 p-4">
        <div className="relative flex items-center gap-2 mb-4">
          <span className="flex h-2 w-2 rounded-full bg-brand-teal-400 shadow-[0_0_8px_#14B8A6] animate-pulse" />
          <span className="text-[11px] font-bold uppercase tracking-widest text-[#0D9488]">Motor em Ação</span>
        </div>
        <div className="relative grid grid-cols-2 gap-3">
          <div className="rounded-xl bg-[#F4F4F5] border border-[#E4E4E7] p-3 flex flex-col gap-0.5">
            <span className="text-3xl font-black text-[#09090B] tabular-nums">{automationStats.remindersToday}</span>
            <span className="text-[11px] text-[#71717A]">Lembretes hoje</span>
          </div>
          <div className="rounded-xl bg-[#F4F4F5] border border-[#E4E4E7] p-3 flex flex-col gap-0.5">
            <span className="text-3xl font-black text-[#09090B] tabular-nums">{automationStats.followupsWeek}</span>
            <span className="text-[11px] text-[#71717A]">Follow-ups esta semana</span>
          </div>
        </div>
      </div>

      <div className="flex flex-col gap-3">
        {/* Lembrete de Agendamento */}
        <motion.div layout className="rounded-xl border border-[#E4E4E7] bg-[#FAFAFA] overflow-hidden">
          <button type="button" className="w-full flex items-center gap-3 p-4 text-left" onClick={() => setReminderExpanded((v) => !v)}>
            <div className="h-9 w-9 shrink-0 rounded-lg bg-brand-teal-500/15 flex items-center justify-center">
              <Bell size={16} className="text-[#0D9488]" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-[13px] font-semibold text-[#09090B]">Lembrete de Agendamento</div>
              <div className="text-[11px] text-[#71717A] mt-0.5">Avisa leads automaticamente {reminderAdvance}h antes do horário</div>
            </div>
            <div className="flex items-center gap-2">
              <ActiveBadge />
              <ChevronDown size={14} className={cn("text-[#A1A1AA] transition-transform duration-200", reminderExpanded && "rotate-180")} />
            </div>
          </button>
          <AnimatePresence>
            {reminderExpanded && (
              <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="border-t border-[#E4E4E7]">
                <div className="p-4 flex flex-col gap-4">
                  <div className="grid grid-cols-4 gap-1.5">
                    {[1, 2, 4, 24].map((h) => (
                      <button
                        key={h}
                        type="button"
                        onClick={() => setReminderAdvance(h)}
                        className={cn(
                          "py-2 rounded-lg text-xs font-bold transition-all",
                          reminderAdvance === h ? "bg-brand-teal-500/20 border border-brand-teal-500/40 text-[#0D9488]" : "bg-[#F4F4F5] border border-[#E4E4E7] text-[#71717A]",
                        )}
                      >
                        {h}h
                      </button>
                    ))}
                  </div>
                  <Button variant="blue" size="sm" className="w-full font-bold" disabled={pending || isReadOnly} onClick={() => saveConfig("reminder", { reminder_advance_hours: reminderAdvance })}>
                    {savedField === "reminder" ? <><Check size={14} className="mr-1.5" />Salvo</> : pending ? "Salvando…" : "Salvar configuração"}
                  </Button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>

        {/* Follow-up Inteligente */}
        <div className={cn("rounded-xl border overflow-hidden relative", isBusiness ? "border-[#E4E4E7] bg-[#FAFAFA]" : "border-[#E4E4E7] bg-white")}>
          {!isBusiness && (
            <div className="absolute inset-0 z-10 flex items-center justify-center rounded-xl bg-white/60 backdrop-blur-[3px]">
              <div className="flex flex-col items-center gap-2 text-center px-6">
                <Zap size={15} className="text-[#2563EB]" />
                <p className="text-[12px] font-bold text-[#09090B]">Plano Business</p>
                <p className="text-[11px] text-[#71717A] max-w-[180px]">Follow-up com IA contextual exclusivo do Business</p>
                <Link href="/settings?tab=billing" className="mt-1 text-[11px] font-bold text-[#2563EB] hover:underline">
                  Fazer upgrade →
                </Link>
              </div>
            </div>
          )}
          <button type="button" className={cn("w-full flex items-center gap-3 p-4 text-left", !isBusiness && "pointer-events-none")} onClick={() => isBusiness && setFollowupExpanded((v) => !v)}>
            <div className={cn("h-9 w-9 shrink-0 rounded-lg flex items-center justify-center", isBusiness ? "bg-brand-blue-500/15" : "bg-[#F4F4F5]")}>
              <MessageCircle size={16} className={isBusiness ? "text-[#2563EB]" : "text-[#D4D4D8]"} />
            </div>
            <div className="flex-1 min-w-0">
              <div className={cn("text-[13px] font-semibold", isBusiness ? "text-[#09090B]" : "text-[#71717A]")}>Follow-up Inteligente</div>
              <div className="text-[11px] text-[#71717A] mt-0.5">IA reengaja leads silenciosos com mensagem contextual</div>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              {isBusiness ? (
                <>
                  <ActiveBadge />
                  <ChevronDown size={14} className={cn("text-[#A1A1AA] transition-transform duration-200", followupExpanded && "rotate-180")} />
                </>
              ) : (
                <Badge variant="neutral" className="text-[10px] px-2 py-0.5 bg-brand-blue-500/10 text-[#1D4ED8] border-brand-blue-500/20">Business</Badge>
              )}
            </div>
          </button>
          <AnimatePresence>
            {followupExpanded && isBusiness && (
              <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="border-t border-[#E4E4E7]">
                <div className="p-4 flex flex-col gap-4">
                  <div className="grid grid-cols-3 gap-1.5">
                    {[12, 24, 48].map((h) => (
                      <button
                        key={h}
                        type="button"
                        onClick={() => setFollowupDelay(h)}
                        className={cn(
                          "py-2 rounded-lg text-xs font-bold transition-all",
                          followupDelay === h ? "bg-brand-blue-500/20 border border-brand-blue-500/40 text-[#1D4ED8]" : "bg-[#F4F4F5] border border-[#E4E4E7] text-[#71717A]",
                        )}
                      >
                        {h}h
                      </button>
                    ))}
                  </div>
                  <div className="grid grid-cols-3 gap-1.5">
                    {[1, 2, 3].map((n) => (
                      <button
                        key={n}
                        type="button"
                        onClick={() => setFollowupRetries(n)}
                        className={cn(
                          "py-2 rounded-lg text-xs font-bold transition-all",
                          followupRetries === n ? "bg-brand-blue-500/20 border border-brand-blue-500/40 text-[#1D4ED8]" : "bg-[#F4F4F5] border border-[#E4E4E7] text-[#71717A]",
                        )}
                      >
                        {n}x
                      </button>
                    ))}
                  </div>
                  <Button variant="blue" size="sm" className="w-full font-bold" disabled={pending || isReadOnly} onClick={() => saveConfig("followup", { followup_delay_hours: followupDelay, followup_max_retries: followupRetries })}>
                    {savedField === "followup" ? <><Check size={14} className="mr-1.5" />Salvo</> : pending ? "Salvando…" : "Salvar configuração"}
                  </Button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Reativação de Leads Frios */}
        <div className={cn("rounded-xl border overflow-hidden relative", isBusiness ? "border-[#E4E4E7] bg-[#FAFAFA]" : "border-[#E4E4E7] bg-white")}>
          {!isBusiness && (
            <div className="absolute inset-0 z-10 flex items-center justify-center rounded-xl bg-white/60 backdrop-blur-[3px]">
              <div className="flex flex-col items-center gap-2 text-center px-6">
                <Zap size={15} className="text-[#2563EB]" />
                <p className="text-[12px] font-bold text-[#09090B]">Plano Business</p>
                <p className="text-[11px] text-[#71717A] max-w-[180px]">Reativação automática de leads frios exclusiva do Business</p>
                <Link href="/settings?tab=billing" className="mt-1 text-[11px] font-bold text-[#2563EB] hover:underline">
                  Fazer upgrade →
                </Link>
              </div>
            </div>
          )}
          <button type="button" className={cn("w-full flex items-center gap-3 p-4 text-left", !isBusiness && "pointer-events-none")} onClick={() => isBusiness && setReactivationExpanded((v) => !v)}>
            <div className={cn("h-9 w-9 shrink-0 rounded-lg flex items-center justify-center", isBusiness ? "bg-brand-orange-500/15" : "bg-[#F4F4F5]")}>
              <RefreshCw size={16} className={isBusiness ? "text-[#F97316]" : "text-[#D4D4D8]"} />
            </div>
            <div className="flex-1 min-w-0">
              <div className={cn("text-[13px] font-semibold", isBusiness ? "text-[#09090B]" : "text-[#71717A]")}>Reativação de Leads Frios</div>
              <div className="text-[11px] text-[#71717A] mt-0.5">Lead inativo por {reactivationDays} dias recebe mensagem com IA</div>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              {isBusiness ? (
                <>
                  {pc.reactivation_hook ? <ActiveBadge /> : <Badge variant="neutral" className="text-[10px] px-2 py-0.5 bg-brand-orange-500/10 text-[#C2410C] border-brand-orange-500/20">Configurar</Badge>}
                  <ChevronDown size={14} className={cn("text-[#A1A1AA] transition-transform duration-200", reactivationExpanded && "rotate-180")} />
                </>
              ) : (
                <Badge variant="neutral" className="text-[10px] px-2 py-0.5 bg-brand-blue-500/10 text-[#1D4ED8] border-brand-blue-500/20">Business</Badge>
              )}
            </div>
          </button>
          <AnimatePresence>
            {reactivationExpanded && isBusiness && (
              <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="border-t border-[#E4E4E7]">
                <div className="p-4 flex flex-col gap-4">
                  <div className="grid grid-cols-4 gap-1.5">
                    {[14, 30, 60, 90].map((d) => (
                      <button
                        key={d}
                        type="button"
                        onClick={() => setReactivationDays(d)}
                        className={cn(
                          "py-2 rounded-lg text-xs font-bold transition-all",
                          reactivationDays === d ? "bg-brand-orange-500/20 border border-brand-orange-500/40 text-[#C2410C]" : "bg-[#F4F4F5] border border-[#E4E4E7] text-[#71717A]",
                        )}
                      >
                        {d}d
                      </button>
                    ))}
                  </div>
                  <textarea
                    value={reactivationHook}
                    onChange={(e) => setReactivationHook(e.target.value)}
                    placeholder="Ex.: Estamos com 20% de desconto esta semana. Quer aproveitar e agendar?"
                    rows={3}
                    maxLength={500}
                    className="w-full rounded-xl border border-[#E4E4E7] bg-[#F4F4F5] px-3.5 py-2.5 text-sm text-[#09090B] outline-none resize-none"
                  />
                  <Button variant="orange" size="sm" className="w-full font-bold" disabled={pending || isReadOnly} onClick={handleSaveReactivation}>
                    {savedField === "reactivation" ? <><Check size={14} className="mr-1.5" />Salvo</> : pending ? "Salvando…" : "Salvar configuração"}
                  </Button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Janela de Silêncio */}
        <div className="rounded-xl border border-[#E4E4E7] bg-[#FAFAFA] p-4 flex items-center gap-3">
          <div className="h-9 w-9 shrink-0 rounded-lg bg-brand-orange-500/10 flex items-center justify-center">
            <Clock size={16} className="text-[#F97316]" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-[13px] font-semibold text-[#09090B]">Janela de Silêncio</div>
            <div className="text-[11px] text-[#71717A] mt-0.5">
              {activeDaysCount} dias · {firstDay[0]}–{firstDay[1]}
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <ActiveBadge />
            <Link href="/settings?tab=rules" className="text-[11px] font-bold text-[#2563EB] hover:underline">
              Configurar →
            </Link>
          </div>
        </div>

        <WebhooksSection webhooks={webhooks} isPro={isPro} isReadOnly={isReadOnly} />
      </div>

      {automationEvents.length > 0 ? (
        <div className="flex flex-col gap-2.5">
          <h4 className="text-[10px] font-bold uppercase tracking-widest text-[#A1A1AA] px-0.5">Atividade Recente</h4>
          <div className="rounded-xl border border-[#E4E4E7] bg-[#FAFAFA] divide-y divide-[#E4E4E7] overflow-hidden">
            {automationEvents.slice(0, 10).map((ev) => {
              const Icon = ev.type === "reminder_sent" ? Bell : ev.type === "followup_sent" ? MessageCircle : RefreshCw;
              const color = ev.type === "reminder_sent" ? "text-[#0D9488]" : ev.type === "followup_sent" ? "text-[#2563EB]" : "text-[#F97316]";
              return (
                <div key={ev.id} className="flex items-center gap-3 px-4 py-2.5">
                  <Icon size={13} className={cn("shrink-0", color)} />
                  <span className="flex-1 text-[12px] text-[#3F3F46] truncate">{ev.detail ?? ev.type}</span>
                  <span className="text-[10px] text-[#71717A] shrink-0 tabular-nums">{formatTimeAgo(ev.created_at)}</span>
                </div>
              );
            })}
          </div>
        </div>
      ) : (
        <div className="flex flex-col items-center justify-center py-8 gap-2 text-center rounded-xl border border-dashed border-[#E4E4E7]">
          <Zap size={20} className="text-[#D4D4D8]" />
          <p className="text-[12px] text-[#71717A] font-medium">Nenhuma automação executada ainda</p>
          <p className="text-[11px] text-[#A1A1AA] max-w-xs leading-relaxed">
            O feed de atividade aparece aqui após os primeiros agendamentos e follow-ups.
          </p>
        </div>
      )}
    </div>
  );
}
