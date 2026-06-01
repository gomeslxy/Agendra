"use client";

import { memo, useMemo, useState, useTransition, useEffect, useRef, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { CalendarCheck, ChevronDown, ChevronLeft, Paperclip, Send, Zap, Sparkles, Check, Trash, X, FileText, Search, MessageCircle, Instagram, Clock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ChatBubble } from "@/components/app/chat-bubble";
import { EmptyState } from "@/components/ui/empty-state";
import { HEAT_GRADIENT, HEAT_LABEL } from "@/lib/constants";
import { cn } from "@/lib/utils";
import type { Lead, Message } from "@/lib/types/database";
import type { LeadWithMessages } from "./page";
import { sendNote, takeOverLead, setConversationTone, setControlMode, approveDraftMessage, deleteDraftMessage, editAndSendDraft, sendFileAttachment, fetchOlderMessages } from "./actions";
import { toast } from "sonner";
import { DateSeparator } from "@/components/app/date-separator";
import { createBrowserClient } from "@supabase/ssr";
import { trackEvent } from "@/lib/analytics";

const browserSupabase = createBrowserClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
);

const TONE_CYCLE: Array<"cold" | "warm" | "hot"> = ["cold", "warm", "hot"];
const TONE_LABEL: Record<string, string> = { cold: "Formal", warm: "Amigável", hot: "Persuasivo" };
const CONTROL_MODES: Array<"autonomous" | "shadow" | "manual"> = ["autonomous", "shadow", "manual"];
const CONTROL_LABEL: Record<string, string> = {
  autonomous: "Autônomo",
  shadow: "Copiloto (Shadow)",
  manual: "Manual",
};

function initials(name: string) {
  return name.split(" ").slice(0, 2).map((w) => w[0]).join("").toUpperCase();
}

function relativeTime(dateStr: string) {
  const diff = Date.now() - new Date(dateStr).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return "agora";
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  const d = Math.floor(h / 24);
  if (d === 1) return "ontem";
  if (d < 7) return `${d}d`;
  return new Date(dateStr).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
}

type PendingMessage = Message & { _pending?: true };

function activityLabel(lead: LeadWithMessages): { dot: string; text: string } {
  const ts = (lead as any).last_message_at ?? lastMsg(lead)?.created_at;
  if (!ts) return { dot: "bg-[#D4D4D8]", text: lead.channel };
  const diffMin = Math.floor((Date.now() - new Date(ts).getTime()) / 60000);
  if (diffMin < 5) return { dot: "bg-[#22C55E] animate-pulse", text: `Ativo agora · ${lead.channel}` };
  if (diffMin < 60) return { dot: "bg-[#F59E0B]", text: `Ativo há ${diffMin}m · ${lead.channel}` };
  const diffH = Math.floor(diffMin / 60);
  if (diffH < 24) return { dot: "bg-[#D4D4D8]", text: `Ativo há ${diffH}h · ${lead.channel}` };
  return { dot: "bg-[#D4D4D8]", text: lead.channel };
}

function lastMsg(lead: LeadWithMessages) {
  const msgs = lead.messages;
  return msgs.length > 0 ? msgs[msgs.length - 1] : undefined;
}

// ─── Module-level components ───

interface ToneDropdownProps {
  selected: LeadWithMessages;
  toneOpen: boolean;
  setToneOpen: (v: boolean) => void;
  tonePending: boolean;
  onToneChange: (tone: "cold" | "warm" | "hot") => void;
  compact?: boolean;
}

function ToneDropdown({ selected, toneOpen, setToneOpen, tonePending, onToneChange, compact = false }: ToneDropdownProps) {
  return (
    <div className="relative">
      <button
        onClick={(e) => { e.stopPropagation(); setToneOpen(!toneOpen); }}
        disabled={tonePending}
        className={cn(
          "flex items-center justify-between gap-1.5 rounded-lg border border-[#E4E4E7] bg-white px-2.5 py-1.5 text-[10px] font-bold uppercase tracking-wide transition-all duration-150 hover:bg-[#F4F4F5] disabled:opacity-50 cursor-pointer",
          toneOpen && "bg-[#F4F4F5]",
          compact ? "h-7 px-2" : "w-full"
        )}
      >
        <div className="flex items-center gap-1.5">
          <span className={cn(
            "h-1.5 w-1.5 rounded-full",
            selected.conversation_tone === "hot" ? "bg-[#F97316]" :
            selected.conversation_tone === "warm" ? "bg-[#F59E0B]" : "bg-[#3B82F6]"
          )} />
          <span className={cn(
            "text-[9px] sm:text-[10px]",
            selected.conversation_tone === "hot" ? "text-[#EA580C]" :
            selected.conversation_tone === "warm" ? "text-[#854D0E]" : "text-[#1D4ED8]"
          )}>
            {TONE_LABEL[selected.conversation_tone ?? "warm"]}
          </span>
        </div>
        <ChevronDown size={11} className={cn("text-[#A1A1AA] transition-transform duration-200", toneOpen && "rotate-180")} />
      </button>
      <AnimatePresence>
        {toneOpen && (
          <>
            <div className="fixed inset-0 z-[100]" onClick={() => setToneOpen(false)} />
            <motion.div
              initial={{ opacity: 0, y: -4, scale: 0.97 }}
              animate={{ opacity: 1, y: 4, scale: 1 }}
              exit={{ opacity: 0, y: -4, scale: 0.97 }}
              className={cn(
                "absolute z-[101] overflow-hidden rounded-xl border border-[#E4E4E7] bg-white p-1 shadow-[0_8px_24px_rgba(0,0,0,0.10)]",
                compact ? "right-0 top-full mt-1 w-36" : "left-0 top-full w-full"
              )}
            >
              {TONE_CYCLE.map((t) => (
                <button
                  key={t}
                  onClick={() => { onToneChange(t); setToneOpen(false); }}
                  className={cn(
                    "flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-[10px] font-bold uppercase tracking-wide transition-colors cursor-pointer",
                    selected.conversation_tone === t ? "bg-[#EFF6FF] text-[#1D4ED8]" : "text-[#71717A] hover:bg-[#F4F4F5] hover:text-[#3F3F46]"
                  )}
                >
                  <span className={cn(
                    "h-1.5 w-1.5 rounded-full",
                    t === "hot" ? "bg-[#F97316]" : t === "warm" ? "bg-[#F59E0B]" : "bg-[#3B82F6]"
                  )} />
                  {TONE_LABEL[t]}
                </button>
              ))}
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}

interface ControlModeDropdownProps {
  selected: LeadWithMessages;
  controlOpen: boolean;
  setControlOpen: (v: boolean) => void;
  controlPending: boolean;
  onControlModeChange: (mode: "autonomous" | "shadow" | "manual") => void;
  compact?: boolean;
}

function ControlModeDropdown({ selected, controlOpen, setControlOpen, controlPending, onControlModeChange, compact = false }: ControlModeDropdownProps) {
  const currentMode = selected.control_mode ?? (selected.is_paused ? "manual" : "autonomous");
  return (
    <div className="relative">
      <button
        onClick={(e) => { e.stopPropagation(); setControlOpen(!controlOpen); }}
        disabled={controlPending}
        className={cn(
          "flex items-center justify-between gap-1.5 rounded-lg border border-[#E4E4E7] bg-white px-2.5 py-1.5 text-[10px] font-bold uppercase tracking-wide transition-all duration-150 hover:bg-[#F4F4F5] disabled:opacity-50 cursor-pointer",
          controlOpen && "bg-[#F4F4F5]",
          compact ? "h-7 px-2" : "w-full"
        )}
      >
        <div className="flex items-center gap-1.5">
          <span className={cn(
            "h-1.5 w-1.5 rounded-full",
            currentMode === "autonomous" ? "bg-[#22C55E]" :
            currentMode === "shadow" ? "bg-[#3B82F6]" : "bg-[#D4D4D8]"
          )} />
          <span className={cn(
            "text-[9px] sm:text-[10px]",
            currentMode === "autonomous" ? "text-[#166534]" :
            currentMode === "shadow" ? "text-[#1D4ED8]" : "text-[#71717A]"
          )}>
            {CONTROL_LABEL[currentMode]}
          </span>
        </div>
        <ChevronDown size={11} className={cn("text-[#A1A1AA] transition-transform duration-200", controlOpen && "rotate-180")} />
      </button>
      <AnimatePresence>
        {controlOpen && (
          <>
            <div className="fixed inset-0 z-[100]" onClick={() => setControlOpen(false)} />
            <motion.div
              initial={{ opacity: 0, y: -4, scale: 0.97 }}
              animate={{ opacity: 1, y: 4, scale: 1 }}
              exit={{ opacity: 0, y: -4, scale: 0.97 }}
              className={cn(
                "absolute z-[101] overflow-hidden rounded-xl border border-[#E4E4E7] bg-white p-1 shadow-[0_8px_24px_rgba(0,0,0,0.10)]",
                compact ? "right-0 top-full mt-1 w-44" : "left-0 top-full w-full"
              )}
            >
              {CONTROL_MODES.map((m) => (
                <button
                  key={m}
                  onClick={() => { onControlModeChange(m); setControlOpen(false); }}
                  className={cn(
                    "flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-[10px] font-bold uppercase tracking-wide transition-colors text-left cursor-pointer",
                    currentMode === m ? "bg-[#EFF6FF] text-[#1D4ED8]" : "text-[#71717A] hover:bg-[#F4F4F5] hover:text-[#3F3F46]"
                  )}
                >
                  <span className={cn(
                    "h-1.5 w-1.5 rounded-full",
                    m === "autonomous" ? "bg-[#22C55E]" : m === "shadow" ? "bg-[#3B82F6]" : "bg-[#D4D4D8]"
                  )} />
                  <div className="flex flex-col">
                    <span>{CONTROL_LABEL[m]}</span>
                    <span className="text-[8px] font-medium text-[#71717A] tracking-normal normal-case">
                      {m === "autonomous" ? "IA responde automaticamente" :
                       m === "shadow" ? "Gera rascunhos para aprovar" : "IA desativada para este lead"}
                    </span>
                  </div>
                </button>
              ))}
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}

// ─── LeadListItem ───

interface LeadListItemProps {
  lead: LeadWithMessages;
  isActive: boolean;
  unreadCount: number;
  onSelect: (id: string) => void;
}

const LeadListItem = memo(function LeadListItem({ lead: l, isActive, unreadCount, onSelect }: LeadListItemProps) {
  const last = lastMsg(l);
  return (
    <div
      onClick={() => onSelect(l.id)}
      className={cn(
        "group relative flex cursor-pointer items-center gap-4 border-b border-[#F4F4F5] px-5 py-3.5 transition-colors duration-150 select-none hover:bg-[#F4F4F5]",
        isActive && "bg-[#EFF6FF] border-b-[#DBEAFE] hover:bg-[#EFF6FF]"
      )}
    >
      {isActive && (
        <div className="absolute inset-y-2 left-0 w-[2px] rounded-r-full bg-[#2563EB]" />
      )}
      <div className="relative grid h-11 w-11 shrink-0 place-items-center rounded-full bg-[#F4F4F5] border border-[#E4E4E7] text-[10px] font-bold text-[#3F3F46]">
        {initials(l.name)}
        <div className={cn(
          "absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-white transition-all",
          l.status === "hot" ? "bg-[#F97316]" :
          l.status === "warm" ? "bg-[#F59E0B]" :
          l.status === "success" ? "bg-[#22C55E]" : "bg-[#3B82F6]"
        )} />
        {unreadCount > 0 && (
          <span className="absolute -top-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full bg-[#2563EB] border-2 border-white text-[8px] font-black text-white leading-none">
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        )}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-1.5 min-w-0">
            <span className="truncate text-[13px] font-semibold text-[#09090B]">{l.name}</span>
            {l.channel === "whatsapp" && <MessageCircle size={11} className="text-[#14B8A6] shrink-0" />}
            {l.channel === "instagram" && <Instagram size={11} className="text-pink-400 shrink-0" />}
          </div>
          <span className="font-mono text-[9px] font-medium text-[#71717A] whitespace-nowrap" suppressHydrationWarning>
            {last ? relativeTime(last.created_at) : "—"}
          </span>
        </div>
        <div className="mt-0.5 flex items-center gap-1.5 min-w-0">
          {last && (last.metadata as any)?.is_draft && (
            <span className="shrink-0 text-[8px] font-bold uppercase tracking-wide text-[#1D4ED8] bg-[#EFF6FF] border border-[#BFDBFE] rounded px-1 py-0.5">
              Rascunho
            </span>
          )}
          <span className={cn(
            "truncate text-[11px] transition-colors",
            isActive ? "text-[#71717A]" : "text-[#71717A]"
          )}>
            {last?.content ?? "Nenhuma mensagem"}
          </span>
        </div>
      </div>
    </div>
  );
});

export function InboxClient({ leads: initialLeads, companyId, fetchError }: { leads: LeadWithMessages[]; companyId: string | null; fetchError?: string | null }) {
  const [leads, setLeads] = useState<LeadWithMessages[]>(initialLeads);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [selectedId, setSelectedId] = useState<string | null>(initialLeads[0]?.id ?? null);
  const [showChatOnMobile, setShowChatOnMobile] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [noteText, setNoteText] = useState("");
  const [sendPending, startSend] = useTransition();

  useEffect(() => {
    setMounted(true);
  }, []);
  const [takePending, startTake] = useTransition();
  const [tonePending, startTone] = useTransition();
  const [toneOpen, setToneOpen] = useState(false);
  const [controlPending, startControl] = useTransition();
  const [controlOpen, setControlOpen] = useState(false);
  const [draftPending, startDraft] = useTransition();
  const [editingDraftId, setEditingDraftId] = useState<string | null>(null);
  const [editDraftText, setEditDraftText] = useState("");
  useEffect(() => {
    if (fetchError) toast.error(`Erro ao carregar inbox: ${fetchError}`);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const [isConnected, setIsConnected] = useState<boolean | null>(null);
  const [attachedFile, setAttachedFile] = useState<File | null>(null);
  const [attachPreview, setAttachPreview] = useState<string | null>(null);
  const [unreadCounts, setUnreadCounts] = useState<Map<string, number>>(new Map());
  const chatBottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [loadingMoreFor, setLoadingMoreFor] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState<Map<string, boolean>>(() => {
    const m = new Map<string, boolean>();
    initialLeads.forEach((l) => { if (l.messages.length >= 50) m.set(l.id, true); });
    return m;
  });
  const selectedIdRef = useRef<string | null>(selectedId);
  useEffect(() => { selectedIdRef.current = selectedId; }, [selectedId]);


  const handleLeadSelect = useCallback((id: string) => {
    setSelectedId(id);
    setShowChatOnMobile(true);
    setEditingDraftId(null);
    setEditDraftText("");
    setUnreadCounts((prev) => {
      if (!prev.has(id)) return prev;
      const next = new Map(prev);
      next.delete(id);
      return next;
    });
  }, []);

  const selectedMessageCount = useMemo(
    () => leads.find((l) => l.id === selectedId)?.messages.length ?? 0,
    [leads, selectedId],
  );

  useEffect(() => {
    chatBottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [selectedMessageCount, showChatOnMobile]);


  useEffect(() => {
    if (!companyId) return;

    const supabase = browserSupabase;
    const companyFilter = `company_id=eq.${companyId}`;

    const fetchLeadById = async (leadId: string): Promise<LeadWithMessages | null> => {
      const { data, error } = await supabase
        .from("leads")
        .select(`*, messages(id, lead_id, company_id, content, role, metadata, created_at)`)
        .eq("id", leadId)
        .eq("company_id", companyId)
        .maybeSingle();
      if (error || !data) {
        console.warn("[Inbox] failed to fetch unknown lead", leadId, error?.message);
        return null;
      }
      const messages = ((data.messages ?? []) as Message[])
        .slice()
        .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
      return { ...(data as Lead), messages, next_event: null };
    };

    const realtimeSort = (arr: LeadWithMessages[]) =>
      arr.slice().sort((a, b) => {
        const aTs = (a as any).last_message_at ?? lastMsg(a)?.created_at ?? a.updated_at;
        const bTs = (b as any).last_message_at ?? lastMsg(b)?.created_at ?? b.updated_at;
        return new Date(bTs).getTime() - new Date(aTs).getTime();
      });

    // Defer realtime subscription past the initial paint/hydration cycle.
    let channel: ReturnType<typeof supabase.channel> | null = null;
    const subscribeTimer = setTimeout(() => {
    channel = supabase
      .channel(`inbox-realtime-${companyId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "messages", filter: companyFilter },
        (payload) => {
          const newMsg = payload.new as Message;

          if (newMsg.role === "user" && newMsg.lead_id !== selectedIdRef.current) {
            setUnreadCounts((prev) => {
              const next = new Map(prev);
              next.set(newMsg.lead_id, (next.get(newMsg.lead_id) ?? 0) + 1);
              return next;
            });
          }

          setLeads((prev) => {
            const leadExists = prev.some((l) => l.id === newMsg.lead_id);
            if (!leadExists) {
              console.warn(`[Inbox] message ${newMsg.id} for unknown lead ${newMsg.lead_id} — fetching lead`);
              void fetchLeadById(newMsg.lead_id).then((lead) => {
                if (!lead) return;
                setLeads((p) => {
                  if (p.some((l) => l.id === lead.id)) {
                    return realtimeSort(p.map((l) =>
                      l.id === lead.id && !l.messages.some((m) => m.id === newMsg.id)
                        ? { ...l, messages: [...l.messages, newMsg] }
                        : l,
                    ));
                  }
                  return realtimeSort([{ ...lead, messages: [newMsg] }, ...p]);
                });
              });
              return prev;
            }
            const next = prev.map((lead) => {
              if (lead.id !== newMsg.lead_id) return lead;
              if (lead.messages.some((m) => m.id === newMsg.id)) return lead;
              // Deduplicate: remove pending temp messages with same content
              const withoutPending = lead.messages.filter((m) => {
                const pm = m as PendingMessage;
                if (!pm._pending) return true;
                const contentMatch = pm.content === newMsg.content;
                const timeClose = Math.abs(new Date(pm.created_at).getTime() - new Date(newMsg.created_at).getTime()) < 30000;
                return !(contentMatch && timeClose);
              });
              return { ...lead, messages: [...withoutPending, newMsg] };
            });
            return realtimeSort(next);
          });
        },
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "leads", filter: companyFilter },
        (payload) => {
          const updatedLead = payload.new as Lead;
          setLeads((prev) =>
            realtimeSort(prev.map((lead) =>
              lead.id === updatedLead.id
                ? { ...lead, ...updatedLead, messages: lead.messages }
                : lead,
            ))
          );
        },
      )
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "leads", filter: companyFilter },
        (payload) => {
          const newLead = payload.new as Lead;
          setLeads((prev) => {
            if (prev.some((l) => l.id === newLead.id)) return prev;
            return realtimeSort([{ ...newLead, messages: [] }, ...prev]);
          });
        },
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "messages", filter: companyFilter },
        (payload) => {
          const updatedMsg = payload.new as Message;
          setLeads((prev) =>
            prev.map((lead) => {
              if (lead.id !== updatedMsg.lead_id) return lead;
              return {
                ...lead,
                messages: lead.messages.map((m) =>
                  m.id === updatedMsg.id ? updatedMsg : m
                ),
              };
            })
          );
        },
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "events", filter: companyFilter },
        (payload) => {
          if (payload.eventType === "INSERT" || payload.eventType === "UPDATE") {
            const newEvent = payload.new as any;
            if (!newEvent.lead_id) return;
            const isFuture = new Date(newEvent.start_time).getTime() >= Date.now();
            setLeads((prev) =>
              prev.map((lead) => {
                if (lead.id !== newEvent.lead_id) return lead;
                if (isFuture) {
                  if (
                    !lead.next_event ||
                    lead.next_event.id === newEvent.id ||
                    new Date(newEvent.start_time).getTime() < new Date(lead.next_event.start_time).getTime()
                  ) {
                    return { ...lead, next_event: { id: newEvent.id, title: newEvent.title, start_time: newEvent.start_time, end_time: newEvent.end_time } };
                  }
                } else if (lead.next_event?.id === newEvent.id) {
                  return { ...lead, next_event: null };
                }
                return lead;
              })
            );
          } else if (payload.eventType === "DELETE") {
            const oldId = (payload.old as { id?: string })?.id;
            if (!oldId) return;
            setLeads((prev) =>
              prev.map((lead) =>
                lead.next_event?.id === oldId ? { ...lead, next_event: null } : lead
              )
            );
          }
        }
      )
      .on(
        "postgres_changes",
        { event: "DELETE", schema: "public", table: "messages", filter: companyFilter },
        (payload) => {
          const deletedId = (payload.old as { id?: string })?.id;
          if (!deletedId) return;
          setLeads((prev) =>
            prev.map((lead) => ({
              ...lead,
              messages: lead.messages.filter((m) => m.id !== deletedId),
            }))
          );
        },
      )
      .subscribe((status) => {
        setIsConnected(status === "SUBSCRIBED" ? true : status === "CHANNEL_ERROR" || status === "TIMED_OUT" || status === "CLOSED" ? false : null);
      });
    }, 200);

    return () => {
      clearTimeout(subscribeTimer);
      if (channel) supabase.removeChannel(channel);
    };
  }, [companyId]);

  const [channelFilter, setChannelFilter] = useState<string>("all");

  const selected = useMemo(
    () => leads.find((l) => l.id === selectedId) ?? null,
    [leads, selectedId],
  );

  const normalizedSearch = useMemo(() => searchQuery.toLowerCase(), [searchQuery]);

  const filteredLeads = useMemo(() => {
    return leads.filter((l) => {
      const matchSearch = !normalizedSearch ||
        l.name.toLowerCase().includes(normalizedSearch) ||
        l.phone.includes(normalizedSearch);
      const matchStatus = statusFilter === 'all' || l.status === statusFilter;
      const matchChannel = channelFilter === 'all' || l.channel === channelFilter;
      return matchSearch && matchStatus && matchChannel;
    });
  }, [leads, normalizedSearch, statusFilter, channelFilter]);

  useEffect(() => {
    if (!sendPending && !takePending && selected) {
      inputRef.current?.focus();
    }
  }, [sendPending, takePending, selected?.id]);

  type GroupedItem =
    | { type: "separator"; date: string; key: string }
    | { type: "message"; key: string; isFirst: boolean; isLast: boolean; hideLabel: boolean; hideTime: boolean } & Message & { _pending?: true };

  const groupedMessages = useMemo((): GroupedItem[] => {
    const msgs = selected?.messages ?? [];
    const result: GroupedItem[] = [];
    const GAP_LIMIT = 5 * 60 * 1000;

    msgs.forEach((msg, i) => {
      const prev = msgs[i - 1];
      const next = msgs[i + 1];

      // Date separator when day changes
      const msgDay = new Date(msg.created_at).toDateString();
      const prevDay = prev ? new Date(prev.created_at).toDateString() : null;
      if (!prevDay || msgDay !== prevDay) {
        result.push({ type: "separator", date: msg.created_at, key: `sep-${msg.created_at}` });
      }

      const isNote = msg.role === "note";
      const prevIsSame = prev && prev.role === msg.role && !isNote;
      const nextIsSame = next && next.role === msg.role && !isNote;
      const timeGapPrev = prev ? (new Date(msg.created_at).getTime() - new Date(prev.created_at).getTime()) : 0;
      const timeGapNext = next ? (new Date(next.created_at).getTime() - new Date(msg.created_at).getTime()) : 0;
      const isFirst = !prevIsSame || timeGapPrev > GAP_LIMIT;
      const isLast = !nextIsSame || timeGapNext > GAP_LIMIT;

      result.push({ type: "message", key: msg.id, ...msg, isFirst, isLast, hideLabel: !isFirst, hideTime: !isLast } as GroupedItem);
    });

    return result;
  }, [selected?.messages]);

  const handleLoadMore = useCallback(async () => {
    if (!selected || loadingMoreFor) return;
    const oldest = selected.messages[0];
    if (!oldest) return;

    setLoadingMoreFor(selected.id);
    try {
      const older = await fetchOlderMessages(selected.id, oldest.created_at);
      if (older.length === 0) {
        setHasMore((prev) => { const next = new Map(prev); next.set(selected.id, false); return next; });
        return;
      }
      setLeads((prev) =>
        prev.map((l) =>
          l.id === selected.id ? { ...l, messages: [...older, ...l.messages] } : l
        )
      );
      if (older.length < 30) {
        setHasMore((prev) => { const next = new Map(prev); next.set(selected.id, false); return next; });
      }
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setLoadingMoreFor(null);
    }
  }, [selected, loadingMoreFor]);

  const clearAttachment = useCallback(() => {
    if (attachPreview) URL.revokeObjectURL(attachPreview);
    setAttachedFile(null);
    setAttachPreview(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  }, [attachPreview]);

  const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 16 * 1024 * 1024) { toast.error('Arquivo muito grande (máx 16 MB)'); return; }
    setAttachedFile(file);
    if (file.type.startsWith('image/')) setAttachPreview(URL.createObjectURL(file));
    else setAttachPreview(null);
  }, []);

  const handleSend = useCallback(() => {
    if (!selected) return;

    if (attachedFile) {
      const file = attachedFile;
      const caption = noteText.trim();
      clearAttachment();
      setNoteText('');
      startSend(async () => {
        try {
          const form = new FormData();
          form.append('file', file);
          if (caption) form.append('caption', caption);
          const result = await sendFileAttachment(selected.id, form);
          if (!result.success) toast.error(result.error ?? 'Erro ao enviar arquivo');
        } catch (e) {
          toast.error((e as Error).message);
        }
      });
      return;
    }

    if (!noteText.trim()) return;
    const content = noteText.trim();
    setNoteText("");

    const tempId = crypto.randomUUID();
    const tempMsg: PendingMessage = {
      id: tempId,
      lead_id: selected.id,
      company_id: selected.company_id,
      content,
      role: "agent",
      created_at: new Date().toISOString(),
      _pending: true,
    };

    setLeads((prev) =>
      prev.map((l) =>
        l.id === selected.id ? { ...l, messages: [...l.messages, tempMsg] } : l
      )
    );

    startSend(async () => {
      try {
        const result = await sendNote(selected.id, content);
        if (result?.success) {
          trackEvent("message_sent", { lead_id: selected.id });
          // Safety: remove temp after 15s if realtime dedup didn't fire
          setTimeout(() => {
            setLeads((prev) =>
              prev.map((l) =>
                l.id === selected.id
                  ? { ...l, messages: l.messages.filter((m) => m.id !== tempId) }
                  : l
              )
            );
          }, 15000);
        } else if (result?.error) {
          toast.error(result.error);
          setNoteText(content);
          setLeads((prev) =>
            prev.map((l) =>
              l.id === selected.id
                ? { ...l, messages: l.messages.filter((m) => m.id !== tempId) }
                : l
            )
          );
        }
      } catch (e) {
        toast.error((e as Error).message);
        setNoteText(content);
        setLeads((prev) =>
          prev.map((l) =>
            l.id === selected.id
              ? { ...l, messages: l.messages.filter((m) => m.id !== tempId) }
              : l
          )
        );
      }
    });
  }, [selected, noteText, attachedFile, clearAttachment]);

  const handleTakeOver = useCallback(() => {
    if (!selected) return;

    const tempId = crypto.randomUUID();
    const tempNote: Message = {
      id: tempId,
      lead_id: selected.id,
      company_id: selected.company_id,
      content: "Você assumiu o atendimento.",
      role: "note",
      created_at: new Date().toISOString(),
    };

    setLeads((prev) =>
      prev.map((l) => (l.id === selected.id ? { ...l, is_paused: true, messages: [...l.messages, tempNote] } : l)),
    );

    startTake(async () => {
      try {
        await takeOverLead(selected.id);
        trackEvent("lead_takeover", { lead_id: selected.id });
      } catch (e) {
        setLeads((prev) =>
          prev.map((l) => (l.id === selected.id ? { ...l, is_paused: false } : l)),
        );
        toast.error((e as Error).message);
      } finally {
        setLeads((prev) =>
          prev.map((l) =>
            l.id === selected.id
              ? { ...l, messages: l.messages.filter((m) => m.id !== tempId) }
              : l
          )
        );
      }
    });
  }, [selected]);


  const handleToneChange = useCallback((tone: "cold" | "warm" | "hot") => {
    if (!selected || selected.conversation_tone === tone) return;
    const current = selected.conversation_tone ?? "warm";
    setLeads((prev) =>
      prev.map((l) => (l.id === selected.id ? { ...l, conversation_tone: tone } : l)),
    );
    startTone(async () => {
      try {
        await setConversationTone(selected.id, tone);
        trackEvent("tone_changed", { lead_id: selected.id, tone });
      } catch (e) {
        setLeads((prev) =>
          prev.map((l) => (l.id === selected.id ? { ...l, conversation_tone: current } : l)),
        );
        toast.error((e as Error).message);
      }
    });
  }, [selected]);

  const handleControlModeChange = useCallback((mode: "autonomous" | "shadow" | "manual") => {
    if (!selected) return;
    const current = selected.control_mode ?? (selected.is_paused ? "manual" : "autonomous");
    if (current === mode) return;

    setLeads((prev) =>
      prev.map((l) => (l.id === selected.id ? { ...l, control_mode: mode, is_paused: mode === 'manual' } : l)),
    );

    startControl(async () => {
      try {
        await setControlMode(selected.id, mode);
        trackEvent("control_mode_changed", { lead_id: selected.id, mode });
      } catch (e) {
        setLeads((prev) =>
          prev.map((l) => (l.id === selected.id ? { ...l, control_mode: current, is_paused: current === 'manual' } : l)),
        );
        toast.error((e as Error).message);
      }
    });
  }, [selected]);

  const handleApproveDraft = useCallback((messageId: string) => {
    if (!selectedId) return;


    // Optimistic update: remove is_draft from message metadata
    setLeads((prev) =>
      prev.map((l) => {
        if (l.id !== selectedId) return l;
        return {
          ...l,
          messages: l.messages.map((m) => {
            if (m.id !== messageId) return m;
            const newMeta = m.metadata ? { ...m.metadata as any } : {};
            delete newMeta.is_draft;
            return { ...m, metadata: newMeta };
          }),
        };
      })
    );

    startDraft(async () => {
      try {
        const result = await approveDraftMessage(messageId);
        if (!result?.success) {
          // Revert optimistic
          setLeads((prev) =>
            prev.map((l) => {
              if (l.id !== selectedId) return l;
              return {
                ...l,
                messages: l.messages.map((m) => {
                  if (m.id !== messageId) return m;
                  return { ...m, metadata: { ...(m.metadata as any), is_draft: true } };
                }),
              };
            })
          );
        }
      } catch (e) {
        toast.error((e as Error).message);
        // Revert optimistic
        setLeads((prev) =>
          prev.map((l) => {
            if (l.id !== selectedId) return l;
            return {
              ...l,
              messages: l.messages.map((m) => {
                if (m.id !== messageId) return m;
                return { ...m, metadata: { ...(m.metadata as any), is_draft: true } };
              }),
            };
          })
        );
      }
    });
  }, [selectedId]);

  const handleEditAndSendDraft = useCallback((messageId: string, text: string) => {
    if (!selectedId || !text.trim()) return;

    setEditingDraftId(null);

    // Save original content for potential rollback
    let originalContent = "";
    let originalMetadata: any = null;

    setLeads((prev) =>
      prev.map((l) => {
        if (l.id !== selectedId) return l;
        return {
          ...l,
          messages: l.messages.map((m) => {
            if (m.id !== messageId) return m;
            originalContent = m.content;
            originalMetadata = m.metadata;
            const newMeta = m.metadata ? { ...m.metadata as any } : {};
            delete newMeta.is_draft;
            return { ...m, content: text.trim(), metadata: newMeta };
          }),
        };
      })
    );

    startDraft(async () => {
      try {
        const result = await editAndSendDraft(messageId, text);
        if (!result?.success) {
          // Rollback
          setLeads((prev) =>
            prev.map((l) => {
              if (l.id !== selectedId) return l;
              return {
                ...l,
                messages: l.messages.map((m) => {
                  if (m.id !== messageId) return m;
                  return { ...m, content: originalContent, metadata: originalMetadata };
                }),
              };
            })
          );
        }
      } catch (e) {
        toast.error((e as Error).message);
        // Rollback
        setLeads((prev) =>
          prev.map((l) => {
            if (l.id !== selectedId) return l;
            return {
              ...l,
              messages: l.messages.map((m) => {
                if (m.id !== messageId) return m;
                return { ...m, content: originalContent, metadata: originalMetadata };
              }),
            };
          })
        );
      }
    });
  }, [selectedId]);

  const handleDeleteDraft = useCallback((messageId: string) => {
    if (!selectedId) return;


    // Save original messages for rollback
    const originalMessages = leads.find((l) => l.id === selectedId)?.messages ?? [];

    setLeads((prev) =>
      prev.map((l) =>
        l.id === selectedId
          ? { ...l, messages: l.messages.filter((m) => m.id !== messageId) }
          : l
      )
    );

    startDraft(async () => {
      try {
        const result = await deleteDraftMessage(messageId);
        if (!result?.success) {
          // Rollback
          setLeads((prev) =>
            prev.map((l) =>
              l.id === selectedId ? { ...l, messages: originalMessages } : l
            )
          );
        }
      } catch (e) {
        toast.error((e as Error).message);
        // Rollback
        setLeads((prev) =>
          prev.map((l) =>
            l.id === selectedId ? { ...l, messages: originalMessages } : l
          )
        );
      }
    });
  }, [selectedId, leads]);

  const sortedMessages = selected ? selected.messages : [];
  const currentMode = selected ? (selected.control_mode ?? (selected.is_paused ? "manual" : "autonomous")) : "autonomous";
  const isAutonomous = mounted && currentMode === "autonomous";
  const inputBlocked = isAutonomous || sendPending;

  return (
    <div className="flex h-full min-h-0 w-full overflow-hidden">
      {/* COL 1 — list */}
      <section className={cn(
        "flex flex-col border-r border-[#E4E4E7] bg-white transition-all duration-300 lg:w-[320px] lg:flex-shrink-0",
        showChatOnMobile ? "hidden lg:flex" : "flex w-full"
      )}>
        <div className="px-5 pb-3 pt-5 shrink-0">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-black tracking-tight text-[#09090B]">Inbox</h2>
            <div className="flex items-center gap-2">
              <div className={cn(
                "flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[10px] font-bold transition-all duration-500",
                isConnected === true
                  ? "bg-[#F0FDFA] text-[#0F766E] border border-[#CCFBF1]"
                  : isConnected === false
                  ? "bg-[#FFF1F2] text-[#DC2626] border border-[#FECACA]"
                  : "bg-[#F4F4F5] text-[#71717A] border border-[#E4E4E7]"
              )}>
                <span className={cn(
                  "h-1.5 w-1.5 rounded-full transition-all duration-500",
                  isConnected === true ? "bg-[#14B8A6] animate-pulse" : isConnected === false ? "bg-[#DC2626]" : "bg-[#D4D4D8]"
                )} />
                {isConnected === true ? "LIVE" : isConnected === false ? "OFFLINE" : "···"}
              </div>
            </div>
          </div>
          <div className="mt-4 flex flex-col gap-3 px-1">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-[#71717A]" size={14} />
              <input
                type="text"
                placeholder="Buscar por nome ou telefone..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full rounded-lg border border-[#E4E4E7] bg-[#F4F4F5] pl-9 pr-3 py-2 text-[13px] text-[#09090B] placeholder:text-[#A1A1AA] focus:border-[#2563EB] focus:outline-none focus:ring-2 focus:ring-[#2563EB]/10 transition-all"
              />
            </div>
            <div className="flex gap-3 overflow-x-auto no-scrollbar pb-1 border-b border-[#E4E4E7] scrollbar-none select-none">
              {['all', 'hot', 'warm', 'cold', 'success'].map((status) => (
                <button
                  key={status}
                  onClick={() => setStatusFilter(status)}
                  className={cn(
                    "relative pb-2 text-[10px] font-bold uppercase tracking-wider transition-colors duration-150 whitespace-nowrap cursor-pointer",
                    statusFilter === status ? "text-[#2563EB]" : "text-[#71717A] hover:text-[#3F3F46]"
                  )}
                >
                  {status === 'all' ? 'Todos' : status === 'hot' ? 'Quente' : status === 'warm' ? 'Morno' : status === 'cold' ? 'Frio' : 'Convertidos'}
                  {statusFilter === status && (
                    <motion.div
                      layoutId="active-filter-status"
                      className="absolute bottom-0 inset-x-0 h-[1.5px] bg-[#2563EB]"
                      transition={{ type: "spring", stiffness: 400, damping: 30 }}
                    />
                  )}
                </button>
              ))}
            </div>
            <div className="flex gap-3 overflow-x-auto no-scrollbar pb-1 scrollbar-none select-none">
              {['all', 'whatsapp', 'instagram'].map((chan) => (
                <button
                  key={chan}
                  onClick={() => setChannelFilter(chan)}
                  className={cn(
                    "relative pb-1.5 text-[10px] font-bold uppercase tracking-wider transition-colors duration-150 whitespace-nowrap flex items-center gap-1 cursor-pointer",
                    channelFilter === chan ? "text-[#09090B]" : "text-[#71717A] hover:text-[#3F3F46]"
                  )}
                >
                  {chan === 'whatsapp' && <MessageCircle size={10} className="text-[#14B8A6] shrink-0" />}
                  {chan === 'instagram' && <Instagram size={10} className="text-pink-400 shrink-0" />}
                  <span>{chan === 'all' ? 'Canais' : chan === 'whatsapp' ? 'WhatsApp' : 'Instagram'}</span>
                  {channelFilter === chan && (
                    <motion.div
                      layoutId="active-filter-channel"
                      className="absolute bottom-0 inset-x-0 h-[1px] bg-[#D4D4D8]"
                      transition={{ type: "spring", stiffness: 400, damping: 30 }}
                    />
                  )}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto overflow-x-hidden custom-scrollbar pb-[calc(72px+env(safe-area-inset-bottom,12px))] lg:pb-0">
          {filteredLeads.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-40 px-5 text-center gap-2">
              <div className="h-12 w-12 rounded-full bg-[#F4F4F5] flex items-center justify-center">
                <Zap size={20} className="text-[#D4D4D8]" />
              </div>
              <p className="text-xs font-medium text-[#A1A1AA]">Nenhum lead encontrado.</p>
            </div>
          ) : (
            <div className="flex flex-col">
              {filteredLeads.map((l) => (
                <LeadListItem
                  key={l.id}
                  lead={l}
                  isActive={l.id === selectedId}
                  unreadCount={unreadCounts.get(l.id) ?? 0}
                  onSelect={handleLeadSelect}
                />
              ))}
            </div>
          )}
        </div>
      </section>

      {/* COL 2 — chat (always in DOM; hidden via CSS on mobile when list is active) */}
      <section className={cn(
        "flex flex-col transition-all duration-300",
        !showChatOnMobile ? "hidden lg:flex lg:flex-1" : "flex w-full lg:flex-1"
      )}>
        {!selected ? (
          <div className="flex flex-1 flex-col items-center justify-center p-8">
            <EmptyState
              icon={Zap}
              title="Agendra Inbox"
              description="Selecione um lead na lista ao lado para iniciar a gestão de atendimento em tempo real e acompanhar a automação da inteligência artificial."
            />
          </div>
        ) : (
          <>
            {/* Chat Header */}
            <div className="flex items-center justify-between border-b border-[#E4E4E7] bg-white px-4 py-3 sm:px-6 z-10 shadow-[0_1px_4px_rgba(0,0,0,0.06)]">
              <div className="flex items-center gap-3 overflow-hidden">
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-9 w-9 rounded-full lg:hidden shrink-0 p-0"
                  onClick={() => setShowChatOnMobile(false)}
                >
                  <ChevronLeft size={20} />
                </Button>
                <div
                  className="relative grid h-10 w-10 shrink-0 place-items-center rounded-full text-xs font-black text-white shadow-lg"
                  style={{ background: HEAT_GRADIENT[selected.status] ?? HEAT_GRADIENT.cold }}
                >
                  {initials(selected.name)}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="truncate text-sm font-bold text-[#09090B]">{selected.name}</span>
                    {/* Mode badge next to lead name — always visible */}
                    <AnimatePresence mode="wait">
                      {isAutonomous ? (
                        <motion.span
                          key="autonomous"
                          initial={{ opacity: 0, scale: 0.85 }}
                          animate={{ opacity: 1, scale: 1 }}
                          exit={{ opacity: 0, scale: 0.85 }}
                          className="shrink-0 inline-flex items-center gap-1 rounded-full bg-[#F0FDF4] border border-[#86EFAC] px-2 py-0.5"
                        >
                          <span className="h-1.5 w-1.5 rounded-full bg-[#22C55E] animate-pulse" />
                          <span className="text-[9px] font-black uppercase tracking-wider text-[#166534]">IA Autônoma</span>
                        </motion.span>
                      ) : currentMode === 'shadow' ? (
                        <motion.span
                          key="shadow"
                          initial={{ opacity: 0, scale: 0.85 }}
                          animate={{ opacity: 1, scale: 1 }}
                          exit={{ opacity: 0, scale: 0.85 }}
                          className="shrink-0 inline-flex items-center gap-1 rounded-full bg-[#EFF6FF] border border-[#BFDBFE] px-2 py-0.5"
                        >
                          <Sparkles size={8} className="text-[#2563EB]" />
                          <span className="text-[9px] font-black uppercase tracking-wider text-[#1D4ED8]">Copiloto</span>
                        </motion.span>
                      ) : (
                        <motion.span
                          key="manual"
                          initial={{ opacity: 0, scale: 0.85 }}
                          animate={{ opacity: 1, scale: 1 }}
                          exit={{ opacity: 0, scale: 0.85 }}
                          className="shrink-0 inline-flex items-center gap-1 rounded-full bg-[#F4F4F5] border border-[#E4E4E7] px-2 py-0.5"
                        >
                          <span className="h-1.5 w-1.5 rounded-full bg-[#D4D4D8]" />
                          <span className="text-[9px] font-black uppercase tracking-wider text-[#71717A]">Manual</span>
                        </motion.span>
                      )}
                    </AnimatePresence>
                  </div>
                  {(() => {
                    const act = activityLabel(selected);
                    return (
                      <div className="flex items-center gap-1.5 truncate text-[10px] font-bold uppercase tracking-wider text-[#A1A1AA]">
                        <span className={cn("h-1.5 w-1.5 rounded-full shrink-0", act.dot)} />
                        {act.text}
                      </div>
                    );
                  })()}
                </div>
              </div>

              <div className="flex items-center gap-3 shrink-0">
                {/* Mode status — right of header, no mounted guard so always renders */}
                {currentMode === 'autonomous' && (
                  <div className="hidden sm:flex flex-col items-end gap-0.5" suppressHydrationWarning>
                    <div className="flex items-center gap-1.5">
                      <span className="h-1.5 w-1.5 rounded-full bg-[#22C55E] animate-pulse" />
                      <span className="text-[11px] font-bold text-[#166534]">IA Autônoma</span>
                    </div>
                    <span className="text-[9px] text-[#A1A1AA] font-medium">respondendo automaticamente</span>
                  </div>
                )}
                {currentMode === 'shadow' && (
                  <div className="hidden sm:flex flex-col items-end gap-0.5">
                    <div className="flex items-center gap-1.5">
                      <Sparkles size={10} className="text-[#2563EB]" />
                      <span className="text-[11px] font-bold text-[#1D4ED8]">Copiloto</span>
                    </div>
                    <span className="text-[9px] text-[#A1A1AA] font-medium">aprovando rascunhos</span>
                  </div>
                )}

                <div className="xl:hidden flex items-center gap-2">
                  <ControlModeDropdown
                    compact
                    selected={selected}
                    controlOpen={controlOpen}
                    setControlOpen={setControlOpen}
                    controlPending={controlPending}
                    onControlModeChange={handleControlModeChange}
                  />
                  <div className="hidden sm:block">
                    <ToneDropdown
                      compact
                      selected={selected}
                      toneOpen={toneOpen}
                      setToneOpen={setToneOpen}
                      tonePending={tonePending}
                      onToneChange={handleToneChange}
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* Messages Area */}
            <div className="flex-1 overflow-y-auto custom-scrollbar">
              <motion.div
                key={selected.id}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ duration: 0.12, ease: [0.22, 1, 0.36, 1] }}
                className="flex flex-col gap-3 p-4 sm:p-6 bg-[#F8F8F8] min-h-full"
              >
                {hasMore.get(selected.id) && (
                  <div className="flex justify-center pb-2">
                    <button
                      onClick={handleLoadMore}
                      disabled={loadingMoreFor === selected.id}
                      className="flex items-center gap-2 rounded-full border border-[#E4E4E7] bg-white px-4 py-1.5 text-[11px] font-semibold text-[#71717A] hover:bg-[#F4F4F5] transition-all disabled:opacity-50 cursor-pointer"
                    >
                      {loadingMoreFor === selected.id ? (
                        <Zap size={11} className="animate-spin text-[#2563EB]" />
                      ) : (
                        <ChevronLeft size={11} className="rotate-90" />
                      )}
                      {loadingMoreFor === selected.id ? "Carregando..." : "Carregar histórico"}
                    </button>
                  </div>
                )}

                {groupedMessages.map((item) => {
                  if (item.type === "separator") {
                    return <DateSeparator key={item.key} date={item.date} />;
                  }

                  const msg = item;
                  const isDraft = (msg.metadata as any)?.is_draft === true;
                  const isPending = !!(msg as PendingMessage)._pending;

                  if (isDraft) {
                    return (
                      <motion.div
                        key={msg.key}
                        initial={{ opacity: 0, y: 8, scale: 0.97 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        className="flex flex-col items-end gap-2 self-end max-w-[85%]"
                      >
                        <div className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-[#14B8A6]">
                          <Sparkles size={10} />
                          Rascunho da IA{(msg.metadata as any)?.part ? ` (Parte ${(msg.metadata as any).part}/${(msg.metadata as any).total_parts})` : ''} · Aguardando aprovação
                        </div>
                        {editingDraftId === msg.id ? (
                          <div className="flex flex-col gap-2 w-full">
                            <textarea
                              autoFocus
                              value={editDraftText}
                              onChange={(e) => setEditDraftText(e.target.value)}
                              rows={4}
                              className="w-full rounded-xl border-[1.5px] border-[#2563EB] bg-white px-3 py-2 text-[13px] text-[#09090B] outline-none resize-none focus:ring-2 focus:ring-[#2563EB]/10"
                            />
                            <div className="flex items-center gap-2 justify-end">
                              <button
                                onClick={() => setEditingDraftId(null)}
                                className="rounded-lg border border-[#E4E4E7] bg-white px-3 py-1.5 text-[11px] font-semibold text-[#71717A] hover:bg-[#F4F4F5] transition-all"
                              >
                                Cancelar
                              </button>
                              <button
                                onClick={() => handleEditAndSendDraft(msg.id, editDraftText)}
                                disabled={draftPending || !editDraftText.trim()}
                                className="flex items-center gap-1.5 rounded-lg border border-[#BFDBFE] bg-[#2563EB] px-4 py-1.5 text-[11px] font-semibold text-white hover:bg-[#1D4ED8] transition-all disabled:opacity-50"
                              >
                                <Send size={10} />
                                Enviar Editado
                              </button>
                            </div>
                          </div>
                        ) : (
                          <>
                            <div className="relative rounded-[14px] rounded-br-[3px] border-[1.5px] border-[#CCFBF1] bg-[#F0FDFA] px-4 py-3 text-[13px] leading-relaxed text-[#166534]">
                              {msg.content}
                            </div>
                            <div className="flex items-center gap-2">
                              <button
                                onClick={() => handleDeleteDraft(msg.id)}
                                disabled={draftPending}
                                className="flex items-center gap-1.5 rounded-lg border border-[#E4E4E7] bg-white px-3 py-1.5 text-[11px] font-semibold text-[#71717A] hover:bg-[#F4F4F5] transition-all disabled:opacity-50"
                              >
                                <Trash size={10} /> Descartar
                              </button>
                              <button
                                onClick={() => { setEditingDraftId(msg.id); setEditDraftText(msg.content); }}
                                disabled={draftPending}
                                className="flex items-center gap-1.5 rounded-lg border border-[#E4E4E7] bg-white px-3 py-1.5 text-[11px] font-semibold text-[#71717A] hover:bg-[#F4F4F5] transition-all disabled:opacity-50"
                              >
                                ✏️ Editar
                              </button>
                              <button
                                onClick={() => handleApproveDraft(msg.id)}
                                disabled={draftPending}
                                className="flex items-center gap-1.5 rounded-lg border border-[#BFDBFE] bg-[#2563EB] px-4 py-1.5 text-[11px] font-semibold text-white hover:bg-[#1D4ED8] transition-all shadow-[0_2px_8px_rgba(37,99,235,0.22)] disabled:opacity-50"
                              >
                                <Check size={10} /> ✓ Aprovar e Enviar
                              </button>
                            </div>
                          </>
                        )}
                      </motion.div>
                    );
                  }

                  const mediaMeta = (msg.metadata as any);
                  const msgContent = mediaMeta?.media_url ? (
                    <div className="flex flex-col gap-1.5">
                      {mediaMeta.media_type === 'image' ? (
                        <img src={mediaMeta.media_url} alt={mediaMeta.filename ?? 'imagem'} className="max-w-[240px] rounded-xl object-cover" />
                      ) : mediaMeta.media_type === 'video' ? (
                        <video src={mediaMeta.media_url} controls className="max-w-[240px] rounded-xl" />
                      ) : mediaMeta.media_type === 'audio' ? (
                        <audio src={mediaMeta.media_url} controls className="w-full max-w-[240px]" />
                      ) : (
                        <a href={mediaMeta.media_url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 rounded-lg border border-[#E4E4E7] bg-[#F4F4F5] px-3 py-2 text-[12px] hover:bg-[#EBEBEC] transition-colors text-[#09090B]">
                          <FileText size={14} className="shrink-0 text-[#71717A]" />
                          <span className="truncate max-w-[180px]">{mediaMeta.filename ?? 'documento'}</span>
                        </a>
                      )}
                      {msg.content && msg.content !== mediaMeta.filename && (
                        <span className="text-[12px] opacity-80">{msg.content}</span>
                      )}
                    </div>
                  ) : (
                    <span className="flex items-end gap-1.5">
                      {msg.content}
                      {isPending && <Clock size={9} className="shrink-0 opacity-40 mb-0.5" />}
                    </span>
                  );

                  return (
                    <ChatBubble
                      key={msg.key}
                      timestamp={msg.created_at}
                      variant={
                        msg.role === "user" ? "lead" :
                        msg.role === "note" ? "note" :
                        msg.role === "agent" ? "agent" :
                        "ai"
                      }
                      isFirst={msg.isFirst}
                      isLast={msg.isLast}
                      hideLabel={msg.hideLabel}
                      hideTime={msg.hideTime}
                      pending={isPending}
                    >
                      {msgContent}
                    </ChatBubble>
                  );
                })}

                {sortedMessages.length === 0 && (
                  <div className="my-12 text-center flex flex-col items-center gap-2">
                    <div className="h-1 w-8 bg-[#E4E4E7] rounded-full" />
                    <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-[#A1A1AA]">Início da conversa</span>
                  </div>
                )}

                <AnimatePresence>
                  {selected.is_processing && (
                    <motion.div
                      initial={{ opacity: 0, y: 8, scale: 0.95 }}
                      animate={{ opacity: 1, y: 0, scale: 1 }}
                      exit={{ opacity: 0, y: -4, scale: 0.95 }}
                      className="flex items-center gap-2 self-start mt-2"
                    >
                      <div className="flex items-center gap-2 rounded-[14px] rounded-bl-[3px] border border-[#E4E4E7] bg-white px-4 py-2.5 shadow-[0_1px_4px_rgba(0,0,0,0.06)]">
                        <div className="flex gap-1">
                          {[0, 1, 2].map((i) => (
                            <motion.span
                              key={i}
                              className="h-1.5 w-1.5 rounded-full bg-[#3B82F6]"
                              animate={{ y: [0, -3, 0] }}
                              transition={{ duration: 0.8, repeat: Infinity, delay: i * 0.15, ease: "easeInOut" }}
                            />
                          ))}
                        </div>
                        <span className="text-[10px] font-medium text-[#71717A]">IA gerando resposta...</span>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
                <div ref={chatBottomRef} />
              </motion.div>
            </div>

            {/* Input Area */}
            <div className="relative bg-white border-t border-[#E4E4E7] p-3 sm:p-4 pb-[calc(72px+env(safe-area-inset-bottom,12px))] lg:pb-[env(safe-area-inset-bottom,16px)]">
              <div className="max-w-5xl mx-auto relative group">
                <AnimatePresence>
                  {isAutonomous && (
                    <motion.div
                      suppressHydrationWarning
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
                      className="absolute inset-0 z-20 flex items-center justify-center bg-white/80 backdrop-blur-[1.5px] rounded-2xl"
                    >
                      <Button
                        variant="orange"
                        size="sm"
                        className="gap-2 px-6 h-10 rounded-full font-black uppercase tracking-wider"
                        onClick={handleTakeOver}
                        disabled={takePending}
                      >
                        {takePending ? (
                          <Zap size={16} className="animate-spin" />
                        ) : (
                          <Zap size={16} fill="currentColor" />
                        )}
                        Assumir Atendimento
                      </Button>
                    </motion.div>
                  )}
                </AnimatePresence>

                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*,application/pdf,video/mp4,video/3gpp,audio/mpeg,audio/ogg,audio/mp4,audio/aac,audio/amr"
                  className="hidden"
                  onChange={handleFileSelect}
                />

                <div suppressHydrationWarning className={cn(
                  "flex items-center gap-2 sm:gap-3 transition-all duration-250 ease-[0.22,1,0.36,1]",
                  isAutonomous && "blur-[1px] opacity-40 scale-[0.99] pointer-events-none"
                )}>
                  <div className="flex-1 relative flex flex-col gap-0 bg-[#F4F4F5] border border-[#E4E4E7] rounded-2xl px-3 py-1.5 transition-all focus-within:border-[#2563EB] focus-within:bg-white focus-within:shadow-[0_0_0_3px_rgba(37,99,235,0.10)]">
                    {attachedFile && (
                      <div className="flex items-center gap-2 pt-2 pb-1">
                        <div className="flex items-center gap-2 rounded-lg border border-[#E4E4E7] bg-white px-3 py-1.5 text-[11px] max-w-[220px]">
                          {attachPreview ? (
                            <img src={attachPreview} alt="" className="h-5 w-5 rounded object-cover shrink-0" />
                          ) : (
                            <FileText size={13} className="shrink-0 text-[#71717A]" />
                          )}
                          <span className="truncate text-[#3F3F46]">{attachedFile.name}</span>
                          <span className="shrink-0 text-[#A1A1AA]">
                            {(attachedFile.size / 1024).toFixed(0)}KB
                          </span>
                        </div>
                        <button
                          onClick={clearAttachment}
                          className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[#F4F4F5] hover:bg-[#E4E4E7] transition-colors"
                        >
                          <X size={10} className="text-[#71717A]" />
                        </button>
                      </div>
                    )}
                    <div className="flex items-end gap-2">
                      <Button
                        variant="ghost"
                        size="sm"
                        className={cn(
                          "h-9 w-9 rounded-xl p-0 shrink-0 mb-0.5 transition-colors",
                          attachedFile && "bg-[#EFF6FF] text-[#2563EB] hover:bg-[#DBEAFE]"
                        )}
                        disabled={inputBlocked}
                        onClick={() => fileInputRef.current?.click()}
                      >
                        <Paperclip size={18} className={cn(attachedFile ? "text-[#2563EB]" : "text-[#A1A1AA]")} />
                      </Button>
                      <textarea
                        ref={inputRef}
                        rows={1}
                        placeholder={attachedFile ? "Legenda (opcional)..." : "Escreva uma mensagem..."}
                        className="flex-1 bg-transparent py-2.5 text-[14px] text-[#09090B] outline-none placeholder:text-[#A1A1AA] disabled:cursor-not-allowed resize-none max-h-32 custom-scrollbar"
                        value={noteText}
                        onChange={(e) => {
                          setNoteText(e.target.value);
                          e.target.style.height = 'auto';
                          e.target.style.height = e.target.scrollHeight + 'px';
                        }}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" && !e.shiftKey) {
                            e.preventDefault();
                            if (!inputBlocked && noteText.trim()) handleSend();
                          }
                        }}
                        disabled={inputBlocked}
                      />
                    </div>
                  </div>

                  <Button
                    variant="primary"
                    size="sm"
                    className={cn(
                      "h-11 w-11 rounded-full shrink-0 transition-all duration-200 overflow-hidden z-10",
                      (noteText.trim() || attachedFile) ? "scale-100 opacity-100" : "scale-90 opacity-40"
                    )}
                    disabled={inputBlocked || (!noteText.trim() && !attachedFile)}
                    onClick={handleSend}
                  >
                    <AnimatePresence mode="wait">
                      {sendPending ? (
                        <motion.div
                          key="pending"
                          initial={{ scale: 0.5, opacity: 0 }}
                          animate={{ scale: 1, opacity: 1 }}
                          exit={{ scale: 0.5, opacity: 0 }}
                        >
                          <Zap size={18} className="animate-spin" />
                        </motion.div>
                      ) : (
                        <motion.div
                          key="idle"
                          initial={{ x: -10, opacity: 0 }}
                          animate={{ x: 0, opacity: 1 }}
                        >
                          <Send size={18} />
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </Button>
                </div>
              </div>

            </div>
          </>
        )}
      </section>

      {/* COL 3 — detail (always in DOM; xl:flex handles visibility) */}
      <aside className="hidden flex-col gap-5 overflow-y-auto border-l border-[#E4E4E7] bg-white p-5 w-[280px] shrink-0 custom-scrollbar xl:flex z-10 select-none">
        {selected && (
          <motion.div
            initial={{ opacity: 0, x: 12 }}
            animate={{ opacity: 1, x: 0 }}
            className="flex flex-col gap-6"
          >
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
                <h4 className="text-[10px] font-bold uppercase tracking-[0.2em] text-[#A1A1AA] mb-3">Inteligência Artificial</h4>
                <div className="space-y-4">
                  <div>
                    <span className="text-[11px] font-bold text-[#A1A1AA] uppercase tracking-wider block mb-2">Tom da Conversa</span>
                    <ToneDropdown
                      selected={selected}
                      toneOpen={toneOpen}
                      setToneOpen={setToneOpen}
                      tonePending={tonePending}
                      onToneChange={handleToneChange}
                    />
                  </div>
                  <div>
                    <span className="text-[11px] font-bold text-[#A1A1AA] uppercase tracking-wider block mb-2">Modo de Operação</span>
                    <ControlModeDropdown
                      selected={selected}
                      controlOpen={controlOpen}
                      setControlOpen={setControlOpen}
                      controlPending={controlPending}
                      onControlModeChange={handleControlModeChange}
                    />
                  </div>
                  {selected.summary && (
                    <div className="rounded-xl bg-[#F0FDFA] border border-[#CCFBF1] p-3">
                      <span className="text-[10px] font-bold uppercase tracking-[0.1em] text-[#14B8A6] block mb-1.5">✦ Resumo IA</span>
                      <p className="text-[12px] leading-relaxed text-[#166534] italic">"{selected.summary}"</p>
                    </div>
                  )}
                </div>
              </section>

              <section>
                <h4 className="text-[10px] font-bold uppercase tracking-[0.2em] text-[#A1A1AA] mb-3">Dados do Lead</h4>
                <div className="space-y-3">
                  <KV k="Status" v={HEAT_LABEL[selected.status]} color={selected.status === 'hot' ? 'text-[#EA580C]' : 'text-[#1D4ED8]'} />
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
    </div>
  );
}

function BookingStatusCard({ lead }: { lead: LeadWithMessages }) {
  const next = lead.next_event;

  if (next) {
    const dt = new Date(next.start_time);
    const formatted = dt.toLocaleString("pt-BR", {
      weekday: "short", day: "2-digit", month: "short",
      hour: "2-digit", minute: "2-digit",
    });
    return (
      <div className="rounded-xl border border-[#E4E4E7] bg-[#FAFAFA] p-4">
        <div className="flex flex-col gap-2">
          <div className="h-7 w-7 rounded-lg bg-[#F0FDFA] flex items-center justify-center text-[#14B8A6]">
            <CalendarCheck size={14} />
          </div>
          <div>
            <div className="text-[11px] font-bold text-[#71717A]">Agendamento Confirmado</div>
            <div className="text-[12px] font-semibold text-[#09090B] mt-0.5">{next.title}</div>
            <div className="text-[10px] text-[#A1A1AA] mt-0.5 capitalize" suppressHydrationWarning>{formatted}</div>
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

function KV({ k, v, color = "text-[#3F3F46]" }: { k: string; v: string; color?: string }) {
  return (
    <div className="flex items-center justify-between gap-2 text-[12px]">
      <span className="font-bold text-[#A1A1AA] uppercase tracking-widest text-[10px]">{k}</span>
      <span className={cn("font-semibold truncate max-w-[140px]", color)}>{v}</span>
    </div>
  );
}
