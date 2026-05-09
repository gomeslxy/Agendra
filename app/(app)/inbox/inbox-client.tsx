"use client";

import { useMemo, useState, useTransition } from "react";
import { motion } from "framer-motion";
import { CalendarCheck, Paperclip, Send } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { ChatBubble } from "@/components/app/chat-bubble";
import { HEAT_GRADIENT, HEAT_LABEL } from "@/lib/constants";
import { stagger } from "@/components/motion/variants";
import { cn } from "@/lib/utils";
import type { Lead, Message } from "@/lib/types/database";
import { sendNote, takeOverLead } from "./actions";

interface LeadWithMessages extends Lead {
  messages: Message[];
}

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
  // messages already sorted ascending by server. Last item is most recent.
  // Avoid spread+sort on every render — O(1) instead of O(n log n) per call.
  const msgs = lead.messages;
  return msgs.length > 0 ? msgs[msgs.length - 1] : undefined;
}

export function InboxClient({ leads }: { leads: LeadWithMessages[] }) {
  const [selectedId, setSelectedId] = useState<string | null>(leads[0]?.id ?? null);
  const [noteText, setNoteText] = useState("");
  const [sendPending, startSend] = useTransition();
  const [takePending, startTake] = useTransition();
  const [inboxError, setInboxError] = useState<string | null>(null);

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

  function handleSend() {
    if (!selected || !noteText.trim()) return;
    setInboxError(null);
    startSend(async () => {
      try {
        await sendNote(selected.id, noteText.trim());
        setNoteText("");
      } catch (e) {
        setInboxError((e as Error).message);
      }
    });
  }

  function handleTakeOver() {
    if (!selected) return;
    setInboxError(null);
    startTake(async () => {
      try {
        await takeOverLead(selected.id);
      } catch (e) {
        setInboxError((e as Error).message);
      }
    });
  }
  const { hot: hotCount, warm: warmCount, cold: coldCount } = counts;

  // server returns messages already sorted ascending — no need to re-sort
  const sortedMessages = selected ? selected.messages : [];

  return (
    <div className="grid h-full min-h-0 lg:grid-cols-[320px_1fr_320px]">
      {/* COL 1 — list */}
      <section className="mobile-scroll-area flex flex-col overflow-hidden border-r border-white/[0.08]">
        <div className="px-5 pb-3 pt-5 shrink-0">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-bold tracking-tight">Caixa de entrada</h2>
            <span className="font-mono text-[11px] font-medium uppercase tracking-wider" style={{ color: "var(--color-fg-3)" }}>
              {leads.length} hoje
            </span>
          </div>
          <div className="mt-3 flex flex-wrap gap-1.5">
            <Badge variant="hot" className="rounded-full">Quente · {hotCount}</Badge>
            <Badge variant="warm" className="rounded-full">Morno · {warmCount}</Badge>
            <Badge variant="cold" className="rounded-full">Frio · {coldCount}</Badge>
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
              <Badge variant={selected.status as "hot" | "warm" | "cold" | "success"} className="ml-auto">
                {HEAT_LABEL[selected.status]}
              </Badge>
              <Button variant="secondary" size="sm" disabled={takePending} onClick={handleTakeOver}>
                {takePending ? "…" : "Assumir"}
              </Button>
            </div>

            <motion.div
              key={selected.id}
              variants={stagger(0.04, 0.04)}
              initial="hidden"
              animate="show"
              className="flex flex-1 flex-col gap-2.5 overflow-y-auto py-4"
            >
              <ChatBubble variant="note">Agendra está respondendo automaticamente</ChatBubble>
              {sortedMessages.map((msg) => (
                <ChatBubble
                  key={msg.id}
                  variant={msg.role === "user" ? "lead" : msg.role === "note" ? "note" : "ai"}
                >
                  {msg.content}
                </ChatBubble>
              ))}
              {sortedMessages.length === 0 && (
                <div className="text-center text-xs" style={{ color: "var(--color-fg-3)" }}>
                  Nenhuma mensagem ainda.
                </div>
              )}
            </motion.div>

            <div className="mb-3">
              <p className={cn("text-xs transition-opacity duration-200", inboxError ? "opacity-100 text-red-400" : "opacity-0")}>
                {inboxError || "Fine"}
              </p>
              <div className="flex items-center gap-2.5 rounded-2xl border border-white/[0.08] bg-white/[0.06] p-2 pr-2.5 focus-within:border-brand-blue-500/50 focus-within:bg-white/[0.08] focus-within:shadow-glow-blue/10 transition-all duration-300">
                <Button variant="ghost" size="sm" className="h-9 w-9 rounded-xl p-0">
                  <Paperclip size={18} style={{ color: "var(--color-fg-3)" }} />
                </Button>
                <input
                  placeholder="Escreva uma nota interna ou assuma a conversa…"
                  className="flex-1 bg-transparent text-[13px] outline-none placeholder:text-fg-3/60"
                  value={noteText}
                  onChange={(e) => setNoteText(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSend(); } }}
                  disabled={sendPending}
                />
                <Button variant="blue" size="sm" className="h-9 gap-2 rounded-xl px-4 font-bold" disabled={sendPending || !noteText.trim()} onClick={handleSend}>
                  {sendPending ? "…" : <><Send size={14} /> Enviar</>}
                </Button>
              </div>
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
            <Card className="p-0 border-white/[0.06]">
              <CardHeader className="p-4 pb-2">
                <CardTitle className="eyebrow text-[10px]" style={{ color: "var(--color-brand-teal-300)" }}>
                  Qualificação · IA
                </CardTitle>
              </CardHeader>
              <CardContent className="p-4 pt-0">
                <KV k="Heat">
                  <Badge variant={selected.status as "hot" | "warm" | "cold" | "success"} className="px-2 py-0.5 font-bold uppercase text-[9px]">
                    {HEAT_LABEL[selected.status]} · {selected.heat_score}%
                  </Badge>
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

function DetailCard({
  title,
  titleColor,
  children,
}: {
  title: string;
  titleColor?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-xl border border-white/[0.08] bg-white/[0.03] p-3.5">
      <div className="eyebrow mb-2.5" style={{ color: titleColor }}>{title}</div>
      {children}
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
