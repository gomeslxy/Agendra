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
  Pencil,
  Search,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { createEvent, deleteEvent, updateEvent, searchLeads } from "./actions";
import { trackEvent } from "@/lib/analytics";
import { EmptyState } from "@/components/ui/empty-state";
import { createBrowserClient } from "@supabase/ssr";

const browserSupabase = createBrowserClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
);

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

  const [editingEvent, setEditingEvent] = useState<AgendaEvent | null>(null);
  const [leadQuery, setLeadQuery] = useState("");
  const [leadResults, setLeadResults] = useState<LeadOption[]>(leads.slice(0, 50));
  const [selectedLead, setSelectedLead] = useState<LeadOption | null>(null);
  const [isSearchingLeads, setIsSearchingLeads] = useState(false);

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

  // [AGD-1] Realtime Subscription
  useEffect(() => {
    if (!_companyId) return;

    const supabase = browserSupabase;
    const companyFilter = `company_id=eq.${_companyId}`;

    const channel = supabase
      .channel(`agenda-realtime-${_companyId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "events", filter: companyFilter },
        (payload) => {
          console.log("[Agenda Realtime] event modification detected:", payload);
          router.refresh();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [_companyId, router]);

  // [AGD-3] Debounced lead search
  useEffect(() => {
    if (!showModal) return;

    const delayDebounceFn = setTimeout(async () => {
      if (!leadQuery.trim()) {
        setLeadResults(leads.slice(0, 50));
        return;
      }
      setIsSearchingLeads(true);
      try {
        const results = await searchLeads(leadQuery);
        setLeadResults(results);
      } catch (err) {
        console.error("Erro ao buscar leads:", err);
      } finally {
        setIsSearchingLeads(false);
      }
    }, 300);

    return () => clearTimeout(delayDebounceFn);
  }, [leadQuery, showModal, leads]);

  // Modal form pre-fill for creation / edition
  useEffect(() => {
    if (!showModal) {
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
      const base = new Date(viewYear, viewMonth, selected, 9, 0);
      setStartTime(toDatetimeLocal(base));
      setEndTime(toDatetimeLocal(new Date(base.getTime() + 60 * 60 * 1000)));
      setSelectedLead(null);
    }
  }, [showModal, editingEvent]); // eslint-disable-line react-hooks/exhaustive-deps

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
    const maxDay = new Date(y, m + 1, 0).getDate();
    setSelected((prev) => Math.min(prev, maxDay));
  };

  const handleSubmit = (formData: FormData) => {
    setError(null);
    const startLocal = formData.get("start_time") as string | null;
    const endLocal = formData.get("end_time") as string | null;
    if (startLocal) formData.set("start_time", new Date(startLocal).toISOString());
    if (endLocal) formData.set("end_time", new Date(endLocal).toISOString());

    if (selectedLead) {
      formData.set("lead_id", selectedLead.id);
    } else {
      formData.set("lead_id", "");
    }

    startTransition(async () => {
      try {
        if (editingEvent) {
          await updateEvent(editingEvent.id, formData);
          trackEvent("event_updated");
        } else {
          await createEvent(formData);
          trackEvent("event_created");
        }
        setShowModal(false);
        setEditingEvent(null);
      } catch (e) {
        const msg = e instanceof Error ? e.message : "Erro ao salvar agendamento";
        setError(
          msg.startsWith("Onboarding not complete")
            ? "Complete o onboarding da sua empresa antes de salvar agendamentos."
            : msg,
        );
      }
    });
  };

  const handleDelete = (eventId: string) => {
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

  // isMobile used to suppress mobile-specific layout differences
  void isMobile;

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
            className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 backdrop-blur-sm"
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              transition={{ duration: 0.18 }}
              className="flex flex-col items-center gap-4 rounded-2xl border border-[#E4E4E7] bg-white px-10 py-8 shadow-2xl"
            >
              <RefreshCw size={28} className="animate-spin text-[#6366F1]" />
              <div className="text-center">
                <p className="font-semibold text-[#09090B]">Sincronizando</p>
                <p className="mt-1 text-sm text-[#71717A]">
                  Buscando eventos do Google Calendar...
                </p>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <header className="mb-6 flex flex-wrap items-start justify-between gap-3 sm:items-end">
        <div>
          <h1 className="text-[24px] font-bold tracking-[-0.02em] text-[#09090B] sm:text-[28px]">Agenda</h1>
          <p className="mt-1 text-sm text-[#71717A]">
            {dayEvents.length} evento{dayEvents.length === 1 ? "" : "s"} em {selected} de {MONTHS[viewMonth]}.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {gcalConnected && (
            <div className="flex items-center gap-2">
              {lastSyncedAt && (
                <span className="hidden text-[11px] text-[#71717A] sm:inline">
                  {gcalEmail ? `${gcalEmail} · ` : ""}
                  {formatRelative(lastSyncedAt)}
                </span>
              )}
              <Button variant="secondary" size="sm" onClick={handleSync} disabled={isSyncing}>
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
          <Button variant="orange" size="sm" onClick={() => { setEditingEvent(null); setShowModal(true); }}>
            <Plus size={14} />
            <span className="hidden sm:inline">Novo agendamento</span>
            <span className="sm:hidden">Novo</span>
          </Button>
        </div>
      </header>

      <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
        {/* Calendar grid */}
        <div className="border border-[#E4E4E7] bg-white rounded-xl p-3 sm:p-5 shadow-sm">
          <div className="mb-4 flex items-center gap-3">
            <div className="flex-1 text-base font-semibold text-[#09090B] sm:text-lg">
              {MONTHS[viewMonth]} {viewYear}
            </div>
            <div className="flex gap-1">
              <button
                onClick={() => navMonth(-1)}
                className="grid h-8 w-8 place-items-center rounded-lg border border-[#E4E4E7] bg-[#F4F4F5] text-[#71717A] transition hover:bg-[#E4E4E7] hover:text-[#09090B]"
                aria-label="Mês anterior"
              >
                <ChevronLeft size={16} />
              </button>
              <button
                onClick={() => navMonth(1)}
                className="grid h-8 w-8 place-items-center rounded-lg border border-[#E4E4E7] bg-[#F4F4F5] text-[#71717A] transition hover:bg-[#E4E4E7] hover:text-[#09090B]"
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
                className="py-1 text-center font-mono text-[9px] font-medium uppercase tracking-[0.12em] text-[#A1A1AA] sm:text-[10px] sm:tracking-[0.16em]"
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
                    "border-[#E4E4E7] bg-white transition-colors",
                    !c.muted && "hover:bg-[#F4F4F5]",
                    c.muted && "opacity-30 cursor-default",
                    isToday && !isSel && "border-[#BFDBFE] bg-[#EFF6FF]",
                    isSel && "border-[#2563EB] bg-[#DBEAFE] shadow-[0_0_0_2px_rgba(37,99,235,0.1)]",
                  )}
                >
                  <span className={cn(
                    "text-[11px] font-semibold sm:text-[13px]",
                    isSel ? "text-[#1D4ED8]" : "text-[#09090B]",
                  )}>{c.d}</span>
                  <div className="flex flex-wrap gap-1 mt-auto pb-0.5 select-none max-h-3 overflow-hidden">
                    {evs.map((e, j) => {
                      const color =
                        e.source === "gcal"
                          ? GCAL_INDIGO
                          : HEAT_COLOR[e.leads?.status ?? "cold"];
                      return (
                        <span
                          key={j}
                          className="h-1.5 w-1.5 rounded-full shrink-0"
                          style={{ backgroundColor: color }}
                          title={e.title}
                        />
                      );
                    })}
                  </div>
                </motion.button>
              );
            })}
          </div>
        </div>

        {/* Day events panel */}
        <div className="border border-[#E4E4E7] bg-white rounded-xl p-4 sm:p-5 shadow-sm">
          <div className="font-mono text-[10px] font-semibold uppercase tracking-[0.14em] text-[#71717A] mb-3">
            Dia {selected} · {MONTHS[viewMonth]}
          </div>
          <div className="flex flex-col gap-2.5 sm:max-h-[calc(100vh-260px)] sm:overflow-y-auto">
            {dayEvents.length === 0 ? (
              <EmptyState
                icon={CalendarDays}
                title="Sem Compromissos"
                description={`Não há nenhum agendamento para o dia ${selected} de ${MONTHS[viewMonth]}.`}
                action={
                  <Button
                    onClick={() => { setEditingEvent(null); setShowModal(true); }}
                    variant="ghost"
                    className="text-xs text-[#2563EB] hover:text-[#1D4ED8]"
                  >
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
                          <span className={cn(
                            "h-1.5 w-1.5 rounded-full shrink-0",
                            status === "hot"     ? "bg-[#F97316] shadow-[0_0_6px_rgba(249,115,22,0.4)]" :
                            status === "warm"    ? "bg-[#EAB308]" :
                            status === "success" ? "bg-[#14B8A6]" : "bg-[#3B82F6]",
                          )} />
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
                              onClick={() => {
                                setEditingEvent(e);
                                setShowModal(true);
                              }}
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
                                onClick={() => handleDelete(e.id)}
                                className="rounded px-1.5 py-0.5 text-[10px] font-black text-[#DC2626] hover:bg-[#FFF1F2] cursor-pointer"
                              >
                                Sim
                              </button>
                              <button
                                onClick={() => setDeleteConfirm(null)}
                                className="rounded px-1.5 py-0.5 text-[10px] text-[#71717A] hover:bg-[#F4F4F5] cursor-pointer"
                              >
                                Não
                              </button>
                            </div>
                          ) : (
                            <button
                              onClick={() => handleDelete(e.id)}
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
              className="fixed inset-0 z-40 bg-black/40 backdrop-blur-sm"
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
                className="w-full max-w-md border border-[#E4E4E7] bg-white p-6 shadow-2xl flex flex-col rounded-xl max-h-[85vh]"
              >
                <div className="mb-5 flex shrink-0 items-center justify-between">
                  <h2 className="text-lg font-semibold text-[#09090B]">
                    {editingEvent ? "Editar agendamento" : "Novo agendamento"}
                  </h2>
                  <button
                    onClick={() => setShowModal(false)}
                    className="grid h-8 w-8 place-items-center rounded-lg text-[#71717A] transition hover:bg-[#F4F4F5] hover:text-[#09090B]"
                  >
                    <X size={16} />
                  </button>
                </div>

                <div className="overflow-y-auto px-1 -mx-1 flex-1">
                  <form action={handleSubmit} className="flex flex-col gap-4 pb-2" key={editingEvent?.id ?? "new"}>
                    <div className="flex flex-col gap-1.5">
                      <label className="font-mono text-[11px] uppercase tracking-wider text-[#71717A]">
                        Título / motivo *
                      </label>
                      <input
                        name="title"
                        required
                        defaultValue={editingEvent?.title ?? ""}
                        placeholder="Ex: Consulta inicial, Retorno..."
                        className="rounded-xl border border-[#E4E4E7] bg-[#F4F4F5] px-3.5 py-2.5 text-sm text-[#09090B] outline-none transition placeholder:text-[#A1A1AA] focus:border-[#2563EB] focus:bg-white focus:ring-2 focus:ring-[#2563EB]/10"
                      />
                    </div>

                    <div className="flex flex-col gap-1.5 relative">
                      <label className="font-mono text-[11px] uppercase tracking-wider text-[#71717A]">
                        Lead (opcional)
                      </label>
                      {selectedLead ? (
                        <div className="flex items-center justify-between rounded-xl border border-[#E4E4E7] bg-[#F4F4F5] p-3 text-sm text-[#09090B]">
                           <div className="flex items-center gap-2">
                             <span className={cn(
                               "h-2 w-2 rounded-full shrink-0",
                               selectedLead.status === "hot"     ? "bg-[#F97316]" :
                               selectedLead.status === "warm"    ? "bg-[#F59E0B]" :
                               selectedLead.status === "success" ? "bg-[#14B8A6]" : "bg-[#60A5FA]",
                             )} />
                             <div>
                               <p className="font-semibold text-left">{selectedLead.name}</p>
                               <p className="text-[11px] text-[#71717A] text-left">{selectedLead.phone}</p>
                             </div>
                           </div>
                           <button
                             type="button"
                             onClick={() => setSelectedLead(null)}
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
                              className="w-full rounded-xl border border-[#E4E4E7] bg-[#F4F4F5] pl-10 pr-3.5 py-2.5 text-sm text-[#09090B] outline-none transition placeholder:text-[#A1A1AA] focus:border-[#2563EB] focus:bg-white focus:ring-2 focus:ring-[#2563EB]/10"
                            />
                            {isSearchingLeads && (
                              <Loader2 size={14} className="animate-spin text-[#71717A] absolute right-3.5" />
                            )}
                          </div>

                          {leadQuery.trim().length > 0 && (
                            <div className="absolute left-0 right-0 z-50 mt-1 max-h-52 overflow-y-auto rounded-xl border border-[#E4E4E7] bg-white p-1 shadow-lg">
                              {leadResults.length === 0 ? (
                                <p className="p-3 text-center text-xs text-[#71717A]">
                                  Nenhum lead encontrado
                                </p>
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
                                    <span className={cn(
                                      "h-1.5 w-1.5 rounded-full shrink-0",
                                      l.status === "hot"     ? "bg-[#F97316]" :
                                      l.status === "warm"    ? "bg-[#F59E0B]" :
                                      l.status === "success" ? "bg-[#14B8A6]" : "bg-[#60A5FA]",
                                    )} />
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
                        <label className="font-mono text-[11px] uppercase tracking-wider text-[#71717A]">
                          Início *
                        </label>
                        <input
                          name="start_time"
                          type="datetime-local"
                          required
                          value={startTime}
                          onChange={(e) => handleStartChange(e.target.value)}
                          className="rounded-xl border border-[#E4E4E7] bg-[#F4F4F5] px-3.5 py-2.5 text-sm text-[#09090B] outline-none transition focus:border-[#2563EB] focus:bg-white focus:ring-2 focus:ring-[#2563EB]/10"
                        />
                      </div>
                      <div className="flex flex-col gap-1.5">
                        <label className="font-mono text-[11px] uppercase tracking-wider text-[#71717A]">
                          Fim *
                        </label>
                        <input
                          name="end_time"
                          type="datetime-local"
                          required
                          value={endTime}
                          onChange={(e) => setEndTime(e.target.value)}
                          className="rounded-xl border border-[#E4E4E7] bg-[#F4F4F5] px-3.5 py-2.5 text-sm text-[#09090B] outline-none transition focus:border-[#2563EB] focus:bg-white focus:ring-2 focus:ring-[#2563EB]/10"
                        />
                      </div>
                    </div>

                    {error && (
                      <p className="rounded-lg border border-[#FECACA] bg-[#FFF1F2] px-3 py-2 text-sm text-[#DC2626]">
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
                        variant="orange"
                        size="sm"
                        disabled={isPending}
                        className="flex-1 justify-center gap-1.5"
                      >
                        {isPending ? (
                          <Loader2 size={14} className="animate-spin" />
                        ) : editingEvent ? (
                          <Pencil size={14} />
                        ) : (
                          <Plus size={14} />
                        )}
                        {isPending
                          ? editingEvent
                            ? "Salvando..."
                            : "Criando..."
                          : editingEvent
                          ? "Salvar alterações"
                          : "Criar agendamento"}
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
