/**
 * Agendra — AI Tools (Fase 2)
 *
 * Define as ferramentas que o Gemini pode invocar durante uma conversa:
 *   - checkAvailability  → Consulta horários livres nos próximos dias
 *   - bookMeeting        → Cria um evento na tabela events (+ GCal se configurado)
 *   - updateLeadInfo     → Atualiza campos do lead (email, cidade, etc.)
 *
 * Cada ferramenta tem:
 *   1. `declaration` — schema JSON para o Gemini (FunctionDeclaration)
 *   2. `handler`     — função assíncrona que executa a lógica real
 */

import { createAdminClient } from '@/lib/supabase/admin';
import { createGoogleCalendarEvent, getFreeBusySlots } from '@/lib/calendar/google';
import type { Tool } from '@google/generative-ai';

// ─── Tipos internos ───────────────────────────────────────────────────────────

export interface ToolContext {
  companyId: string;
  leadId: string;
}

export interface AvailableSlot {
  start: string; // ISO 8601
  end: string;   // ISO 8601
  label: string; // "Terça, 13 mai · 10:00–11:00"
}

export interface BookingResult {
  event_id: string;
  gcal_event_id: string | null;
  start_time: string;
  end_time: string;
  title: string;
}

// ─── Tool Declarations (schema para o Gemini) ────────────────────────────────

export const toolDeclarations: Tool = {
  functionDeclarations: [
    {
      name: 'checkAvailability',
      description:
        'Consulta os horários disponíveis para agendamento nos próximos 7 dias. ' +
        'Use esta ferramenta quando o lead demonstrar interesse em agendar uma reunião ' +
        'ou pedir para ver os horários disponíveis.',
      parameters: {
        type: 'OBJECT' as const,
        properties: {
          days_ahead: {
            type: 'NUMBER' as const,
            description: 'Quantos dias à frente verificar (padrão: 7, máximo: 14)',
          },
        },
        required: [],
      },
    },
    {
      name: 'bookMeeting',
      description:
        'Agenda uma reunião para o lead num horário específico. ' +
        'Só use esta ferramenta após o lead confirmar explicitamente o horário desejado. ' +
        'O horário deve ser um dos retornados por checkAvailability.',
      parameters: {
        type: 'OBJECT' as const,
        properties: {
          start_time: {
            type: 'STRING' as const,
            description: 'Data e hora de início em ISO 8601 (ex: "2026-05-15T10:00:00-03:00")',
          },
          end_time: {
            type: 'STRING' as const,
            description: 'Data e hora de fim em ISO 8601 (ex: "2026-05-15T11:00:00-03:00")',
          },
          title: {
            type: 'STRING' as const,
            description: 'Título do evento (ex: "Reunião com João — Agendra Demo")',
          },
        },
        required: ['start_time', 'end_time', 'title'],
      },
    },
    {
      name: 'updateLeadInfo',
      description:
        'Atualiza informações do lead no banco de dados quando o lead as fornecer durante a conversa. ' +
        'Use para salvar email, cidade ou a origem do interesse do lead.',
      parameters: {
        type: 'OBJECT' as const,
        properties: {
          email: {
            type: 'STRING' as const,
            description: 'Email do lead, se fornecido',
          },
          city: {
            type: 'STRING' as const,
            description: 'Cidade do lead, se fornecida',
          },
          source: {
            type: 'STRING' as const,
            description: 'Como o lead conheceu a empresa (ex: "Instagram", "indicação")',
          },
        },
        required: [],
      },
    },
  ],
};

// ─── Tool Handlers ────────────────────────────────────────────────────────────

/**
 * checkAvailability — retorna slots livres formatados para o Gemini responder.
 *
 * Estratégia: consulta a tabela `events` para conflitos locais.
 * Se a empresa tiver Google Calendar configurado, usa a API Free/Busy.
 */
export async function handleCheckAvailability(
  args: { days_ahead?: number },
  ctx: ToolContext,
): Promise<{ slots: AvailableSlot[]; message: string }> {
  const admin = createAdminClient();
  const daysAhead = Math.min(args.days_ahead ?? 7, 14);

  // Buscar configuração da empresa (timezone, working_hours, slot_duration, google_refresh_token)
  const { data: company } = await admin
    .from('companies')
    .select('persona_config, google_refresh_token, google_calendar_id')
    .eq('id', ctx.companyId)
    .single();

  const persona = (company?.persona_config ?? {}) as Record<string, unknown>;
  const timezone = (persona.timezone as string) ?? 'America/Sao_Paulo';
  const slotDuration = (persona.slot_duration_minutes as number) ?? 60;
  const workingHours = (persona.working_hours as Record<string, [string, string]>) ?? {
    mon: ['09:00', '18:00'],
    tue: ['09:00', '18:00'],
    wed: ['09:00', '18:00'],
    thu: ['09:00', '18:00'],
    fri: ['09:00', '18:00'],
  };

  const now = new Date();
  const rangeEnd = new Date(now.getTime() + daysAhead * 24 * 60 * 60 * 1000);

  // Buscar eventos já agendados no banco local
  const { data: existingEvents } = await admin
    .from('events')
    .select('start_time, end_time')
    .eq('company_id', ctx.companyId)
    .gte('start_time', now.toISOString())
    .lte('end_time', rangeEnd.toISOString());

  // Buscar bloqueios do Google Calendar se configurado
  let gcalBusySlots: Array<{ start: string; end: string }> = [];
  if (company?.google_refresh_token && company?.google_calendar_id) {
    try {
      gcalBusySlots = await getFreeBusySlots(
        company.google_refresh_token,
        company.google_calendar_id,
        now.toISOString(),
        rangeEnd.toISOString(),
      );
    } catch (err) {
      console.warn('[Tools] ⚠️ Google Calendar Free/Busy falhou — usando apenas banco local', err);
    }
  }

  // Consolidar bloqueados (local + GCal)
  const busyIntervals = [
    ...(existingEvents ?? []).map((e) => ({ start: e.start_time, end: e.end_time })),
    ...gcalBusySlots,
  ];

  // Gerar slots candidatos
  const dayNames: Record<number, string> = { 1: 'mon', 2: 'tue', 3: 'wed', 4: 'thu', 5: 'fri', 6: 'sat', 0: 'sun' };
  const ptDays: Record<string, string> = {
    mon: 'Segunda', tue: 'Terça', wed: 'Quarta', thu: 'Quinta',
    fri: 'Sexta', sat: 'Sábado', sun: 'Domingo',
  };
  const ptMonths = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];

  const availableSlots: AvailableSlot[] = [];
  const cursor = new Date(now);
  cursor.setMinutes(0, 0, 0);
  cursor.setHours(cursor.getHours() + 1); // começa na próxima hora cheia

  while (cursor < rangeEnd && availableSlots.length < 10) {
    const dayKey = dayNames[cursor.getDay()];
    const hours = workingHours[dayKey];

    if (hours) {
      const [startHH, startMM] = hours[0].split(':').map(Number);
      const [endHH, endMM] = hours[1].split(':').map(Number);

      const dayStart = new Date(cursor);
      dayStart.setHours(startHH, startMM, 0, 0);
      const dayEnd = new Date(cursor);
      dayEnd.setHours(endHH, endMM, 0, 0);

      // Garantir que o slot não seja no passado
      const slotStart = cursor < dayStart ? dayStart : new Date(cursor);
      slotStart.setMinutes(0, 0, 0);

      let s = new Date(slotStart);
      while (s.getTime() + slotDuration * 60000 <= dayEnd.getTime()) {
        const slotEnd = new Date(s.getTime() + slotDuration * 60000);

        // Verificar colisão com busy intervals
        const isBusy = busyIntervals.some(
          (busy) => new Date(busy.start) < slotEnd && new Date(busy.end) > s,
        );

        if (!isBusy) {
          const pad = (n: number) => String(n).padStart(2, '0');
          const label = `${ptDays[dayKey]}, ${pad(s.getDate())} ${ptMonths[s.getMonth()]} · ${pad(s.getHours())}:${pad(s.getMinutes())}–${pad(slotEnd.getHours())}:${pad(slotEnd.getMinutes())}`;
          availableSlots.push({
            start: s.toISOString(),
            end: slotEnd.toISOString(),
            label,
          });
        }

        s = slotEnd;
      }
    }

    // Avançar para o próximo dia
    cursor.setDate(cursor.getDate() + 1);
    cursor.setHours(0, 0, 0, 0);
  }

  if (availableSlots.length === 0) {
    return { slots: [], message: 'Nenhum horário disponível nos próximos ' + daysAhead + ' dias.' };
  }

  const message =
    'Horários disponíveis:\n' +
    availableSlots.map((s, i) => `${i + 1}. ${s.label}`).join('\n');

  return { slots: availableSlots, message };
}

/**
 * bookMeeting — cria o evento no banco e no Google Calendar (se configurado).
 */
export async function handleBookMeeting(
  args: { start_time: string; end_time: string; title: string },
  ctx: ToolContext,
): Promise<BookingResult> {
  const admin = createAdminClient();

  // Verificar colisão antes de gravar
  const { data: collision } = await admin
    .from('events')
    .select('id')
    .eq('company_id', ctx.companyId)
    .lt('start_time', args.end_time)
    .gt('end_time', args.start_time)
    .maybeSingle();

  if (collision) {
    throw new Error('Este horário já foi reservado. Use checkAvailability para ver os horários disponíveis.');
  }

  // Buscar token do Google Calendar
  const { data: company } = await admin
    .from('companies')
    .select('google_refresh_token, google_calendar_id')
    .eq('id', ctx.companyId)
    .single();

  let gcalEventId: string | null = null;

  if (company?.google_refresh_token) {
    try {
      gcalEventId = await createGoogleCalendarEvent(
        company.google_refresh_token,
        company.google_calendar_id ?? 'primary',
        {
          title: args.title,
          start: args.start_time,
          end: args.end_time,
          description: `Lead ID: ${ctx.leadId} — Agendado via Agendra AI`,
        },
      );
    } catch (err) {
      console.error('[Tools] ❌ Falha ao criar evento no Google Calendar:', err);
      // Continua — salva no banco mesmo sem GCal
    }
  }

  // Gravar no banco local
  const { data: event, error } = await admin
    .from('events')
    .insert({
      lead_id: ctx.leadId,
      company_id: ctx.companyId,
      title: args.title,
      start_time: args.start_time,
      end_time: args.end_time,
      gcal_event_id: gcalEventId,
    })
    .select()
    .single();

  if (error || !event) {
    throw new Error(`Falha ao gravar evento: ${error?.message}`);
  }

  return {
    event_id: event.id,
    gcal_event_id: gcalEventId,
    start_time: event.start_time,
    end_time: event.end_time,
    title: event.title,
  };
}

/**
 * updateLeadInfo — atualiza campos do lead quando o usuário os compartilha.
 */
export async function handleUpdateLeadInfo(
  args: { email?: string; city?: string; source?: string },
  ctx: ToolContext,
): Promise<{ updated: boolean; fields: string[] }> {
  const admin = createAdminClient();

  const patch: Record<string, string> = {};
  if (args.email) patch.email = args.email.trim().toLowerCase();
  if (args.city) patch.city = args.city.trim();
  if (args.source) patch.source = args.source.trim();

  if (Object.keys(patch).length === 0) {
    return { updated: false, fields: [] };
  }

  const { error } = await admin
    .from('leads')
    .update(patch)
    .eq('id', ctx.leadId);

  if (error) {
    throw new Error(`Falha ao atualizar lead: ${error.message}`);
  }

  return { updated: true, fields: Object.keys(patch) };
}
