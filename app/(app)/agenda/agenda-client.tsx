"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import { CalendarDays, Plus, RefreshCw } from "lucide-react";
import { createBrowserClient } from "@supabase/ssr";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { trackEvent } from "@/lib/analytics";
import { createEvent, deleteEvent, updateEvent } from "./actions";
import { formatRelative, MONTHS, type AgendaEvent, type LeadOption } from "./components/agenda-types";
import { CalendarMonthGrid } from "./components/calendar-month-grid";
import { DayEventsPanel } from "./components/day-events-panel";
import { EventFormModal } from "./components/event-form-modal";

const browserSupabase = createBrowserClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
);

export function AgendaClient({
  events,
  leads,
  companyId,
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
  const today = new Date();
  const [viewYear, setViewYear] = useState(today.getFullYear());
  const [viewMonth, setViewMonth] = useState(today.getMonth());
  const [selected, setSelected] = useState(today.getDate());
  const [showModal, setShowModal] = useState(false);
  const [editingEvent, setEditingEvent] = useState<AgendaEvent | null>(null);
  const [isPending, startTransition] = useTransition();
  const [isSyncing, setIsSyncing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);

  const didAutoSync = useRef(false);
  useEffect(() => {
    if (!autoSync || didAutoSync.current) return;
    didAutoSync.current = true;
    setIsSyncing(true);
    fetch("/api/sync/gcal")
      .then((res) => {
        if (!res.ok) throw new Error("Sync failed");
        return router.refresh();
      })
      .catch(() => {
        toast.error("Não foi possível sincronizar o Google Calendar automaticamente.");
      })
      .finally(() => setIsSyncing(false));
  }, [autoSync, router]);

  useEffect(() => {
    if (!companyId) return;
    const channel = browserSupabase
      .channel(`agenda-realtime-${companyId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "events", filter: `company_id=eq.${companyId}` },
        () => router.refresh(),
      )
      .subscribe();

    return () => {
      browserSupabase.removeChannel(channel);
    };
  }, [companyId, router]);

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

  const dayEvents = (eventsByDay[selected] || [])
    .slice()
    .sort((a, b) => new Date(a.start_time).getTime() - new Date(b.start_time).getTime());

  function navMonth(delta: number) {
    let m = viewMonth + delta;
    let y = viewYear;
    if (m < 0) {
      m = 11;
      y -= 1;
    }
    if (m > 11) {
      m = 0;
      y += 1;
    }
    setViewMonth(m);
    setViewYear(y);
    const maxDay = new Date(y, m + 1, 0).getDate();
    setSelected((prev) => Math.min(prev, maxDay));
  }

  function handleSubmit(formData: FormData, selectedLead: LeadOption | null) {
    setError(null);
    const startLocal = formData.get("start_time") as string | null;
    const endLocal = formData.get("end_time") as string | null;
    if (startLocal) formData.set("start_time", new Date(startLocal).toISOString());
    if (endLocal) formData.set("end_time", new Date(endLocal).toISOString());
    formData.set("lead_id", selectedLead ? selectedLead.id : "");

    startTransition(async () => {
      try {
        if (editingEvent) {
          await updateEvent(editingEvent.id, formData);
          trackEvent("event_updated");
          toast.success("Agendamento atualizado!");
        } else {
          await createEvent(formData);
          trackEvent("event_created");
          toast.success("Agendamento criado!");
        }
        setShowModal(false);
        setEditingEvent(null);
      } catch (e) {
        const msg = e instanceof Error ? e.message : "Erro ao salvar agendamento";
        const displayMsg = msg.startsWith("Onboarding not complete")
          ? "Complete o onboarding da sua empresa antes de salvar agendamentos."
          : msg;
        setError(displayMsg);
        toast.error(displayMsg);
      }
    });
  }

  function handleDelete(eventId: string) {
    if (deleteConfirm !== eventId) {
      setDeleteConfirm(eventId);
      return;
    }
    setDeleteConfirm(null);
    startTransition(async () => {
      try {
        await deleteEvent(eventId);
        trackEvent("event_deleted");
        toast.success("Agendamento excluído.");
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Erro ao excluir agendamento.");
      }
    });
  }

  async function handleSync() {
    if (isSyncing) return;
    setIsSyncing(true);
    try {
      const res = await fetch("/api/sync/gcal");
      if (!res.ok) throw new Error("Falha ao sincronizar com Google Calendar");
      router.refresh();
      toast.success("Agenda sincronizada com Google Calendar!");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro na sincronização com Google Calendar.");
    } finally {
      setIsSyncing(false);
    }
  }

  return (
    <div className="relative mobile-scroll-area h-full overflow-y-auto px-4 pt-4 pb-6 sm:pt-7 sm:px-8 sm:pb-7">
      <AnimatePresence>
        {isSyncing && (
          <motion.div
            key="sync-overlay"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 backdrop-blur-sm"
          >
            <div className="flex flex-col items-center gap-4 rounded-2xl border border-[#E4E4E7] bg-white px-10 py-8 shadow-2xl">
              <RefreshCw size={28} className="animate-spin text-[#6366F1]" />
              <div className="text-center">
                <p className="font-semibold text-[#09090B]">Sincronizando</p>
                <p className="mt-1 text-sm text-[#71717A]">Buscando eventos do Google Calendar...</p>
              </div>
            </div>
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
                <span className="hidden sm:inline">{isSyncing ? "Sincronizando..." : "Sincronizar"}</span>
              </Button>
            </div>
          )}
          <Button
            variant="secondary"
            size="sm"
            onClick={() => {
              const now = new Date();
              setViewYear(now.getFullYear());
              setViewMonth(now.getMonth());
              setSelected(now.getDate());
            }}
          >
            <CalendarDays size={14} />
            <span className="hidden sm:inline">Hoje</span>
          </Button>
          <Button
            variant="orange"
            size="sm"
            onClick={() => {
              setEditingEvent(null);
              setError(null);
              setShowModal(true);
            }}
          >
            <Plus size={14} />
            <span className="hidden sm:inline">Novo agendamento</span>
            <span className="sm:hidden">Novo</span>
          </Button>
        </div>
      </header>

      <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
        <CalendarMonthGrid
          viewYear={viewYear}
          viewMonth={viewMonth}
          selectedDay={selected}
          today={today}
          eventsByDay={eventsByDay}
          onSelectDay={setSelected}
          onNavMonth={navMonth}
        />

        <DayEventsPanel
          selectedDay={selected}
          viewMonth={viewMonth}
          dayEvents={dayEvents}
          deleteConfirm={deleteConfirm}
          onNewEvent={() => {
            setEditingEvent(null);
            setError(null);
            setShowModal(true);
          }}
          onEditEvent={(ev) => {
            setEditingEvent(ev);
            setError(null);
            setShowModal(true);
          }}
          onDeleteEvent={handleDelete}
          onCancelDelete={() => setDeleteConfirm(null)}
        />
      </div>

      <EventFormModal
        open={showModal}
        editingEvent={editingEvent}
        leads={leads}
        viewYear={viewYear}
        viewMonth={viewMonth}
        selectedDay={selected}
        isPending={isPending}
        error={error}
        onClose={() => setShowModal(false)}
        onSubmit={handleSubmit}
      />
    </div>
  );
}
