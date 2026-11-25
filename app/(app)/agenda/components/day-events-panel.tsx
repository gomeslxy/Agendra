"use client";

import { motion } from "framer-motion";
import { CalendarDays, Cloud, Pencil, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { cn } from "@/lib/utils";
import { HEAT_LABEL, MONTHS, formatTime, type AgendaEvent } from "./agenda-types";

interface DayEventsPanelProps {
  selectedDay: number;
  viewMonth: number;
  dayEvents: AgendaEvent[];
  deleteConfirm: string | null;
  onNewEvent: () => void;
  onEditEvent: (ev: AgendaEvent) => void;
  onDeleteEvent: (id: string) => void;
  onCancelDelete: () => void;
}

export function DayEventsPanel({
  selectedDay,
  viewMonth,
  dayEvents,
  deleteConfirm,
  onNewEvent,
  onEditEvent,
  onDeleteEvent,
  onCancelDelete,
}: DayEventsPanelProps) {
  return (
    <div className="border border-[#E4E4E7] bg-white rounded-xl p-4 sm:p-5 shadow-sm">
      <div className="font-mono text-[10px] font-semibold uppercase tracking-[0.14em] text-[#71717A] mb-3">
        Dia {selectedDay} · {MONTHS[viewMonth]}
      </div>
      <div className="flex flex-col gap-2.5 sm:max-h-[calc(100vh-260px)] sm:overflow-y-auto">
        {dayEvents.length === 0 ? (
          <EmptyState
            icon={CalendarDays}
            title="Sem Compromissos"
            description={`Não há nenhum agendamento para o dia ${selectedDay} de ${MONTHS[viewMonth]}.`}
            action={
              <Button onClick={onNewEvent} variant="ghost" className="text-xs text-[#2563EB] hover:text-[#1D4ED8]">
                Novo agendamento
              </Button>
            }
          />
        ) : (
          dayEvents.map((e, i) => {
            const status = e.leads?.status ?? "cold";
            const isGcal = e.source === "gcal";
            return (
              <motion.div
                key={e.id}
                initial={{ opacity: 0, x: -8 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.2, delay: i * 0.04 }}
                className="flex items-start gap-3 rounded-xl border border-[#E4E4E7] bg-white p-3 hover:bg-[#F4F4F5] hover:border-[#D4D4D8] transition-all duration-200"
              >
                <span className="min-w-[44px] font-mono text-xs font-semibold text-[#0D9488] shrink-0">
                  {formatTime(e.start_time)}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="text-[13px] font-semibold text-[#09090B]">{e.title}</span>
                    {isGcal && (
                      <span className="inline-flex items-center gap-1 rounded-full border border-[#C7D2FE] bg-[#EEF2FF] px-1.5 py-0.5 text-[9px] font-bold text-[#6366F1]">
                        <Cloud size={8} />
                        Google
                      </span>
                    )}
                    {e.gcal_sync_status === "error" && (
                      <span className="rounded-full border border-[#FDE68A] bg-[#FFFBEB] px-1.5 py-0.5 text-[9px] font-bold text-[#92400E]">
                        Sync pendente
                      </span>
                    )}
                  </div>
                  {e.leads?.name && (
                    <div className="mt-0.5 truncate text-[11px] text-[#71717A]">
                      {e.leads.name} · {e.leads.phone}
                    </div>
                  )}
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  {!isGcal && e.leads && (
                    <div className="flex items-center gap-1 text-[10px] font-semibold text-[#71717A] select-none">
                      <span
                        className={cn(
                          "h-1.5 w-1.5 rounded-full shrink-0",
                          status === "hot"
                            ? "bg-[#F97316]"
                            : status === "warm"
                              ? "bg-[#EAB308]"
                              : status === "success"
                                ? "bg-[#14B8A6]"
                                : "bg-[#3B82F6]",
                        )}
                      />
                      <span>{HEAT_LABEL[status]}</span>
                    </div>
                  )}
                  {e.status === "pending" && (
                    <span className="rounded-full border border-[#FDE68A] bg-[#FFFBEB] px-1.5 py-0.5 text-[9px] font-bold text-[#92400E]">
                      Pendente
                    </span>
                  )}
                  {e.status === "rescheduled" && (
                    <span className="rounded-full border border-[#BFDBFE] bg-[#EFF6FF] px-1.5 py-0.5 text-[9px] font-bold text-[#1D4ED8]">
                      Remarcado
                    </span>
                  )}
                  {!isGcal && (
                    <div className="flex items-center gap-1">
                      {deleteConfirm !== e.id && (
                        <button
                          type="button"
                          onClick={() => onEditEvent(e)}
                          className="grid h-6 w-6 place-items-center rounded-lg text-[#A1A1AA] transition hover:bg-[#F4F4F5] hover:text-[#09090B] cursor-pointer shrink-0"
                          aria-label="Editar"
                        >
                          <Pencil size={12} />
                        </button>
                      )}
                      {deleteConfirm === e.id ? (
                        <div className="flex items-center gap-1">
                          <span className="text-[10px] text-[#DC2626] font-bold">Excluir?</span>
                          <button
                            type="button"
                            onClick={() => onDeleteEvent(e.id)}
                            className="rounded px-1.5 py-0.5 text-[10px] font-black text-[#DC2626] hover:bg-[#FFF1F2] cursor-pointer"
                          >
                            Sim
                          </button>
                          <button
                            type="button"
                            onClick={onCancelDelete}
                            className="rounded px-1.5 py-0.5 text-[10px] text-[#71717A] hover:bg-[#F4F4F5] cursor-pointer"
                          >
                            Não
                          </button>
                        </div>
                      ) : (
                        <button
                          type="button"
                          onClick={() => onDeleteEvent(e.id)}
                          className="grid h-6 w-6 place-items-center rounded-lg text-[#A1A1AA] transition hover:bg-[#FFF1F2] hover:text-[#DC2626] cursor-pointer shrink-0"
                          aria-label="Excluir"
                        >
                          <Trash2 size={12} />
                        </button>
                      )}
                    </div>
                  )}
                </div>
              </motion.div>
            );
          })
        )}
      </div>
    </div>
  );
}
