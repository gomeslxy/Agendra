/**
 * Fachada pública fina da Engine de IA (<100 linhas).
 * A lógica modular reside em `turn-orchestrator.ts`, `turn-lock.ts`, `prompt-builder.ts`,
 * `rag.ts`, `response-composer.ts` e `sanitizer.ts`.
 */
import type { CompanyUsage } from '@/lib/billing/limits';
import {
  executeTurn,
  processLeadMessage,
  triggerAutoFollowUp,
  type AIResult,
  type TurnContext,
  type TurnOutcome,
  type TurnState,
} from './turn-orchestrator';
import { isResponseSuspicious, sanitizeAIResponse, sanitizeClientResponse } from './sanitizer';

export type { AIResult, TurnContext, TurnOutcome, TurnState };
export {
  executeTurn,
  processLeadMessage,
  triggerAutoFollowUp,
  isResponseSuspicious,
  sanitizeAIResponse,
  sanitizeClientResponse,
};

export async function handleIncomingMessage(
  companyId: string,
  phone: string,
  senderName: string,
  messageText: string,
  providerMessageId?: string,
  preloadedUsage?: CompanyUsage,
  incomingMetadata?: Record<string, unknown>,
): Promise<'requeued' | void> {
  const outcome = await executeTurn(
    companyId,
    phone,
    senderName,
    messageText,
    providerMessageId,
    preloadedUsage,
    incomingMetadata,
  );
  if (outcome.status === 'requeued') {
    return 'requeued';
  }
}
