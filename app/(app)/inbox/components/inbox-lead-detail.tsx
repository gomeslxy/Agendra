"use client";

import { motion } from "framer-motion";
import { CalendarCheck } from "lucide-react";
import { SafeClientOnly } from "@/components/ui/safe-client-only";
import { HEAT_LABEL } from "@/lib/constants";
import { cn } from "@/lib/utils";
import type { LeadWithInboxMessages } from "../reconcile";
import { ControlModeDropdown, ToneDropdown } from "./inbox-chat-header";
import { initials } from "./inbox-utils";

function KV({ k, v, color = "text-[#3F3F46]" }: { k: string; v: string; color?: string }) {
  return (
    <div className="flex items-center justify-between gap-2 text-[12px]">
      <span className="font-bold text-[#A1A1AA] uppercase tracking-widest text-[10px]">{k}</span>
      <span className={cn("font-semibold truncate max-w-[140px]", color)}>{v}</span>
    </div>
  );
}

function BookingStatusCard({ lead }: { lead: LeadWithInboxMessages }) {
  const next = lead.next_event;

  if (next) {
    return (
      <div className="rounded-xl border border-[#E4E4E7] bg-[#FAFAFA] p-4">
        <div className="flex flex-col gap-2">
          <div className="h-7 w-7 rounded-lg bg-[#F0FDFA] flex items-center justify-center text-[#14B8A6]">
            <CalendarCheck size={14} />
          </div>
          <div>
            <div className="text-[11px] font-bold text-[#71717A]">Agendamento Confirmado</div>
            <div className="text-[12px] font-semibold text-[#09090B] mt-0.5">{next.title}</div>
            <div className="text-[10px] text-[#A1A1AA] mt-0.5 capitalize">
              <SafeClientOnly fallback="—">
                {new Date(next.start_time).toLocaleString("pt-BR", {
                  weekday: "short",
                  day: "2-digit",
                  month: "short",
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </SafeClientOnly>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (lead.status === "success") {
    return (
      <div className="rounded-xl border border-[#E4E4E7] bg-[#FAFAFA] p-4">
        <div className="flex flex-col gap-2">
          <div className="h-7 w-7 rounded-lg bg-[#F0FDFA] flex items-center justify-center text-[#14B8A6]">
            <CalendarCheck size={14} />
          </div>
          <div>
            <div className="text-[11px] font-bold text-[#71717A]">Convertido</div>
            <div className="text-[10px] text-[#A1A1AA] mt-0.5">Agendamento concluído</div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-[#E4E4E7] bg-[#FAFAFA] p-4">
      <div className="flex flex-col gap-2">
        <div className="h-7 w-7 rounded-lg bg-[#F4F4F5] flex items-center justify-center text-[#A1A1AA]">
          <CalendarCheck size={14} />
        </div>
        <div>
          <div className="text-[11px] font-bold text-[#71717A]">Sem agendamento ativo</div>
          <div className="text-[10px] text-[#A1A1AA] mt-0.5">
            {lead.status === "hot" ? "Lead quente — IA conduzindo para agendamento" : "IA qualificando lead"}
          </div>
        </div>
      </div>
    </div>
  );
}

interface InboxLeadDetailProps {
  selected: LeadWithInboxMessages | null;
  tonePending: boolean;
  controlPending: boolean;
  onToneChange: (tone: "cold" | "warm" | "hot") => void;
  onControlModeChange: (mode: "autonomous" | "shadow" | "manual") => void;
}

export function InboxLeadDetail({
  selected,
  tonePending,
  controlPending,
  onToneChange,
  onControlModeChange,
}: InboxLeadDetailProps) {
  return (
    <aside className="hidden flex-col gap-5 overflow-y-auto border-l border-[#E4E4E7] bg-white p-5 w-[280px] shrink-0 custom-scrollbar xl:flex z-10 select-none">
      {selected && (
        <motion.div initial={{ opacity: 0, x: 12 }} animate={{ opacity: 1, x: 0 }} className="flex flex-col gap-6">
          <div className="flex flex-col items-center text-center gap-3.5 pb-4 border-b border-[#F4F4F5]">
            <div className="grid h-16 w-16 place-items-center rounded-2xl bg-[#F4F4F5] border border-[#E4E4E7] text-base font-bold text-[#3F3F46]">
              {initials(selected.name)}
            </div>
            <div>
              <h2 className="text-base font-bold text-[#09090B] leading-tight">{selected.name}</h2>
              <p className="text-[11px] font-medium text-[#A1A1AA] mt-0.5">{selected.phone}</p>
            </div>
          </div>

          <div className="space-y-6">
            <section>
              <h4 className="text-[10px] font-bold uppercase tracking-[0.2em] text-[#A1A1AA] mb-3">
                Inteligência Artificial
              </h4>
              <div className="space-y-4">
                <div>
                  <span className="text-[11px] font-bold text-[#A1A1AA] uppercase tracking-wider block mb-2">
                    Tom da Conversa
                  </span>
                  <ToneDropdown selected={selected} tonePending={tonePending} onToneChange={onToneChange} />
                </div>
                <div>
                  <span className="text-[11px] font-bold text-[#A1A1AA] uppercase tracking-wider block mb-2">
                    Modo de Operação
                  </span>
                  <ControlModeDropdown
                    selected={selected}
                    controlPending={controlPending}
                    onControlModeChange={onControlModeChange}
                  />
                </div>
                {selected.summary && (
                  <div className="rounded-xl bg-[#F0FDFA] border border-[#CCFBF1] p-3">
                    <span className="text-[10px] font-bold uppercase tracking-[0.1em] text-[#14B8A6] block mb-1.5">
                      ✦ Resumo IA
                    </span>
                    <p className="text-[12px] leading-relaxed text-[#166534] italic">&quot;{selected.summary}&quot;</p>
                  </div>
                )}
              </div>
            </section>

            <section>
              <h4 className="text-[10px] font-bold uppercase tracking-[0.2em] text-[#A1A1AA] mb-3">Dados do Lead</h4>
              <div className="space-y-3">
                <KV
                  k="Status"
                  v={HEAT_LABEL[selected.status]}
                  color={selected.status === "hot" ? "text-[#EA580C]" : "text-[#1D4ED8]"}
                />
                <KV k="Canal" v={selected.channel} />
                <KV k="Origem" v={selected.source ?? "Direto"} />
                {selected.city && <KV k="Cidade" v={selected.city} />}
              </div>
            </section>

            <section className="pt-4">
              <BookingStatusCard lead={selected} />
            </section>
          </div>
        </motion.div>
      )}
    </aside>
  );
}
