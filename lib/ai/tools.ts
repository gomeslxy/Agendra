/**
 * Agendra — AI Tools (Fase 2+)
 *
 * Define as ferramentas que o Gemini pode invocar durante uma conversa:
 *   - listServices       → Lista serviços disponíveis
 *   - checkAvailability  → Consulta horários livres baseados no serviço
 *   - bookAppointment    → Cria um agendamento estruturado
 *   - cancelAppointment  → Cancela um agendamento
 *   - rescheduleAppointment → Reagenda um evento
 *   - myAppointments     → Lista agendamentos do lead
 *   - updateLeadInfo     → Atualiza campos do lead (email, cidade, etc.)
 */

import { createAdminClient } from '@/lib/supabase/admin';
import {
  createGoogleCalendarEvent,
  getFreeBusySlots,
  deleteGCalEvent,
  updateGCalEvent
} from '@/lib/calendar/google';
import { calculateAvailableSlots, isWithinWorkingHours } from '@/lib/calendar/availability';
import { type Tool, type FunctionDeclaration, SchemaType } from '@google/generative-ai';
import { handleUpdateLeadMemory } from './memory';
import { buildBookingConfirmation, formatDateTime } from '@/lib/whatsapp/messages';
import { dispatchWebhook } from '@/lib/webhooks/dispatcher';

export { handleUpdateLeadMemory };

// ─── Tipos internos ───────────────────────────────────────────────────────────

export interface ToolContext {
  companyId: string;
  leadId: string;
  traceId?: string;
}

export interface BookingResult {
  event_id: string;
  gcal_event_id: string | null;
  start_time: string;
  end_time: string;
  title: string;
}

// ─── Tool Declarations (schema para o Gemini) ────────────────────────────────

const baseFunctionDeclarations: FunctionDeclaration[] = [
    {
      name: 'listServices',
      description:
        'Lista todos os serviços, preços e durações oferecidos pela empresa. ' +
        'Use quando o lead perguntar quais serviços estão disponíveis ou o que a empresa faz. ' +
        'NÃO use se o lead já especificou o serviço que deseja.',
      parameters: { type: SchemaType.OBJECT, properties: {}, required: [] },
    },
    {
      name: 'get_available_slots',
      description:
        'Consulta horários disponíveis nos próximos dias para um serviço específico em um fuso horário definido. ' +
        'Use quando o lead demonstrar interesse real em agendar um serviço específico. ' +
        'OBRIGATÓRIO informar o service_id e o timezone (fuso horário).',
      parameters: {
        type: SchemaType.OBJECT,
        properties: {
          service_id: { type: SchemaType.STRING, description: 'ID do serviço desejado' },
          days_ahead: { type: SchemaType.NUMBER, description: 'Dias à frente (padrão 7)' },
          date_hint: { type: SchemaType.STRING, description: 'Dica de data mencionada pelo lead (ex: "hoje", "amanhã", "terça") para otimizar a busca' },
          timezone: { type: SchemaType.STRING, description: 'Timezone do lead/tenant (ex: "America/Sao_Paulo", "America/Manaus", "America/Bahia")' },
        },
        required: ['service_id', 'timezone'],
      },
    },
    {
      name: 'bookAppointment',
      description:
        'Cria um novo agendamento de forma atômica no calendário. ' +
        'Use SOMENTE depois de ter confirmado explicitamente com o lead o serviço, a data e o horário selecionados. ' +
        'IMPORTANTE: start_time DEVE ser exatamente o valor "start" ISO retornado por get_available_slots, NUNCA reconstrua o horário manualmente.',
      parameters: {
        type: SchemaType.OBJECT,
        properties: {
          service_id: { type: SchemaType.STRING, description: 'ID do serviço' },
          start_time: { type: SchemaType.STRING, description: 'ISO 8601 — OBRIGATORIAMENTE use o campo "start" do slot retornado por get_available_slots. Nunca tente reconstruir manualmente.' },
          notes: { type: SchemaType.STRING, description: 'Observações adicionais' },
        },
        required: ['service_id', 'start_time'],
      },
    },
    {
      name: 'cancelAppointment',
      description:
        'Cancela um agendamento futuro existente do lead. ' +
        'FLUXO OBRIGATÓRIO: (1) Chame myAppointments para obter a lista de agendamentos futuros. ' +
        '(2) Identifique o agendamento correto usando o contexto da conversa (data, serviço, horário). ' +
        '(3) Se houver apenas 1 agendamento, confirme com o lead antes de cancelar. ' +
        '(4) Se houver múltiplos, faça uma pergunta natural para identificar qual o lead deseja cancelar. ' +
        'NUNCA solicite ou mencione o event_id ao cliente — use-o apenas internamente após identificá-lo via myAppointments.',
      parameters: {
        type: SchemaType.OBJECT,
        properties: {
          event_id: { type: SchemaType.STRING, description: 'ID interno do agendamento — obtido de myAppointments, NUNCA solicitado ao cliente' },
          reason: { type: SchemaType.STRING, description: 'Motivo do cancelamento (opcional, inferido da conversa)' },
          date_hint: { type: SchemaType.STRING, description: 'Data mencionada pelo cliente para ajudar a identificar o agendamento (ex: "amanhã", "sexta")' },
          service_hint: { type: SchemaType.STRING, description: 'Serviço mencionado pelo cliente (ex: "corte", "barba")' },
          time_hint: { type: SchemaType.STRING, description: 'Horário mencionado pelo cliente (ex: "14h", "manhã")' },
        },
        required: ['event_id'],
      },
    },
    {
      name: 'rescheduleAppointment',
      description:
        'Altera o horário de um agendamento futuro existente do lead. ' +
        'Use quando o lead pedir para mudar, remarcar ou reagendar o seu horário atual. ' +
        'FLUXO OBRIGATÓRIO: (1) Chame myAppointments para obter a lista de agendamentos futuros. ' +
        '(2) Identifique o agendamento correto usando o contexto da conversa. ' +
        '(3) Se houver apenas 1 agendamento, confirme qual é e pergunte o novo horário desejado. ' +
        '(4) Use get_available_slots para verificar disponibilidade do novo horário. ' +
        'NUNCA solicite ou mencione o event_id ao cliente — use-o apenas internamente após identificá-lo via myAppointments.',
      parameters: {
        type: SchemaType.OBJECT,
        properties: {
          event_id: { type: SchemaType.STRING, description: 'ID interno do agendamento — obtido de myAppointments, NUNCA solicitado ao cliente' },
          new_start_time: { type: SchemaType.STRING, description: 'Novo ISO 8601 de início — use o campo "start" exato retornado por get_available_slots' },
          date_hint: { type: SchemaType.STRING, description: 'Data mencionada pelo cliente para ajudar a identificar o agendamento' },
          service_hint: { type: SchemaType.STRING, description: 'Serviço mencionado pelo cliente' },
        },
        required: ['event_id', 'new_start_time'],
      },
    },
    {
      name: 'myAppointments',
      description:
        'Lista todos os agendamentos futuros e ativos do lead. ' +
        'Use quando o lead perguntar sobre seus horários marcados ou se tem algum agendamento.',
      parameters: { type: SchemaType.OBJECT, properties: {}, required: [] },
    },
    {
      name: 'updateLeadInfo',
      description:
        'Atualiza informações cadastrais do lead no CRM (email, cidade ou origem/canal). ' +
        'Use quando o lead informar espontaneamente esses dados na conversa.',
      parameters: {
        type: SchemaType.OBJECT,
        properties: {
          email: { type: SchemaType.STRING },
          city: { type: SchemaType.STRING },
          source: { type: SchemaType.STRING },
        },
      },
    },
    {
      name: 'updateLeadMemory',
      description:
        'Atualiza a memória comportamental e o funil estratégico do lead no CRM. ' +
        'Use para registrar interesses reais, objeções superadas ou desqualificação. NÃO use para registrar saudações casuais.',
      parameters: {
        type: SchemaType.OBJECT,
        properties: {
          event_type: {
            type: SchemaType.STRING,
            format: 'enum',
            enum: ['showed_interest', 'objection_raised', 'slot_shown', 'slot_declined', 'booked', 'no_show', 'reactivated', 'disqualified'],
          },
          note: { type: SchemaType.STRING },
          services_mentioned: { type: SchemaType.ARRAY, items: { type: SchemaType.STRING } },
          objection: { type: SchemaType.STRING },
          answers: { type: SchemaType.OBJECT, properties: {} },
          intent_signal: { type: SchemaType.STRING },
        },
        required: ['event_type'],
      },
    },
    {
      name: 'requestHumanAgent',
      description:
        'Pausa o atendimento automático da IA e solicita intervenção humana urgente. ' +
        'Use imediatamente quando o lead demonstrar forte irritação, exigir falar com um humano, ou se a dúvida for complexa e fora do escopo comercial/agendamento.',
      parameters: {
        type: SchemaType.OBJECT,
        properties: {
          reason: { type: SchemaType.STRING, description: 'Breve motivo da transferência' },
        },
      },
    },
];

// Fintech tools only included in schema when feature flag is enabled.
// Keeping them out of the schema saves tokens and prevents the model from
// attempting calls that will always throw "feature disabled".
const fintechFunctionDeclarations: FunctionDeclaration[] = process.env.ENABLE_FINTECH === 'true'
  ? [
      {
        name: 'generatePixCharge',
        description:
          'Gera uma cobrança Pix (QR code e chave copia e cola) para o lead efetuar o pagamento. ' +
          'Use somente após o lead concordar com o agendamento e o valor do serviço em planos pagos que exigem sinal. ' +
          'NÃO use se o lead não aceitou o valor.',
        parameters: {
          type: SchemaType.OBJECT,
          properties: {
            amount: { type: SchemaType.NUMBER, description: 'Valor em reais (ex: 150.00)' },
            service_id: { type: SchemaType.STRING, description: 'ID do serviço cobrado' },
          },
          required: ['amount'],
        },
      },
      {
        name: 'checkPaymentStatus',
        description:
          'Verifica em tempo real o status de pagamento de uma cobrança Pix gerada anteriormente. ' +
          'Use após enviar a cobrança para validar se o pagamento foi confirmado antes de concluir o agendamento.',
        parameters: {
          type: SchemaType.OBJECT,
          properties: {
            transaction_id: { type: SchemaType.STRING, description: 'ID da transação retornado por generatePixCharge' },
          },
          required: ['transaction_id'],
        },
      },
    ]
  : [];

export const toolDeclarations: Tool = {
  functionDeclarations: [...baseFunctionDeclarations, ...fintechFunctionDeclarations],
};

// ─── Tool Handlers ────────────────────────────────────────────────────────────

export async function handleListServices(_args: any, ctx: ToolContext) {
  const admin = createAdminClient();
  const { data: services, error } = await admin
    .from('services')
    .select('id, name, description, duration, price')
    .eq('company_id', ctx.companyId)
    .eq('active', true)
    .neq('is_paused', true);

  if (error) throw new Error(`Erro ao listar serviços: ${error.message}`);
  
  if (!services?.length) {
    return { message: 'A empresa ainda não cadastrou serviços disponíveis.' };
  }

  const list = services.map(s => 
    `- ${s.name} (${s.duration}min)${s.price ? ` - R$ ${s.price}` : ''} [ID: ${s.id}]`
  ).join('\n');

  return { message: `Serviços disponíveis:\n${list}`, services };
}

export async function handleGetAvailableSlots(
  args: { service_id: string; days_ahead?: number; date_hint?: string; timezone: string },
  ctx: ToolContext,
) {
  const admin = createAdminClient();

  let daysAhead = args.days_ahead;
  if (daysAhead === undefined) {
    if (args.date_hint) {
      const hint = args.date_hint.toLowerCase();
      if (hint.includes('hoje')) {
        daysAhead = 1;
      } else if (hint.includes('amanhã') || hint.includes('amanha')) {
        daysAhead = 2;
      } else if (hint.includes('fim de semana') || hint.includes('fds')) {
        daysAhead = 3;
      } else {
        daysAhead = 7;
      }
    } else {
      daysAhead = 7;
    }
  }
  daysAhead = Math.max(1, Math.min(daysAhead, 14));

  // 1. Buscar serviço e config da empresa
  const [svcRes, coRes] = await Promise.all([
    admin.from('services').select('duration').eq('id', args.service_id).eq('company_id', ctx.companyId).single(),
    admin.from('companies').select('persona_config, google_refresh_token, google_calendar_id').eq('id', ctx.companyId).single()
  ]);

  if (!svcRes.data) throw new Error('Serviço não encontrado.');
  const company = coRes.data;
  const persona = (company?.persona_config ?? {}) as any;
  
  // Quantizado ao minuto: timeMin/timeMax com precisão de ms tornavam a chave do
  // cache Free/Busy única por chamada → 0% de hit, toda consulta de disponibilidade
  // pagava o round-trip completo ao Google. Com granularidade de 60s, chamadas
  // repetidas dentro do TTL de 90s (lead explorando dias/períodos) hitam o cache.
  // Inofensivo para o cálculo: slots começam no próximo bloco de 30min + 1h buffer.
  const now = new Date(Math.floor(Date.now() / 60_000) * 60_000);
  const rangeEnd = new Date(now.getTime() + daysAhead * 24 * 60 * 60 * 1000);

  // 2. Buscar bloqueios (Local + GCal) — overlap query: event overlaps [now, rangeEnd]
  const { data: localEvents } = await admin
    .from('events')
    .select('start_time, end_time')
    .eq('company_id', ctx.companyId)
    .neq('status', 'cancelled')
    .lt('start_time', rangeEnd.toISOString())
    .gt('end_time', now.toISOString());

  let gcalBusy: any[] = [];
  if (company?.google_refresh_token && company?.google_calendar_id) {
    try {
      // CRIT-6: 5s timeout to prevent tool-call stall on GCal slowness
      const gcalPromise = getFreeBusySlots(
        company.google_refresh_token,
        company.google_calendar_id,
        now.toISOString(),
        rangeEnd.toISOString()
      );
      const gcalTimeout = new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('GCal Free/Busy timeout (5s)')), 5000)
      );
      gcalBusy = await Promise.race([gcalPromise, gcalTimeout]);
    } catch (e: any) {
      console.warn('[Tools] GCal Free/Busy failed or timed out, using local only:', e.message);
    }
  }

  const busyIntervals = [
    ...(localEvents ?? []).map(e => ({ start: new Date(e.start_time), end: new Date(e.end_time) })),
    ...gcalBusy.map(b => ({ start: new Date(b.start), end: new Date(b.end) }))
  ];

  // 3. Calcular slots
  const tz = args.timezone || persona.timezone || 'America/Sao_Paulo';

  const slots = calculateAvailableSlots({
    timezone: tz,
    workingHours: persona.working_hours ?? {
      mon: ['09:00', '18:00'], tue: ['09:00', '18:00'], wed: ['09:00', '18:00'],
      thu: ['09:00', '18:00'], fri: ['09:00', '18:00']
    },
    durationMinutes: svcRes.data.duration,
    busyIntervals,
    daysAhead,
    bufferMinutes: persona.buffer_minutes ?? 0
  });

  console.log(`[Tools] get_available_slots: found ${slots.length} slots for svc ${args.service_id} (duration ${svcRes.data.duration}m)`);
  if (busyIntervals.length > 0) {
    console.log(`[Tools] busyIntervals count: ${busyIntervals.length}`);
  }

  const workingHours = persona.working_hours ?? {
    mon: ['09:00', '18:00'], tue: ['09:00', '18:00'], wed: ['09:00', '18:00'],
    thu: ['09:00', '18:00'], fri: ['09:00', '18:00']
  };

  const consulted_at = new Intl.DateTimeFormat('pt-BR', {
    timeZone: tz,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
    timeZoneName: 'short'
  }).format(now);
  const today_date = new Intl.DateTimeFormat('pt-BR', {
    timeZone: tz,
    year: 'numeric', month: '2-digit', day: '2-digit'
  }).format(now);

  // Diagnóstico diário para diferenciar dias fechados vs lotados
  const dayBreakdown: { date: string; weekday: string; status: 'disponivel' | 'fechado' | 'lotado'; working_hours?: string[] }[] = [];
  const ptDaysLong: Record<string, string> = {
    mon: 'segunda-feira', tue: 'terça-feira', wed: 'quarta-feira', thu: 'quinta-feira',
    fri: 'sexta-feira', sat: 'sábado', sun: 'domingo'
  };

  for (let i = 0; i < daysAhead; i++) {
    const checkDate = new Date(now.getTime() + i * 24 * 60 * 60 * 1000);
    const dayName = new Intl.DateTimeFormat('en-US', { timeZone: tz, weekday: 'short' }).format(checkDate).toLowerCase();
    const dateStr = new Intl.DateTimeFormat('pt-BR', { timeZone: tz, day: '2-digit', month: '2-digit' }).format(checkDate);
    const weekdayPt = ptDaysLong[dayName] || dayName;

    const hours = workingHours[dayName];
    if (!hours) {
      dayBreakdown.push({
        date: dateStr,
        weekday: weekdayPt,
        status: 'fechado'
      });
    } else {
      const hasSlot = slots.some(slot => {
        const slotDate = new Date(slot.start);
        const slotDayStr = new Intl.DateTimeFormat('pt-BR', { timeZone: tz, day: '2-digit', month: '2-digit' }).format(slotDate);
        return slotDayStr === dateStr;
      });

      dayBreakdown.push({
        date: dateStr,
        weekday: weekdayPt,
        status: hasSlot ? 'disponivel' : 'lotado',
        working_hours: hours
      });
    }
  }

  const dayBreakdownFiltered = dayBreakdown.filter(d => d.status !== 'disponivel');

  const breakdownSummary = dayBreakdownFiltered.map(d => {
    if (d.status === 'fechado') {
      return `- ${d.weekday} (${d.date}): FECHADO (Sem expediente comercial).`;
    } else {
      return `- ${d.weekday} (${d.date}): LOTADO (Todos os horários preenchidos).`;
    }
  }).join('\n');

  if (!slots.length) {
    return {
      consulted_at,
      today_date,
      slots: [],
      day_breakdown: dayBreakdownFiltered,
      message: `Consulta realizada em ${consulted_at}. Hoje é ${today_date}.\n\nInfelizmente não encontrei horários disponíveis para este serviço nos próximos dias.\n\nStatus detalhado da agenda por dia:\n${breakdownSummary}`
    };
  }

  const availabilitySummary = buildAvailabilitySummary(slots, tz);

  // Cap the raw slot list sent to the model (token budget) WITHOUT capping the
  // slots used for day_breakdown/summary above — capping the calculation itself
  // made later days falsely appear "lotado". Keep an even spread per day so the
  // model still has bookable ISO starts across the whole window.
  const slotsForModel = capSlotsPerDay(slots, tz, 5);

  console.log(`[Tools] get_available_slots summary: ${availabilitySummary}`);
  return {
    consulted_at,
    today_date,
    day_breakdown: dayBreakdownFiltered,
    availability_summary: availabilitySummary,
    slots: slotsForModel,
    message: `Consulta realizada em ${consulted_at}. Hoje é ${today_date}.\n\nDisponibilidade agrupada por período (apresente ao lead em faixas, NUNCA liste slot a slot): ${availabilitySummary}${breakdownSummary ? `\n\nStatus detalhado da agenda por dia:\n${breakdownSummary}` : ''}`,
  };
}

/** Evenly samples at most `perDay` slots for each local day (keeps first/last of the day). */
function capSlotsPerDay<T extends { start: string }>(slots: T[], tz: string, perDay: number): T[] {
  const dayKeyFmt = new Intl.DateTimeFormat('pt-BR', { timeZone: tz, day: '2-digit', month: '2-digit' });
  const byDay = new Map<string, T[]>();
  for (const s of slots) {
    const key = dayKeyFmt.format(new Date(s.start));
    if (!byDay.has(key)) byDay.set(key, []);
    byDay.get(key)!.push(s);
  }
  const out: T[] = [];
  for (const daySlots of byDay.values()) {
    if (daySlots.length <= perDay) {
      out.push(...daySlots);
      continue;
    }
    for (let i = 0; i < perDay; i++) {
      const idx = Math.round((i * (daySlots.length - 1)) / (perDay - 1));
      out.push(daySlots[idx]);
    }
  }
  return out;
}

type DayPeriod = 'manhã' | 'tarde' | 'noite';

function periodOf(d: Date, tz: string): DayPeriod {
  const hour = Number(
    new Intl.DateTimeFormat('pt-BR', { timeZone: tz, hour: '2-digit', hour12: false }).format(d)
  );
  return hour < 12 ? 'manhã' : hour < 18 ? 'tarde' : 'noite';
}

/**
 * Condensa uma lista de slots ISO em um resumo legível por dia e período, ex.:
 * "segunda-feira 02/06: manhã (09:00–11:30), tarde (14:00–17:00) | terça-feira 03/06: tarde (14:00–16:30)".
 */
function buildAvailabilitySummary(slots: { start: string }[], tz: string): string {
  const dayFmt = new Intl.DateTimeFormat('pt-BR', { timeZone: tz, weekday: 'long', day: '2-digit', month: '2-digit' });
  const timeFmt = new Intl.DateTimeFormat('pt-BR', { timeZone: tz, hour: '2-digit', minute: '2-digit', hour12: false });

  // dia -> período -> { first, last } (slots já chegam ordenados por start)
  const byDay = new Map<string, Map<DayPeriod, { first: string; last: string }>>();
  for (const s of slots) {
    const d = new Date(s.start);
    const dayKey = dayFmt.format(d);
    const p = periodOf(d, tz);
    const hhmm = timeFmt.format(d);
    let periods = byDay.get(dayKey);
    if (!periods) { periods = new Map(); byDay.set(dayKey, periods); }
    const bucket = periods.get(p);
    if (!bucket) periods.set(p, { first: hhmm, last: hhmm });
    else bucket.last = hhmm;
  }

  return [...byDay.entries()]
    .map(([day, periods]) =>
      `${day}: ` + [...periods.entries()]
        .map(([p, { first, last }]) => first === last ? `${p} (${first})` : `${p} (${first}–${last})`)
        .join(', ')
    )
    .join(' | ');
}

export async function handleBookAppointment(
  args: { service_id: string; start_time: string; notes?: string },
  ctx: ToolContext
) {
  const admin = createAdminClient();

  // 1. Buscar detalhes do serviço, lead e empresa em paralelo
  const [svcRes, leadRes, coRes] = await Promise.all([
    admin.from('services').select('name, duration').eq('id', args.service_id).eq('company_id', ctx.companyId).single(),
    admin.from('leads').select('name, email').eq('id', ctx.leadId).eq('company_id', ctx.companyId).single(),
    admin.from('companies').select('google_refresh_token, google_calendar_id, persona_config, name').eq('id', ctx.companyId).single(),
  ]);

  if (!svcRes.data) throw new Error('Serviço não encontrado.');
  const service = svcRes.data;
  const lead = leadRes.data;
  const bookPersona = (coRes.data?.persona_config ?? {}) as any;
  const bufferMinutes = bookPersona.buffer_minutes ?? 0;
  const startTime = new Date(args.start_time);
  if (isNaN(startTime.getTime())) throw new Error('Horário inválido. Informe um ISO 8601 válido.');
  if (startTime.getTime() < Date.now()) throw new Error('Não é possível agendar no passado.');

  // Server-side working-hours guard: the model is instructed to only use slots
  // returned by checkAvailability, but if it fabricates a start_time this is the
  // last line of defense against bookings outside the configured schedule.
  const bookTz = bookPersona.timezone ?? 'America/Sao_Paulo';
  const bookWorkingHours = bookPersona.working_hours ?? {
    mon: ['09:00', '18:00'], tue: ['09:00', '18:00'], wed: ['09:00', '18:00'],
    thu: ['09:00', '18:00'], fri: ['09:00', '18:00']
  };
  if (!isWithinWorkingHours(startTime, service.duration, bookWorkingHours, bookTz)) {
    throw new Error(
      'Este horário está fora do expediente da empresa. Use checkAvailability e ofereça apenas os horários retornados.'
    );
  }

  const endTime = new Date(startTime.getTime() + service.duration * 60000);

  // 3. Sync GCal & Double-Check External
  const company = coRes.data;

  let gcalId: string | null = null;
  let gcalFailed = false;
  if (company?.google_refresh_token) {
    try {
      // FIX-F2: 5s timeout so booking stall doesn't block the AI if GCal is slow at booking time
      // noCache: precisa do estado REAL do calendário no instante da confirmação —
      // um "livre" cacheado de até 90s atrás é exatamente a janela de double-booking.
      const gcalDoubleCheckPromise = getFreeBusySlots(
        company.google_refresh_token,
        company.google_calendar_id ?? 'primary',
        startTime.toISOString(),
        endTime.toISOString(),
        { noCache: true }
      );
      const gcalDoubleCheckTimeout = new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('GCal double-check timeout (5s)')), 5000)
      );
      const gcalBusy = await Promise.race([gcalDoubleCheckPromise, gcalDoubleCheckTimeout]);

      if (gcalBusy.length > 0) {
        throw new Error('Este horário foi ocupado recentemente no calendário externo. Por favor, tente outro.');
      }

      const advanceHours = (company?.persona_config as any)?.reminder_advance_hours ?? 2;
      const reminderMinutes = advanceHours * 60;

      gcalId = await createGoogleCalendarEvent(
        company.google_refresh_token,
        company.google_calendar_id ?? 'primary',
        {
          title: `${service.name} - ${lead?.name || 'Cliente'}`,
          start: startTime.toISOString(),
          end: endTime.toISOString(),
          description: args.notes || `Agendamento realizado via Agendra AI.\nLead ID: ${ctx.leadId}`,
          attendeeEmail: lead?.email || undefined,
          timeZone: (company.persona_config as any)?.timezone,
          reminderMinutes
        }
      );
    } catch (e: any) {
      console.error('[Tools] GCal double-check or creation failed:', e.message);
      if (e.message.includes('calendário externo')) throw e; // Rethrow business error
      gcalFailed = true;
    }
  }

  // 4. Salvar no banco de forma atômica via procedure PL/pgSQL
  let event: any;
  try {
    const { data: rpcRes, error: rpcErr } = await admin.rpc('book_appointment_atomic', {
      p_lead_id: ctx.leadId,
      p_company_id: ctx.companyId,
      p_service_id: args.service_id,
      p_title: `${service.name} - ${lead?.name || 'Cliente'}`,
      p_start_time: startTime.toISOString(),
      p_end_time: endTime.toISOString(),
      p_gcal_event_id: gcalId,
      p_notes: args.notes ?? null,
      p_duration_minutes: service.duration,
      p_buffer_minutes: bufferMinutes
    });

    if (rpcErr) throw rpcErr;
    if (!rpcRes.success) throw new Error(rpcRes.error);

    event = rpcRes.event;

    // GCal estava indisponível na criação: o evento existe só localmente e a
    // agenda externa diverge. Marca 'error' para o badge da UI e para a
    // reconciliação push do cron gcal-sync (30min) recriar o evento no Google.
    if (gcalFailed) {
      await admin.from('events')
        .update({ gcal_sync_status: 'error' })
        .eq('id', event.id)
        .eq('company_id', ctx.companyId);
    }

    // 5. Agendar Lembrete Automático (antecedência configurável via persona_config)
    try {
      const advanceHours = (company?.persona_config as any)?.reminder_advance_hours ?? 2;
      const remindAt = new Date(startTime.getTime() - advanceHours * 60 * 60 * 1000);
      if (remindAt > new Date()) {
        await admin.from('reminders').insert({
          event_id: event.id,
          company_id: ctx.companyId,
          lead_id: ctx.leadId,
          remind_at: remindAt.toISOString(),
          status: 'pending'
        });
      }
    } catch (remErr) {
      console.error('[Tools] Falha ao agendar lembrete:', remErr);
    }

    // Reset followup_count on success
    await admin.from('leads').update({ followup_count: 0 }).eq('id', ctx.leadId).eq('company_id', ctx.companyId);
  } catch (dbErr: any) {
    console.error('[Tools] DB transaction failed in bookAppointment, compensating GCal creation:', dbErr.message);
    if (gcalId && company?.google_refresh_token) {
      try {
        await deleteGCalEvent(company.google_refresh_token, company.google_calendar_id ?? 'primary', gcalId);
      } catch (compensateErr: any) {
        console.error('[Tools] Compensation failed (could not delete GCal event):', compensateErr.message);
      }
    }
    throw dbErr;
  }

  const companyTimezone = (company?.persona_config as any)?.timezone ?? 'America/Sao_Paulo';
  const { dateStr, timeStr } = formatDateTime(startTime, companyTimezone);
  const confirmationMsg = buildBookingConfirmation({
    leadFirstName: lead?.name?.split(' ')[0] ?? 'cliente',
    serviceName: service.name,
    dateStr,
    timeStr,
    businessName: company?.name ?? 'nossa empresa',
    notes: args.notes,
  });

  // Disparar webhook booking.created de forma não-bloqueante
  void dispatchWebhook(ctx.companyId, 'booking.created', {
    event_id: event.id,
    lead_id: ctx.leadId,
    service_name: service.name,
    start_time: startTime.toISOString(),
    end_time: endTime.toISOString(),
    gcal_event_id: gcalId,
  });

  return { message: confirmationMsg, event };
}

export async function handleCancelAppointment(args: { event_id: string; reason?: string }, _ctx: ToolContext) {
  const admin = createAdminClient();
  
  const { data: event } = await admin
    .from('events')
    .select('gcal_event_id, company_id, companies(google_refresh_token, google_calendar_id)')
    .eq('id', args.event_id)
    .eq('company_id', _ctx.companyId)
    .eq('lead_id', _ctx.leadId) // prevent intra-company IDOR
    .single();

  if (!event) throw new Error('Agendamento não encontrado.');

  // Cancel local
  await admin.from('events').update({ status: 'cancelled', notes: args.reason }).eq('id', args.event_id).eq('company_id', _ctx.companyId);
  
  // Cancelar lembretes pendentes
  await admin.from('reminders')
    .update({ status: 'cancelled' })
    .eq('event_id', args.event_id)
    .eq('company_id', _ctx.companyId)
    .eq('status', 'pending');

  // Reset followup_count on success
  await admin.from('leads').update({ followup_count: 0 }).eq('id', _ctx.leadId).eq('company_id', _ctx.companyId);

  // Sync GCal — update gcal_sync_status on failure for observability
  const co = event.companies as any;
  if (event.gcal_event_id && co?.google_refresh_token) {
    try {
      await deleteGCalEvent(co.google_refresh_token, co.google_calendar_id ?? 'primary', event.gcal_event_id);
    } catch (e) {
      // 'error' (não 'failed'): único valor de falha no tipo GCalSyncStatus — o
      // badge da agenda e a reconciliação push do cron gcal-sync filtram por ele.
      console.warn('[Tools] Failed to delete GCal event on cancel — marking gcal_sync_status=error');
      await admin.from('events').update({ gcal_sync_status: 'error' }).eq('id', args.event_id).eq('company_id', _ctx.companyId);
    }
  }

  // Dispatch webhook booking.cancelled (non-blocking — FIX-F7)
  void dispatchWebhook(_ctx.companyId, 'booking.cancelled', {
    event_id: args.event_id,
    lead_id: _ctx.leadId,
    reason: args.reason ?? null,
  });

  return { message: 'Agendamento cancelado com sucesso.' };
}

export async function handleRescheduleAppointment(args: { event_id: string; new_start_time: string }, ctx: ToolContext) {
  const admin = createAdminClient();

  const { data: event } = await admin
    .from('events')
    .select('*, services(duration), companies(google_refresh_token, google_calendar_id, persona_config)')
    .eq('id', args.event_id)
    .eq('company_id', ctx.companyId)
    .eq('lead_id', ctx.leadId) // prevent intra-company IDOR
    .single();

  if (!event) throw new Error('Agendamento não encontrado.');
    const duration = event.duration_minutes ??
      (event.services as any)?.duration ??
      Math.round((new Date(event.end_time).getTime() - new Date(event.start_time).getTime()) / 60000);
  const newStart = new Date(args.new_start_time);
  if (isNaN(newStart.getTime())) throw new Error('Horário inválido. Informe um ISO 8601 válido.');
  if (newStart.getTime() < Date.now()) throw new Error('Não é possível reagendar para o passado.');
  const newEnd = new Date(newStart.getTime() + duration * 60000);

  // Same server-side guards as bookAppointment: working hours + buffer-aware,
  // atomic collision check (the old SELECT-then-UPDATE allowed double-booking
  // when a concurrent booking landed between the two statements).
  const reschedPersona = ((event.companies as any)?.persona_config ?? {}) as any;
  const reschedTz = reschedPersona.timezone ?? 'America/Sao_Paulo';
  const reschedWorkingHours = reschedPersona.working_hours ?? {
    mon: ['09:00', '18:00'], tue: ['09:00', '18:00'], wed: ['09:00', '18:00'],
    thu: ['09:00', '18:00'], fri: ['09:00', '18:00']
  };
  if (!isWithinWorkingHours(newStart, duration, reschedWorkingHours, reschedTz)) {
    throw new Error(
      'Este novo horário está fora do expediente da empresa. Use checkAvailability e ofereça apenas os horários retornados.'
    );
  }

  const reschedBuffer = reschedPersona.buffer_minutes ?? 0;
  const { data: reschedRes, error: reschedErr } = await admin.rpc('reschedule_appointment_atomic', {
    p_event_id: args.event_id,
    p_company_id: ctx.companyId,
    p_lead_id: ctx.leadId,
    p_new_start_time: newStart.toISOString(),
    p_new_end_time: newEnd.toISOString(),
    p_buffer_minutes: reschedBuffer,
  });

  if (reschedErr) {
    // Function not deployed yet (migration 077 pending) → legacy non-atomic path
    if ((reschedErr as any).code === 'PGRST202' || /reschedule_appointment_atomic/.test(reschedErr.message ?? '')) {
      console.warn('[Tools] reschedule_appointment_atomic missing — falling back to legacy path. Apply migration 077.');
      const { data: collision } = await admin
        .from('events')
        .select('id')
        .eq('company_id', ctx.companyId)
        .neq('id', args.event_id)
        .neq('status', 'cancelled')
        .lt('start_time', newEnd.toISOString())
        .gt('end_time', newStart.toISOString())
        .maybeSingle();

      if (collision) throw new Error('Infelizmente este novo horário já está ocupado.');

      await admin.from('events').update({
        start_time: newStart.toISOString(),
        end_time: newEnd.toISOString(),
        status: 'rescheduled'
      }).eq('id', args.event_id).eq('company_id', ctx.companyId);
    } else {
      throw reschedErr;
    }
  } else if (!reschedRes?.success) {
    throw new Error(reschedRes?.error ?? 'Não foi possível reagendar.');
  }
  
  // Atualizar lembrete usando reminder_advance_hours da config (fallback 2h)
  const reminderAdvanceHours = (event.companies as any)?.persona_config?.reminder_advance_hours ?? 2;
  const newRemindAt = new Date(newStart.getTime() - reminderAdvanceHours * 60 * 60 * 1000);
  if (newRemindAt > new Date()) {
    await admin.from('reminders')
      .update({ remind_at: newRemindAt.toISOString() })
      .eq('event_id', args.event_id)
      .eq('company_id', ctx.companyId)
      .eq('status', 'pending');
  } else {
    // Se o novo horário for muito em cima, cancelamos o lembrete pendente
    await admin.from('reminders')
      .update({ status: 'cancelled' })
      .eq('event_id', args.event_id)
      .eq('company_id', ctx.companyId)
      .eq('status', 'pending');
  }

  // Sync GCal — update gcal_sync_status on failure for observability
  const co = event.companies as any;
  if (event.gcal_event_id && co?.google_refresh_token) {
    try {
      await updateGCalEvent(co.google_refresh_token, co.google_calendar_id ?? 'primary', event.gcal_event_id, {
        title: event.title,
        start: newStart.toISOString(),
        end: newEnd.toISOString(),
        timeZone: co.persona_config?.timezone
      });
    } catch (e) {
      console.warn('[Tools] Failed to update GCal event on reschedule — marking gcal_sync_status=error');
      await admin.from('events').update({ gcal_sync_status: 'error' }).eq('id', args.event_id).eq('company_id', ctx.companyId);
    }
  }

  // Dispatch webhook booking.rescheduled (non-blocking — FIX-F8)
  void dispatchWebhook(ctx.companyId, 'booking.rescheduled', {
    event_id: args.event_id,
    lead_id: ctx.leadId,
    new_start_time: newStart.toISOString(),
    new_end_time: newEnd.toISOString(),
  });

  return { message: 'Reagendamento concluído com sucesso.' };
}

export async function handleMyAppointments(_args: any, ctx: ToolContext) {
  const admin = createAdminClient();
  const { data: events } = await admin
    .from('events')
    .select('id, title, start_time, status')
    .eq('lead_id', ctx.leadId)
    .eq('company_id', ctx.companyId) // ALWAYS filter by company_id!
    .neq('status', 'cancelled')
    .gte('start_time', new Date().toISOString())
    .order('start_time', { ascending: true });

  if (!events?.length) return { message: 'Você não possui agendamentos futuros.' };

  // IMP-1: Format start_time in company timezone for AI readability (not raw UTC)
  const { data: coData } = await admin.from('companies').select('persona_config').eq('id', ctx.companyId).single();
  const tz = (coData?.persona_config as any)?.timezone ?? 'America/Sao_Paulo';
  const list = events.map(e => {
    const localStart = new Intl.DateTimeFormat('pt-BR', {
      timeZone: tz, day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit'
    }).format(new Date(e.start_time));
    // ID is NOT included in the human-readable text to prevent leaks,
    // but is available in the structured appointments array for the AI to use internally.
    return `- ${e.title} em ${localStart}`;
  }).join('\n');
  return { message: `Seus agendamentos:\n${list}`, appointments: events };
}
export async function handleUpdateLeadInfo(
  args: { email?: string; city?: string; source?: string },
  ctx: ToolContext,
) {
  const admin = createAdminClient();
  const patch: any = {};
  if (args.email) patch.email = args.email.trim().toLowerCase();
  if (args.city) patch.city = args.city.trim();
  if (args.source) patch.source = args.source.trim();

  if (Object.keys(patch).length === 0) return { updated: false };

  const { error } = await admin.from('leads').update(patch).eq('id', ctx.leadId).eq('company_id', ctx.companyId);
  if (error) throw error;
  return { updated: true, fields: Object.keys(patch) };
}

export async function handleRequestHumanAgent(
  args: { reason?: string },
  ctx: ToolContext,
) {
  const admin = createAdminClient();
  
  const { error } = await admin
    .from('leads')
    .update({ 
      is_paused: true, 
      control_mode: 'manual',
      status: 'manual',
      summary: `[TRANSFERÊNCIA] ${args.reason || 'Lead solicitou falar com humano.'}`
    })
    .eq('id', ctx.leadId)
    .eq('company_id', ctx.companyId);

  if (error) throw error;

  return { 
    message: 'Entendido. Estou pausando meu atendimento e notificando um atendente humano para te ajudar. Por favor, aguarde um momento.',
    paused: true 
  };
}

export async function handleGeneratePixCharge(
  args: { service_id: string; amount: number },
  ctx: ToolContext
) {
  if (process.env.ENABLE_FINTECH !== 'true') {
    throw new Error('Fintech feature desativada');
  }

  const admin = createAdminClient();

  const pixKey = "00020101021226830014br.gov.bcb.pix2561api.agendra.site/v2/cobv/" + ctx.companyId.replace(/-/g, '').substring(0, 15) + "5802BR5920Agendra Tecnologia6009Sao Paulo62070503***6304" + Math.random().toString(36).substring(2, 6).toUpperCase();

  const { data: tx, error } = await admin
    .from('transactions')
    .insert({
      company_id: ctx.companyId,
      lead_id: ctx.leadId,
      amount: args.amount,
      status: 'pending',
      pix_qrcode: pixKey,
      pix_image_url: 'https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=' + encodeURIComponent(pixKey),
    })
    .select()
    .single();

  if (error) throw new Error(`Falha ao criar cobrança Pix: ${error.message}`);

  return {
    message: `Cobrança Pix de *R$ ${args.amount.toFixed(2)}* gerada com sucesso!\n\n*Pix Copia e Cola*:\n\`\`\`${pixKey}\`\`\`\n\n_Efetue o pagamento e a confirmação será automática._`,
    transaction_id: tx.id,
    pix_key: pixKey
  };
}

export async function handleCheckPaymentStatus(
  args: { transaction_id: string },
  ctx: ToolContext
) {
  if (process.env.ENABLE_FINTECH !== 'true') {
    throw new Error('Fintech feature desativada');
  }

  const admin = createAdminClient();

  const { data: tx, error } = await admin
    .from('transactions')
    .select('id, status, paid_at, amount')
    .eq('id', args.transaction_id)
    .eq('company_id', ctx.companyId) // IDOR guard
    .maybeSingle();

  if (error || !tx) {
    return { status: 'not_found', message: 'Transação não encontrada.' };
  }

  const statusMsg =
    tx.status === 'paid'
      ? `Pagamento de R$ ${Number(tx.amount).toFixed(2)} confirmado! ✅ Confirme o agendamento.`
      : tx.status === 'pending'
      ? `Aguardando pagamento de R$ ${Number(tx.amount).toFixed(2)}. Lead ainda não pagou.`
      : `Pagamento com status: ${tx.status}.`;

  return { status: tx.status, paid_at: tx.paid_at, amount: tx.amount, message: statusMsg };
}

// Alias for backwards compatibility if any old engine code calls it
export const handleBookMeeting = handleBookAppointment;
