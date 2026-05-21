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
import { calculateAvailableSlots } from '@/lib/calendar/availability';
import { type Tool, SchemaType } from '@google/generative-ai';
import { handleUpdateLeadMemory } from './memory';
import { buildBookingConfirmation, formatDateTime } from '@/lib/whatsapp/messages';

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
        'Cria um novo agendamento. Use após o lead escolher um horário de checkAvailability. IMPORTANTE: start_time DEVE ser o valor "start" ISO retornado por checkAvailability, NUNCA reconstrua o horário manualmente.',
      parameters: {
        type: SchemaType.OBJECT,
        properties: {
          service_id: { type: SchemaType.STRING, description: 'ID do serviço' },
          start_time: { type: SchemaType.STRING, description: 'ISO 8601 — OBRIGATORIAMENTE use o campo "start" do slot retornado por checkAvailability (ex: 2026-05-15T14:00:00Z). Nunca tente reconstruir manualmente.' },
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
      description: 'Pausa o atendimento da IA e solicita a intervenção de um atendente humano. Use quando o lead demonstrar irritação, pedir explicitamente por um humano ou se o problema for complexo demais para a IA.',
      parameters: {
        type: SchemaType.OBJECT,
        properties: {
          reason: { type: SchemaType.STRING, description: 'Breve motivo da transferência' },
        },
      },
    },
  ],
};

// ─── Tool Handlers ────────────────────────────────────────────────────────────

export async function handleListServices(_args: any, ctx: ToolContext) {
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
    admin.from('services').select('duration').eq('id', args.service_id).eq('company_id', ctx.companyId).single(),
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

  console.log(`[Tools] checkAvailability: found ${slots.length} slots for svc ${args.service_id} (duration ${svcRes.data.duration}m)`);
  if (busyIntervals.length > 0) {
    console.log(`[Tools] busyIntervals count: ${busyIntervals.length}`);
  }

  if (!slots.length) return { message: 'Infelizmente não encontrei horários disponíveis para este serviço nos próximos dias.' };

  const message = 'Aqui estão os horários que encontrei:\n' + slots.map((s, i) => `${i + 1}. ${s.label}`).join('\n') + '\n\n[IMPORTANTE PARA A IA: Use o campo "start" ISO do slot selecionado no bookAppointment, não tente reconstruir a hora manualmente!]';
  return { slots, message };
}

export async function handleBookAppointment(
  args: { service_id: string; start_time: string; notes?: string },
  ctx: ToolContext
) {
  const admin = createAdminClient();

  // 1. Buscar detalhes do serviço e lead
  const [svcRes, leadRes] = await Promise.all([
    admin.from('services').select('name, duration').eq('id', args.service_id).eq('company_id', ctx.companyId).single(),
    admin.from('leads').select('name, email').eq('id', ctx.leadId).eq('company_id', ctx.companyId).single()
  ]);

  if (!svcRes.data) throw new Error('Serviço não encontrado.');
  const service = svcRes.data;
  const lead = leadRes.data;
  const startTime = new Date(args.start_time);
  if (isNaN(startTime.getTime())) throw new Error('Horário inválido. Informe um ISO 8601 válido.');
  if (startTime.getTime() < Date.now()) throw new Error('Não é possível agendar no passado.');
  const endTime = new Date(startTime.getTime() + service.duration * 60000);

  // 2a. Check colisão geral (empresa)
  const { data: collision } = await admin
    .from('events')
    .select('id')
    .eq('company_id', ctx.companyId)
    .neq('status', 'cancelled')
    .lt('start_time', endTime.toISOString())
    .gt('end_time', startTime.toISOString())
    .maybeSingle();

  if (collision) throw new Error('Este horário acabou de ser ocupado. Por favor, escolha outro.');

  // 2b. Anti-abuso: limite de 3 agendamentos futuros por lead
  const { count: futureCount } = await admin
    .from('events')
    .select('id', { count: 'exact', head: true })
    .eq('lead_id', ctx.leadId)
    .eq('company_id', ctx.companyId)
    .neq('status', 'cancelled')
    .gte('start_time', new Date().toISOString());

  if ((futureCount ?? 0) >= 3) {
    throw new Error('Você já possui 3 agendamentos futuros. Cancele ou conclua algum antes de marcar mais.');
  }

  // 2c. Anti-duplicidade: mesmo serviço já agendado no mesmo dia
  const dayStart = new Date(startTime); dayStart.setHours(0, 0, 0, 0);
  const dayEnd = new Date(startTime); dayEnd.setHours(23, 59, 59, 999);
  const { data: sameDay } = await admin
    .from('events')
    .select('id')
    .eq('lead_id', ctx.leadId)
    .eq('company_id', ctx.companyId)
    .eq('service_id', args.service_id)
    .neq('status', 'cancelled')
    .gte('start_time', dayStart.toISOString())
    .lte('start_time', dayEnd.toISOString())
    .maybeSingle();

  if (sameDay) {
    throw new Error('Você já tem este mesmo serviço agendado neste dia. Quer reagendar o existente?');
  }

  // 3. Sync GCal & Double-Check External
  const { data: company } = await admin
    .from('companies')
    .select('google_refresh_token, google_calendar_id, persona_config, name')
    .eq('id', ctx.companyId)
    .single();

  let gcalId: string | null = null;
  if (company?.google_refresh_token) {
    try {
      // DOUBLE-CHECK: Verificar se o GCal ainda está livre neste exato momento
      const gcalBusy = await getFreeBusySlots(
        company.google_refresh_token,
        company.google_calendar_id ?? 'primary',
        startTime.toISOString(),
        endTime.toISOString()
      );

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
      }
    }

  // 4. Salvar no banco com compensação atômica em caso de falha
  let event: any;
  try {
    const { data, error } = await admin
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
    event = data;

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

  return { message: confirmationMsg, event };
}

export async function handleCancelAppointment(args: { event_id: string; reason?: string }, _ctx: ToolContext) {
  const admin = createAdminClient();
  
  const { data: event } = await admin
    .from('events')
    .select('gcal_event_id, company_id, companies(google_refresh_token, google_calendar_id)')
    .eq('id', args.event_id)
    .eq('company_id', _ctx.companyId)
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
    .eq('company_id', ctx.companyId)
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
  }).eq('id', args.event_id).eq('company_id', ctx.companyId);
  
  // Atualizar lembrete (2h antes do novo horário)
  const newRemindAt = new Date(newStart.getTime() - 2 * 60 * 60 * 1000);
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

export async function handleMyAppointments(_args: any, ctx: ToolContext) {
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

  const pixKey = "00020101021226830014br.gov.bcb.pix2561api.agendra.com.br/v2/cobv/" + ctx.companyId.replace(/-/g, '').substring(0, 15) + "5802BR5920Agendra Tecnologia6009Sao Paulo62070503***6304" + Math.random().toString(36).substring(2, 6).toUpperCase();

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

// Alias for backwards compatibility if any old engine code calls it
export const handleBookMeeting = handleBookAppointment;
