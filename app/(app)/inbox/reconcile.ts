import type { Message } from "@/lib/types/database";
import type { LeadWithMessages } from "../page";

export type OptimisticDeliveryState = "sending" | "sent" | "failed";

export interface OptimisticMessage extends Message {
  _optimistic: true;
  clientTempId: string;
  deliveryState: OptimisticDeliveryState;
  errorMessage?: string;
}

export type InboxMessageItem = Message | OptimisticMessage;

export interface LeadWithInboxMessages extends Omit<LeadWithMessages, "messages"> {
  messages: InboxMessageItem[];
}

export function isOptimisticMessage(m: InboxMessageItem): m is OptimisticMessage {
  return "_optimistic" in m && m._optimistic === true;
}

/**
 * Deduplica mensagem otimista 1:1 via `metadata.client_temp_id` (persistido no INSERT).
 * Nunca apaga a bolha por timeout fixo: se falhar, marca `deliveryState = 'failed'`
 * para permitir retry manual sem perder o texto digitado.
 */
export function reconcileIncomingMessage(
  current: InboxMessageItem[],
  incoming: Message,
): InboxMessageItem[] {
  if (current.some((m) => m.id === incoming.id)) return current;
  const incomingTempId = (incoming.metadata as Record<string, unknown> | null)?.client_temp_id;

  const filtered = current.filter((m) => {
    if (!isOptimisticMessage(m)) return true;
    if (typeof incomingTempId === "string" && m.clientTempId === incomingTempId) return false;
    return !(m.content === incoming.content && m.role === incoming.role);
  });

  return [...filtered, incoming].sort(
    (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime(),
  );
}
