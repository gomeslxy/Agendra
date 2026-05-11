"use client";

import { useMemo, useState, useTransition, useEffect, useRef, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { CalendarCheck, ChevronDown, ChevronLeft, Paperclip, Send, Zap } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { ChatBubble } from "@/components/app/chat-bubble";
import { HEAT_GRADIENT, HEAT_LABEL } from "@/lib/constants";
import { stagger } from "@/components/motion/variants";
import { cn } from "@/lib/utils";
import type { Lead, Message } from "@/lib/types/database";
import type { LeadWithMessages } from "./page";
import { sendNote, takeOverLead, automatizeLead, setConversationTone } from "./actions";
import { createBrowserClient } from "@supabase/ssr";
import { trackEvent } from "@/lib/analytics";


const TONE_CYCLE: Array<"cold" | "warm" | "hot"> = ["cold", "warm", "hot"];
const TONE_LABEL: Record<string, string> = { cold: "Formal", warm: "Amigável", hot: "Persuasivo" };

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

export function InboxClient({ leads: initialLeads }: { leads: LeadWithMessages[] }) {
  const [leads, setLeads] = useState<LeadWithMessages[]>(initialLeads);
  const [selectedId, setSelectedId] = useState<string | null>(initialLeads[0]?.id ?? null);
  const [showChatOnMobile, setShowChatOnMobile] = useState(false);
  const [noteText, setNoteText] = useState("");
  const [sendPending, startSend] = useTransition();
  const [takePending, startTake] = useTransition();
  const [tonePending, startTone] = useTransition();
  const [toneOpen, setToneOpen] = useState(false);
  const [inboxError, setInboxError] = useState<string | null>(null);
  const [isTyping, setIsTyping] = useState(false);
  const [isConnected, setIsConnected] = useState(false);
  const chatBottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const typingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    chatBottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [leads, selectedId, showChatOnMobile]);

  useEffect(() => {
    const supabase = createBrowserClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    );

    const channel = supabase
      .channel("inbox-realtime")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "messages" },
        (payload) => {
          const newMsg = payload.new as Message;
          if (newMsg.role === "user") {
            setIsTyping(true);
            if (typingTimerRef.current) clearTimeout(typingTimerRef.current);
            typingTimerRef.current = setTimeout(() => setIsTyping(false), 8000);
          } else {
            setIsTyping(false);
            if (typingTimerRef.current) clearTimeout(typingTimerRef.current);
          }
          setLeads((prev) =>
            prev.map((lead) => {
              if (lead.id !== newMsg.lead_id) return lead;
              if (lead.messages.some((m) => m.id === newMsg.id)) return lead;
              return { ...lead, messages: [...lead.messages, newMsg] };
            }),
          );
        },
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "leads" },
        (payload) => {
          const updatedLead = payload.new as Lead;
          setLeads((prev) =>
            prev.map((lead) =>
              lead.id === updatedLead.id ? { ...lead, ...updatedLead } : lead,
            ),
          );
        },
      )
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "leads" },
        (payload) => {
          const newLead = payload.new as Lead;
          setLeads((prev) => {
            if (prev.some((l) => l.id === newLead.id)) return prev;
            return [{ ...newLead, messages: [] }, ...prev];
          });
        },
      )
      .subscribe((status) => {
        setIsConnected(status === "SUBSCRIBED");
      });

    return () => {
      if (typingTimerRef.current) clearTimeout(typingTimerRef.current);
      supabase.removeChannel(channel);
    };
  }, []);

  const selected = useMemo(
    () => leads.find((l) => l.id === selectedId) ?? null,
    [leads, selectedId],
  );

  // Restore focus after sending message or taking over
  useEffect(() => {
    if (!sendPending && !takePending && selected) {
      inputRef.current?.focus();
    }
  }, [sendPending, takePending, selected?.id]);

  const counts = useMemo(() => {
    let hot = 0, warm = 0, cold = 0;
    for (const l of leads) {
      if (l.status === "hot") hot++;
      else if (l.status === "warm") warm++;
      else if (l.status === "cold") cold++;
    }
    return { hot, warm, cold };
  }, [leads]);

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

  const handleSend = useCallback(() => {
    if (!selected || !noteText.trim()) return;
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
        await sendNote(selected.id, content);
        trackEvent("message_sent", { lead_id: selected.id });
      } catch (e) {
        setInboxError((e as Error).message);
        // Remove optimistic message on error
        setLeads((prev) =>
          prev.map((l) =>
            l.id === selected.id
              ? { ...l, messages: l.messages.filter((m) => m.id !== tempId) }
              : l
          )
        );
        setNoteText(content); // Restore text
      }
    });
  }, [selected, noteText]);

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
      prev.map((l) => (l.id === selected.id ? { ...l, auto_respond: false, messages: [...l.messages, tempNote] } : l)),
    );

    startTake(async () => {
      try {
        await takeOverLead(selected.id);
        trackEvent("lead_takeover", { lead_id: selected.id });
      } catch (e) {
        // revert
        setLeads((prev) =>
          prev.map((l) => (l.id === selected.id ? { ...l, auto_respond: true, messages: l.messages.filter(m => m.id !== tempId) } : l)),
        );
        setInboxError((e as Error).message);
      }
    });
  }, [selected]);

  const handleAutomatize = useCallback(() => {
    if (!selected) return;
    setInboxError(null);
    setLeads((prev) =>
      prev.map((l) => (l.id === selected.id ? { ...l, auto_respond: true } : l)),
    );
    startTake(async () => {
      try {
        await automatizeLead(selected.id);
        trackEvent("lead_automatize", { lead_id: selected.id });
      } catch (e) {
        setLeads((prev) =>
          prev.map((l) => (l.id === selected.id ? { ...l, auto_respond: false } : l)),
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

  const ToneDropdown = ({ compact = false }: { compact?: boolean }) => {
    if (!selected) return null;
    return (
      <div className="relative">
        <button
          onClick={(e) => {
            e.stopPropagation();
            setToneOpen(!toneOpen);
          }}
          disabled={tonePending}
          className={cn(
            "flex items-center justify-between gap-2 rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-[11px] font-bold uppercase tracking-wide transition-all duration-200 hover:bg-white/10 disabled:opacity-50",
            toneOpen && "border-brand-blue-500/30 bg-white/10",
            compact ? "h-8 px-2" : "w-full"
          )}
        >
          <div className="flex items-center gap-2">
            <span
              className={cn(
                "h-1.5 w-1.5 rounded-full",
                selected.conversation_tone === "hot" ? "bg-orange-400 shadow-[0_0_6px_rgba(251,146,60,0.6)]" :
                selected.conversation_tone === "warm" ? "bg-yellow-400 shadow-[0_0_6px_rgba(250,204,21,0.6)]" :
                "bg-blue-400 shadow-[0_0_6px_rgba(96,165,250,0.6)]"
              )}
            />
            <span className={cn(
              "text-[10px] sm:text-[11px]",
              selected.conversation_tone === "hot" ? "text-orange-400" :
              selected.conversation_tone === "warm" ? "text-yellow-400" :
              "text-blue-400"
            )}>
              {TONE_LABEL[selected.conversation_tone ?? "warm"]}
            </span>
          </div>
          <ChevronDown size={12} className={cn("text-white/40 transition-transform duration-300", toneOpen && "rotate-180")} />
        </button>

        <AnimatePresence>
          {toneOpen && (
            <>
              <div className="fixed inset-0 z-[100]" onClick={() => setToneOpen(false)} />
              <motion.div
                initial={{ opacity: 0, y: -4, scale: 0.95 }}
                animate={{ opacity: 1, y: 4, scale: 1 }}
                exit={{ opacity: 0, y: -4, scale: 0.95 }}
                className={cn(
                  "absolute z-[101] overflow-hidden rounded-xl border border-white/10 bg-[#0A0A0A]/95 backdrop-blur-xl p-1 shadow-2xl shadow-black/50",
                  compact ? "right-0 top-full mt-1 w-32" : "left-0 top-full w-full"
                )}
              >
                {TONE_CYCLE.map((t) => (
                  <button
                    key={t}
                    onClick={() => {
                      handleToneChange(t);
                      setToneOpen(false);
                    }}
                    className={cn(
                      "flex w-full items-center gap-2 rounded-lg px-3 py-2 text-[11px] font-bold uppercase tracking-wide transition-colors",
                      selected.conversation_tone === t
                        ? "bg-white/10 text-white"
                        : "text-white/40 hover:bg-white/5 hover:text-white/70"
                    )}
                  >
                    <span
                      className={cn(
                        "h-1.5 w-1.5 rounded-full",
                        t === "hot" ? "bg-orange-400" :
                        t === "warm" ? "bg-yellow-400" : "bg-blue-400"
                      )}
                    />
                    {TONE_LABEL[t]}
                  </button>
                ))}
              </motion.div>
            </>
          )}
        </AnimatePresence>
      </div>
    );
  };

  const { hot: hotCount, warm: warmCount, cold: coldCount } = counts;
  const sortedMessages = selected ? selected.messages : [];
  const isAutoRespond = selected?.auto_respond ?? true;
  const inputBlocked = isAutoRespond || sendPending;

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
          <div className="mt-4 flex items-center gap-2 rounded-xl bg-white/[0.03] border border-white/[0.06] px-3 py-2">
            <span className="text-[11px] font-bold uppercase tracking-wider text-white/40">Atividade:</span>
            <span className="font-mono text-[11px] font-bold text-brand-blue-400">
              {leads.length} leads hoje
            </span>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto overflow-x-hidden custom-scrollbar pb-[calc(72px+env(safe-area-inset-bottom,12px))] lg:pb-0">
          {leads.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-40 px-5 text-center gap-2">
              <div className="h-12 w-12 rounded-full bg-white/5 flex items-center justify-center">
                <Zap size={20} className="text-white/20" />
              </div>
              <p className="text-xs font-medium text-white/30 italic">Nenhuma conversa disponível.</p>
            </div>
          ) : (
            <motion.div variants={stagger(0.02, 0.03)} initial="hidden" animate="show" className="flex flex-col">
              {leads.map((l) => {
                const last = lastMsg(l);
                const isActive = l.id === selectedId;
                return (
                  <motion.div
                    key={l.id}
                    variants={{ hidden: { opacity: 0, x: -8 }, show: { opacity: 1, x: 0 } }}
                    whileHover={{ backgroundColor: "rgba(255,255,255,0.03)" }}
                    onClick={() => {
                      setSelectedId(l.id);
                      setShowChatOnMobile(true);
                    }}
                    className={cn(
                      "group relative flex cursor-pointer items-center gap-4 border-b border-white/[0.04] px-5 py-4 transition-all duration-200",
                      isActive && "bg-brand-blue-600/10"
                    )}
                  >
                    {isActive && (
                      <motion.div
                        layoutId="active-lead"
                        className="absolute inset-y-2 left-0 w-1 rounded-r-full bg-brand-blue-500 shadow-[0_0_10px_rgba(59,130,246,0.5)]"
                        transition={{ type: "spring", stiffness: 400, damping: 30 }}
                      />
                    )}
                    <div
                      className="relative grid h-12 w-12 shrink-0 place-items-center rounded-full text-sm font-black text-white shadow-xl"
                      style={{ background: HEAT_GRADIENT[l.status] ?? HEAT_GRADIENT.cold }}
                    >
                      {initials(l.name)}
                      <div className={cn(
                        "absolute -bottom-0.5 -right-0.5 h-3.5 w-3.5 rounded-full border-2 border-[#050505] transition-all",
                        l.status === "hot" ? "bg-orange-500 shadow-[0_0_8px_rgba(249,115,22,0.6)]" :
                        l.status === "warm" ? "bg-yellow-500" :
                        l.status === "success" ? "bg-teal-500" : "bg-blue-400"
                      )} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-2">
                        <span className="truncate text-[14px] font-bold tracking-tight text-white">{l.name}</span>
                        <span className="font-mono text-[10px] font-bold uppercase text-white/30 whitespace-nowrap">
                          {last ? relativeTime(last.created_at) : "—"}
                        </span>
                      </div>
                      <div className="mt-1 flex items-center gap-1.5">
                        <span className={cn(
                          "truncate text-[12px] font-medium transition-colors",
                          isActive ? "text-white/70" : "text-white/40"
                        )}>
                          {last?.content ?? "Nenhuma mensagem"}
                        </span>
                      </div>
                    </div>
                  </motion.div>
                );
              })}
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
          <div className="flex flex-1 flex-col items-center justify-center gap-4 p-8 text-center">
            <div className="h-20 w-20 rounded-full bg-white/[0.02] border border-white/[0.05] flex items-center justify-center shadow-inner">
               <Zap size={32} className="text-white/10" />
            </div>
            <div>
              <h3 className="text-lg font-bold text-white/40">Agendra Inbox</h3>
              <p className="text-sm text-white/20 mt-1 max-w-[240px]">Selecione um lead para iniciar a gestão de atendimento em tempo real.</p>
            </div>
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
                <Button
                  variant={isAutoRespond ? "secondary" : "blue"}
                  size="sm"
                  className={cn(
                    "h-8 rounded-lg px-3 text-[11px] font-black uppercase tracking-wider transition-all",
                    !isAutoRespond && "shadow-glow-blue/20"
                  )}
                  disabled={takePending}
                  onClick={isAutoRespond ? handleTakeOver : handleAutomatize}
                >
                  {takePending ? "…" : isAutoRespond ? "Assumir" : "Automatizar"}
                </Button>
                <div className="hidden sm:block">
                  <ToneDropdown compact />
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
                {isAutoRespond && (
                  <ChatBubble variant="note">Agendra está respondendo automaticamente</ChatBubble>
                )}

                {/* Group messages by date could be added here */}

                {groupedMessages.map((msg) => (
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
                    {msg.content}
                  </ChatBubble>
                ))}

                {sortedMessages.length === 0 && (
                  <div className="my-12 text-center flex flex-col items-center gap-2">
                    <div className="h-1 w-8 bg-white/10 rounded-full" />
                    <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-white/20">Início da conversa</span>
                  </div>
                )}

                {isTyping && selected.id === selectedId && (
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
                {isAutoRespond && (
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

                <div className={cn(
                  "flex items-center gap-2 sm:gap-3 transition-all duration-300",
                  isAutoRespond && "blur-[2px] scale-[0.98] opacity-50"
                )}>
                  <div className="flex-1 relative flex items-end gap-2 bg-white/[0.03] border border-white/[0.08] rounded-2xl px-3 py-1.5 transition-all focus-within:border-brand-blue-500/50 focus-within:bg-white/[0.06] focus-within:shadow-glow-blue/5">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-9 w-9 rounded-xl p-0 hover:bg-white/5 shrink-0 mb-0.5"
                      disabled={inputBlocked}
                    >
                      <Paperclip size={18} className="text-white/30" />
                    </Button>
                    <textarea
                      ref={inputRef}
                      rows={1}
                      placeholder="Escreva uma mensagem..."
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
                  </div>
                  
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
                        noteText.trim() ? "scale-100 opacity-100 shadow-glow-blue/40" : "scale-90 opacity-40 grayscale"
                      )}
                      disabled={inputBlocked || !noteText.trim()}
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

              {isAutoRespond && (
                <p className="mt-3 text-center text-[9px] font-black uppercase tracking-[0.2em] text-brand-blue-400 animate-pulse">
                  Modo Automático Ativo · Agendra IA está no controle
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
      <aside className="hidden flex-col gap-4 overflow-y-auto border-l border-white/[0.08] bg-background/30 p-5 w-[320px] shrink-0 custom-scrollbar xl:flex">
        {selected && (
          <motion.div
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            className="flex flex-col gap-6"
          >
            <div className="flex flex-col items-center text-center gap-4 pb-4 border-b border-white/[0.06]">
              <div
                className="grid h-20 w-20 place-items-center rounded-3xl text-2xl font-black text-white shadow-2xl rotate-3"
                style={{ background: HEAT_GRADIENT[selected.status] ?? HEAT_GRADIENT.cold }}
              >
                {initials(selected.name)}
              </div>
              <div>
                <h2 className="text-lg font-bold text-white">{selected.name}</h2>
                <p className="text-xs font-medium text-white/40">{selected.phone}</p>
              </div>
            </div>

            <div className="space-y-6">
              <section>
                <h4 className="text-[10px] font-black uppercase tracking-[0.2em] text-white/20 mb-3">Inteligência Artificial</h4>
                <div className="space-y-4">
                  <div>
                    <span className="text-[11px] font-bold text-white/30 uppercase tracking-wider block mb-2">Tom da Conversa</span>
                    <ToneDropdown />
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
      <div className="rounded-2xl border border-teal-500/30 bg-teal-500/10 p-4 relative overflow-hidden">
        <div className="flex flex-col gap-2">
          <div className="h-8 w-8 rounded-lg bg-teal-500/20 flex items-center justify-center text-teal-400">
            <CalendarCheck size={16} />
          </div>
          <div>
            <div className="text-xs font-bold text-teal-300">Agendamento Confirmado</div>
            <div className="text-[12px] font-semibold text-white mt-0.5">{next.title}</div>
            <div className="text-[11px] text-teal-400/80 mt-0.5 capitalize">{formatted}</div>
          </div>
        </div>
      </div>
    );
  }

  if (lead.status === "success") {
    return (
      <div className="rounded-2xl border border-brand-teal-500/20 bg-brand-teal-500/5 p-4">
        <div className="flex flex-col gap-2">
          <div className="h-8 w-8 rounded-lg bg-brand-teal-500/20 flex items-center justify-center text-brand-teal-400">
            <CalendarCheck size={16} />
          </div>
          <div>
            <div className="text-xs font-bold text-white">Convertido</div>
            <div className="text-[11px] text-brand-teal-400/70 mt-0.5">Agendamento concluído</div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-white/[0.06] bg-white/[0.02] p-4">
      <div className="flex flex-col gap-2">
        <div className="h-8 w-8 rounded-lg bg-white/[0.05] flex items-center justify-center text-white/30">
          <CalendarCheck size={16} />
        </div>
        <div>
          <div className="text-xs font-bold text-white/50">Sem agendamento ativo</div>
          <div className="text-[11px] text-white/30 mt-0.5">
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
