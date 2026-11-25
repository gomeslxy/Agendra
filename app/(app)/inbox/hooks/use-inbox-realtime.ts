"use client";

import { useEffect, useRef, useState } from "react";
import { createBrowserClient } from "@supabase/ssr";
import type { Lead, Message } from "@/lib/types/database";
import { getSignedMediaUrl } from "../actions";
import { reconcileIncomingMessage, type LeadWithInboxMessages } from "../reconcile";
import { sortLeadsByRecency } from "../components/inbox-utils";

const browserSupabase = createBrowserClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
);

interface UseInboxRealtimeArgs {
  companyId: string | null;
  selectedIdRef: React.MutableRefObject<string | null>;
  setLeads: React.Dispatch<React.SetStateAction<LeadWithInboxMessages[]>>;
  setUnreadCounts: React.Dispatch<React.SetStateAction<Map<string, number>>>;
}

export function useInboxRealtime({
  companyId,
  selectedIdRef,
  setLeads,
  setUnreadCounts,
}: UseInboxRealtimeArgs) {
  const [isConnected, setIsConnected] = useState<boolean | null>(null);
  const wasDisconnectedRef = useRef(false);
  const lastSyncIsoRef = useRef<string>(new Date().toISOString());

  useEffect(() => {
    if (!companyId) return;

    const supabase = browserSupabase;
    const companyFilter = `company_id=eq.${companyId}`;

    async function hydrateMediaUrl(msg: Message) {
      const meta = (msg.metadata ?? null) as Record<string, unknown> | null;
      const mediaPath = typeof meta?.media_path === "string" ? meta.media_path : null;
      const mediaUrl = typeof meta?.media_url === "string" ? meta.media_url : null;
      if (!mediaPath || mediaUrl) return;

      try {
        const signedUrl = await getSignedMediaUrl(mediaPath);
        if (!signedUrl) return;
        setLeads((prev) =>
          prev.map((lead) =>
            lead.id === msg.lead_id
              ? {
                  ...lead,
                  messages: lead.messages.map((m) =>
                    m.id === msg.id
                      ? { ...m, metadata: { ...(m.metadata as Record<string, unknown> | null), media_url: signedUrl } }
                      : m,
                  ),
                }
              : lead,
          ),
        );
      } catch {
        // Silencioso: usuário ainda vê placeholder textual caso falhe assinatura
      }
    }

    async function fetchLeadById(leadId: string): Promise<LeadWithInboxMessages | null> {
      const { data, error } = await supabase
        .from("leads")
        .select("*, messages(id, lead_id, company_id, content, role, metadata, created_at)")
        .eq("id", leadId)
        .eq("company_id", companyId)
        .maybeSingle();
      if (error || !data) return null;
      const messages = ((data.messages ?? []) as Message[])
        .slice()
        .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
      return { ...(data as Lead), messages, next_event: null };
    }

    async function runIncrementalBackfill() {
      const since = lastSyncIsoRef.current;
      const { data: missed, error } = await supabase
        .from("messages")
        .select("id, lead_id, company_id, content, role, metadata, created_at")
        .eq("company_id", companyId)
        .gt("created_at", since)
        .order("created_at", { ascending: true })
        .limit(100);

      if (error || !missed || missed.length === 0) return;

      lastSyncIsoRef.current = missed[missed.length - 1].created_at;
      const missedMsgs = missed as Message[];
      for (const msg of missedMsgs) {
        void hydrateMediaUrl(msg);
      }

      setLeads((prev) => {
        const byLead = new Map<string, Message[]>();
        for (const msg of missedMsgs) {
          const list = byLead.get(msg.lead_id) ?? [];
          list.push(msg);
          byLead.set(msg.lead_id, list);
        }

        const updated = prev.map((lead) => {
          const additions = byLead.get(lead.id);
          if (!additions) return lead;
          let nextMsgs = lead.messages;
          for (const msg of additions) {
            nextMsgs = reconcileIncomingMessage(nextMsgs, msg);
          }
          return { ...lead, messages: nextMsgs };
        });

        return sortLeadsByRecency(updated);
      });
    }

    let channel: ReturnType<typeof supabase.channel> | null = null;
    const subscribeTimer = setTimeout(() => {
      channel = supabase
        .channel(`inbox-realtime-${companyId}`)
        .on(
          "postgres_changes",
          { event: "INSERT", schema: "public", table: "messages", filter: companyFilter },
          (payload) => {
            const newMsg = payload.new as Message;
            lastSyncIsoRef.current = newMsg.created_at;
            void hydrateMediaUrl(newMsg);

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
                void fetchLeadById(newMsg.lead_id).then((lead) => {
                  if (!lead) return;
                  setLeads((p) => {
                    if (p.some((l) => l.id === lead.id)) {
                      return sortLeadsByRecency(
                        p.map((l) =>
                          l.id === lead.id ? { ...l, messages: reconcileIncomingMessage(l.messages, newMsg) } : l,
                        ),
                      );
                    }
                    return sortLeadsByRecency([{ ...lead, messages: reconcileIncomingMessage(lead.messages, newMsg) }, ...p]);
                  });
                });
                return prev;
              }
              const next = prev.map((lead) =>
                lead.id === newMsg.lead_id
                  ? { ...lead, messages: reconcileIncomingMessage(lead.messages, newMsg) }
                  : lead,
              );
              return sortLeadsByRecency(next);
            });
          },
        )
        .on(
          "postgres_changes",
          { event: "UPDATE", schema: "public", table: "leads", filter: companyFilter },
          (payload) => {
            const updatedLead = payload.new as Lead;
            setLeads((prev) =>
              sortLeadsByRecency(
                prev.map((lead) =>
                  lead.id === updatedLead.id ? { ...lead, ...updatedLead, messages: lead.messages } : lead,
                ),
              ),
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
              return sortLeadsByRecency([{ ...newLead, messages: [], next_event: null }, ...prev]);
            });
          },
        )
        .on(
          "postgres_changes",
          { event: "UPDATE", schema: "public", table: "messages", filter: companyFilter },
          (payload) => {
            const updatedMsg = payload.new as Message;
            void hydrateMediaUrl(updatedMsg);
            setLeads((prev) =>
              prev.map((lead) =>
                lead.id === updatedMsg.lead_id
                  ? { ...lead, messages: lead.messages.map((m) => (m.id === updatedMsg.id ? updatedMsg : m)) }
                  : lead,
              ),
            );
          },
        )
        .on(
          "postgres_changes",
          { event: "*", schema: "public", table: "events", filter: companyFilter },
          (payload) => {
            if (payload.eventType === "INSERT" || payload.eventType === "UPDATE") {
              const newEvent = payload.new as { id: string; lead_id?: string | null; title: string; start_time: string; end_time: string };
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
                      return {
                        ...lead,
                        next_event: {
                          id: newEvent.id,
                          title: newEvent.title,
                          start_time: newEvent.start_time,
                          end_time: newEvent.end_time,
                        },
                      };
                    }
                  } else if (lead.next_event?.id === newEvent.id) {
                    return { ...lead, next_event: null };
                  }
                  return lead;
                }),
              );
            } else if (payload.eventType === "DELETE") {
              const oldId = (payload.old as { id?: string })?.id;
              if (!oldId) return;
              setLeads((prev) =>
                prev.map((lead) => (lead.next_event?.id === oldId ? { ...lead, next_event: null } : lead)),
              );
            }
          },
        )
        .on(
          "postgres_changes",
          { event: "DELETE", schema: "public", table: "messages", filter: companyFilter },
          (payload) => {
            const deletedId = (payload.old as { id?: string })?.id;
            if (!deletedId) return;
            setLeads((prev) =>
              prev.map((lead) => ({ ...lead, messages: lead.messages.filter((m) => m.id !== deletedId) })),
            );
          },
        )
        .subscribe((status) => {
          if (status === "SUBSCRIBED") {
            setIsConnected(true);
            if (wasDisconnectedRef.current) {
              wasDisconnectedRef.current = false;
              void runIncrementalBackfill();
            }
          } else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT" || status === "CLOSED") {
            setIsConnected(false);
            wasDisconnectedRef.current = true;
          } else {
            setIsConnected(null);
          }
        });
    }, 200);

    return () => {
      clearTimeout(subscribeTimer);
      if (channel) supabase.removeChannel(channel);
    };
  }, [companyId, selectedIdRef, setLeads, setUnreadCounts]);

  return { isConnected };
}
