"use client";

import { useMemo, useState, useTransition } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { CalendarDays, ChevronLeft, ChevronRight, Plus, X, Trash2, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { createEvent, deleteEvent } from "./actions";

const MONTHS = [
  "Janeiro","Fevereiro","Março","Abril","Maio","Junho",
  "Julho","Agosto","Setembro","Outubro","Novembro","Dezembro",
];
const DOW = ["Dom","Seg","Ter","Qua","Qui","Sex","Sáb"];

type LeadStatus = "hot" | "warm" | "cold" | "success";

interface EventLead {
  name: string;
  status: LeadStatus;
  phone: string;
}

interface AgendaEvent {
  id: string;
  title: string;
  start_time: string;
  end_time: string;
  lead_id: string | null;
  leads: EventLead | null;
}

interface LeadOption {
  id: string;
  name: string;
  status: LeadStatus;
  phone: string;
}

const HEAT_COLOR: Record<LeadStatus, string> = {
  hot: "#F97316",
  warm: "#F59E0B",
  cold: "#60A5FA",
  success: "#14B8A6",
};

const HEAT_LABEL: Record<LeadStatus, string> = {
  hot: "Quente",
  warm: "Morno",
  cold: "Frio",
  success: "Convertido",
};

function formatTime(iso: string) {
  return new Date(iso).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
}

function toInputDate(d: Date) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function toInputDatetime(iso: string) {
  const d = new Date(iso);
  const date = toInputDate(d);
  const time = d.toTimeString().slice(0, 5);
  return `${date}T${time}`;
}

export function AgendaClient({
  events,
  leads,
}: {
  events: AgendaEvent[];
  leads: LeadOption[];
  companyId: string;
}) {
  const TODAY = new Date();
  const [viewYear, setViewYear] = useState(TODAY.getFullYear());
  const [viewMonth, setViewMonth] = useState(TODAY.getMonth());
  const [selected, setSelected] = useState(TODAY.getDate());
  const [showModal, setShowModal] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const eventsByDay = useMemo(() => {
    const map: Record<number, AgendaEvent[]> = {};
    for (const ev of events) {
      const d = new Date(ev.start_time);
      if (d.getFullYear() === viewYear && d.getMonth() === viewMonth) {
        const day = d.getDate();
        if (!map[day]) map[day] = [];
        map[day].push(ev);
      }
    }
    return map;
  }, [events, viewYear, viewMonth]);

  const cells = useMemo(() => {
    const first = new Date(viewYear, viewMonth, 1);
    const startDow = first.getDay();
    const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
    const prevDays = new Date(viewYear, viewMonth, 0).getDate();

    const arr: { d: number; muted: boolean }[] = [];
    for (let i = 0; i < startDow; i++) {
      arr.push({ d: prevDays - startDow + 1 + i, muted: true });
    }
    for (let d = 1; d <= daysInMonth; d++) arr.push({ d, muted: false });
    while (arr.length % 7 !== 0) arr.push({ d: arr.length - daysInMonth - startDow + 1, muted: true });
    return arr;
  }, [viewYear, viewMonth]);

  const dayEvents = (eventsByDay[selected] || []).slice().sort(
    (a, b) => new Date(a.start_time).getTime() - new Date(b.start_time).getTime()
  );

  const navMonth = (delta: number) => {
    let m = viewMonth + delta;
    let y = viewYear;
    if (m < 0) { m = 11; y -= 1; }
    if (m > 11) { m = 0; y += 1; }
    setViewMonth(m);
    setViewYear(y);
  };

  const handleCreate = (formData: FormData) => {
    setError(null);
    startTransition(async () => {
      try {
        await createEvent(formData);
        setShowModal(false);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Erro ao criar agendamento");
      }
    });
  };

  const handleDelete = (eventId: string) => {
    startTransition(async () => {
      try {
        await deleteEvent(eventId);
      } catch (e) {
        console.error(e);
      }
    });
  };

  const defaultDate = `${viewYear}-${String(viewMonth + 1).padStart(2, "0")}-${String(selected).padStart(2, "0")}`;

  return (
    <div className="mobile-scroll-area h-full overflow-y-auto px-8 py-7">
      <header className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-[28px] font-bold tracking-[-0.02em]">Agenda</h1>
          <p className="mt-1 text-sm" style={{ color: "var(--color-fg-2)" }}>
            {dayEvents.length} evento{dayEvents.length === 1 ? "" : "s"} em {selected} de {MONTHS[viewMonth]}.
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="secondary"
            size="sm"
            onClick={() => {
              setViewYear(TODAY.getFullYear());
              setViewMonth(TODAY.getMonth());
              setSelected(TODAY.getDate());
            }}
          >
            <CalendarDays size={14} />
            Hoje
          </Button>
          <Button variant="primary" size="sm" onClick={() => setShowModal(true)}>
            <Plus size={14} />
            Novo agendamento
          </Button>
        </div>
      </header>

      <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
        {/* Calendar grid */}
        <div className="rounded-2xl border border-white/[0.08] bg-white/[0.04] p-5">
          <div className="mb-4 flex items-center gap-3">
            <div className="flex-1 text-lg font-semibold">
              {MONTHS[viewMonth]} {viewYear}
            </div>
            <div className="flex gap-1">
              <button
                onClick={() => navMonth(-1)}
                className="grid h-8 w-8 place-items-center rounded-lg border border-white/[0.08] bg-white/[0.04] text-fg-2 transition hover:bg-white/[0.08] hover:text-white"
                aria-label="Mês anterior"
              >
                <ChevronLeft size={16} />
              </button>
              <button
                onClick={() => navMonth(1)}
                className="grid h-8 w-8 place-items-center rounded-lg border border-white/[0.08] bg-white/[0.04] text-fg-2 transition hover:bg-white/[0.08] hover:text-white"
                aria-label="Próximo mês"
              >
                <ChevronRight size={16} />
              </button>
            </div>
          </div>

          <div className="grid grid-cols-7 gap-1.5">
            {DOW.map((d) => (
              <div
                key={d}
                className="py-1 text-center font-mono text-[10px] font-medium uppercase tracking-[0.16em]"
                style={{ color: "var(--color-fg-3)" }}
              >
                {d}
              </div>
            ))}
            {cells.map((c, i) => {
              const evs = !c.muted ? eventsByDay[c.d] || [] : [];
              const isToday = !c.muted && c.d === TODAY.getDate() && viewMonth === TODAY.getMonth() && viewYear === TODAY.getFullYear();
              const isSel = !c.muted && c.d === selected;
              return (
                <motion.button
                  key={i}
                  whileHover={c.muted ? undefined : { scale: 1.03 }}
                  transition={{ type: "spring", stiffness: 400, damping: 28 }}
                  onClick={() => !c.muted && setSelected(c.d)}
                  className={cn(
                    "flex aspect-square cursor-pointer flex-col gap-1 rounded-xl border p-2 text-left",
                    "border-white/[0.08] bg-white/[0.02] transition-colors",
                    !c.muted && "hover:bg-white/[0.05]",
                    c.muted && "opacity-30",
                    isToday && "border-[#2563EB]/50 bg-[#2563EB]/10",
                    isSel && "border-[#F97316]/50 !bg-[#F97316]/10",
                  )}
                >
                  <span className="text-[13px] font-semibold">{c.d}</span>
                  <span className="mt-auto flex gap-0.5">
                    {evs.slice(0, 4).map((e, j) => {
                      const status = e.leads?.status ?? "cold";
                      return (
                        <span
                          key={j}
                          className="h-1.5 w-1.5 rounded-full"
                          style={{ background: HEAT_COLOR[status] }}
                        />
                      );
                    })}
                  </span>
                </motion.button>
              );
            })}
          </div>
        </div>

        {/* Day events panel */}
        <div className="rounded-2xl border border-white/[0.08] bg-white/[0.04] p-5">
          <div className="eyebrow mb-3">Dia {selected} · {MONTHS[viewMonth]}</div>
          <div className="flex max-h-[calc(100vh-260px)] flex-col gap-2.5 overflow-y-auto">
            {dayEvents.length === 0 ? (
              <div className="rounded-xl border border-white/[0.08] bg-white/[0.04] p-4 text-center"
                   style={{ color: "var(--color-fg-3)" }}>
                <p className="text-sm">Sem agendamentos neste dia.</p>
                <p className="mt-1 text-[11px]">Clique em "Novo agendamento" para adicionar.</p>
              </div>
            ) : (
              dayEvents.map((e, i) => {
                const status = e.leads?.status ?? "cold";
                return (
                  <motion.div
                    key={e.id}
                    initial={{ opacity: 0, x: -8 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ duration: 0.2, delay: i * 0.04 }}
                    className="flex items-start gap-3 rounded-xl border border-white/[0.08] bg-white/[0.04] p-3"
                  >
                    <span className="min-w-[50px] font-mono text-xs font-semibold text-brand-teal-300">
                      {formatTime(e.start_time)}
                    </span>
                    <div className="flex-1">
                      <div className="text-[13px] font-semibold">{e.title}</div>
                      {e.leads?.name && (
                        <div className="mt-0.5 text-[11px]" style={{ color: "var(--color-fg-3)" }}>
                          {e.leads.name} · {e.leads.phone}
                        </div>
                      )}
                    </div>
                    <div className="flex items-center gap-1.5">
                      <Badge variant={status} className="px-2 py-0.5">
                        {HEAT_LABEL[status]}
                      </Badge>
                      <button
                        onClick={() => handleDelete(e.id)}
                        className="grid h-6 w-6 place-items-center rounded-lg text-fg-3 transition hover:bg-white/[0.08] hover:text-red-400"
                        aria-label="Excluir"
                      >
                        <Trash2 size={12} />
                      </button>
                    </div>
                  </motion.div>
                );
              })
            )}
          </div>
        </div>
      </div>

      {/* Modal — Novo Agendamento */}
      <AnimatePresence>
        {showModal && (
          <>
            <motion.div
              key="backdrop"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowModal(false)}
              className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm"
            />
            <motion.div
              key="modal"
              initial={{ opacity: 0, scale: 0.96, y: 16 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.96, y: 16 }}
              transition={{ duration: 0.18 }}
              className="fixed inset-0 z-50 flex items-center justify-center p-4"
            >
              <div className="w-full max-w-md rounded-2xl border border-white/[0.1] bg-[rgba(11,18,34,0.95)] p-6 shadow-2xl backdrop-blur-xl">
                <div className="mb-5 flex items-center justify-between">
                  <h2 className="text-lg font-semibold">Novo agendamento</h2>
                  <button
                    onClick={() => setShowModal(false)}
                    className="grid h-8 w-8 place-items-center rounded-lg text-fg-3 transition hover:bg-white/[0.08] hover:text-white"
                  >
                    <X size={16} />
                  </button>
                </div>

                <form action={handleCreate} className="flex flex-col gap-4">
                  <div className="flex flex-col gap-1.5">
                    <label className="font-mono text-[11px] uppercase tracking-wider" style={{ color: "var(--color-fg-3)" }}>
                      Título / motivo *
                    </label>
                    <input
                      name="title"
                      required
                      placeholder="Ex: Consulta inicial, Retorno..."
                      className="rounded-xl border border-white/[0.08] bg-white/[0.04] px-3.5 py-2.5 text-sm outline-none transition placeholder:text-fg-3 focus:border-[#2563EB]/50 focus:bg-white/[0.06]"
                    />
                  </div>

                  <div className="flex flex-col gap-1.5">
                    <label className="font-mono text-[11px] uppercase tracking-wider" style={{ color: "var(--color-fg-3)" }}>
                      Lead (opcional)
                    </label>
                    <select
                      name="lead_id"
                      className="rounded-xl border border-white/[0.08] bg-[rgba(11,18,34,0.9)] px-3.5 py-2.5 text-sm outline-none transition focus:border-[#2563EB]/50"
                    >
                      <option value="">— Nenhum lead vinculado —</option>
                      {leads.map((l) => (
                        <option key={l.id} value={l.id}>
                          {l.name} ({l.phone})
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div className="flex flex-col gap-1.5">
                      <label className="font-mono text-[11px] uppercase tracking-wider" style={{ color: "var(--color-fg-3)" }}>
                        Início *
                      </label>
                      <input
                        name="start_time"
                        type="datetime-local"
                        required
                        defaultValue={`${defaultDate}T09:00`}
                        className="rounded-xl border border-white/[0.08] bg-white/[0.04] px-3.5 py-2.5 text-sm outline-none transition focus:border-[#2563EB]/50 focus:bg-white/[0.06]"
                      />
                    </div>
                    <div className="flex flex-col gap-1.5">
                      <label className="font-mono text-[11px] uppercase tracking-wider" style={{ color: "var(--color-fg-3)" }}>
                        Fim *
                      </label>
                      <input
                        name="end_time"
                        type="datetime-local"
                        required
                        defaultValue={`${defaultDate}T10:00`}
                        className="rounded-xl border border-white/[0.08] bg-white/[0.04] px-3.5 py-2.5 text-sm outline-none transition focus:border-[#2563EB]/50 focus:bg-white/[0.06]"
                      />
                    </div>
                  </div>

                  {error && (
                    <p className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-400">
                      {error}
                    </p>
                  )}

                  <div className="mt-1 flex gap-2">
                    <Button
                      type="button"
                      variant="secondary"
                      size="sm"
                      className="flex-1 justify-center"
                      onClick={() => setShowModal(false)}
                    >
                      Cancelar
                    </Button>
                    <Button
                      type="submit"
                      variant="primary"
                      size="sm"
                      className="flex-1 justify-center"
                      disabled={isPending}
                    >
                      {isPending ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
                      {isPending ? "Salvando..." : "Criar agendamento"}
                    </Button>
                  </div>
                </form>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}
