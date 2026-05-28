"use client";

import { memo, useMemo, useState, useTransition, useEffect, useRef, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { CalendarCheck, ChevronDown, ChevronLeft, Paperclip, Send, Zap, Sparkles, Check, Trash, X, FileText, Search, MessageCircle, Instagram } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ChatBubble } from "@/components/app/chat-bubble";
import { EmptyState } from "@/components/ui/empty-state";
import { HEAT_GRADIENT, HEAT_LABEL } from "@/lib/constants";
import { stagger } from "@/components/motion/variants";
import { cn } from "@/lib/utils";
import type { Lead, Message } from "@/lib/types/database";
import type { LeadWithMessages } from "./page";
import { sendNote, takeOverLead, automatizeLead, setConversationTone, setControlMode, approveDraftMessage, deleteDraftMessage, editAndSendDraft, sendFileAttachment } from "./actions";
import { createBrowserClient } from "@supabase/ssr";
import { useRouter } from "next/navigation";
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

// Module-level animation constants — defined outside component to avoid new object refs on each render
const LEAD_LIST_VARIANTS = stagger(0.02, 0.03);
const LEAD_ITEM_VARIANTS = { hidden: { opacity: 0, x: -8 }, show: { opacity: 1, x: 0 } };
const LEAD_ITEM_HOVER = { backgroundColor: "rgba(255,255,255,0.03)" };

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
  return `${d}d`;
}

function lastMsg(lead: LeadWithMessages) {
  const msgs = lead.messages;
  return msgs.length > 0 ? msgs[msgs.length - 1] : undefined;
}

// ─── Module-level components (outside InboxClient to avoid React remount on each render) ───

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
          "flex items-center justify-between gap-1.5 rounded-xl border border-white/[0.05] bg-white/[0.01] px-2.5 py-1.5 text-[10px] font-bold uppercase tracking-wide transition-all duration-150 hover:bg-white/[0.04] hover:border-white/[0.08] disabled:opacity-50 cursor-pointer",
          toneOpen && "border-[#2563EB]/25 bg-white/[0.04]",
          compact ? "h-7.5 px-2" : "w-full"
        )}
      >
        <div className="flex items-center gap-1.5">
          <span className={cn(
            "h-1.5 w-1.5 rounded-full",
            selected.conversation_tone === "hot" ? "bg-orange-500 shadow-[0_0_6px_rgba(249,115,22,0.4)]" :
            selected.conversation_tone === "warm" ? "bg-yellow-500" : "bg-blue-400"
          )} />
          <span className={cn(
            "text-[9px] sm:text-[10px]",
            selected.conversation_tone === "hot" ? "text-orange-400" :
            selected.conversation_tone === "warm" ? "text-yellow-400" : "text-blue-400"
          )}>
            {TONE_LABEL[selected.conversation_tone ?? "warm"]}
          </span>
        </div>
        <ChevronDown size={11} className={cn("text-white/20 transition-transform duration-200", toneOpen && "rotate-180")} />
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
                "glass absolute z-[101] overflow-hidden rounded-xl border border-white/[0.08] bg-[#0A0A0A]/95 p-1 shadow-2xl",
                compact ? "right-0 top-full mt-1 w-32" : "left-0 top-full w-full"
              )}
            >
              {TONE_CYCLE.map((t) => (
                <button
                  key={t}
                  onClick={() => { onToneChange(t); setToneOpen(false); }}
                  className={cn(
                    "flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-[10px] font-bold uppercase tracking-wide transition-colors cursor-pointer",
                    selected.conversation_tone === t ? "bg-white/[0.06] text-white" : "text-white/40 hover:bg-white/5 hover:text-white/70"
                  )}
                >
                  <span className={cn(
                    "h-1.5 w-1.5 rounded-full",
                    t === "hot" ? "bg-orange-500" : t === "warm" ? "bg-yellow-500" : "bg-blue-400"
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
          "flex items-center justify-between gap-1.5 rounded-xl border border-white/[0.05] bg-white/[0.01] px-2.5 py-1.5 text-[10px] font-bold uppercase tracking-wide transition-all duration-150 hover:bg-white/[0.04] hover:border-white/[0.08] disabled:opacity-50 cursor-pointer",
          controlOpen && "border-[#2563EB]/25 bg-white/[0.04]",
          compact ? "h-7.5 px-2" : "w-full"
        )}
      >
        <div className="flex items-center gap-1.5">
          <span className={cn(
            "h-1.5 w-1.5 rounded-full",
            currentMode === "autonomous" ? "bg-emerald-400 shadow-[0_0_6px_rgba(52,211,153,0.4)]" :
            currentMode === "shadow" ? "bg-brand-blue-400 shadow-[0_0_6px_rgba(96,165,250,0.4)]" : "bg-white/20"
          )} />
          <span className={cn(
            "text-[9px] sm:text-[10px]",
            currentMode === "autonomous" ? "text-emerald-400" :
            currentMode === "shadow" ? "text-brand-blue-400" : "text-white/50"
          )}>
            {CONTROL_LABEL[currentMode]}
          </span>
        </div>
        <ChevronDown size={11} className={cn("text-white/20 transition-transform duration-200", controlOpen && "rotate-180")} />
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
                "glass absolute z-[101] overflow-hidden rounded-xl border border-white/[0.08] bg-[#0A0A0A]/95 p-1 shadow-2xl",
                compact ? "right-0 top-full mt-1 w-44" : "left-0 top-full w-full"
              )}
            >
              {CONTROL_MODES.map((m) => (
                <button
                  key={m}
                  onClick={() => { onControlModeChange(m); setControlOpen(false); }}
                  className={cn(
                    "flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-[10px] font-bold uppercase tracking-wide transition-colors text-left cursor-pointer",
                    currentMode === m ? "bg-white/[0.06] text-white" : "text-white/40 hover:bg-white/5 hover:text-white/70"
                  )}
                >
                  <span className={cn(
                    "h-1.5 w-1.5 rounded-full",
                    m === "autonomous" ? "bg-emerald-400" : m === "shadow" ? "bg-brand-blue-400" : "bg-white/20"
                  )} />
                  <div className="flex flex-col">
                    <span>{CONTROL_LABEL[m]}</span>
                    <span className="text-[8px] font-medium text-white/20 tracking-normal normal-case">
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

// ─── LeadListItem — memoized to prevent full-list re-render on every realtime message ───

interface LeadListItemProps {
  lead: LeadWithMessages;
  isActive: boolean;
  isUnread: boolean;
  onSelect: (id: string) => void;
}

const LeadListItem = memo(function LeadListItem({ lead: l, isActive, isUnread, onSelect }: LeadListItemProps) {
  const last = lastMsg(l);
  return (
    <motion.div
      variants={LEAD_ITEM_VARIANTS}
      whileHover={LEAD_ITEM_HOVER}
      onClick={() => onSelect(l.id)}
      className={cn(
        "group relative flex cursor-pointer items-center gap-4 border-b border-white/[0.02] px-5 py-3.5 transition-all duration-200 hover:bg-white/[0.02] select-none",
        isActive && "bg-brand-blue-600/5 hover:bg-brand-blue-600/8 border-brand-blue-500/10"
      )}
    >
      {isActive && (
        <motion.div
          layoutId="active-lead"
          className="absolute inset-y-2 left-0 w-1 rounded-r-full bg-brand-blue-500 shadow-[0_0_10px_rgba(59,130,246,0.4)]"
          transition={{ type: "spring", stiffness: 400, damping: 30 }}
        />
      )}
      <div
        className="relative grid h-11 w-11 shrink-0 place-items-center rounded-full text-xs font-black text-white shadow-lg"
        style={{ background: HEAT_GRADIENT[l.status] ?? HEAT_GRADIENT.cold }}
      >
        {initials(l.name)}
        <div className={cn(
          "absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-[#050505] transition-all",
          l.status === "hot" ? "bg-orange-500 shadow-[0_0_8px_rgba(249,115,22,0.6)]" :
          l.status === "warm" ? "bg-yellow-500" :
          l.status === "success" ? "bg-teal-500" : "bg-blue-400"
        )} />
        {isUnread && (
          <motion.span
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            className="absolute -top-1 -right-1 h-2.5 w-2.5 rounded-full bg-brand-blue-500 border-2 border-[#050505] shadow-[0_0_8px_rgba(59,130,246,0.7)]"
          />
        )}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-1.5 min-w-0">
            <span className="truncate text-[13px] font-bold tracking-tight text-white">{l.name}</span>
            {l.channel === "whatsapp" && (
              <MessageCircle size={11} className="text-teal-400 shrink-0" />
            )}
            {l.channel === "instagram" && (
              <Instagram size={11} className="text-pink-400 shrink-0" />
            )}
          </div>
          <span className="font-mono text-[9px] font-bold uppercase text-white/20 whitespace-nowrap">
            {last ? relativeTime(last.created_at) : "—"}
          </span>
        </div>
        <div className="mt-0.5 flex items-center gap-1.5 min-w-0">
          {last && (last.metadata as any)?.is_draft && (
            <span className="shrink-0 text-[8px] font-black uppercase tracking-wide text-brand-blue-400 bg-brand-blue-500/10 border border-brand-blue-500/20 rounded px-1 py-0.5">
              Rascunho
            </span>
          )}
          <span className={cn(
            "truncate text-[11px] font-medium transition-colors",
            isActive ? "text-white/60" : "text-white/35"
          )}>
            {last?.content ?? "Nenhuma mensagem"}
          </span>
        </div>
      </div>
    </motion.div>
  );
});

export function InboxClient({ leads: initialLeads, companyId, fetchError }: { leads: LeadWithMessages[]; companyId: string | null; fetchError?: string | null }) {
  const router = useRouter();
  const [leads, setLeads] = useState<LeadWithMessages[]>(initialLeads);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [selectedId, setSelectedId] = useState<string | null>(initialLeads[0]?.id ?? null);
  const [showChatOnMobile, setShowChatOnMobile] = useState(false);
  const [noteText, setNoteText] = useState("");
  const [sendPending, startSend] = useTransition();
  const [takePending, startTake] = useTransition();
  const [tonePending, startTone] = useTransition();
  const [toneOpen, setToneOpen] = useState(false);
  const [controlPending, startControl] = useTransition();
  const [controlOpen, setControlOpen] = useState(false);
  const [draftPending, startDraft] = useTransition();
  const [editingDraftId, setEditingDraftId] = useState<string | null>(null);
  const [editDraftText, setEditDraftText] = useState("");
  const [inboxError, setInboxError] = useState<string | null>(fetchError ?? null);
  const [isTyping, setIsTyping] = useState(false);
  const [isConnected, setIsConnected] = useState(false);
  const [attachedFile, setAttachedFile] = useState<File | null>(null);
  const [attachPreview, setAttachPreview] = useState<string | null>(null);
  // Track leads that received new messages while not being viewed
  const [unreadLeadIds, setUnreadLeadIds] = useState<Set<string>>(new Set());
  const chatBottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const typingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Ref to latest selectedId for use inside realtime callbacks (avoids stale closure)
  const selectedIdRef = useRef<string | null>(selectedId);
  useEffect(() => { selectedIdRef.current = selectedId; }, [selectedId]);

  // Stable callback so LeadListItem memo never breaks on re-render
  const handleLeadSelect = useCallback((id: string) => {
    setSelectedId(id);
    setShowChatOnMobile(true);
    setUnreadLeadIds((prev) => {
      if (!prev.has(id)) return prev; // avoid state update if nothing to clear
      const next = new Set(prev);
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

  // Clear typing indicator when switching leads
  useEffect(() => {
    setIsTyping(false);
    if (typingTimerRef.current) clearTimeout(typingTimerRef.current);
  }, [selectedId]);

  useEffect(() => {
    if (!companyId) return; // Cannot subscribe without a tenant filter

    const supabase = browserSupabase;

    const companyFilter = `company_id=eq.${companyId}`;

    // [FIX] When a message arrives for a lead not in our local state (e.g. lead was
    // created after the initial 30-lead window, or lead INSERT realtime event hasn't
    // landed yet), fetch the lead from the server and prepend it instead of dropping
    // the message silently.
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

    const channel = supabase
      .channel(`inbox-realtime-${companyId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "messages", filter: companyFilter },
        (payload) => {
          const newMsg = payload.new as Message;
          // Only show typing indicator for the lead currently being viewed
          if (newMsg.role === "user" && newMsg.lead_id === selectedIdRef.current) {
            setIsTyping(true);
            if (typingTimerRef.current) clearTimeout(typingTimerRef.current);
            typingTimerRef.current = setTimeout(() => setIsTyping(false), 8000);
          } else if (newMsg.role !== "user") {
            setIsTyping(false);
            if (typingTimerRef.current) clearTimeout(typingTimerRef.current);
          }

          // Track unread: messages from other leads mark that lead as unread
          if (newMsg.role === "user" && newMsg.lead_id !== selectedIdRef.current) {
            setUnreadLeadIds((prev) => new Set(prev).add(newMsg.lead_id));
          }

          setLeads((prev) => {
            const leadExists = prev.some((l) => l.id === newMsg.lead_id);
            if (!leadExists) {
              // Lead not in local cache — fetch it from server in the background.
              // Message will be re-attached when the lead lands.
              console.warn(`[Inbox] message ${newMsg.id} for unknown lead ${newMsg.lead_id} — fetching lead`);
              void fetchLeadById(newMsg.lead_id).then((lead) => {
                if (!lead) return;
                setLeads((p) => {
                  if (p.some((l) => l.id === lead.id)) {
                    // Lead arrived through another path — just attach the message.
                    return p.map((l) =>
                      l.id === lead.id && !l.messages.some((m) => m.id === newMsg.id)
                        ? { ...l, messages: [...l.messages, newMsg] }
                        : l,
                    );
                  }
                  return [lead, ...p];
                });
              });
              return prev;
            }
            const next = prev.map((lead) => {
              if (lead.id !== newMsg.lead_id) return lead;
              if (lead.messages.some((m) => m.id === newMsg.id)) return lead;
              return { ...lead, messages: [...lead.messages, newMsg] };
            });
            return next.sort((a, b) => {
              const aLast = lastMsg(a)?.created_at ?? a.updated_at;
              const bLast = lastMsg(b)?.created_at ?? b.updated_at;
              return new Date(bLast).getTime() - new Date(aLast).getTime();
            });
          });
        },
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "leads", filter: companyFilter },
        (payload) => {
          const updatedLead = payload.new as Lead;
          setLeads((prev) => {
            const next = prev.map((lead) =>
              lead.id === updatedLead.id
                ? { ...lead, ...updatedLead, messages: lead.messages }
                : lead,
            );
            return next.sort((a, b) => {
              const aLast = lastMsg(a)?.created_at ?? a.updated_at;
              const bLast = lastMsg(b)?.created_at ?? b.updated_at;
              return new Date(bLast).getTime() - new Date(aLast).getTime();
            });
          });
        },
      )
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "leads", filter: companyFilter },
        (payload) => {
          const newLead = payload.new as Lead;
          setLeads((prev) => {
            if (prev.some((l) => l.id === newLead.id)) return prev;
            return [{ ...newLead, messages: [] }, ...prev].sort((a, b) => {
              const aLast = lastMsg(a)?.created_at ?? a.updated_at;
              const bLast = lastMsg(b)?.created_at ?? b.updated_at;
              return new Date(bLast).getTime() - new Date(aLast).getTime();
            });
          });
        },
      )
      .on(
        "postgres_changes",
        { event: "DELETE", schema: "public", table: "messages", filter: companyFilter },
        (payload) => {
          // Handles realtime draft deletion visible to multiple sessions (e.g. two agents)
          const deletedId = (payload.old as { id?: string })?.id;
          if (!deletedId) return;
          setLeads((prev) =>
            prev.map((lead) => ({
              ...lead,
              messages: lead.messages.filter((m) => m.id !== deletedId),
            })),
          );
        },
      )
      .subscribe((status) => {
        console.log(`[Inbox] realtime status: ${status}`);
        setIsConnected(status === "SUBSCRIBED");
      });

    return () => {
      if (typingTimerRef.current) clearTimeout(typingTimerRef.current);
      supabase.removeChannel(channel);
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

  // Restore focus after sending message or taking over
  useEffect(() => {
    if (!sendPending && !takePending && selected) {
      inputRef.current?.focus();
    }
  }, [sendPending, takePending, selected?.id]);

  const groupedMessages = useMemo(() => {
    const msgs = selected?.messages ?? [];
    return msgs.map((msg, i) => {
      const prev = msgs[i - 1];
      const next = msgs[i + 1];
      const isNote = msg.role === "note";
      const prevIsSame = prev && prev.role === msg.role && !isNote;
      const nextIsSame = next && next.role === msg.role && !isNote;

      const timeGapPrev = prev ? (new Date(msg.created_at).getTime() - new Date(prev.created_at).getTime()) : 0;
      const timeGapNext = next ? (new Date(next.created_at).getTime() - new Date(msg.created_at).getTime()) : 0;
      const GAP_LIMIT = 5 * 60 * 1000;

      const isFirst = !prevIsSame || timeGapPrev > GAP_LIMIT;
      const isLast = !nextIsSame || timeGapNext > GAP_LIMIT;

      return {
        ...msg,
        isFirst,
        isLast,
        hideLabel: !isFirst,
        hideTime: !isLast,
      };
    });
  }, [selected?.messages]);

  const clearAttachment = useCallback(() => {
    if (attachPreview) URL.revokeObjectURL(attachPreview);
    setAttachedFile(null);
    setAttachPreview(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  }, [attachPreview]);

  const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 16 * 1024 * 1024) { setInboxError('Arquivo muito grande (máx 16 MB)'); return; }
    setAttachedFile(file);
    if (file.type.startsWith('image/')) setAttachPreview(URL.createObjectURL(file));
    else setAttachPreview(null);
  }, []);

  const handleSend = useCallback(() => {
    if (!selected) return;

    // ── File attachment path ──────────────────────────────────────
    if (attachedFile) {
      setInboxError(null);
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
          if (!result.success) setInboxError(result.error ?? 'Erro ao enviar arquivo');
        } catch (e) {
          setInboxError((e as Error).message);
        }
      });
      return;
    }

    if (!noteText.trim()) return;
    const content = noteText.trim();
    setInboxError(null);
    setNoteText(""); // Clear immediately for better UX

    // Optimistic update
    const tempId = crypto.randomUUID();
    const tempMsg: Message = {
      id: tempId,
      lead_id: selected.id,
      company_id: selected.company_id,
      content,
      role: "agent",
      created_at: new Date().toISOString(),
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
        } else if (result?.error) {
          setInboxError(result.error);
          setNoteText(content); // Restore text
        }
      } catch (e) {
        setInboxError((e as Error).message);
        setNoteText(content); // Restore text
      } finally {
        // Remove optimistic message ALWAYS after completion
        // The real message will be added by the Realtime listener
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
    setInboxError(null);
    
    // optimistic
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
        // revert
        setLeads((prev) =>
          prev.map((l) => (l.id === selected.id ? { ...l, is_paused: false, messages: l.messages.filter(m => m.id !== tempId) } : l)),
        );
        setInboxError((e as Error).message);
      }
    });
  }, [selected]);

  const handleAutomatize = useCallback(() => {
    if (!selected) return;
    setInboxError(null);
    setLeads((prev) =>
      prev.map((l) => (l.id === selected.id ? { ...l, is_paused: false } : l)),
    );
    startTake(async () => {
      try {
        await automatizeLead(selected.id);
        trackEvent("lead_automatize", { lead_id: selected.id });
      } catch (e) {
        setLeads((prev) =>
          prev.map((l) => (l.id === selected.id ? { ...l, is_paused: true } : l)),
        );
        setInboxError((e as Error).message);
      }
    });
  }, [selected]);

  const handleToneChange = useCallback((tone: "cold" | "warm" | "hot") => {
    if (!selected || selected.conversation_tone === tone) return;
    const current = selected.conversation_tone ?? "warm";
    // optimistic
    setLeads((prev) =>
      prev.map((l) => (l.id === selected.id ? { ...l, conversation_tone: tone } : l)),
    );
    startTone(async () => {
      try {
        await setConversationTone(selected.id, tone);
        trackEvent("tone_changed", { lead_id: selected.id, tone });
      } catch (e) {
        // revert
        setLeads((prev) =>
          prev.map((l) => (l.id === selected.id ? { ...l, conversation_tone: current } : l)),
        );
        setInboxError((e as Error).message);
      }
    });
  }, [selected]);

  const handleControlModeChange = useCallback((mode: "autonomous" | "shadow" | "manual") => {
    if (!selected) return;
    const current = selected.control_mode ?? (selected.is_paused ? "manual" : "autonomous");
    if (current === mode) return;

    // optimistic update
    setLeads((prev) =>
      prev.map((l) => (l.id === selected.id ? { ...l, control_mode: mode, is_paused: mode === 'manual' } : l)),
    );

    startControl(async () => {
      try {
        await setControlMode(selected.id, mode);
        trackEvent("control_mode_changed", { lead_id: selected.id, mode });
      } catch (e) {
        // revert
        setLeads((prev) =>
          prev.map((l) => (l.id === selected.id ? { ...l, control_mode: current, is_paused: current === 'manual' } : l)),
        );
        setInboxError((e as Error).message);
      }
    });
  }, [selected]);

  const handleApproveDraft = useCallback((messageId: string) => {
    setInboxError(null);
    startDraft(async () => {
      try {
        await approveDraftMessage(messageId);
      } catch (e) {
        setInboxError((e as Error).message);
      }
    });
  }, []);

  const handleEditAndSendDraft = useCallback((messageId: string, text: string) => {
    if (!text.trim()) return;
    setInboxError(null);
    setEditingDraftId(null);
    startDraft(async () => {
      try {
        await editAndSendDraft(messageId, text);
      } catch (e) {
        setInboxError((e as Error).message);
      }
    });
  }, []);

  const handleDeleteDraft = useCallback((messageId: string) => {
    setInboxError(null);
    // Optimistic remove
    setLeads((prev) =>
      prev.map((l) =>
        l.id === selectedId
          ? { ...l, messages: l.messages.filter((m) => m.id !== messageId) }
          : l
      )
    );
    startDraft(async () => {
      try {
        await deleteDraftMessage(messageId);
      } catch (e) {
        setInboxError((e as Error).message);
      }
    });
  }, [selectedId]);

  const sortedMessages = selected ? selected.messages : [];
  const isPaused = selected?.is_paused ?? false;
  const isShadowMode = selected?.control_mode === 'shadow';
  // Shadow mode: IA gera rascunhos mas humano pode também enviar notas diretas
  const inputBlocked = (!isPaused && !isShadowMode) || sendPending;

  return (
    <div className="flex h-full min-h-0 w-full overflow-hidden">
      {/* COL 1 — list */}
      <section className={cn(
        "flex flex-col border-r border-white/[0.08] transition-all duration-300 lg:w-[320px] lg:flex-shrink-0",
        showChatOnMobile ? "hidden lg:flex" : "flex w-full"
      )}>
        <div className="px-5 pb-3 pt-5 shrink-0">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-black tracking-tight bg-gradient-to-r from-white to-white/50 bg-clip-text text-transparent">Inbox</h2>
            <div className="flex items-center gap-2">
              <div
                className={cn(
                  "flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[10px] font-bold transition-all duration-500",
                  isConnected
                    ? "bg-teal-500/10 text-teal-400 border border-teal-500/20"
                    : "bg-white/5 text-white/30 border border-white/5"
                )}
              >
                <span
                  className={cn(
                    "h-1.5 w-1.5 rounded-full transition-all duration-500",
                    isConnected
                      ? "bg-teal-400 shadow-[0_0_8px_rgba(45,212,191,0.8)] animate-pulse"
                      : "bg-white/20"
                  )}
                />
                {isConnected ? "LIVE" : "OFFLINE"}
              </div>
            </div>
          </div>
          <div className="mt-4 flex flex-col gap-3 px-1">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-white/30" size={14} />
              <input
                type="text"
                placeholder="Buscar por nome ou telefone..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full rounded-xl border border-white/10 bg-white/5 pl-9 pr-3 py-2 text-[13px] text-white placeholder:text-white/30 focus:border-brand-blue-500 focus:outline-none focus:ring-1 focus:ring-brand-blue-500 transition-all"
              />
            </div>
            <div className="flex gap-3 overflow-x-auto no-scrollbar pb-1 border-b border-white/[0.04] scrollbar-none select-none">
              {['all', 'hot', 'warm', 'cold', 'success'].map((status) => (
                <button
                  key={status}
                  onClick={() => setStatusFilter(status)}
                  className={cn(
                    "relative pb-2 text-[10px] font-bold uppercase tracking-wider transition-colors duration-150 whitespace-nowrap cursor-pointer",
                    statusFilter === status 
                      ? "text-brand-blue-400" 
                      : "text-white/30 hover:text-white/60"
                  )}
                >
                  {status === 'all' ? 'Todos' : status === 'hot' ? 'Quente' : status === 'warm' ? 'Morno' : status === 'cold' ? 'Frio' : 'Convertidos'}
                  {statusFilter === status && (
                    <motion.div
                      layoutId="active-filter-status"
                      className="absolute bottom-0 inset-x-0 h-[1.5px] bg-brand-blue-400"
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
                    channelFilter === chan 
                      ? "text-white" 
                      : "text-white/30 hover:text-white/60"
                  )}
                >
                  {chan === 'whatsapp' && <MessageCircle size={10} className="text-teal-400 shrink-0" />}
                  {chan === 'instagram' && <Instagram size={10} className="text-pink-400 shrink-0" />}
                  <span>{chan === 'all' ? 'Canais' : chan === 'whatsapp' ? 'WhatsApp' : 'Instagram'}</span>
                  {channelFilter === chan && (
                    <motion.div
                      layoutId="active-filter-channel"
                      className="absolute bottom-0 inset-x-0 h-[1px] bg-white/40"
                      transition={{ type: "spring", stiffness: 400, damping: 30 }}
                    />
                  )}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto overflow-x-hidden custom-scrollbar pb-[calc(72px+env(safe-area-inset-bottom,12px))] lg:pb-0">
          {inboxError && (
            <div className="mx-3 mb-2 flex items-center justify-between gap-2 rounded-xl border border-red-500/20 bg-red-500/10 px-3 py-2">
              <p className="text-[12px] font-medium text-red-400 leading-tight">
                {inboxError}
              </p>
              <button
                onClick={() => router.refresh()}
                className="shrink-0 text-[11px] font-black uppercase tracking-wider text-red-400 hover:text-red-300 transition-colors"
              >
                Tentar novamente
              </button>
            </div>
          )}
          {filteredLeads.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-40 px-5 text-center gap-2">
              <div className="h-12 w-12 rounded-full bg-white/5 flex items-center justify-center">
                <Zap size={20} className="text-white/20" />
              </div>
              <p className="text-xs font-medium text-white/30 italic">Nenhum lead encontrado.</p>
            </div>
          ) : (
            <motion.div variants={LEAD_LIST_VARIANTS} initial="hidden" animate="show" className="flex flex-col">
              {filteredLeads.map((l) => (
                <LeadListItem
                  key={l.id}
                  lead={l}
                  isActive={l.id === selectedId}
                  isUnread={unreadLeadIds.has(l.id)}
                  onSelect={handleLeadSelect}
                />
              ))}
            </motion.div>
          )}
        </div>
      </section>

      {/* COL 2 — chat */}
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
            <div className="flex items-center justify-between border-b border-white/[0.08] bg-background/80 backdrop-blur-xl px-4 py-3 sm:px-6 z-10 shadow-lg shadow-black/20">
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
                <div className="min-w-0">
                  <div className="truncate text-sm font-bold text-white">{selected.name}</div>
                  <div className="flex items-center gap-1.5 truncate text-[10px] font-bold uppercase tracking-wider text-white/40">
                    <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
                    Ativo agora · {selected.channel}
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-2">
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

            {/* Messages Area */}
            <div className="flex-1 overflow-y-auto custom-scrollbar">
              <motion.div
                key={selected.id}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ duration: 0.12, ease: [0.22, 1, 0.36, 1] }}
                className="flex flex-col gap-3 p-4 sm:p-6"
              >
                {!isPaused && selected.control_mode !== 'shadow' && (
                  <ChatBubble variant="note">Agendra está respondendo automaticamente</ChatBubble>
                )}
                {selected.control_mode === 'shadow' && (
                  <ChatBubble variant="note">
                    <span className="flex items-center gap-1.5">
                      <Sparkles size={11} className="text-brand-blue-400 shrink-0" />
                      Modo Copiloto ativo — IA gera rascunhos para sua aprovação
                    </span>
                  </ChatBubble>
                )}

                {/* Group messages by date could be added here */}

                {groupedMessages.map((msg) => {
                  const isDraft = (msg.metadata as any)?.is_draft === true;

                  if (isDraft) {
                    return (
                      <motion.div
                        key={msg.id}
                        initial={{ opacity: 0, y: 8, scale: 0.97 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        className="flex flex-col items-end gap-2 self-end max-w-[85%]"
                      >
                        <div className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-brand-blue-400">
                          <Sparkles size={10} />
                          Rascunho da IA · Aguardando aprovação
                        </div>
                        <div className="relative rounded-2xl rounded-br-sm border border-brand-blue-500/40 bg-brand-blue-500/10 backdrop-blur-sm px-4 py-3 text-[13px] leading-relaxed text-white/90 shadow-[0_0_20px_rgba(59,130,246,0.12)]">
                          {msg.content}
                          <div className="absolute inset-0 rounded-2xl rounded-br-sm bg-gradient-to-b from-white/[0.04] to-transparent pointer-events-none" />
                        </div>
                        {editingDraftId === msg.id ? (
                          <div className="flex flex-col gap-2 w-full">
                            <textarea
                              autoFocus
                              value={editDraftText}
                              onChange={(e) => setEditDraftText(e.target.value)}
                              rows={3}
                              className="w-full rounded-xl border border-brand-blue-500/40 bg-[#0A0A0A]/80 px-3 py-2 text-[13px] text-white/90 outline-none resize-none focus:border-brand-blue-400/60"
                            />
                            <div className="flex items-center gap-2 justify-end">
                              <button
                                onClick={() => setEditingDraftId(null)}
                                className="rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-[11px] font-bold text-white/40 hover:bg-white/10 transition-all"
                              >
                                Cancelar
                              </button>
                              <button
                                onClick={() => handleEditAndSendDraft(msg.id, editDraftText)}
                                disabled={draftPending || !editDraftText.trim()}
                                className="flex items-center gap-1.5 rounded-lg border border-brand-blue-500/40 bg-brand-blue-500/20 px-4 py-1.5 text-[11px] font-bold text-brand-blue-300 hover:bg-brand-blue-500/30 transition-all disabled:opacity-50"
                              >
                                <Send size={10} />
                                Enviar Editado
                              </button>
                            </div>
                          </div>
                        ) : (
                          <div className="flex items-center gap-2">
                            <button
                              onClick={() => handleDeleteDraft(msg.id)}
                              disabled={draftPending}
                              className="flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-[11px] font-bold text-white/40 hover:bg-white/10 hover:text-white/70 transition-all disabled:opacity-50"
                            >
                              <Trash size={10} />
                              Descartar
                            </button>
                            <button
                              onClick={() => { setEditingDraftId(msg.id); setEditDraftText(msg.content); }}
                              disabled={draftPending}
                              className="flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-[11px] font-bold text-white/40 hover:bg-white/10 hover:text-white/70 transition-all disabled:opacity-50"
                            >
                              ✏️ Editar
                            </button>
                            <button
                              onClick={() => handleApproveDraft(msg.id)}
                              disabled={draftPending}
                              className="flex items-center gap-1.5 rounded-lg border border-brand-blue-500/40 bg-brand-blue-500/20 px-4 py-1.5 text-[11px] font-bold text-brand-blue-300 hover:bg-brand-blue-500/30 transition-all shadow-[0_0_12px_rgba(59,130,246,0.15)] disabled:opacity-50"
                            >
                              <Check size={10} />
                              ✨ Aprovar e Enviar
                            </button>
                          </div>
                        )}
                      </motion.div>
                    );
                  }

                  const mediaMeta = (msg.metadata as any);
                  return (
                    <ChatBubble
                      key={msg.id}
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
                    >
                      {mediaMeta?.media_url ? (
                        <div className="flex flex-col gap-1.5">
                          {mediaMeta.media_type === 'image' ? (
                            <img
                              src={mediaMeta.media_url}
                              alt={mediaMeta.filename ?? 'imagem'}
                              className="max-w-[240px] rounded-xl object-cover"
                            />
                          ) : mediaMeta.media_type === 'video' ? (
                            <video src={mediaMeta.media_url} controls className="max-w-[240px] rounded-xl" />
                          ) : mediaMeta.media_type === 'audio' ? (
                            <audio src={mediaMeta.media_url} controls className="w-full max-w-[240px]" />
                          ) : (
                            <a
                              href={mediaMeta.media_url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="flex items-center gap-2 rounded-lg border border-white/20 bg-white/10 px-3 py-2 text-[12px] hover:bg-white/20 transition-colors"
                            >
                              <FileText size={14} className="shrink-0" />
                              <span className="truncate max-w-[180px]">{mediaMeta.filename ?? 'documento'}</span>
                            </a>
                          )}
                          {msg.content && msg.content !== mediaMeta.filename && (
                            <span className="text-[12px] opacity-80">{msg.content}</span>
                          )}
                        </div>
                      ) : msg.content}
                    </ChatBubble>
                  );
                })}

                {sortedMessages.length === 0 && (
                  <div className="my-12 text-center flex flex-col items-center gap-2">
                    <div className="h-1 w-8 bg-white/10 rounded-full" />
                    <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-white/20">Início da conversa</span>
                  </div>
                )}

                {isTyping && (
                  <motion.div
                    initial={{ opacity: 0, y: 8, scale: 0.95 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    className="flex items-center gap-2 self-start mt-2"
                  >
                    <div className="flex items-center gap-2 rounded-2xl rounded-bl-sm border border-white/[0.08] bg-white/[0.05] px-4 py-2.5 backdrop-blur-sm">
                      <div className="flex gap-1">
                        {[0, 1, 2].map((i) => (
                          <motion.span
                            key={i}
                            className="h-1.5 w-1.5 rounded-full bg-brand-blue-400"
                            animate={{ y: [0, -3, 0] }}
                            transition={{
                              duration: 0.8,
                              repeat: Infinity,
                              delay: i * 0.15,
                              ease: "easeInOut",
                            }}
                          />
                        ))}
                      </div>
                    </div>
                  </motion.div>
                )}
                <div ref={chatBottomRef} />
              </motion.div>
            </div>

            {/* Input Area */}
            <div className="relative bg-background/95 backdrop-blur-2xl border-t border-white/[0.08] p-3 sm:p-4 pb-[calc(72px+env(safe-area-inset-bottom,12px))] lg:pb-[env(safe-area-inset-bottom,16px)] shadow-[0_-10px_40px_rgba(0,0,0,0.5)]">
              <div className="max-w-5xl mx-auto relative group">
                {!isPaused && !isShadowMode && (
                  <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    className="absolute inset-0 z-20 flex items-center justify-center bg-black/60 backdrop-blur-sm rounded-2xl"
                  >
                    <Button
                      variant="blue"
                      size="sm"
                      className="gap-2 px-6 h-10 rounded-full font-black uppercase tracking-wider shadow-glow-blue"
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

                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*,application/pdf,video/mp4,video/3gpp,audio/mpeg,audio/ogg,audio/mp4,audio/aac,audio/amr"
                  className="hidden"
                  onChange={handleFileSelect}
                />

                <div className={cn(
                  "flex items-center gap-2 sm:gap-3 transition-all duration-300",
                  !isPaused && !isShadowMode && "blur-[2px] scale-[0.98] opacity-50"
                )}>
                  <div className="flex-1 relative flex flex-col gap-0 bg-white/[0.03] border border-white/[0.08] rounded-2xl px-3 py-1.5 transition-all focus-within:border-brand-blue-500/50 focus-within:bg-white/[0.06] focus-within:shadow-glow-blue/5">
                    {/* Attachment preview chip */}
                    {attachedFile && (
                      <div className="flex items-center gap-2 pt-2 pb-1">
                        <div className="flex items-center gap-2 rounded-lg border border-white/10 bg-white/[0.06] px-3 py-1.5 text-[11px] max-w-[220px]">
                          {attachPreview ? (
                            <img src={attachPreview} alt="" className="h-5 w-5 rounded object-cover shrink-0" />
                          ) : (
                            <FileText size={13} className="shrink-0 text-white/50" />
                          )}
                          <span className="truncate text-white/70">{attachedFile.name}</span>
                          <span className="shrink-0 text-white/30">
                            {(attachedFile.size / 1024).toFixed(0)}KB
                          </span>
                        </div>
                        <button
                          onClick={clearAttachment}
                          className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-white/10 hover:bg-white/20 transition-colors"
                        >
                          <X size={10} className="text-white/60" />
                        </button>
                      </div>
                    )}
                    <div className="flex items-end gap-2">
                    <Button
                      variant="ghost"
                      size="sm"
                      className={cn(
                        "h-9 w-9 rounded-xl p-0 hover:bg-white/5 shrink-0 mb-0.5 transition-colors",
                        attachedFile && "bg-brand-blue-500/20 text-brand-blue-400 hover:bg-brand-blue-500/30"
                      )}
                      disabled={inputBlocked}
                      onClick={() => fileInputRef.current?.click()}
                    >
                      <Paperclip size={18} className={cn(attachedFile ? "text-brand-blue-400" : "text-white/30")} />
                    </Button>
                    <textarea
                      ref={inputRef}
                      rows={1}
                      placeholder={attachedFile ? "Legenda (opcional)..." : "Escreva uma mensagem..."}
                      className="flex-1 bg-transparent py-2.5 text-[14px] outline-none placeholder:text-white/20 disabled:cursor-not-allowed resize-none max-h-32 custom-scrollbar"
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
                    </div>{/* end flex items-end row */}
                  </div>{/* end flex-col input container */}

                  <div className="relative group/send shrink-0 flex items-center justify-center h-12 w-12">
                    <div className={cn(
                      "absolute inset-0 rounded-full blur-md transition-all duration-500 opacity-0 group-hover/send:opacity-40 bg-brand-blue-500",
                      noteText.trim() && !sendPending && "group-hover/send:opacity-60"
                    )} />
                    <Button
                      variant="blue"
                      size="sm"
                      className={cn(
                        "relative h-11 w-11 rounded-full shrink-0 transition-all duration-500 overflow-hidden shadow-2xl z-10",
                        (noteText.trim() || attachedFile) ? "scale-100 opacity-100 shadow-glow-blue/40" : "scale-90 opacity-40 grayscale"
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
                            whileHover={{ x: [0, 5, 0], transition: { repeat: Infinity, duration: 1 } }}
                          >
                            <Send size={18} className={cn(
                              "transition-transform duration-300",
                              noteText.trim() && "group-hover/send:translate-x-0.5 group-hover/send:-translate-y-0.5 group-hover/send:scale-110"
                            )} />
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </Button>
                  </div>
                </div>
              </div>

              {!isPaused && selected.control_mode !== 'shadow' && (
                <p className="mt-3 text-center text-[9px] font-black uppercase tracking-[0.2em] text-brand-blue-400 animate-pulse">
                  Modo Automático Ativo · Agendra IA está no controle
                </p>
              )}
              {selected.control_mode === 'shadow' && (
                <p className="mt-3 text-center text-[9px] font-black uppercase tracking-[0.2em] text-brand-blue-400">
                  <Sparkles className="inline mr-1" size={9} />
                  Modo Copiloto · Aprove rascunhos acima ou escreva diretamente
                </p>
              )}
              {inboxError && (
                <p className="mt-2 text-center text-[11px] font-bold text-red-400">
                   Erro: {inboxError}
                </p>
              )}
            </div>
          </>
        )}
      </section>

      {/* COL 3 — detail */}
      <aside className="hidden flex-col gap-5 overflow-y-auto border-l border-white/[0.04] bg-white/[0.005] p-5 w-[300px] shrink-0 custom-scrollbar xl:flex z-10 select-none">
        {selected && (
          <motion.div
            initial={{ opacity: 0, x: 12 }}
            animate={{ opacity: 1, x: 0 }}
            className="flex flex-col gap-6"
          >
            <div className="flex flex-col items-center text-center gap-3.5 pb-4 border-b border-white/[0.04]">
              <div
                className="grid h-16 w-16 place-items-center rounded-2xl text-xl font-black text-white shadow-lg"
                style={{ background: HEAT_GRADIENT[selected.status] ?? HEAT_GRADIENT.cold }}
              >
                {initials(selected.name)}
              </div>
              <div>
                <h2 className="text-base font-bold text-white leading-tight">{selected.name}</h2>
                <p className="text-[11px] font-medium text-white/30 mt-0.5">{selected.phone}</p>
              </div>
            </div>

            <div className="space-y-6">
              <section>
                <h4 className="text-[10px] font-black uppercase tracking-[0.2em] text-white/20 mb-3">Inteligência Artificial</h4>
                <div className="space-y-4">
                  <div>
                    <span className="text-[11px] font-bold text-white/30 uppercase tracking-wider block mb-2">Tom da Conversa</span>
                    <ToneDropdown
                      selected={selected}
                      toneOpen={toneOpen}
                      setToneOpen={setToneOpen}
                      tonePending={tonePending}
                      onToneChange={handleToneChange}
                    />
                  </div>
                  <div>
                    <span className="text-[11px] font-bold text-white/30 uppercase tracking-wider block mb-2">Modo de Operação</span>
                    <ControlModeDropdown
                      selected={selected}
                      controlOpen={controlOpen}
                      setControlOpen={setControlOpen}
                      controlPending={controlPending}
                      onControlModeChange={handleControlModeChange}
                    />
                  </div>
                  {selected.summary && (
                    <div className="rounded-xl bg-white/[0.03] border border-white/[0.06] p-3">
                      <span className="text-[11px] font-bold text-white/30 uppercase tracking-wider block mb-1.5">Resumo IA</span>
                      <p className="text-[12px] leading-relaxed text-white/70 italic">"{selected.summary}"</p>
                    </div>
                  )}
                </div>
              </section>

              <section>
                <h4 className="text-[10px] font-black uppercase tracking-[0.2em] text-white/20 mb-3">Dados do Lead</h4>
                <div className="space-y-3">
                   <KV k="Status" v={HEAT_LABEL[selected.status]} color={selected.status === 'hot' ? 'text-orange-400' : 'text-blue-400'} />
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
      <div className="rounded-2xl border border-teal-500/15 bg-teal-500/5 p-4 relative overflow-hidden">
        <div className="flex flex-col gap-2">
          <div className="h-7 w-7 rounded-lg bg-teal-500/10 flex items-center justify-center text-teal-400">
            <CalendarCheck size={14} />
          </div>
          <div>
            <div className="text-[11px] font-bold text-teal-300">Agendamento Confirmado</div>
            <div className="text-[12px] font-semibold text-white mt-0.5">{next.title}</div>
            <div className="text-[10px] text-teal-400/80 mt-0.5 capitalize">{formatted}</div>
          </div>
        </div>
      </div>
    );
  }

  if (lead.status === "success") {
    return (
      <div className="rounded-2xl border border-brand-teal-500/10 bg-brand-teal-500/[0.02] p-4">
        <div className="flex flex-col gap-2">
          <div className="h-7 w-7 rounded-lg bg-brand-teal-500/10 flex items-center justify-center text-brand-teal-400">
            <CalendarCheck size={14} />
          </div>
          <div>
            <div className="text-[11px] font-bold text-white">Convertido</div>
            <div className="text-[10px] text-brand-teal-400/70 mt-0.5">Agendamento concluído</div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-white/[0.03] bg-white/[0.005] p-4">
      <div className="flex flex-col gap-2">
        <div className="h-7 w-7 rounded-lg bg-white/[0.04] flex items-center justify-center text-white/30">
          <CalendarCheck size={14} />
        </div>
        <div>
          <div className="text-[11px] font-bold text-white/40">Sem agendamento ativo</div>
          <div className="text-[10px] text-white/20 mt-0.5">
            {lead.status === "hot" ? "Lead quente — IA conduzindo para agendamento" : "IA qualificando lead"}
          </div>
        </div>
      </div>
    </div>
  );
}

function KV({ k, v, color = "text-white/60" }: { k: string; v: string; color?: string }) {
  return (
    <div className="flex items-center justify-between gap-2 text-[12px]">
      <span className="font-bold text-white/20 uppercase tracking-widest text-[10px]">{k}</span>
      <span className={cn("font-bold truncate max-w-[140px]", color)}>{v}</span>
    </div>
  );
}
