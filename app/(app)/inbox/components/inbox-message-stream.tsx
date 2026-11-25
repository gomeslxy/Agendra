"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Check, ChevronLeft, Clock, FileText, RotateCcw, Send, Sparkles, Trash, Zap } from "lucide-react";
import { ChatBubble } from "@/components/app/chat-bubble";
import { DateSeparator } from "@/components/app/date-separator";
import type { InboxMessageItem, LeadWithInboxMessages } from "../reconcile";
import { isOptimisticMessage } from "../reconcile";

type GroupedItem =
  | { type: "separator"; date: string; key: string }
  | ({
      type: "message";
      key: string;
      isFirst: boolean;
      isLast: boolean;
      hideLabel: boolean;
      hideTime: boolean;
    } & InboxMessageItem);

interface InboxMessageStreamProps {
  selected: LeadWithInboxMessages;
  showChatOnMobile: boolean;
  hasMore: boolean;
  loadingMore: boolean;
  draftPending: boolean;
  onLoadMore: () => Promise<void>;
  onApproveDraft: (messageId: string) => void;
  onEditAndSendDraft: (messageId: string, text: string) => void;
  onDeleteDraft: (messageId: string) => void;
  onRetryMessage: (content: string, clientTempId: string) => void;
}

export function InboxMessageStream({
  selected,
  showChatOnMobile,
  hasMore,
  loadingMore,
  draftPending,
  onLoadMore,
  onApproveDraft,
  onEditAndSendDraft,
  onDeleteDraft,
  onRetryMessage,
}: InboxMessageStreamProps) {
  const [editingDraftId, setEditingDraftId] = useState<string | null>(null);
  const [editDraftText, setEditDraftText] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const prevScrollHeightRef = useRef<number | null>(null);
  const prevLeadIdRef = useRef<string>(selected.id);
  const prevLengthRef = useRef<number>(selected.messages.length);

  useEffect(() => {
    setEditingDraftId(null);
    setEditDraftText("");
  }, [selected.id]);

  // Preserva posição de scroll após paginação reversa e rola para o final em novas mensagens
  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (!el) return;

    if (prevScrollHeightRef.current !== null) {
      const diff = el.scrollHeight - prevScrollHeightRef.current;
      el.scrollTop += diff;
      prevScrollHeightRef.current = null;
    } else if (prevLeadIdRef.current !== selected.id || selected.messages.length > prevLengthRef.current) {
      bottomRef.current?.scrollIntoView({ behavior: prevLeadIdRef.current !== selected.id ? "auto" : "smooth" });
    }

    prevLeadIdRef.current = selected.id;
    prevLengthRef.current = selected.messages.length;
  }, [selected.id, selected.messages.length, showChatOnMobile]);

  async function handleLoadMoreClick() {
    if (scrollRef.current) {
      prevScrollHeightRef.current = scrollRef.current.scrollHeight;
    }
    await onLoadMore();
  }

  const groupedMessages = useMemo((): GroupedItem[] => {
    const msgs = selected.messages;
    const result: GroupedItem[] = [];
    const GAP_LIMIT = 5 * 60 * 1000;

    msgs.forEach((msg, i) => {
      const prev = msgs[i - 1];
      const next = msgs[i + 1];

      const msgDay = new Date(msg.created_at).toDateString();
      const prevDay = prev ? new Date(prev.created_at).toDateString() : null;
      if (!prevDay || msgDay !== prevDay) {
        result.push({ type: "separator", date: msg.created_at, key: `sep-${msg.created_at}` });
      }

      const isNote = msg.role === "note";
      const prevIsSame = prev && prev.role === msg.role && !isNote;
      const nextIsSame = next && next.role === msg.role && !isNote;
      const timeGapPrev = prev ? new Date(msg.created_at).getTime() - new Date(prev.created_at).getTime() : 0;
      const timeGapNext = next ? new Date(next.created_at).getTime() - new Date(msg.created_at).getTime() : 0;
      const isFirst = !prevIsSame || timeGapPrev > GAP_LIMIT;
      const isLast = !nextIsSame || timeGapNext > GAP_LIMIT;

      result.push({
        type: "message",
        key: msg.id,
        ...msg,
        isFirst,
        isLast,
        hideLabel: !isFirst,
        hideTime: !isLast,
      });
    });

    return result;
  }, [selected.messages]);

  return (
    <div ref={scrollRef} className="flex-1 overflow-y-auto custom-scrollbar">
      <motion.div
        key={selected.id}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.15, ease: [0.22, 1, 0.36, 1] }}
        className="flex flex-col gap-3 p-4 sm:p-6 bg-[#FAFAFA] min-h-full"
      >
        {hasMore && (
          <div className="flex justify-center pb-2">
            <button
              type="button"
              onClick={handleLoadMoreClick}
              disabled={loadingMore}
              className="flex items-center gap-2 rounded-full border border-[#E4E4E7] bg-white px-4 py-1.5 text-[11px] font-semibold text-[#71717A] hover:bg-[#F4F4F5] transition-all disabled:opacity-50 cursor-pointer"
            >
              {loadingMore ? <Zap size={11} className="animate-spin text-[#2563EB]" /> : <ChevronLeft size={11} className="rotate-90" />}
              {loadingMore ? "Carregando..." : "Carregar histórico"}
            </button>
          </div>
        )}

        {groupedMessages.map((item) => {
          if (item.type === "separator") {
            return <DateSeparator key={item.key} date={item.date} />;
          }

          const msg = item;
          const meta = (msg.metadata ?? null) as Record<string, unknown> | null;
          const isDraft = meta?.is_draft === true;
          const isOptimistic = isOptimisticMessage(msg);
          const isPending = isOptimistic && msg.deliveryState === "sending";
          const isFailed = isOptimistic && msg.deliveryState === "failed";

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
                  Rascunho da IA
                  {meta?.part ? ` (Parte ${String(meta.part)}/${String(meta.total_parts ?? "")})` : ""} · Aguardando aprovação
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
                        type="button"
                        onClick={() => setEditingDraftId(null)}
                        className="rounded-lg border border-[#E4E4E7] bg-white px-3 py-1.5 text-[11px] font-semibold text-[#71717A] hover:bg-[#F4F4F5]"
                      >
                        Cancelar
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          onEditAndSendDraft(msg.id, editDraftText);
                          setEditingDraftId(null);
                        }}
                        disabled={draftPending || !editDraftText.trim()}
                        className="flex items-center gap-1.5 rounded-lg border border-[#BFDBFE] bg-[#2563EB] px-4 py-1.5 text-[11px] font-semibold text-white hover:bg-[#1D4ED8] disabled:opacity-50"
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
                    <div className="flex items-center gap-2 flex-wrap justify-end">
                      <button
                        type="button"
                        onClick={() => onDeleteDraft(msg.id)}
                        disabled={draftPending}
                        className="flex items-center gap-1.5 rounded-lg border border-[#E4E4E7] bg-white px-3 py-1.5 text-[11px] font-semibold text-[#71717A] hover:bg-[#F4F4F5] disabled:opacity-50"
                      >
                        <Trash size={10} /> Descartar
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setEditingDraftId(msg.id);
                          setEditDraftText(msg.content);
                        }}
                        disabled={draftPending}
                        className="flex items-center gap-1.5 rounded-lg border border-[#E4E4E7] bg-white px-3 py-1.5 text-[11px] font-semibold text-[#71717A] hover:bg-[#F4F4F5] disabled:opacity-50"
                      >
                        ✏️ Editar
                      </button>
                      <button
                        type="button"
                        onClick={() => onApproveDraft(msg.id)}
                        disabled={draftPending}
                        className="flex items-center gap-1.5 rounded-lg border border-[#BFDBFE] bg-[#2563EB] px-4 py-1.5 text-[11px] font-semibold text-white hover:bg-[#1D4ED8] shadow-[0_2px_8px_rgba(37,99,235,0.22)] disabled:opacity-50"
                      >
                        <Check size={10} /> Aprovar e Enviar
                      </button>
                    </div>
                  </>
                )}
              </motion.div>
            );
          }

          const mediaUrl = typeof meta?.media_url === "string" ? meta.media_url : null;
          const mediaType = typeof meta?.media_type === "string" ? meta.media_type : null;
          const filename = typeof meta?.filename === "string" ? meta.filename : "documento";

          const msgContent = mediaUrl ? (
            <div className="flex flex-col gap-1.5">
              {mediaType === "image" ? (
                <img src={mediaUrl} alt={filename} className="max-w-[240px] rounded-xl object-cover" />
              ) : mediaType === "video" ? (
                <video src={mediaUrl} controls className="max-w-[240px] rounded-xl" />
              ) : mediaType === "audio" ? (
                <audio src={mediaUrl} controls className="w-full max-w-[240px]" />
              ) : (
                <a
                  href={mediaUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-2 rounded-lg border border-[#E4E4E7] bg-[#F4F4F5] px-3 py-2 text-[12px] hover:bg-[#EBEBEC] text-[#09090B]"
                >
                  <FileText size={14} className="shrink-0 text-[#71717A]" />
                  <span className="truncate max-w-[180px]">{filename}</span>
                </a>
              )}
              {msg.content && msg.content !== filename && <span className="text-[12px] opacity-80">{msg.content}</span>}
            </div>
          ) : (
            <span className="flex items-end gap-1.5">
              {msg.content}
              {isPending && <Clock size={9} className="shrink-0 opacity-40 mb-0.5" />}
            </span>
          );

          return (
            <div key={msg.key} className="flex flex-col">
              <ChatBubble
                timestamp={msg.created_at}
                variant={
                  msg.role === "user"
                    ? "lead"
                    : msg.role === "note"
                      ? "note"
                      : msg.role === "agent"
                        ? "agent"
                        : "ai"
                }
                isFirst={msg.isFirst}
                isLast={msg.isLast}
                hideLabel={msg.hideLabel}
                hideTime={msg.hideTime}
                pending={isPending}
              >
                {msgContent}
              </ChatBubble>
              {isFailed && isOptimistic && (
                <div className="mt-1 self-end flex items-center gap-2 text-[11px] text-[#DC2626]">
                  <span>{msg.errorMessage ?? "Falha ao enviar"}</span>
                  <button
                    type="button"
                    onClick={() => onRetryMessage(msg.content, msg.clientTempId)}
                    className="inline-flex items-center gap-1 rounded-md border border-[#FECACA] bg-[#FEF2F2] px-2 py-0.5 font-semibold hover:bg-[#FEE2E2]"
                  >
                    <RotateCcw size={10} />
                    Tentar novamente
                  </button>
                </div>
              )}
            </div>
          );
        })}

        {selected.messages.length === 0 && (
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
        <div ref={bottomRef} />
      </motion.div>
    </div>
  );
}
