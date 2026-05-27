"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import {
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Plus,
  X,
  Trash2,
  Loader2,
  RefreshCw,
  Cloud,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { createEvent, deleteEvent } from "./actions";
import { trackEvent } from "@/lib/analytics";

const MONTHS = [
  "Janeiro","Fevereiro","Março","Abril","Maio","Junho",
  "Julho","Agosto","Setembro","Outubro","Novembro","Dezembro",
];
const DOW = ["Dom","Seg","Ter","Qua","Qui","Sex","Sáb"];

type LeadStatus = "hot" | "warm" | "cold" | "success";
type EventSource = "agendra" | "gcal";
type GCalSyncStatus = "synced" | "pending" | "error" | null;
type EventStatus = "pending" | "confirmed" | "cancelled" | "rescheduled" | null;

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
  source: EventSource;
  gcal_sync_status: GCalSyncStatus;
  gcal_event_id: string | null;
  status: EventStatus;
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

const GCAL_INDIGO = "#6366F1";

function formatTime(iso: string) {
  return new Date(iso).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
}

function toDatetimeLocal(d: Date) {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function formatRelative(iso: string) {
  const mins = Math.floor((Date.now() - new Date(iso).getTime()) / 60_000);
  if (mins < 1) return "agora";
  if (mins < 60) return `há ${mins}min`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `há ${hrs}h`;
  return `há ${Math.floor(hrs / 24)}d`;
}

function useIsMobile(breakpoint = 640) {
  const [isMobile, setIsMobile] = useState(false);
  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < breakpoint);
    check();
    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, [breakpoint]);
  return isMobile;
}

export function AgendaClient({
  events,
  leads,
  companyId: _companyId,
  gcalConnected = false,
  gcalEmail,
  lastSyncedAt,
  autoSync = false,
}: {
  events: AgendaEvent[];
  leads: LeadOption[];
  companyId: string;
  gcalConnected?: boolean;
  gcalEmail?: string | null;
  lastSyncedAt?: string | null;
  /** If true, auto-triggers GCal sync on mount (data is stale) */
  autoSync?: boolean;
}) {
  const router = useRouter();
  const isMobile = useIsMobile();

  const TODAY = new Date();
  const [viewYear, setViewYear] = useState(TODAY.getFullYear());
  const [viewMonth, setViewMonth] = useState(TODAY.getMonth());
  const [selected, setSelected] = useState(TODAY.getDate());
  const [showModal, setShowModal] = useState(false);
  const [startTime, setStartTime] = useState("");
  const [endTime, setEndTime] = useState("");
  const [isPending, startTransition] = useTransition();
  const [isSyncing, setIsSyncing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);

  // P1 fix: auto-sync on mount when data is stale — keeps SSR fast
  const didAutoSync = useRef(false);
  useEffect(() => {
    if (!autoSync || didAutoSync.current) return;
    didAutoSync.current = true;
    setIsSyncing(true);
    fetch("/api/sync/gcal")
      .then((res) => { if (!res.ok) throw new Error("Sync failed"); return router.refresh(); })
      .catch((e) => console.error("[AgendaClient] auto-sync:", e))
      .finally(() => setIsSyncing(false));
  }, [autoSync, router]);

  // Reset form times whenever modal opens, based on selected day
  useEffect(() => {
    if (!showModal) return;
    const base = new Date(viewYear, viewMonth, selected, 9, 0);
    setStartTime(toDatetimeLocal(base));
    setEndTime(toDatetimeLocal(new Date(base.getTime() + 60 * 60 * 1000)));
  }, [showModal]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleStartChange = (val: string) => {
    setStartTime(val);
    if (!val) return;
    const start = new Date(val);
    if (isNaN(start.getTime())) return;
    const end = new Date(endTime);
    if (isNaN(end.getTime()) || end <= start) {
      setEndTime(toDatetimeLocal(new Date(start.getTime() + 60 * 60 * 1000)));
    }
  };

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
    // P1 fix: clamp selected day to the max days in the new month
    // (e.g. navigating from Jan 31 to Feb → clamp to 28/29)
    const maxDay = new Date(y, m + 1, 0).getDate();
    setSelected((prev) => Math.min(prev, maxDay));
  };

  const handleCreate = (formData: FormData) => {
    setError(null);
    // P0 timezone fix: datetime-local inputs return local time strings without timezone.
    // Convert to UTC ISO strings here (in browser) so the server action receives UTC.
    const startLocal = formData.get("start_time") as string | null;
    const endLocal = formData.get("end_time") as string | null;
    if (startLocal) formData.set("start_time", new Date(startLocal).toISOString());
    if (endLocal) formData.set("end_time", new Date(endLocal).toISOString());

    startTransition(async () => {
      try {
        await createEvent(formData);
        trackEvent("event_created");
        setShowModal(false);
      } catch (e) {
        const msg = e instanceof Error ? e.message : "Erro ao criar agendamento";
        // Map internal onboarding error to user-friendly message
        setError(
          msg.startsWith("Onboarding not complete")
            ? "Complete o onboarding da sua empresa antes de criar agendamentos."
            : msg,
        );
      }
    });
  };

  const handleDelete = (eventId: string) => {
    // P2 fix: require confirmation before delete (irreversible action)
    if (deleteConfirm !== eventId) {
      setDeleteConfirm(eventId);
      return;
    }
    setDeleteConfirm(null);
    startTransition(async () => {
      try {
        await deleteEvent(eventId);
        trackEvent("event_deleted");
      } catch (e) {
        console.error(e);
      }
    });
  };

  const handleSync = async () => {
    if (isSyncing) return;
    setIsSyncing(true);
    try {
      const res = await fetch("/api/sync/gcal");
      if (!res.ok) throw new Error("Sync failed");
      router.refresh();
    } catch (e) {
      console.error("[AgendaClient] sync failed:", e);
    } finally {
      setIsSyncing(false);
    }
  };

  return (
    <div className="relative mobile-scroll-area h-full overflow-y-auto px-4 pt-4 pb-[calc(72px+env(safe-area-inset-bottom,12px))] sm:pt-7 sm:px-8 sm:pb-7">
      {/* Sync loading overlay */}
      <AnimatePresence>
        {isSyncing && (
          <motion.div
            key="sync-overlay"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 backdrop-blur-sm"
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              transition={{ duration: 0.18 }}
              className="flex flex-col items-center gap-4 rounded-2xl border border-white/[0.1] bg-[rgba(11,18,34,0.97)] px-10 py-8 shadow-2xl"
            >
              <RefreshCw size={28} className="animate-spin text-indigo-400" />
              <div className="text-center">
                <p className="font-semibold">Sincronizando</p>
                <p className="mt-1 text-sm" style={{ color: "var(--color-fg-3)" }}>
                  Buscando eventos do Google Calendar...
                </p>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
      <header className="mb-6 flex flex-wrap items-start justify-between gap-3 sm:items-end">
        <div>
          <h1 className="text-[24px] font-bold tracking-[-0.02em] sm:text-[28px]">Agenda</h1>
          <p className="mt-1 text-sm" style={{ color: "var(--color-fg-2)" }}>
            {dayEvents.length} evento{dayEvents.length === 1 ? "" : "s"} em {selected} de {MONTHS[viewMonth]}.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {gcalConnected && (
            <div className="flex items-center gap-2">
              {lastSyncedAt && (
                <span
                  className="hidden text-[11px] sm:inline"
                  style={{ color: "var(--color-fg-3)" }}
                >
                  {gcalEmail ? `${gcalEmail} · ` : ""}
                  {formatRelative(lastSyncedAt)}
                </span>
              )}
              <Button
                variant="secondary"
                size="sm"
                onClick={handleSync}
                disabled={isSyncing}
              >
                <RefreshCw size={14} className={cn(isSyncing && "animate-spin")} />
                <span className="hidden sm:inline">
                  {isSyncing ? "Sincronizando..." : "Sincronizar"}
                </span>
              </Button>
            </div>
          )}
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
            <span className="hidden sm:inline">Hoje</span>
          </Button>
          <Button variant="primary" size="sm" onClick={() => setShowModal(true)}>
            <Plus size={14} />
            <span className="hidden sm:inline">Novo agendamento</span>
            <span className="sm:hidden">Novo</span>
          </Button>
        </div>
      </header>

      <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
        {/* Calendar grid */}
        <div className="rounded-2xl border border-white/[0.08] bg-white/[0.04] p-3 sm:p-5">
          <div className="mb-4 flex items-center gap-3">
            <div className="flex-1 text-base font-semibold sm:text-lg">
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

          <div className="grid grid-cols-7 gap-1 sm:gap-1.5">
            {DOW.map((d) => (
              <div
                key={d}
                className="py-1 text-center font-mono text-[9px] font-medium uppercase tracking-[0.12em] sm:text-[10px] sm:tracking-[0.16em]"
                style={{ color: "var(--color-fg-3)" }}
              >
                {d}
              </div>
            ))}
            {cells.map((c, i) => {
              const evs = !c.muted ? eventsByDay[c.d] || [] : [];
              const isToday =
                !c.muted &&
                c.d === TODAY.getDate() &&
                viewMonth === TODAY.getMonth() &&
                viewYear === TODAY.getFullYear();
              const isSel = !c.muted && c.d === selected;
              return (
                <motion.button
                  key={i}
                  whileHover={c.muted ? undefined : { scale: 1.02 }}
                  transition={{ type: "spring", stiffness: 400, damping: 28 }}
                  onClick={() => !c.muted && setSelected(c.d)}
                  className={cn(
                    "flex min-h-[60px] cursor-pointer flex-col gap-1 rounded-xl border p-1.5 text-left sm:min-h-[80px] sm:p-2",
                    "border-white/[0.08] bg-white/[0.02] transition-colors",
                    !c.muted && "hover:bg-white/[0.05]",
                    c.muted && "opacity-30",
                    isToday && "border-[#2563EB]/50 bg-[#2563EB]/10",
                    isSel && "border-[#F97316]/50 !bg-[#F97316]/10",
                  )}
                >
                  <span className="text-[11px] font-semibold sm:text-[13px]">{c.d}</span>
                  {/* Event chips */}
                  <div className="flex flex-col gap-0.5 overflow-hidden">
                    {evs.slice(0, isMobile ? 1 : 2).map((e, j) => {
                      const color =
                        e.source === "gcal"
                          ? GCAL_INDIGO
                          : HEAT_COLOR[e.leads?.status ?? "cold"];
                      return (
                        <span
                          key={j}
                          className="truncate rounded px-1 py-0.5 text-[8px] font-semibold leading-tight sm:text-[9px]"
                          style={{
                            background: color + "28",
                            color,
                            border: `1px solid ${color}33`,
                          }}
                        >
                          {e.title}
                        </span>
                      );
                    })}
                    {evs.length > (isMobile ? 1 : 2) && (
                      <span
                        className="text-[8px] font-medium sm:text-[9px]"
                        style={{ color: "var(--color-fg-3)" }}
                      >
                        +{evs.length - (isMobile ? 1 : 2)} mais
                      </span>
                    )}
                  </div>
                </motion.button>
              );
            })}
          </div>
        </div>

        {/* Day events panel */}
        <div className="rounded-2xl border border-white/[0.08] bg-white/[0.04] p-4 sm:p-5">
          <div className="eyebrow mb-3">Dia {selected} · {MONTHS[viewMonth]}</div>
          <div className="flex flex-col gap-2.5 sm:max-h-[calc(100vh-260px)] sm:overflow-y-auto">
            {dayEvents.length === 0 ? (
              <div
                className="rounded-xl border border-white/[0.08] bg-white/[0.04] p-4 text-center"
                style={{ color: "var(--color-fg-3)" }}
              >
                <p className="text-sm">Sem agendamentos neste dia.</p>
                <p className="mt-1 text-[11px]">Clique em "Novo" para adicionar.</p>
              </div>
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
                    className="flex items-start gap-3 rounded-xl border border-white/[0.08] bg-white/[0.04] p-3"
                  >
                    <span className="min-w-[44px] font-mono text-xs font-semibold text-brand-teal-300">
                      {formatTime(e.start_time)}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className="text-[13px] font-semibold">{e.title}</span>
                        {isGcal && (
                          <span className="inline-flex items-center gap-1 rounded-full border border-indigo-400/40 bg-indigo-400/10 px-1.5 py-0.5 text-[10px] font-medium text-indigo-400">
                            <Cloud size={8} />
                            Google
                          </span>
                        )}
                        {e.gcal_sync_status === "error" && (
                          <span className="rounded-full border border-amber-400/40 bg-amber-400/10 px-1.5 py-0.5 text-[10px] font-medium text-amber-400">
                            Sync pendente
                          </span>
                        )}
                      </div>
                      {e.leads?.name && (
                        <div className="mt-0.5 truncate text-[11px]" style={{ color: "var(--color-fg-3)" }}>
                          {e.leads.name} · {e.leads.phone}
                        </div>
                      )}
                    </div>
                    <div className="flex shrink-0 items-center gap-1.5">
                      {!isGcal && e.leads && (
                        <Badge variant={status} className="px-2 py-0.5 text-[10px]">
                          {HEAT_LABEL[status]}
                        </Badge>
                      )}
                      {/* Pending/rescheduled event status badge */}
                      {e.status === "pending" && (
                        <span className="rounded-full border border-amber-400/40 bg-amber-400/10 px-1.5 py-0.5 text-[10px] font-medium text-amber-400">
                          Pendente
                        </span>
                      )}
                      {e.status === "rescheduled" && (
                        <span className="rounded-full border border-blue-400/40 bg-blue-400/10 px-1.5 py-0.5 text-[10px] font-medium text-blue-400">
                          Remarcado
                        </span>
                      )}
                      {!isGcal && (
                        deleteConfirm === e.id ? (
                          // P2 fix: confirmation state before irreversible delete
                          <div className="flex items-center gap-1">
                            <span className="text-[10px] text-red-400">Excluir?</span>
                            <button
                              onClick={() => handleDelete(e.id)}
                              className="rounded px-1.5 py-0.5 text-[10px] font-semibold text-red-400 hover:bg-red-400/10"
                            >
                              Sim
                            </button>
                            <button
                              onClick={() => setDeleteConfirm(null)}
                              className="rounded px-1.5 py-0.5 text-[10px] text-fg-3 hover:bg-white/[0.08]"
                            >
                              Não
                            </button>
                          </div>
                        ) : (
                          <button
                            onClick={() => handleDelete(e.id)}
                            className="grid h-7 w-7 place-items-center rounded-lg text-fg-3 transition hover:bg-white/[0.08] hover:text-red-400"
                            aria-label="Excluir"
                          >
                            <Trash2 size={12} />
                          </button>
                        )
                      )}
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
              key="modal-wrap"
              className="fixed inset-0 z-50 flex items-center justify-center p-4"
            >
              <motion.div
                key="modal"
                initial={{ opacity: 0, scale: 0.96, y: 16 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.96, y: 16 }}
                transition={{ duration: 0.18 }}
                className="w-full max-w-md border border-white/[0.1] bg-[rgba(11,18,34,0.97)] p-6 shadow-2xl backdrop-blur-xl flex flex-col rounded-2xl max-h-[85vh]"
              >
                <div className="mb-5 flex shrink-0 items-center justify-between">
                  <h2 className="text-lg font-semibold">Novo agendamento</h2>
                  <button
                    onClick={() => setShowModal(false)}
                    className="grid h-8 w-8 place-items-center rounded-lg text-fg-3 transition hover:bg-white/[0.08] hover:text-white"
                  >
                    <X size={16} />
                  </button>
                </div>

                <div className="overflow-y-auto px-1 -mx-1 flex-1">
                  <form action={handleCreate} className="flex flex-col gap-4 pb-2">
                    <div className="flex flex-col gap-1.5">
                      <label
                        className="font-mono text-[11px] uppercase tracking-wider"
                        style={{ color: "var(--color-fg-3)" }}
                      >
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
                      <label
                        className="font-mono text-[11px] uppercase tracking-wider"
                        style={{ color: "var(--color-fg-3)" }}
                      >
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
                      {leads.length === 200 && (
                        <p className="text-[10px]" style={{ color: "var(--color-fg-3)" }}>
                          Exibindo os 200 leads mais recentes. Use a busca de leads para encontrar outros.
                        </p>
                      )}
                    </div>

                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                      <div className="flex flex-col gap-1.5">
                        <label
                          className="font-mono text-[11px] uppercase tracking-wider"
                          style={{ color: "var(--color-fg-3)" }}
                        >
                          Início *
                        </label>
                        <input
                          name="start_time"
                          type="datetime-local"
                          required
                          value={startTime}
                          onChange={(e) => handleStartChange(e.target.value)}
                          className="rounded-xl border border-white/[0.08] bg-white/[0.04] px-3.5 py-2.5 text-sm outline-none transition focus:border-[#2563EB]/50 focus:bg-white/[0.06]"
                        />
                      </div>
                      <div className="flex flex-col gap-1.5">
                        <label
                          className="font-mono text-[11px] uppercase tracking-wider"
                          style={{ color: "var(--color-fg-3)" }}
                        >
                          Fim *
                        </label>
                        <input
                          name="end_time"
                          type="datetime-local"
                          required
                          value={endTime}
                          onChange={(e) => setEndTime(e.target.value)}
                          className="rounded-xl border border-white/[0.08] bg-white/[0.04] px-3.5 py-2.5 text-sm outline-none transition focus:border-[#2563EB]/50 focus:bg-white/[0.06]"
                        />
                      </div>
                    </div>

                    {error && (
                      <p className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-400">
                        {error}
                      </p>
                    )}

                    <div className="mt-2 flex gap-2 shrink-0">
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
                        {isPending ? "Salvando..." : "Criar"}
                      </Button>
                    </div>
                  </form>
                </div>
              </motion.div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}
