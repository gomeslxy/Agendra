// lib/ai/memory.ts
import { createAdminClient } from '@/lib/supabase/admin';
import type { LeadMemory, LeadMemoryEventType, ScoreHistoryEntry, Message } from '@/lib/types/database';
import { GoogleGenerativeAI } from '@google/generative-ai';

const genAI = new GoogleGenerativeAI(process.env.GOOGLE_AI_API_KEY!);

export const EMPTY_MEMORY: LeadMemory = {
  timeline: [],
  objections_raised: [],
  services_mentioned: [],
  score_history: [],
  last_intent_signal: '',
  qualification_answers: {},
};

/**
 * mountContext — Builds a high-fidelity contextual block for the system prompt.
 * Merges memory state, previous summary, and strategic signals.
 */
export function mountContext(memory: LeadMemory | null | undefined, summary: string | null): string {
  if (!memory && !summary) return '';

  const lines: string[] = ['## Memória Estratégica do Lead'];

  if (summary) {
    lines.push(`- Situação Atual: ${summary}`);
  }

  if (!memory || memory.timeline.length === 0) {
    return lines.length > 1 ? lines.join('\n') : '';
  }

  const firstContact = memory.timeline.find((e) => e.event === 'first_contact');
  if (firstContact) {
    const d = new Date(firstContact.date);
    lines.push(`- Primeiro contato: ${d.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' })}`);
  }

  if (memory.services_mentioned.length > 0) {
    lines.push(`- Interesse: ${memory.services_mentioned.join(', ')}`);
  }

  if (memory.objections_raised.length > 0) {
    lines.push(`- Objeções: ${memory.objections_raised.map((o) => `"${o}"`).join(', ')}`);
  }

  const slotShown = memory.timeline.filter((e) => e.event === 'slot_shown').length;
  if (slotShown > 0) {
    const declined = memory.timeline.filter((e) => e.event === 'slot_declined').length;
    lines.push(`- Engajamento: ${slotShown} convites de agenda${declined > 0 ? ` (${declined} recusas)` : ''}`);
  }

  if (memory.score_history.length > 0) {
    const recent = memory.score_history.slice(-3);
    const trend = recent.map((s) => s.score).join(' → ');
    lines.push(`- Evolução do Score: ${trend}`);
  }

  const flags = [];
  if (memory.timeline.some((e) => e.event === 'disqualified')) flags.push('⚠️ Lead Desqualificado');
  if (memory.timeline.some((e) => e.event === 'no_show')) flags.push('⚠️ No-show anterior');
  if (flags.length > 0) lines.push(`- Flags: ${flags.join(' | ')}`);

  // Extrair respostas de qualificação se houver
  const answers = Object.entries(memory.qualification_answers || {});
  if (answers.length > 0) {
    lines.push('- Dados Coletados:');
    answers.forEach(([q, a]) => lines.push(`  * ${q}: ${a}`));
  }

  return lines.join('\n');
}

/**
 * summarizeConversation — Uses AI to generate a compact, one-sentence summary of the lead's state.
 */
export async function summarizeConversation(
  history: Message[],
  currentSummary: string | null
): Promise<string> {
  const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash-lite' }); // Fast, free-tier model for summarization
  
  const conversation = history
    .filter(m => m.role === 'user' || m.role === 'assistant')
    .map(m => `${m.role === 'user' ? 'Lead' : 'IA'}: ${m.content}`)
    .join('\n');

  const prompt = `Resuma o estado atual deste lead em UMA frase curta e direta em português.
Foco: O que ele quer? Em que estágio da venda está?
Resumo anterior: ${currentSummary || 'Nenhum'}

Conversa:
${conversation}

Resumo:`;

  try {
    const result = await model.generateContent(prompt);
    return result.response.text().trim().replace(/^"|"$/g, '');
  } catch (err) {
    console.error('[Memory] Summarization failed:', err);
    return currentSummary || 'Lead em conversação.';
  }
}

/**
 * extractRelevantFacts — AI handler to extract specific fields for the memory structure.
 */
export async function extractRelevantFacts(message: string): Promise<{
  services?: string[];
  objections?: string[];
  answers?: Record<string, string>;
  intent_signal?: string;
}> {
  const model = genAI.getGenerativeModel({
    model: 'gemini-2.5-flash-lite',
    generationConfig: { responseMimeType: 'application/json' }
  });

  const prompt = `Analise a mensagem do lead e extraia fatos relevantes para o CRM no formato JSON.
Campos:
- services: lista de serviços/produtos de interesse mencionados
- objections: lista de preocupações ou motivos para não fechar citados
- answers: dicionário de perguntas respondidas (ex: {"orçamento": "5k", "prazo": "imediato"})
- intent_signal: uma frase curta descrevendo a intenção atual (ex: "querendo agendar", "apenas pesquisando")

Mensagem: "${message}"

JSON:`;

  try {
    const result = await model.generateContent(prompt);
    return JSON.parse(result.response.text());
  } catch (err) {
    console.error('[Memory] Fact extraction failed:', err);
    return {};
  }
}

/**
 * cleanContext — Prunes the timeline to keep it compact while preserving key strategic events.
 */
export function cleanContext(memory: LeadMemory): LeadMemory {
  // Keep the first contact, all bookings/no-shows, and the last 10 events
  const first = memory.timeline.find(e => e.event === 'first_contact');
  const criticalEvents = ['booked', 'no_show', 'disqualified', 'reactivated'];
  
  const criticals = memory.timeline.filter(e => criticalEvents.includes(e.event));
  const recent = memory.timeline.slice(-10);

  const newTimeline = [...new Set([
    ...(first ? [first] : []),
    ...criticals,
    ...recent
  ])].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

  return {
    ...memory,
    timeline: newTimeline,
    score_history: memory.score_history.slice(-10), // Keep only last 10 scores
  };
}

/**
 * prepareForRAG — Transforms memory into a clean string for embedding storage.
 */
export function prepareForRAG(memory: LeadMemory, summary: string | null): string {
  const parts = [
    summary ? `Resumo: ${summary}` : '',
    memory.services_mentioned.length > 0 ? `Serviços: ${memory.services_mentioned.join(', ')}` : '',
    memory.objections_raised.length > 0 ? `Objeções: ${memory.objections_raised.join(', ')}` : '',
    Object.entries(memory.qualification_answers || {}).map(([q, a]) => `${q}: ${a}`).join(' | ')
  ].filter(Boolean);

  return parts.join(' \n ');
}

/**
 * appendMemoryEvent — Appends a new event and updates derived fields.
 */
export function appendMemoryEvent(
  current: LeadMemory | null | undefined,
  event: LeadMemoryEventType,
  options: {
    note?: string;
    objection?: string;
    services?: string[];
    intentSignal?: string;
    answers?: Record<string, string>;
  } = {},
): LeadMemory {
  const mem: LeadMemory = current
    ? { ...current, timeline: [...current.timeline] }
    : { ...EMPTY_MEMORY, timeline: [] };

  // Avoid duplicate major events in short succession
  const lastEvent = mem.timeline[mem.timeline.length - 1];
  if (lastEvent?.event === event && lastEvent.note === options.note) return mem;

  mem.timeline.push({ date: new Date().toISOString(), event, note: options.note });

  if (options.objection && !mem.objections_raised.includes(options.objection)) {
    mem.objections_raised = [...mem.objections_raised, options.objection];
  }

  if (options.services) {
    const newServices = options.services.filter((s) => !mem.services_mentioned.includes(s));
    mem.services_mentioned = [...mem.services_mentioned, ...newServices];
  }

  if (options.intentSignal) {
    mem.last_intent_signal = options.intentSignal;
  }

  if (options.answers) {
    mem.qualification_answers = { ...(mem.qualification_answers || {}), ...options.answers };
  }

  return cleanContext(mem);
}

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
 * handleUpdateLeadMemory — Tool handler to persist memory updates.
 */
export async function handleUpdateLeadMemory(
  args: {
    event_type: LeadMemoryEventType;
    note?: string;
    services_mentioned?: string[];
    objection?: string;
    intent_signal?: string;
    answers?: Record<string, string>;
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
    answers: args.answers,
  });

  const { error } = await admin
    .from('leads')
    .update({ lead_memory: updated })
    .eq('id', ctx.leadId);

  if (error) throw new Error(`Failed to update lead memory: ${error.message}`);

  return { updated: true };
}
