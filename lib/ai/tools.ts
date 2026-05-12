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
import { calculateAvailableSlots, AvailableSlot } from '@/lib/calendar/availability';
import { type Tool, SchemaType } from '@google/generative-ai';
import { handleUpdateLeadMemory } from './memory';

export { handleUpdateLeadMemory };

// ─── Tipos internos ───────────────────────────────────────────────────────────

export interface ToolContext {
  companyId: string;
  leadId: string;
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
      name: 'listServices',
      description: 'Lista todos os serviços, preços e durações oferecidos pela empresa.',
      parameters: { type: SchemaType.OBJECT, properties: {}, required: [] },
    },
    {
      name: 'checkAvailability',
      description:
        'Consulta horários disponíveis nos próximos dias. ' +
        'Obrigatório informar o service_id para calcular a duração correta.',
      parameters: {
        type: SchemaType.OBJECT,
        properties: {
          service_id: { type: SchemaType.STRING, description: 'ID do serviço desejado' },
          days_ahead: { type: SchemaType.NUMBER, description: 'Dias à frente (padrão 7)' },
        },
        required: ['service_id'],
      },
    },
    {
      name: 'bookAppointment',
      description:
        'Cria um novo agendamento. Use após o lead escolher um horário de checkAvailability.',
      parameters: {
        type: SchemaType.OBJECT,
        properties: {
          service_id: { type: SchemaType.STRING, description: 'ID do serviço' },
          start_time: { type: SchemaType.STRING, description: 'ISO 8601 (ex: 2026-05-15T14:00:00Z)' },
          notes: { type: SchemaType.STRING, description: 'Observações adicionais' },
        },
        required: ['service_id', 'start_time'],
      },
    },
    {
      name: 'cancelAppointment',
      description: 'Cancela um agendamento existente do lead.',
      parameters: {
        type: SchemaType.OBJECT,
        properties: {
          event_id: { type: SchemaType.STRING, description: 'ID do agendamento (do myAppointments)' },
          reason: { type: SchemaType.STRING, description: 'Motivo do cancelamento' },
        },
        required: ['event_id'],
      },
    },
    {
      name: 'rescheduleAppointment',
      description: 'Altera o horário de um agendamento existente.',
      parameters: {
        type: SchemaType.OBJECT,
        properties: {
          event_id: { type: SchemaType.STRING, description: 'ID do agendamento' },
          new_start_time: { type: SchemaType.STRING, description: 'Novo ISO 8601 de início' },
        },
        required: ['event_id', 'new_start_time'],
      },
    },
    {
      name: 'myAppointments',
      description: 'Lista todos os agendamentos futuros do lead.',
      parameters: { type: SchemaType.OBJECT, properties: {}, required: [] },
    },
    {
      name: 'updateLeadInfo',
      description: 'Atualiza email, cidade ou origem do lead.',
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
      description: 'Atualiza a memória estratégica e comportamental do lead.',
      parameters: {
        type: SchemaType.OBJECT,
        properties: {
          event_type: {
            type: SchemaType.STRING,
            enum: ['showed_interest', 'objection_raised', 'slot_shown', 'slot_declined', 'booked', 'no_show', 'reactivated', 'disqualified'],
          },
          note: { type: SchemaType.STRING },
          services_mentioned: { type: SchemaType.ARRAY, items: { type: SchemaType.STRING } },
          objection: { type: SchemaType.STRING },
          answers: { type: SchemaType.OBJECT },
          intent_signal: { type: SchemaType.STRING },
        },
        required: ['event_type'],
      },
    },
  ],
};

// ─── Tool Handlers ────────────────────────────────────────────────────────────

export async function handleListServices(args: any, ctx: ToolContext) {
  const admin = createAdminClient();
  const { data: services, error } = await admin
    .from('services')
    .select('id, name, description, duration, price')
    .eq('company_id', ctx.companyId)
    .eq('active', true);

  if (error) throw new Error(`Erro ao listar serviços: ${error.message}`);
  
  if (!services?.length) {
    return { message: 'A empresa ainda não cadastrou serviços disponíveis.' };
  }

  const list = services.map(s => 
    `- ${s.name} (${s.duration}min)${s.price ? ` - R$ ${s.price}` : ''} [ID: ${s.id}]`
  ).join('\n');

  return { message: `Serviços disponíveis:\n${list}`, services };
}

export async function handleCheckAvailability(
  args: { service_id: string; days_ahead?: number },
  ctx: ToolContext,
) {
  const admin = createAdminClient();
  const daysAhead = Math.min(args.days_ahead ?? 7, 14);

  // 1. Buscar serviço e config da empresa
  const [svcRes, coRes] = await Promise.all([
    admin.from('services').select('duration').eq('id', args.service_id).single(),
    admin.from('companies').select('persona_config, google_refresh_token, google_calendar_id').eq('id', ctx.companyId).single()
  ]);

  if (!svcRes.data) throw new Error('Serviço não encontrado.');
  const company = coRes.data;
  const persona = (company?.persona_config ?? {}) as any;
  
  const now = new Date();
  const rangeEnd = new Date(now.getTime() + daysAhead * 24 * 60 * 60 * 1000);

  // 2. Buscar bloqueios (Local + GCal)
  const { data: localEvents } = await admin
    .from('events')
    .select('start_time, end_time')
    .eq('company_id', ctx.companyId)
    .neq('status', 'cancelled')
    .gte('start_time', now.toISOString())
    .lte('end_time', rangeEnd.toISOString());

  let gcalBusy: any[] = [];
  if (company?.google_refresh_token && company?.google_calendar_id) {
    try {
      gcalBusy = await getFreeBusySlots(
        company.google_refresh_token,
        company.google_calendar_id,
        now.toISOString(),
        rangeEnd.toISOString()
      );
    } catch (e) {
      console.warn('[Tools] GCal Free/Busy failed, using local only.');
    }
  }

  const busyIntervals = [
    ...(localEvents ?? []).map(e => ({ start: new Date(e.start_time), end: new Date(e.end_time) })),
    ...gcalBusy.map(b => ({ start: new Date(b.start), end: new Date(b.end) }))
  ];

  // 3. Calcular slots
  const slots = calculateAvailableSlots({
    timezone: persona.timezone ?? 'America/Sao_Paulo',
    workingHours: persona.working_hours ?? {
      mon: ['09:00', '18:00'], tue: ['09:00', '18:00'], wed: ['09:00', '18:00'],
      thu: ['09:00', '18:00'], fri: ['09:00', '18:00']
    },
    durationMinutes: svcRes.data.duration,
    busyIntervals,
    daysAhead,
    bufferMinutes: persona.buffer_minutes ?? 0
  });

  if (!slots.length) return { message: 'Infelizmente não encontrei horários disponíveis para este serviço nos próximos dias.' };

  const message = 'Aqui estão os horários que encontrei:\n' + slots.map((s, i) => `${i + 1}. ${s.label}`).join('\n');
  return { slots, message };
}

export async function handleBookAppointment(
  args: { service_id: string; start_time: string; notes?: string },
  ctx: ToolContext
) {
  const admin = createAdminClient();

  // 1. Buscar detalhes do serviço e lead
  const [svcRes, leadRes] = await Promise.all([
    admin.from('services').select('name, duration').eq('id', args.service_id).single(),
    admin.from('leads').select('name, email').eq('id', ctx.leadId).single()
  ]);

  if (!svcRes.data) throw new Error('Serviço não encontrado.');
  const service = svcRes.data;
  const lead = leadRes.data;
  const startTime = new Date(args.start_time);
  const endTime = new Date(startTime.getTime() + service.duration * 60000);

  // 2. Check colisão
  const { data: collision } = await admin
    .from('events')
    .select('id')
    .eq('company_id', ctx.companyId)
    .neq('status', 'cancelled')
    .lt('start_time', endTime.toISOString())
    .gt('end_time', startTime.toISOString())
    .maybeSingle();

  if (collision) throw new Error('Este horário acabou de ser ocupado. Por favor, escolha outro.');

  // 3. Sync GCal
  const { data: company } = await admin
    .from('companies')
    .select('google_refresh_token, google_calendar_id, persona_config')
    .eq('id', ctx.companyId)
    .single();

  let gcalId: string | null = null;
  if (company?.google_refresh_token) {
    try {
      gcalId = await createGoogleCalendarEvent(
        company.google_refresh_token,
        company.google_calendar_id ?? 'primary',
        {
          title: `${service.name} - ${lead?.name || 'Cliente'}`,
          start: startTime.toISOString(),
          end: endTime.toISOString(),
          description: args.notes || `Agendamento realizado via Agendra AI.\nLead ID: ${ctx.leadId}`,
          attendeeEmail: lead?.email || undefined,
          timeZone: (company.persona_config as any)?.timezone
        }
      );
    } catch (e) {
      console.error('[Tools] GCal sync failed during booking');
    }
  }

  // 4. Salvar no banco
  const { data: event, error } = await admin
    .from('events')
    .insert({
      lead_id: ctx.leadId,
      company_id: ctx.companyId,
      service_id: args.service_id,
      title: `${service.name} - ${lead?.name || 'Cliente'}`,
      start_time: startTime.toISOString(),
      end_time: endTime.toISOString(),
      gcal_event_id: gcalId,
      notes: args.notes,
      status: 'confirmed'
    })
    .select()
    .single();

  if (error) throw error;

  return {
    message: `Perfeito! Agendamento confirmado para ${service.name} em ${args.start_time}.`,
    event
  };
}

export async function handleCancelAppointment(args: { event_id: string; reason?: string }, ctx: ToolContext) {
  const admin = createAdminClient();
  
  const { data: event } = await admin
    .from('events')
    .select('gcal_event_id, company_id, companies(google_refresh_token, google_calendar_id)')
    .eq('id', args.event_id)
    .single();

  if (!event) throw new Error('Agendamento não encontrado.');

  // Cancel local
  await admin.from('events').update({ status: 'cancelled', notes: args.reason }).eq('id', args.event_id);

  // Sync GCal
  const co = event.companies as any;
  if (event.gcal_event_id && co?.google_refresh_token) {
    try {
      await deleteGCalEvent(co.google_refresh_token, co.google_calendar_id ?? 'primary', event.gcal_event_id);
    } catch (e) {
      console.warn('[Tools] Failed to delete GCal event');
    }
  }

  return { message: 'Agendamento cancelado com sucesso.' };
}

export async function handleRescheduleAppointment(args: { event_id: string; new_start_time: string }, ctx: ToolContext) {
  const admin = createAdminClient();

  const { data: event } = await admin
    .from('events')
    .select('*, services(duration), companies(google_refresh_token, google_calendar_id, persona_config)')
    .eq('id', args.event_id)
    .single();

  if (!event) throw new Error('Agendamento não encontrado.');
  
  const duration = (event.services as any)?.duration || 60;
  const newStart = new Date(args.new_start_time);
  const newEnd = new Date(newStart.getTime() + duration * 60000);

  // Check collision
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

  // Update local
  await admin.from('events').update({
    start_time: newStart.toISOString(),
    end_time: newEnd.toISOString(),
    status: 'rescheduled'
  }).eq('id', args.event_id);

  // Sync GCal
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
      console.warn('[Tools] Failed to update GCal event');
    }
  }

  return { message: 'Reagendamento concluído com sucesso.' };
}

export async function handleMyAppointments(args: any, ctx: ToolContext) {
  const admin = createAdminClient();
  const { data: events } = await admin
    .from('events')
    .select('id, title, start_time, status')
    .eq('lead_id', ctx.leadId)
    .neq('status', 'cancelled')
    .gte('start_time', new Date().toISOString())
    .order('start_time', { ascending: true });

  if (!events?.length) return { message: 'Você não possui agendamentos futuros.' };

  const list = events.map(e => `- ${e.title} em ${e.start_time} [ID: ${e.id}]`).join('\n');
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

  const { error } = await admin.from('leads').update(patch).eq('id', ctx.leadId);
  if (error) throw error;
  return { updated: true, fields: Object.keys(patch) };
}

// Alias for backwards compatibility if any old engine code calls it
export const handleBookMeeting = handleBookAppointment;
