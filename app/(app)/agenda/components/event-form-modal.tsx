"use client";

import { useEffect, useState } from "react";
import { Loader2, Pencil, Plus, Search, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { searchLeads } from "../actions";
import { toDatetimeLocal, type AgendaEvent, type LeadOption } from "./agenda-types";

interface EventFormModalProps {
  open: boolean;
  editingEvent: AgendaEvent | null;
  leads: LeadOption[];
  viewYear: number;
  viewMonth: number;
  selectedDay: number;
  isPending: boolean;
  error: string | null;
  onClose: () => void;
  onSubmit: (formData: FormData, selectedLead: LeadOption | null) => void;
}

export function EventFormModal({
  open,
  editingEvent,
  leads,
  viewYear,
  viewMonth,
  selectedDay,
  isPending,
  error,
  onClose,
  onSubmit,
}: EventFormModalProps) {
  const [startTime, setStartTime] = useState("");
  const [endTime, setEndTime] = useState("");
  const [leadQuery, setLeadQuery] = useState("");
  const [leadResults, setLeadResults] = useState<LeadOption[]>(leads.slice(0, 50));
  const [selectedLead, setSelectedLead] = useState<LeadOption | null>(null);
  const [isSearchingLeads, setIsSearchingLeads] = useState(false);

  useEffect(() => {
    if (!open) {
      setLeadQuery("");
      setSelectedLead(null);
      return;
    }
    if (editingEvent) {
      setStartTime(toDatetimeLocal(new Date(editingEvent.start_time)));
      setEndTime(toDatetimeLocal(new Date(editingEvent.end_time)));
      if (editingEvent.lead_id) {
        setSelectedLead({
          id: editingEvent.lead_id,
          name: editingEvent.leads?.name ?? "",
          status: editingEvent.leads?.status ?? "cold",
          phone: editingEvent.leads?.phone ?? "",
        });
      } else {
        setSelectedLead(null);
      }
    } else {
      const base = new Date(viewYear, viewMonth, selectedDay, 9, 0);
      setStartTime(toDatetimeLocal(base));
      setEndTime(toDatetimeLocal(new Date(base.getTime() + 60 * 60 * 1000)));
      setSelectedLead(null);
    }
  }, [open, editingEvent, viewYear, viewMonth, selectedDay]);

  useEffect(() => {
    if (!open) return;
    const timer = setTimeout(async () => {
      if (!leadQuery.trim()) {
        setLeadResults(leads.slice(0, 50));
        return;
      }
      setIsSearchingLeads(true);
      try {
        const results = await searchLeads(leadQuery);
        setLeadResults(results);
      } catch {
        setLeadResults([]);
      } finally {
        setIsSearchingLeads(false);
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [leadQuery, open, leads]);

  function handleStartChange(val: string) {
    setStartTime(val);
    if (!val) return;
    const start = new Date(val);
    if (isNaN(start.getTime())) return;
    const end = new Date(endTime);
    if (isNaN(end.getTime()) || end <= start) {
      setEndTime(toDatetimeLocal(new Date(start.getTime() + 60 * 60 * 1000)));
    }
  }

  return (
    <Dialog
      open={open}
      onClose={onClose}
      titleId="agenda-event-modal-title"
      className="p-6 flex flex-col max-h-[85vh]"
    >
      <div className="mb-5 flex shrink-0 items-center justify-between">
        <h2 id="agenda-event-modal-title" className="text-lg font-semibold text-[#09090B]">
          {editingEvent ? "Editar agendamento" : "Novo agendamento"}
        </h2>
        <button
          type="button"
          onClick={onClose}
          aria-label="Fechar"
          className="grid h-8 w-8 place-items-center rounded-lg text-[#71717A] transition hover:bg-[#F4F4F5] hover:text-[#09090B]"
        >
          <X size={16} />
        </button>
      </div>

      <div className="overflow-y-auto px-1 -mx-1 flex-1">
        <form
          action={(fd) => onSubmit(fd, selectedLead)}
          className="flex flex-col gap-4 pb-2"
          key={editingEvent?.id ?? "new"}
        >
          <div className="flex flex-col gap-1.5">
            <label className="font-mono text-[11px] uppercase tracking-wider text-[#71717A]">
              Título / motivo *
            </label>
            <input
              name="title"
              required
              defaultValue={editingEvent?.title ?? ""}
              placeholder="Ex: Consulta inicial, Retorno..."
              className="rounded-xl border border-[#E4E4E7] bg-[#F4F4F5] px-3.5 py-2.5 text-sm text-[#09090B] outline-none focus:border-[#2563EB] focus:bg-white focus:ring-2 focus:ring-[#2563EB]/10"
            />
          </div>

          <div className="flex flex-col gap-1.5 relative">
            <label className="font-mono text-[11px] uppercase tracking-wider text-[#71717A]">
              Lead (opcional)
            </label>
            {selectedLead ? (
              <div className="flex items-center justify-between rounded-xl border border-[#E4E4E7] bg-[#F4F4F5] p-3 text-sm text-[#09090B]">
                <div className="flex items-center gap-2">
                  <span
                    className={cn(
                      "h-2 w-2 rounded-full shrink-0",
                      selectedLead.status === "hot"
                        ? "bg-[#F97316]"
                        : selectedLead.status === "warm"
                          ? "bg-[#F59E0B]"
                          : selectedLead.status === "success"
                            ? "bg-[#14B8A6]"
                            : "bg-[#60A5FA]",
                    )}
                  />
                  <div>
                    <p className="font-semibold text-left">{selectedLead.name}</p>
                    <p className="text-[11px] text-[#71717A] text-left">{selectedLead.phone}</p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setSelectedLead(null)}
                  aria-label="Remover lead selecionado"
                  className="grid h-7 w-7 place-items-center rounded-lg text-[#71717A] hover:bg-[#E4E4E7] hover:text-[#09090B]"
                >
                  <X size={14} />
                </button>
                <input type="hidden" name="lead_id" value={selectedLead.id} />
              </div>
            ) : (
              <div className="relative">
                <div className="flex items-center relative">
                  <Search size={14} className="absolute left-3.5 text-[#A1A1AA]" />
                  <input
                    type="text"
                    placeholder="Buscar lead por nome ou telefone..."
                    value={leadQuery}
                    onChange={(e) => setLeadQuery(e.target.value)}
                    className="w-full rounded-xl border border-[#E4E4E7] bg-[#F4F4F5] pl-10 pr-3.5 py-2.5 text-sm text-[#09090B] outline-none focus:border-[#2563EB] focus:bg-white focus:ring-2 focus:ring-[#2563EB]/10"
                  />
                  {isSearchingLeads && (
                    <Loader2 size={14} className="animate-spin text-[#71717A] absolute right-3.5" />
                  )}
                </div>

                {leadQuery.trim().length > 0 && (
                  <div className="absolute left-0 right-0 z-50 mt-1 max-h-52 overflow-y-auto rounded-xl border border-[#E4E4E7] bg-white p-1 shadow-lg">
                    {leadResults.length === 0 ? (
                      <p className="p-3 text-center text-xs text-[#71717A]">Nenhum lead encontrado</p>
                    ) : (
                      leadResults.map((l) => (
                        <button
                          key={l.id}
                          type="button"
                          onClick={() => {
                            setSelectedLead(l);
                            setLeadQuery("");
                          }}
                          className="flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-xs transition hover:bg-[#F4F4F5]"
                        >
                          <div>
                            <p className="font-semibold text-[#09090B]">{l.name}</p>
                            <p className="text-[10px] text-[#71717A]">{l.phone}</p>
                          </div>
                          <span
                            className={cn(
                              "h-1.5 w-1.5 rounded-full shrink-0",
                              l.status === "hot"
                                ? "bg-[#F97316]"
                                : l.status === "warm"
                                  ? "bg-[#F59E0B]"
                                  : l.status === "success"
                                    ? "bg-[#14B8A6]"
                                    : "bg-[#60A5FA]",
                            )}
                          />
                        </button>
                      ))
                    )}
                  </div>
                )}
              </div>
            )}
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <label className="font-mono text-[11px] uppercase tracking-wider text-[#71717A]">Início *</label>
              <input
                name="start_time"
                type="datetime-local"
                required
                value={startTime}
                onChange={(e) => handleStartChange(e.target.value)}
                className="rounded-xl border border-[#E4E4E7] bg-[#F4F4F5] px-3.5 py-2.5 text-sm text-[#09090B] outline-none focus:border-[#2563EB] focus:bg-white focus:ring-2 focus:ring-[#2563EB]/10"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="font-mono text-[11px] uppercase tracking-wider text-[#71717A]">Fim *</label>
              <input
                name="end_time"
                type="datetime-local"
                required
                value={endTime}
                onChange={(e) => setEndTime(e.target.value)}
                className="rounded-xl border border-[#E4E4E7] bg-[#F4F4F5] px-3.5 py-2.5 text-sm text-[#09090B] outline-none focus:border-[#2563EB] focus:bg-white focus:ring-2 focus:ring-[#2563EB]/10"
              />
            </div>
          </div>

          {error && (
            <p className="rounded-lg border border-[#FECACA] bg-[#FFF1F2] px-3 py-2 text-sm text-[#DC2626]">{error}</p>
          )}

          <div className="mt-2 flex gap-2 shrink-0">
            <Button type="button" variant="secondary" size="sm" className="flex-1 justify-center" onClick={onClose}>
              Cancelar
            </Button>
            <Button type="submit" variant="orange" size="sm" disabled={isPending} className="flex-1 justify-center gap-1.5">
              {isPending ? <Loader2 size={14} className="animate-spin" /> : editingEvent ? <Pencil size={14} /> : <Plus size={14} />}
              {isPending ? (editingEvent ? "Salvando..." : "Criando...") : editingEvent ? "Salvar alterações" : "Criar agendamento"}
            </Button>
          </div>
        </form>
      </div>
    </Dialog>
  );
}
