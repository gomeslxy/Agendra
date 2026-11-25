"use client";

import { useCallback, useState, useTransition } from "react";
import { toast } from "sonner";
import { trackEvent } from "@/lib/analytics";
import type { Message } from "@/lib/types/database";
import {
  approveDraftMessage,
  deleteDraftMessage,
  editAndSendDraft,
  fetchOlderMessages,
  sendFileAttachment,
  sendNote,
  setControlMode,
  setConversationTone,
  takeOverLead,
} from "../actions";
import {
  isOptimisticMessage,
  reconcileIncomingMessage,
  type LeadWithInboxMessages,
  type OptimisticMessage,
} from "../reconcile";

interface UseInboxActionsArgs {
  selected: LeadWithInboxMessages | null;
  selectedId: string | null;
  setLeads: React.Dispatch<React.SetStateAction<LeadWithInboxMessages[]>>;
  setHasMore: React.Dispatch<React.SetStateAction<Map<string, boolean>>>;
}

export function useInboxActions({ selected, selectedId, setLeads, setHasMore }: UseInboxActionsArgs) {
  const [sendPending, startSend] = useTransition();
  const [takePending, startTake] = useTransition();
  const [tonePending, startTone] = useTransition();
  const [controlPending, startControl] = useTransition();
  const [draftPending, startDraft] = useTransition();
  const [loadingMoreFor, setLoadingMoreFor] = useState<string | null>(null);

  const sendTextMessage = useCallback(
    (content: string, existingTempId?: string) => {
      if (!selected) return;
      const trimmed = content.trim();
      if (!trimmed) return;

      const clientTempId = existingTempId ?? crypto.randomUUID();

      if (existingTempId) {
        setLeads((prev) =>
          prev.map((l) =>
            l.id === selected.id
              ? {
                  ...l,
                  messages: l.messages.map((m) =>
                    isOptimisticMessage(m) && m.clientTempId === existingTempId
                      ? { ...m, deliveryState: "sending", errorMessage: undefined }
                      : m,
                  ),
                }
              : l,
          ),
        );
      } else {
        const tempMsg: OptimisticMessage = {
          id: clientTempId,
          lead_id: selected.id,
          company_id: selected.company_id,
          content: trimmed,
          role: "agent",
          created_at: new Date().toISOString(),
          metadata: { client_temp_id: clientTempId },
          _optimistic: true,
          clientTempId,
          deliveryState: "sending",
        };
        setLeads((prev) =>
          prev.map((l) => (l.id === selected.id ? { ...l, messages: [...l.messages, tempMsg] } : l)),
        );
      }

      startSend(async () => {
        try {
          const result = await sendNote(selected.id, trimmed, clientTempId);
          if (result?.success) {
            trackEvent("message_sent", { lead_id: selected.id });
            if (result.message) {
              setLeads((prev) =>
                prev.map((l) =>
                  l.id === selected.id
                    ? { ...l, messages: reconcileIncomingMessage(l.messages, result.message as Message) }
                    : l,
                ),
              );
            } else {
              setLeads((prev) =>
                prev.map((l) =>
                  l.id === selected.id
                    ? {
                        ...l,
                        messages: l.messages.map((m) =>
                          isOptimisticMessage(m) && m.clientTempId === clientTempId
                            ? { ...m, deliveryState: "sent" }
                            : m,
                        ),
                      }
                    : l,
                ),
              );
            }
          } else {
            const errMsg = result?.error ?? "Falha ao enviar mensagem";
            toast.error(errMsg);
            setLeads((prev) =>
              prev.map((l) =>
                l.id === selected.id
                  ? {
                      ...l,
                      messages: l.messages.map((m) =>
                        isOptimisticMessage(m) && m.clientTempId === clientTempId
                          ? { ...m, deliveryState: "failed", errorMessage: errMsg }
                          : m,
                      ),
                    }
                  : l,
              ),
            );
          }
        } catch (e) {
          const errMsg = (e as Error).message;
          toast.error(errMsg);
          setLeads((prev) =>
            prev.map((l) =>
              l.id === selected.id
                ? {
                    ...l,
                    messages: l.messages.map((m) =>
                      isOptimisticMessage(m) && m.clientTempId === clientTempId
                        ? { ...m, deliveryState: "failed", errorMessage: errMsg }
                        : m,
                    ),
                  }
                : l,
            ),
          );
        }
      });
    },
    [selected, setLeads],
  );

  const sendAttachment = useCallback(
    (file: File, caption: string) => {
      if (!selected) return;
      const clientTempId = crypto.randomUUID();
      startSend(async () => {
        try {
          const form = new FormData();
          form.append("file", file);
          form.append("client_temp_id", clientTempId);
          if (caption.trim()) form.append("caption", caption.trim());
          const result = await sendFileAttachment(selected.id, form);
          if (!result.success) {
            toast.error(result.error ?? "Erro ao enviar arquivo");
          } else if (result.message) {
            setLeads((prev) =>
              prev.map((l) =>
                l.id === selected.id
                  ? { ...l, messages: reconcileIncomingMessage(l.messages, result.message as Message) }
                  : l,
              ),
            );
          }
        } catch (e) {
          toast.error((e as Error).message);
        }
      });
    },
    [selected, setLeads],
  );

  const handleLoadMore = useCallback(async () => {
    if (!selected || loadingMoreFor) return;
    const oldest = selected.messages[0];
    if (!oldest) return;

    setLoadingMoreFor(selected.id);
    try {
      const older = await fetchOlderMessages(selected.id, oldest.created_at);
      if (older.length === 0) {
        setHasMore((prev) => {
          const next = new Map(prev);
          next.set(selected.id, false);
          return next;
        });
        return;
      }
      setLeads((prev) =>
        prev.map((l) => (l.id === selected.id ? { ...l, messages: [...older, ...l.messages] } : l)),
      );
      if (older.length < 30) {
        setHasMore((prev) => {
          const next = new Map(prev);
          next.set(selected.id, false);
          return next;
        });
      }
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setLoadingMoreFor(null);
    }
  }, [selected, loadingMoreFor, setLeads, setHasMore]);

  const handleTakeOver = useCallback(() => {
    if (!selected) return;
    const prevMode = selected.control_mode ?? "autonomous";
    const prevPaused = selected.is_paused;

    setLeads((prev) =>
      prev.map((l) => (l.id === selected.id ? { ...l, is_paused: true, control_mode: "manual" } : l)),
    );

    startTake(async () => {
      try {
        await takeOverLead(selected.id);
        trackEvent("lead_takeover", { lead_id: selected.id });
      } catch (e) {
        setLeads((prev) =>
          prev.map((l) => (l.id === selected.id ? { ...l, is_paused: prevPaused, control_mode: prevMode } : l)),
        );
        toast.error((e as Error).message);
      }
    });
  }, [selected, setLeads]);

  const handleToneChange = useCallback(
    (tone: "cold" | "warm" | "hot") => {
      if (!selected || selected.conversation_tone === tone) return;
      const current = selected.conversation_tone ?? "warm";
      setLeads((prev) => prev.map((l) => (l.id === selected.id ? { ...l, conversation_tone: tone } : l)));
      startTone(async () => {
        try {
          await setConversationTone(selected.id, tone);
          trackEvent("tone_changed", { lead_id: selected.id, tone });
        } catch (e) {
          setLeads((prev) => prev.map((l) => (l.id === selected.id ? { ...l, conversation_tone: current } : l)));
          toast.error((e as Error).message);
        }
      });
    },
    [selected, setLeads],
  );

  const handleControlModeChange = useCallback(
    (mode: "autonomous" | "shadow" | "manual") => {
      if (!selected) return;
      const current = selected.control_mode ?? (selected.is_paused ? "manual" : "autonomous");
      if (current === mode) return;

      setLeads((prev) =>
        prev.map((l) =>
          l.id === selected.id
            ? {
                ...l,
                control_mode: mode,
                is_paused: mode === "manual",
                ...(mode !== "manual" ? { human_takeover_until: null, human_takeover_at: null } : {}),
              }
            : l,
        ),
      );

      startControl(async () => {
        try {
          await setControlMode(selected.id, mode);
          trackEvent("control_mode_changed", { lead_id: selected.id, mode });
        } catch (e) {
          setLeads((prev) =>
            prev.map((l) =>
              l.id === selected.id ? { ...l, control_mode: current, is_paused: current === "manual" } : l,
            ),
          );
          toast.error((e as Error).message);
        }
      });
    },
    [selected, setLeads],
  );

  const handleApproveDraft = useCallback(
    (messageId: string) => {
      if (!selectedId) return;
      setLeads((prev) =>
        prev.map((l) =>
          l.id === selectedId
            ? {
                ...l,
                messages: l.messages.map((m) => {
                  if (m.id !== messageId) return m;
                  const newMeta = { ...((m.metadata as Record<string, unknown>) ?? {}) };
                  delete newMeta.is_draft;
                  return { ...m, metadata: newMeta };
                }),
              }
            : l,
        ),
      );
      startDraft(async () => {
        try {
          const result = await approveDraftMessage(messageId);
          if (!result?.success) throw new Error("Falha ao aprovar rascunho");
        } catch (e) {
          toast.error((e as Error).message);
          setLeads((prev) =>
            prev.map((l) =>
              l.id === selectedId
                ? {
                    ...l,
                    messages: l.messages.map((m) =>
                      m.id === messageId
                        ? { ...m, metadata: { ...((m.metadata as Record<string, unknown>) ?? {}), is_draft: true } }
                        : m,
                    ),
                  }
                : l,
            ),
          );
        }
      });
    },
    [selectedId, setLeads],
  );

  const handleEditAndSendDraft = useCallback(
    (messageId: string, text: string) => {
      if (!selectedId || !text.trim()) return;
      let originalContent = "";
      let originalMetadata: unknown = null;

      setLeads((prev) =>
        prev.map((l) =>
          l.id === selectedId
            ? {
                ...l,
                messages: l.messages.map((m) => {
                  if (m.id !== messageId) return m;
                  originalContent = m.content;
                  originalMetadata = m.metadata;
                  const newMeta = { ...((m.metadata as Record<string, unknown>) ?? {}) };
                  delete newMeta.is_draft;
                  return { ...m, content: text.trim(), metadata: newMeta };
                }),
              }
            : l,
        ),
      );

      startDraft(async () => {
        try {
          const result = await editAndSendDraft(messageId, text);
          if (!result?.success) throw new Error("Falha ao enviar rascunho editado");
        } catch (e) {
          toast.error((e as Error).message);
          setLeads((prev) =>
            prev.map((l) =>
              l.id === selectedId
                ? {
                    ...l,
                    messages: l.messages.map((m) =>
                      m.id === messageId ? { ...m, content: originalContent, metadata: originalMetadata } : m,
                    ),
                  }
                : l,
            ),
          );
        }
      });
    },
    [selectedId, setLeads],
  );

  const handleDeleteDraft = useCallback(
    (messageId: string) => {
      if (!selectedId) return;
      const originalMessages = selected?.messages ?? [];
      setLeads((prev) =>
        prev.map((l) => (l.id === selectedId ? { ...l, messages: l.messages.filter((m) => m.id !== messageId) } : l)),
      );
      startDraft(async () => {
        try {
          const result = await deleteDraftMessage(messageId);
          if (!result?.success) throw new Error("Falha ao descartar rascunho");
        } catch (e) {
          toast.error((e as Error).message);
          setLeads((prev) =>
            prev.map((l) => (l.id === selectedId ? { ...l, messages: originalMessages } : l)),
          );
        }
      });
    },
    [selectedId, selected?.messages, setLeads],
  );

  return {
    sendPending,
    takePending,
    tonePending,
    controlPending,
    draftPending,
    loadingMoreFor,
    sendTextMessage,
    sendAttachment,
    handleLoadMore,
    handleTakeOver,
    handleToneChange,
    handleControlModeChange,
    handleApproveDraft,
    handleEditAndSendDraft,
    handleDeleteDraft,
  };
}
