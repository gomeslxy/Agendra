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

const LEAD_LIST_VARIANTS = stagger(0.02, 0.03);
const LEAD_ITEM_VARIANTS = { hidden: { opacity: 0, x: -8 }, show: { opacity: 1, x: 0 } };
const LEAD_ITEM_HOVER = { backgroundColor: "#F4F4F5" };

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
        "group relative flex cursor-pointer items-center gap-4 border-b border-[#F4F4F5] px-5 py-3.5 transition-all duration-150 select-none",
        isActive && "bg-[#EFF6FF] border-l-2 border-l-[#2563EB] pl-[18px] border-b-[#DBEAFE]"
      )}
    >
      {isActive && (
        <motion.div
          layoutId="active-lead"
          className="absolute inset-y-2 left-0 w-[2px] rounded-r-full bg-[#2563EB]"
          transition={{ type: "spring", stiffness: 400, damping: 30 }}
        />
      )}
      <div className="relative grid h-11 w-11 shrink-0 place-items-center rounded-full bg-[#F4F4F5] border border-[#E4E4E7] text-[10px] font-bold text-[#3F3F46]">
        {initials(l.name)}
        <div className={cn(
          "absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-white transition-all",
          l.status === "hot" ? "bg-[#F97316]" :
          l.status === "warm" ? "bg-[#F59E0B]" :
          l.status === "success" ? "bg-[#22C55E]" : "bg-[#3B82F6]"
        )} />
        {isUnread && (
          <motion.span
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            className="absolute -top-1 -right-1 h-2.5 w-2.5 rounded-full bg-[#2563EB] border-2 border-white"
          />
        )}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-1.5 min-w-0">
            <span className="truncate text-[13px] font-semibold text-[#09090B]">{l.name}</span>
            {l.channel === "whatsapp" && <MessageCircle size={11} className="text-[#14B8A6] shrink-0" />}
            {l.channel === "instagram" && <Instagram size={11} className="text-pink-400 shrink-0" />}
          </div>
          <span className="font-mono text-[9px] font-medium text-[#71717A] whitespace-nowrap">
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
  const [unreadLeadIds, setUnreadLeadIds] = useState<Set<string>>(new Set());
  const chatBottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const typingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const selectedIdRef = useRef<string | null>(selectedId);
  useEffect(() => { selectedIdRef.current = selectedId; }, [selectedId]);

  const handleLeadSelect = useCallback((id: string) => {
    setSelectedId(id);
    setShowChatOnMobile(true);
    setUnreadLeadIds((prev) => {
      if (!prev.has(id)) return prev;
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

  useEffect(() => {
    setIsTyping(false);
    if (typingTimerRef.current) clearTimeout(typingTimerRef.current);
  }, [selectedId]);

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

    const channel = supabase
      .channel(`inbox-realtime-${companyId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "messages", filter: companyFilter },
        (payload) => {
          const newMsg = payload.new as Message;
          if (newMsg.role === "user" && newMsg.lead_id === selectedIdRef.current) {
            setIsTyping(true);
            if (typingTimerRef.current) clearTimeout(typingTimerRef.current);
            typingTimerRef.current = setTimeout(() => setIsTyping(false), 8000);
          } else if (newMsg.role !== "user") {
            setIsTyping(false);
            if (typingTimerRef.current) clearTimeout(typingTimerRef.current);
          }

          if (newMsg.role === "user" && newMsg.lead_id !== selectedIdRef.current) {
            setUnreadLeadIds((prev) => new Set(prev).add(newMsg.lead_id));
          }

          setLeads((prev) => {
            const leadExists = prev.some((l) => l.id === newMsg.lead_id);
            if (!leadExists) {
              console.warn(`[Inbox] message ${newMsg.id} for unknown lead ${newMsg.lead_id} — fetching lead`);
              void fetchLeadById(newMsg.lead_id).then((lead) => {
                if (!lead) return;
                setLeads((p) => {
                  if (p.some((l) => l.id === lead.id)) {
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

      return { ...msg, isFirst, isLast, hideLabel: !isFirst, hideTime: !isLast };
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
    setNoteText("");

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
          setNoteText(content);
        }
      } catch (e) {
        setInboxError((e as Error).message);
        setNoteText(content);
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
  }, [selected, noteText, attachedFile, clearAttachment]);

  const handleTakeOver = useCallback(() => {
    if (!selected) return;
    setInboxError(null);

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
        setInboxError((e as Error).message);
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
  const inputBlocked = (!isPaused && !isShadowMode) || sendPending;

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
                isConnected
                  ? "bg-[#F0FDFA] text-[#0F766E] border border-[#CCFBF1]"
                  : "bg-[#F4F4F5] text-[#71717A] border border-[#E4E4E7]"
              )}>
                <span className={cn(
                  "h-1.5 w-1.5 rounded-full transition-all duration-500",
                  isConnected ? "bg-[#14B8A6] animate-pulse" : "bg-[#D4D4D8]"
                )} />
                {isConnected ? "LIVE" : "OFFLINE"}
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
          {inboxError && (
            <div className="mx-3 mb-2 flex items-center justify-between gap-2 rounded-xl border border-[#FECACA] bg-[#FFF1F2] px-3 py-2">
              <p className="text-[12px] font-medium text-[#DC2626] leading-tight">{inboxError}</p>
              <button
                onClick={() => router.refresh()}
                className="shrink-0 text-[11px] font-black uppercase tracking-wider text-[#DC2626] hover:text-[#991B1B] transition-colors"
              >
                Tentar novamente
              </button>
            </div>
          )}
          {filteredLeads.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-40 px-5 text-center gap-2">
              <div className="h-12 w-12 rounded-full bg-[#F4F4F5] flex items-center justify-center">
                <Zap size={20} className="text-[#D4D4D8]" />
              </div>
              <p className="text-xs font-medium text-[#A1A1AA]">Nenhum lead encontrado.</p>
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
                <div className="min-w-0">
                  <div className="truncate text-sm font-bold text-[#09090B]">{selected.name}</div>
                  <div className="flex items-center gap-1.5 truncate text-[10px] font-bold uppercase tracking-wider text-[#A1A1AA]">
                    <span className="h-1.5 w-1.5 rounded-full bg-[#22C55E] animate-pulse" />
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
                className="flex flex-col gap-3 p-4 sm:p-6 bg-[#F8F8F8] min-h-full"
              >
                {!isPaused && selected.control_mode !== 'shadow' && (
                  <ChatBubble variant="note">Agendra está respondendo automaticamente</ChatBubble>
                )}
                {selected.control_mode === 'shadow' && (
                  <ChatBubble variant="note">
                    <span className="flex items-center gap-1.5">
                      <Sparkles size={11} className="text-[#2563EB] shrink-0" />
                      Modo Copiloto ativo — IA gera rascunhos para sua aprovação
                    </span>
                  </ChatBubble>
                )}

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
                        <div className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-[#14B8A6]">
                          <Sparkles size={10} />
                          Rascunho da IA · Aguardando aprovação
                        </div>
                        <div className="relative rounded-[14px] rounded-br-[3px] border-[1.5px] border-[#CCFBF1] bg-[#F0FDFA] px-4 py-3 text-[13px] leading-relaxed text-[#166534]">
                          {msg.content}
                        </div>
                        {editingDraftId === msg.id ? (
                          <div className="flex flex-col gap-2 w-full">
                            <textarea
                              autoFocus
                              value={editDraftText}
                              onChange={(e) => setEditDraftText(e.target.value)}
                              rows={3}
                              className="w-full rounded-xl border-[1.5px] border-[#E4E4E7] bg-white px-3 py-2 text-[13px] text-[#09090B] outline-none resize-none focus:border-[#2563EB] focus:ring-2 focus:ring-[#2563EB]/10"
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
                              className="flex items-center gap-2 rounded-lg border border-[#E4E4E7] bg-[#F4F4F5] px-3 py-2 text-[12px] hover:bg-[#EBEBEC] transition-colors text-[#09090B]"
                            >
                              <FileText size={14} className="shrink-0 text-[#71717A]" />
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
                    <div className="h-1 w-8 bg-[#E4E4E7] rounded-full" />
                    <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-[#A1A1AA]">Início da conversa</span>
                  </div>
                )}

                {isTyping && (
                  <motion.div
                    initial={{ opacity: 0, y: 8, scale: 0.95 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
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
                    </div>
                  </motion.div>
                )}
                <div ref={chatBottomRef} />
              </motion.div>
            </div>

            {/* Input Area */}
            <div className="relative bg-white border-t border-[#E4E4E7] p-3 sm:p-4 pb-[calc(72px+env(safe-area-inset-bottom,12px))] lg:pb-[env(safe-area-inset-bottom,16px)]">
              <div className="max-w-5xl mx-auto relative group">
                {!isPaused && !isShadowMode && (
                  <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    className="absolute inset-0 z-20 flex items-center justify-center bg-white/80 backdrop-blur-sm rounded-2xl"
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

                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*,application/pdf,video/mp4,video/3gpp,audio/mpeg,audio/ogg,audio/mp4,audio/aac,audio/amr"
                  className="hidden"
                  onChange={handleFileSelect}
                />

                <div className={cn(
                  "flex items-center gap-2 sm:gap-3 transition-all duration-300",
                  !isPaused && !isShadowMode && "blur-[2px] scale-[0-98] opacity-50"
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

              {!isPaused && selected.control_mode !== 'shadow' && (
                <p className="mt-3 text-center text-[9px] font-bold uppercase tracking-[0.2em] text-[#14B8A6]">
                  Modo Automático Ativo · Agendra IA está no controle
                </p>
              )}
              {selected.control_mode === 'shadow' && (
                <p className="mt-3 text-center text-[9px] font-bold uppercase tracking-[0.2em] text-[#2563EB]">
                  <Sparkles className="inline mr-1" size={9} />
                  Modo Copiloto · Aprove rascunhos acima ou escreva diretamente
                </p>
              )}
              {inboxError && (
                <p className="mt-2 text-center text-[11px] font-bold text-[#DC2626]">Erro: {inboxError}</p>
              )}
            </div>
          </>
        )}
      </section>

      {/* COL 3 — detail */}
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
            <div className="text-[10px] text-[#A1A1AA] mt-0.5 capitalize">{formatted}</div>
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
