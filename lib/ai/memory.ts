import { createAdminClient } from '@/lib/supabase/admin';
import type {
  LeadMemory,
  LeadMemoryEventType,
  Message,
  ScoreHistoryEntry,
} from '@/lib/types/database';
import { logError } from '@/lib/logging';
import { routeGenerate } from './providers/router';
import type { ToolCallRecord } from './providers/types';
import { BackgroundAnalyticsSchema } from './schemas/analytics.schema';

export const EMPTY_MEMORY: LeadMemory = {
  timeline: [],
  objections_raised: [],
  services_mentioned: [],
  score_history: [],
  last_intent_signal: '',
  qualification_answers: {},
};

export function mountContext(
  memory: LeadMemory | null | undefined,
  summary: string | null,
): string {
  if (!memory && !summary) return '';

  const lines: string[] = ['## Memória Estratégica do Lead'];

  if (summary) {
    lines.push(`- Situação Atual: ${summary}`);
  }

  if (memory?.last_intent_signal) {
    lines.push(`- Última Intenção Identificada: ${memory.last_intent_signal}`);
  }

  if (memory?.services_mentioned && memory.services_mentioned.length > 0) {
    lines.push(`- Interesse: ${memory.services_mentioned.join(', ')}`);
  }

  if (memory?.objections_raised && memory.objections_raised.length > 0) {
    lines.push(`- Objeções: ${memory.objections_raised.map((o) => `"${o}"`).join(', ')}`);
  }

  if (memory?.score_history && memory.score_history.length > 0) {
    const recent = memory.score_history.slice(-3);
    const trend = recent.map((s) => s.score).join(' → ');
    lines.push(`- Evolução do Score: ${trend}`);
  }

  const answers = Object.entries(memory?.qualification_answers || {});
  if (answers.length > 0) {
    lines.push('- Dados Coletados:');
    answers.forEach(([q, a]) => lines.push(`  * ${q}: ${a}`));
  }

  if (memory?.timeline && memory.timeline.length > 0) {
    const firstContact = memory.timeline.find((e) => e.event === 'first_contact');
    if (firstContact) {
      const d = new Date(firstContact.date);
      lines.push(
        `- Primeiro contato: ${d.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' })}`,
      );
    }

    const slotShown = memory.timeline.filter((e) => e.event === 'slot_shown').length;
    if (slotShown > 0) {
      const declined = memory.timeline.filter((e) => e.event === 'slot_declined').length;
      lines.push(
        `- Engajamento: ${slotShown} convites de agenda${declined > 0 ? ` (${declined} recusas)` : ''}`,
      );
    }

    const flags: string[] = [];
    if (memory.timeline.some((e) => e.event === 'disqualified')) {
      flags.push('⚠️ Lead Desqualificado');
    }
    if (memory.timeline.some((e) => e.event === 'no_show')) {
      flags.push('⚠️ No-show anterior');
    }
    if (flags.length > 0) lines.push(`- Flags: ${flags.join(' | ')}`);
  }

  return lines.join('\n');
}

export async function processBackgroundAnalytics(
  history: Message[],
  message: string,
  reply: string,
  toolsCalled: ToolCallRecord[],
  currentSummary: string | null,
): Promise<{
  sentiment: 'positive' | 'neutral' | 'frustrated' | 'aggressively_cold';
  sentiment_score: number;
  intent_detected: string;
  urgency_detected: boolean;
  objection_handled: string | null;
  rationale: string;
  services: string[];
  objections: string[];
  answers: Record<string, string>;
  new_summary: string;
}> {
  const conversation = history
    .filter((m) => m.role === 'user' || m.role === 'assistant')
    .slice(-5)
    .map((m) => `${m.role === 'user' ? 'Lead' : 'IA'}: ${m.content}`)
    .join('\n');

  const prompt = `Analise a última interação do lead e extraia metadados estruturados para o CRM e auditoria no formato JSON.

Resumo anterior do estado do lead: ${currentSummary || 'Nenhum'}

Histórico recente:
${conversation}

Última mensagem do lead: "${message}"
Última resposta gerada pela IA: "${reply}"
Ferramentas chamadas pela IA: ${JSON.stringify(toolsCalled)}

Retorne um objeto JSON estritamente com os seguintes campos:
- sentiment: "positive" | "neutral" | "frustrated" | "aggressively_cold"
- sentiment_score: float de -1.0 a 1.0
- intent_detected: intenção principal identificada do lead
- urgency_detected: true se o lead demonstrou urgência, senao false
- objection_handled: objeção tratada pela IA nesta resposta (ou null)
- rationale: raciocínio que descreve o porquê a IA respondeu dessa forma
- services: lista de strings com serviços/produtos de interesse mencionados pelo lead (se houver)
- objections: lista de strings com preocupações ou motivos para não fechar citados (se houver)
- answers: objeto chave-valor de perguntas de qualificação respondidas (ex: {"orçamento": "5k"})
- new_summary: UMA frase curta e direta resumindo o novo estado do lead. IMPORTANTE: NUNCA mencione o estado de disponibilidade de horários ou se a agenda está cheia/vazia (ex: evite termos como "sem horários", "agenda cheia", "não há horários"), pois a disponibilidade deve ser consultada em tempo real e não fixada no resumo histórico.

JSON:`;

  try {
    const generateResult = await routeGenerate({ prompt, jsonMode: true }, { chain: 'bg' });
    const rawParsed: unknown = JSON.parse(generateResult.text);
    const validated = BackgroundAnalyticsSchema.safeParse(rawParsed);

    if (!validated.success) {
      logError('[AI Audit] BackgroundAnalyticsSchema validation failed:', validated.error.message);
      return {
        sentiment: 'neutral',
        sentiment_score: 0,
        intent_detected: 'conversação',
        urgency_detected: false,
        objection_handled: null,
        rationale: 'Interação padrão.',
        services: [],
        objections: [],
        answers: {},
        new_summary: currentSummary || 'Lead em conversação.',
      };
    }

    return {
      ...validated.data,
      new_summary: validated.data.new_summary || currentSummary || 'Lead em conversação.',
    };
  } catch (err) {
    logError('[AI Audit] Falha na analise de background:', err);
    return {
      sentiment: 'neutral',
      sentiment_score: 0.0,
      intent_detected: 'conversação',
      urgency_detected: false,
      objection_handled: null,
      rationale: 'Análise indisponível.',
      services: [],
      objections: [],
      answers: {},
      new_summary: currentSummary || 'Lead em conversação.',
    };
  }
}

export function cleanContext(memory: LeadMemory): LeadMemory {
  const first = memory.timeline.find((e) => e.event === 'first_contact');
  const criticalEvents = ['booked', 'no_show', 'disqualified', 'reactivated'];

  const criticals = memory.timeline.filter((e) => criticalEvents.includes(e.event));
  const recent = memory.timeline.slice(-10);

  const newTimeline = [
    ...new Set([...(first ? [first] : []), ...criticals, ...recent]),
  ].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

  return {
    ...memory,
    timeline: newTimeline,
    score_history: memory.score_history.slice(-10),
  };
}

export function prepareForRAG(memory: LeadMemory, summary: string | null): string {
  const parts = [
    summary ? `Resumo: ${summary}` : '',
    memory.services_mentioned.length > 0
      ? `Serviços: ${memory.services_mentioned.join(', ')}`
      : '',
    memory.objections_raised.length > 0
      ? `Objeções: ${memory.objections_raised.join(', ')}`
      : '',
    Object.entries(memory.qualification_answers || {})
      .map(([q, a]) => `${q}: ${a}`)
      .join(' | '),
  ].filter(Boolean);

  return parts.join(' \n ');
}

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

export async function handleUpdateLeadMemory(
  args: {
    event_type: LeadMemoryEventType;
    note?: string;
    services_mentioned?: string[];
    objection?: string;
    intent_signal?: string;
    answers?: Record<string, string>;
  },
  ctx: { leadId: string; companyId: string },
): Promise<{ updated: boolean }> {
  const admin = createAdminClient();

  const { data: lead } = await admin
    .from('leads')
    .select('lead_memory')
    .eq('id', ctx.leadId)
    .eq('company_id', ctx.companyId)
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
    .eq('id', ctx.leadId)
    .eq('company_id', ctx.companyId);

  if (error) throw new Error(`Failed to update lead memory: ${error.message}`);

  return { updated: true };
}
