// lib/ai/memory.ts
import { createAdminClient } from '@/lib/supabase/admin';
import type { LeadMemory, LeadMemoryEventType, ScoreHistoryEntry } from '@/lib/types/database';

export const EMPTY_MEMORY: LeadMemory = {
  timeline: [],
  objections_raised: [],
  services_mentioned: [],
  score_history: [],
  last_intent_signal: '',
  qualification_answers: {},
};

/**
 * Builds a compact ~200-token memory block injected into the system prompt.
 * Returns empty string if memory has no meaningful content.
 */
export function buildMemoryContext(memory: LeadMemory | null | undefined): string {
  if (!memory || memory.timeline.length === 0) return '';

  const lines: string[] = ['## Memória estratégica deste lead'];

  const firstContact = memory.timeline.find((e) => e.event === 'first_contact');
  if (firstContact) {
    const d = new Date(firstContact.date);
    lines.push(`- Primeiro contato: ${d.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' })}`);
  }

  if (memory.services_mentioned.length > 0) {
    lines.push(`- Demonstrou interesse em: ${memory.services_mentioned.join(', ')}`);
  }

  if (memory.objections_raised.length > 0) {
    lines.push(`- Objeções levantadas: ${memory.objections_raised.map((o) => `"${o}"`).join(', ')}`);
  }

  const slotShown = memory.timeline.filter((e) => e.event === 'slot_shown').length;
  const slotDeclined = memory.timeline.filter((e) => e.event === 'slot_declined').length;
  if (slotShown > 0) {
    lines.push(`- Slots mostrados: ${slotShown}x${slotDeclined > 0 ? ` (recusou ${slotDeclined}x)` : ''}`);
  }

  if (memory.score_history.length > 1) {
    const recent = memory.score_history.slice(-5);
    const trend = recent.map((s) => s.score).join(' → ');
    lines.push(`- Score: ${trend}`);
  }

  if (memory.last_intent_signal) {
    lines.push(`- Último sinal: "${memory.last_intent_signal}"`);
  }

  const disqualified = memory.timeline.some((e) => e.event === 'disqualified');
  if (disqualified) {
    lines.push(`- ⚠️ Lead marcado como desinteressado anteriormente`);
  }

  const hasNoShow = memory.timeline.some((e) => e.event === 'no_show');
  if (hasNoShow) {
    lines.push(`- ⚠️ Lead não compareceu a um agendamento anterior`);
  }

  return lines.join('\n');
}

/**
 * Appends a new event to lead_memory.timeline and updates derived fields.
 * Returns the updated memory object (does NOT persist — caller persists).
 */
export function appendMemoryEvent(
  current: LeadMemory | null | undefined,
  event: LeadMemoryEventType,
  options: {
    note?: string;
    objection?: string;
    services?: string[];
    intentSignal?: string;
  } = {},
): LeadMemory {
  const mem: LeadMemory = current
    ? { ...current, timeline: [...current.timeline] }
    : { ...EMPTY_MEMORY, timeline: [] };

  mem.timeline.push({ date: new Date().toISOString(), event, note: options.note });

  if (options.objection && !mem.objections_raised.includes(options.objection)) {
    mem.objections_raised = [...mem.objections_raised, options.objection];
  }

  if (options.services) {
    const newServices = options.services.filter((s) => !mem.services_mentioned.includes(s));
    if (newServices.length > 0) {
      mem.services_mentioned = [...mem.services_mentioned, ...newServices];
    }
  }

  if (options.intentSignal) {
    mem.last_intent_signal = options.intentSignal;
  }

  return mem;
}

/**
 * Appends a score entry to lead_memory.score_history.
 * Keeps last 20 entries only.
 */
export function appendScoreHistory(
  current: LeadMemory | null | undefined,
  score: number,
  reason: string,
): LeadMemory {
  const mem: LeadMemory = current
    ? { ...current, score_history: [...(current.score_history ?? [])] }
    : { ...EMPTY_MEMORY, score_history: [] };

  const entry: ScoreHistoryEntry = { date: new Date().toISOString(), score, reason };
  mem.score_history = [...mem.score_history, entry].slice(-20);
  return mem;
}

/**
 * Handler for the `updateLeadMemory` tool call from Gemini.
 * Reads current memory from DB, appends event, persists.
 */
export async function handleUpdateLeadMemory(
  args: {
    event_type: LeadMemoryEventType;
    note?: string;
    services_mentioned?: string[];
    objection?: string;
    intent_signal?: string;
  },
  ctx: { leadId: string },
): Promise<{ updated: boolean }> {
  const admin = createAdminClient();

  const { data: lead } = await admin
    .from('leads')
    .select('lead_memory')
    .eq('id', ctx.leadId)
    .single();

  const current = (lead?.lead_memory ?? null) as LeadMemory | null;

  const updated = appendMemoryEvent(current, args.event_type, {
    note: args.note,
    objection: args.objection,
    services: args.services_mentioned,
    intentSignal: args.intent_signal,
  });

  const { error } = await admin
    .from('leads')
    .update({ lead_memory: updated })
    .eq('id', ctx.leadId);

  if (error) throw new Error(`Failed to update lead memory: ${error.message}`);

  return { updated: true };
}
