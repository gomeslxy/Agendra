"use client";

import { useMemo, useState, useTransition, useEffect, useRef, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { CalendarCheck, ChevronDown, Paperclip, Send, Zap } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { ChatBubble } from "@/components/app/chat-bubble";
import { HEAT_GRADIENT, HEAT_LABEL } from "@/lib/constants";
import { stagger } from "@/components/motion/variants";
import { cn } from "@/lib/utils";
import type { Lead, Message } from "@/lib/types/database";
import { sendNote, takeOverLead, automatizeLead, setConversationTone } from "./actions";
import { createBrowserClient } from "@supabase/ssr";
import { trackEvent } from "@/lib/analytics";

interface LeadWithMessages extends Lead {
  messages: Message[];
}

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
  const [noteText, setNoteText] = useState("");
  const [sendPending, startSend] = useTransition();
  const [takePending, startTake] = useTransition();
  const [tonePending, startTone] = useTransition();
  const [toneOpen, setToneOpen] = useState(false);
  const [inboxError, setInboxError] = useState<string | null>(null);
  const [isTyping, setIsTyping] = useState(false);
  const [isConnected, setIsConnected] = useState(false);
  const chatBottomRef = useRef<HTMLDivElement>(null);
  const typingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    chatBottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [leads, selectedId]);

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

  const counts = useMemo(() => {
    let hot = 0, warm = 0, cold = 0;
    for (const l of leads) {
      if (l.status === "hot") hot++;
      else if (l.status === "warm") warm++;
      else if (l.status === "cold") cold++;
    }
    return { hot, warm, cold };
  }, [leads]);

  const handleSend = useCallback(() => {
    if (!selected || !noteText.trim()) return;
    setInboxError(null);
    startSend(async () => {
      try {
        await sendNote(selected.id, noteText.trim());
        trackEvent("message_sent", { lead_id: selected.id });
        setNoteText("");
      } catch (e) {
        setInboxError((e as Error).message);
      }
    });
  }, [selected, noteText]);

  const handleTakeOver = useCallback(() => {
    if (!selected) return;
    setInboxError(null);
    // optimistic
    setLeads((prev) =>
      prev.map((l) => (l.id === selected.id ? { ...l, auto_respond: false } : l)),
    );
    startTake(async () => {
      try {
        await takeOverLead(selected.id);
        trackEvent("lead_takeover", { lead_id: selected.id });
      } catch (e) {
        // revert
        setLeads((prev) =>
          prev.map((l) => (l.id === selected.id ? { ...l, auto_respond: true } : l)),
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
    <div className="grid h-full min-h-0 lg:grid-cols-[320px_1fr_320px]">
      {/* COL 1 — list */}
      <section className="mobile-scroll-area flex flex-col overflow-hidden border-r border-white/[0.08]">
        <div className="px-5 pb-3 pt-5 shrink-0">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-bold tracking-tight">Caixa de entrada</h2>
            <div className="flex items-center gap-2">
              <div
                className={cn(
                  "flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[10px] font-medium transition-all duration-500",
                  isConnected
                    ? "bg-teal-500/10 text-teal-400"
                    : "bg-white/5 text-white/30"
                )}
              >
                <span
                  className={cn(
                    "h-1.5 w-1.5 rounded-full transition-all duration-500",
                    isConnected
                      ? "bg-teal-400 shadow-[0_0_6px_rgba(45,212,191,0.8)] animate-pulse"
                      : "bg-white/20"
                  )}
                />
                {isConnected ? "Live" : "—"}
              </div>
              <span className="font-mono text-[11px] font-medium uppercase tracking-wider" style={{ color: "var(--color-fg-3)" }}>
                {leads.length} hoje
              </span>
            </div>
          </div>
          <div className="mt-3 flex flex-wrap gap-1.5 opacity-0 pointer-events-none h-0">
            {/* Heat filters removed per user request */}
          </div>
        </div>

        <div className="flex-1 overflow-y-auto">
          {leads.length === 0 ? (
            <div className="px-5 py-8 text-sm italic" style={{ color: "var(--color-fg-3)" }}>
              Nenhuma conversa ainda.
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
                    whileTap={{ scale: 0.98 }}
                    onClick={() => setSelectedId(l.id)}
                    className={cn(
                      "group relative grid cursor-pointer grid-cols-[auto_1fr_auto] gap-3 border-b border-white/[0.04] px-5 py-4 transition-all duration-200",
                      isActive && "bg-brand-blue-600/10"
                    )}
                  >
                    {isActive && (
                      <motion.div
                        layoutId="active-lead"
                        className="absolute inset-y-1 left-1 w-1 rounded-full bg-brand-blue-500"
                        transition={{ type: "spring", stiffness: 400, damping: 30 }}
                      />
                    )}
                    <div
                      className="grid h-10 w-10 shrink-0 place-items-center rounded-full text-[13px] font-bold text-white shadow-lg shadow-black/20"
                      style={{ background: HEAT_GRADIENT[l.status] ?? HEAT_GRADIENT.cold }}
                    >
                      {initials(l.name)}
                    </div>
                    <div className="min-w-0">
                      <div className="truncate text-[13px] font-bold tracking-tight">{l.name}</div>
                      <div className="mt-1 truncate text-xs font-medium" style={{ color: isActive ? "var(--color-fg-2)" : "var(--color-fg-3)" }}>
                        {last?.content ?? "Sem mensagens"}
                      </div>
                    </div>
                    <div className="flex flex-col items-end gap-1.5">
                      <div className="font-mono text-[10px] font-medium" style={{ color: "var(--color-fg-3)" }}>
                        {last ? relativeTime(last.created_at) : "—"}
                      </div>
                      <span
                        className={cn(
                          "h-1.5 w-1.5 rounded-full ring-2 ring-transparent transition-all group-hover:ring-white/10",
                          l.status === "hot" ? "bg-orange-spark shadow-[0_0_8px_rgba(249,115,22,0.6)]" :
                          l.status === "warm" ? "bg-yellow-500" :
                          l.status === "success" ? "bg-teal-flow shadow-[0_0_8px_rgba(20,184,166,0.6)]" : "bg-blue-400"
                        )}
                      />
                    </div>
                  </motion.div>
                );
              })}
            </motion.div>
          )}
        </div>
      </section>

      {/* COL 2 — chat */}
      <section className="flex min-h-0 flex-col px-6 py-5">
        {!selected ? (
          <div className="flex flex-1 items-center justify-center text-sm" style={{ color: "var(--color-fg-3)" }}>
            Selecione uma conversa
          </div>
        ) : (
          <>
            <div className="flex items-center gap-3 border-b border-white/[0.08] pb-3.5">
              <div
                className="grid h-10 w-10 shrink-0 place-items-center rounded-full text-sm font-bold text-white"
                style={{ background: HEAT_GRADIENT[selected.status] ?? HEAT_GRADIENT.cold }}
              >
                {initials(selected.name)}
              </div>
              <div>
                <div className="text-sm font-semibold">{selected.name}</div>
                <div className="text-xs" style={{ color: "var(--color-fg-3)" }}>
                  {selected.phone} · {selected.channel}
                </div>
              </div>
              {/* Heat badge removed per user request */}
              <Button
                variant="secondary"
                size="sm"
                disabled={takePending}
                onClick={isAutoRespond ? handleTakeOver : handleAutomatize}
              >
                {takePending ? "…" : isAutoRespond ? "Assumir" : "Automatizar"}
              </Button>
              <div className="lg:hidden">
                <ToneDropdown compact />
              </div>
            </div>

            <motion.div
              key={selected.id}
              variants={stagger(0.04, 0.04)}
              initial="hidden"
              animate="show"
              className="flex flex-1 flex-col gap-2.5 overflow-y-auto py-4"
            >
              {isAutoRespond && (
                <ChatBubble variant="note">Agendra está respondendo automaticamente</ChatBubble>
              )}
              {sortedMessages.map((msg) => (
                <ChatBubble
                  key={msg.id}
                  variant={
                    msg.role === "user" ? "lead" :
                    msg.role === "note" ? "note" :
                    msg.role === "agent" ? "agent" :
                    "ai"
                  }
                >
                  {msg.content}
                </ChatBubble>
              ))}
              {sortedMessages.length === 0 && (
                <div className="text-center text-xs" style={{ color: "var(--color-fg-3)" }}>
                  Nenhuma mensagem ainda.
                </div>
              )}

              <AnimatePresence>
                {isTyping && selected.id === selectedId && (
                  <motion.div
                    key="typing"
                    initial={{ opacity: 0, y: 8, scale: 0.95 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: 4, scale: 0.95 }}
                    transition={{ duration: 0.2 }}
                    className="flex items-center gap-2 self-start"
                  >
                    <div className="flex items-center gap-1.5 rounded-2xl rounded-bl-sm border border-white/[0.08] bg-white/[0.05] px-4 py-2.5">
                      <div className="flex gap-1">
                        {[0, 1, 2].map((i) => (
                          <motion.span
                            key={i}
                            className="h-1.5 w-1.5 rounded-full bg-brand-blue-400"
                            animate={{ y: [0, -4, 0] }}
                            transition={{
                              duration: 0.8,
                              repeat: Infinity,
                              delay: i * 0.15,
                              ease: "easeInOut",
                            }}
                          />
                        ))}
                      </div>
                      <span className="text-[11px] font-medium" style={{ color: "var(--color-fg-3)" }}>
                        Agendra digitando…
                      </span>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>

              <div ref={chatBottomRef} />
            </motion.div>

            <div className="mb-3">
              <p className={cn("text-xs transition-opacity duration-200", inboxError ? "opacity-100 text-red-400" : "opacity-0")}>
                {inboxError || "Fine"}
              </p>
              <div className={cn(
                "flex items-center gap-2.5 rounded-2xl border bg-white/[0.06] p-2 pr-2.5 transition-all duration-300",
                inputBlocked
                  ? "border-white/[0.04] opacity-60 cursor-not-allowed"
                  : "border-white/[0.08] focus-within:border-brand-blue-500/50 focus-within:bg-white/[0.08] focus-within:shadow-glow-blue/10"
              )}>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-9 w-9 rounded-xl p-0"
                  disabled={inputBlocked}
                  title={isAutoRespond ? "Assuma a conversa para enviar arquivos" : undefined}
                >
                  <Paperclip size={18} style={{ color: "var(--color-fg-3)" }} />
                </Button>
                <input
                  placeholder={
                    isAutoRespond
                      ? "Clique em 'Assumir' para escrever uma mensagem…"
                      : "Escreva uma mensagem para o lead…"
                  }
                  className="flex-1 bg-transparent text-[13px] outline-none placeholder:text-fg-3/60 disabled:cursor-not-allowed"
                  value={noteText}
                  onChange={(e) => setNoteText(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      if (!inputBlocked) handleSend();
                    }
                  }}
                  disabled={inputBlocked}
                />
                <Button
                  variant="blue"
                  size="sm"
                  className="h-9 gap-2 rounded-xl px-4 font-bold"
                  disabled={inputBlocked || !noteText.trim()}
                  onClick={handleSend}
                >
                  {sendPending ? "…" : <><Send size={14} /> Enviar</>}
                </Button>
              </div>
              {isAutoRespond && (
                <p className="mt-1.5 text-center text-[11px]" style={{ color: "var(--color-fg-3)" }}>
                  Chat automatizado · clique em <strong>Assumir</strong> para liberar o chat
                </p>
              )}
            </div>
          </>
        )}
      </section>

      {/* COL 3 — detail */}
      <aside className="hidden flex-col gap-3.5 overflow-y-auto border-l border-white/[0.08] p-5 lg:flex">
        {selected && (
          <motion.div
            initial={{ opacity: 0, x: 10 }}
            animate={{ opacity: 1, x: 0 }}
            className="flex flex-col gap-4"
          >
            <Card className="p-0 border-white/[0.06] !overflow-visible">
              <CardHeader className="p-4 pb-2">
                <CardTitle className="eyebrow text-[10px]" style={{ color: "var(--color-brand-teal-300)" }}>
                  Inteligência Artificial
                </CardTitle>
              </CardHeader>
              <CardContent className="p-4 pt-0 !overflow-visible">
                <KV k="Tom da IA">
                  <ToneDropdown />
                </KV>
                {selected.summary && <KV k="Resumo"><p className="leading-relaxed opacity-80">{selected.summary}</p></KV>}
                <KV k="Canal">{selected.channel}</KV>
              </CardContent>
            </Card>

            <Card className="p-0 border-white/[0.06]">
              <CardHeader className="p-4 pb-2">
                <CardTitle className="eyebrow text-[10px]">Contato</CardTitle>
              </CardHeader>
              <CardContent className="p-4 pt-0">
                <KV k="Telefone">{selected.phone}</KV>
                <KV k="Origem">{selected.source ?? "Direto"}</KV>
                {selected.city && <KV k="Cidade">{selected.city}</KV>}
                {selected.email && <KV k="Email">{selected.email}</KV>}
              </CardContent>
            </Card>

            <div className={cn(
              "rounded-2xl border p-4 relative overflow-hidden transition-all duration-500",
              isConnected
                ? "border-teal-500/20 bg-teal-500/5"
                : "border-white/[0.06] bg-white/[0.02]"
            )}>
              <div className="absolute top-0 right-0 p-3 opacity-10">
                <Zap size={48} />
              </div>
              <div className={cn(
                "eyebrow text-[10px] mb-2 transition-colors duration-500",
                isConnected ? "text-teal-400" : "text-white/30"
              )}>
                {isConnected ? "Realtime · Conectado" : "Realtime · Offline"}
              </div>
              <div className="flex items-center gap-3">
                <div className={cn(
                  "h-10 w-10 shrink-0 rounded-full grid place-items-center transition-all duration-500",
                  isConnected ? "bg-teal-500/20" : "bg-white/5"
                )}>
                  <Zap size={20} className={isConnected ? "text-teal-300" : "text-white/20"} />
                </div>
                <div>
                  <div className="text-sm font-bold text-white">
                    {isConnected ? "Mensagens ao vivo" : "Reconectando…"}
                  </div>
                  <div className="text-[11px] font-medium" style={{ color: "var(--color-fg-3)" }}>
                    {isConnected
                      ? "Atualizações instantâneas ativas"
                      : "Verificando conexão com Supabase"}
                  </div>
                </div>
              </div>
            </div>

            <div className="rounded-2xl border border-brand-teal-500/20 bg-brand-teal-500/5 p-4 relative overflow-hidden">
              <div className="absolute top-0 right-0 p-3 opacity-10">
                 <CalendarCheck size={48} />
              </div>
              <div className="eyebrow text-[10px] text-brand-teal-400 mb-2">Próximo Passo</div>
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 shrink-0 rounded-full bg-brand-teal-500/20 grid place-items-center">
                  <CalendarCheck size={20} className="text-brand-teal-300" />
                </div>
                <div>
                  <div className="text-sm font-bold text-white">Agendamento em progresso</div>
                  <div className="text-[11px] font-medium" style={{ color: "var(--color-fg-3)" }}>
                    IA aguardando confirmação
                  </div>
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </aside>
    </div>
  );
}

function KV({ k, children }: { k: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[90px_1fr] gap-2 py-1 text-[13px]">
      <span className="self-center font-mono text-[11px] uppercase tracking-wider"
            style={{ color: "var(--color-fg-3)" }}>
        {k}
      </span>
      <span>{children}</span>
    </div>
  );
}
