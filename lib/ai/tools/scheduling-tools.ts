import { after } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import {
  createGoogleCalendarEvent,
  getFreeBusySlots,
  deleteGCalEvent,
  updateGCalEvent,
  invalidateGCalFreeBusyCache,
} from '@/lib/calendar/google';
import { getCompanyGCalRefreshToken } from '@/lib/calendar/gcal-token';
import { calculateAvailableSlots, isWithinWorkingHours } from '@/lib/calendar/availability';
import { buildBookingConfirmation, formatDateTime } from '@/lib/whatsapp/messages';
import { dispatchWebhook, type WebhookEventType } from '@/lib/webhooks/dispatcher';
import { logDebug, logError } from '@/lib/logging';
import { BusinessRuleError } from '../error-sanitizer';
import { withTimeout } from '../timeout';
import type { ToolContext } from './types';

function scheduleWebhookDispatch(
  companyId: string,
  event: WebhookEventType,
  data: Record<string, unknown>,
): void {
  try {
    after(() => dispatchWebhook(companyId, event, data));
  } catch {
    // Fallback when executed outside a Next.js request scope (e.g. unit tests / crons)
    void dispatchWebhook(companyId, event, data);
  }
}

async function resolveCompanyGCalToken(
  companyId: string,
  company: {
    google_refresh_token?: string | null;
    google_refresh_token_secret_id?: string | null;
  } | null,
): Promise<string | null> {
  if (company?.google_refresh_token) return company.google_refresh_token;
  if (company?.google_refresh_token_secret_id) {
    return getCompanyGCalRefreshToken(companyId);
  }
  return null;
}

type WorkingHoursMap = Record<string, [string, string]>;

interface CompanyPersonaSettings {
  timezone?: string;
  working_hours?: WorkingHoursMap;
  buffer_minutes?: number;
  reminder_advance_hours?: number;
}

interface BusySlot {
  start: string;
  end: string;
}

const DEFAULT_WORKING_HOURS: WorkingHoursMap = {
  mon: ['09:00', '18:00'],
  tue: ['09:00', '18:00'],
  wed: ['09:00', '18:00'],
  thu: ['09:00', '18:00'],
  fri: ['09:00', '18:00'],
};

export async function handleListServices(_args: Record<string, never>, ctx: ToolContext) {
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

  const list = services
    .map(
      (s) =>
        `- ${s.name} (${s.duration}min)${s.price ? ` - R$ ${s.price}` : ''} [ID: ${s.id}]`,
    )
    .join('\n');

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

  const [svcRes, coRes] = await Promise.all([
    admin
      .from('services')
      .select('duration')
      .eq('id', args.service_id)
      .eq('company_id', ctx.companyId)
      .single(),
    admin
      .from('companies')
      .select('persona_config, google_refresh_token, google_refresh_token_secret_id, google_calendar_id')
      .eq('id', ctx.companyId)
      .single(),
  ]);

  if (!svcRes.data) {
    throw new BusinessRuleError('Serviço não encontrado.');
  }

  const company = coRes.data;
  const persona = (company?.persona_config ?? {}) as CompanyPersonaSettings;

  const now = new Date(Math.floor(Date.now() / 60_000) * 60_000);
  const rangeEnd = new Date(now.getTime() + daysAhead * 24 * 60 * 60 * 1000);

  const { data: localEvents } = await admin
    .from('events')
    .select('start_time, end_time')
    .eq('company_id', ctx.companyId)
    .neq('status', 'cancelled')
    .lt('start_time', rangeEnd.toISOString())
    .gt('end_time', now.toISOString());

  let gcalBusy: BusySlot[] = [];
  const slotsRefreshToken = await resolveCompanyGCalToken(ctx.companyId, company);
  if (slotsRefreshToken && company?.google_calendar_id) {
    try {
      gcalBusy = await withTimeout(
        getFreeBusySlots(
          slotsRefreshToken,
          company.google_calendar_id,
          now.toISOString(),
          rangeEnd.toISOString(),
          { companyId: ctx.companyId },
        ),
        5000,
        'GCal Free/Busy timeout (5s)',
      );
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      logError('[Tools] GCal Free/Busy failed or timed out, using local only:', msg);
    }
  }

  const busyIntervals = [
    ...(localEvents ?? []).map((e) => ({
      start: new Date(e.start_time as string),
      end: new Date(e.end_time as string),
    })),
    ...gcalBusy.map((b) => ({ start: new Date(b.start), end: new Date(b.end) })),
  ];

  const tz = args.timezone || persona.timezone || 'America/Sao_Paulo';
  const workingHours = persona.working_hours ?? DEFAULT_WORKING_HOURS;

  const slots = calculateAvailableSlots({
    timezone: tz,
    workingHours,
    durationMinutes: svcRes.data.duration as number,
    busyIntervals,
    daysAhead,
    bufferMinutes: persona.buffer_minutes ?? 0,
  });

  logDebug(
    `[Tools] get_available_slots: found ${slots.length} slots for svc ${args.service_id}`,
  );

  const consulted_at = new Intl.DateTimeFormat('pt-BR', {
    timeZone: tz,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    timeZoneName: 'short',
  }).format(now);
  const today_date = new Intl.DateTimeFormat('pt-BR', {
    timeZone: tz,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);

  const dayBreakdown: {
    date: string;
    weekday: string;
    status: 'disponivel' | 'fechado' | 'lotado';
    working_hours?: string[];
  }[] = [];

  const ptDaysLong: Record<string, string> = {
    mon: 'segunda-feira',
    tue: 'terça-feira',
    wed: 'quarta-feira',
    thu: 'quinta-feira',
    fri: 'sexta-feira',
    sat: 'sábado',
    sun: 'domingo',
  };

  for (let i = 0; i < daysAhead; i++) {
    const checkDate = new Date(now.getTime() + i * 24 * 60 * 60 * 1000);
    const dayName = new Intl.DateTimeFormat('en-US', {
      timeZone: tz,
      weekday: 'short',
    })
      .format(checkDate)
      .toLowerCase();
    const dateStr = new Intl.DateTimeFormat('pt-BR', {
      timeZone: tz,
      day: '2-digit',
      month: '2-digit',
    }).format(checkDate);
    const weekdayPt = ptDaysLong[dayName] || dayName;

    const hours = workingHours[dayName];
    if (!hours) {
      dayBreakdown.push({ date: dateStr, weekday: weekdayPt, status: 'fechado' });
    } else {
      const hasSlot = slots.some((slot) => {
        const slotDate = new Date(slot.start);
        const slotDayStr = new Intl.DateTimeFormat('pt-BR', {
          timeZone: tz,
          day: '2-digit',
          month: '2-digit',
        }).format(slotDate);
        return slotDayStr === dateStr;
      });

      dayBreakdown.push({
        date: dateStr,
        weekday: weekdayPt,
        status: hasSlot ? 'disponivel' : 'lotado',
        working_hours: hours,
      });
    }
  }

  const dayBreakdownFiltered = dayBreakdown.filter((d) => d.status !== 'disponivel');
  const breakdownSummary = dayBreakdownFiltered
    .map((d) =>
      d.status === 'fechado'
        ? `- ${d.weekday} (${d.date}): FECHADO (Sem expediente comercial).`
        : `- ${d.weekday} (${d.date}): LOTADO (Todos os horários preenchidos).`,
    )
    .join('\n');

  if (!slots.length) {
    return {
      consulted_at,
      today_date,
      slots: [],
      day_breakdown: dayBreakdownFiltered,
      message: `Consulta realizada em ${consulted_at}. Hoje é ${today_date}.\n\nInfelizmente não encontrei horários disponíveis para este serviço nos próximos dias.\n\nStatus detalhado da agenda por dia:\n${breakdownSummary}`,
    };
  }

  const availabilitySummary = buildAvailabilitySummary(slots, tz);
  const slotsForModel = capSlotsPerDay(slots, tz, 5);

  return {
    consulted_at,
    today_date,
    day_breakdown: dayBreakdownFiltered,
    availability_summary: availabilitySummary,
    slots: slotsForModel,
    message: `Consulta realizada em ${consulted_at}. Hoje é ${today_date}.\n\nDisponibilidade agrupada por período (apresente ao lead em faixas, NUNCA liste slot a slot): ${availabilitySummary}${breakdownSummary ? `\n\nStatus detalhado da agenda por dia:\n${breakdownSummary}` : ''}`,
  };
}

function capSlotsPerDay<T extends { start: string }>(
  slots: T[],
  tz: string,
  perDay: number,
): T[] {
  const dayKeyFmt = new Intl.DateTimeFormat('pt-BR', {
    timeZone: tz,
    day: '2-digit',
    month: '2-digit',
  });
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
    new Intl.DateTimeFormat('pt-BR', {
      timeZone: tz,
      hour: '2-digit',
      hour12: false,
    }).format(d),
  );
  return hour < 12 ? 'manhã' : hour < 18 ? 'tarde' : 'noite';
}

function buildAvailabilitySummary(slots: { start: string }[], tz: string): string {
  const dayFmt = new Intl.DateTimeFormat('pt-BR', {
    timeZone: tz,
    weekday: 'long',
    day: '2-digit',
    month: '2-digit',
  });
  const timeFmt = new Intl.DateTimeFormat('pt-BR', {
    timeZone: tz,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });

  const byDay = new Map<string, Map<DayPeriod, { first: string; last: string }>>();
  for (const s of slots) {
    const d = new Date(s.start);
    const dayKey = dayFmt.format(d);
    const p = periodOf(d, tz);
    const hhmm = timeFmt.format(d);
    let periods = byDay.get(dayKey);
    if (!periods) {
      periods = new Map();
      byDay.set(dayKey, periods);
    }
    const bucket = periods.get(p);
    if (!bucket) periods.set(p, { first: hhmm, last: hhmm });
    else bucket.last = hhmm;
  }

  return [...byDay.entries()]
    .map(
      ([day, periods]) =>
        `${day}: ` +
        [...periods.entries()]
          .map(([p, { first, last }]) =>
            first === last ? `${p} (${first})` : `${p} (${first}–${last})`,
          )
          .join(', '),
    )
    .join(' | ');
}

export async function handleBookAppointment(
  args: { service_id: string; start_time: string; notes?: string },
  ctx: ToolContext,
) {
  const admin = createAdminClient();

  const [svcRes, leadRes, coRes] = await Promise.all([
    admin
      .from('services')
      .select('name, duration')
      .eq('id', args.service_id)
      .eq('company_id', ctx.companyId)
      .single(),
    admin
      .from('leads')
      .select('name, email')
      .eq('id', ctx.leadId)
      .eq('company_id', ctx.companyId)
      .single(),
    admin
      .from('companies')
      .select('google_refresh_token, google_refresh_token_secret_id, google_calendar_id, persona_config, name')
      .eq('id', ctx.companyId)
      .single(),
  ]);

  if (!svcRes.data) {
    throw new BusinessRuleError('Serviço não encontrado.');
  }
  const service = svcRes.data as { name: string; duration: number };
  const lead = leadRes.data as { name?: string | null; email?: string | null } | null;
  const bookPersona = (coRes.data?.persona_config ?? {}) as CompanyPersonaSettings;
  const bufferMinutes = bookPersona.buffer_minutes ?? 0;

  const startTime = new Date(args.start_time);
  if (Number.isNaN(startTime.getTime())) {
    throw new BusinessRuleError('Horário inválido. Informe um ISO 8601 válido.');
  }
  if (startTime.getTime() < Date.now()) {
    throw new BusinessRuleError('Não é possível agendar no passado.');
  }

  const bookTz = bookPersona.timezone ?? 'America/Sao_Paulo';
  const bookWorkingHours = bookPersona.working_hours ?? DEFAULT_WORKING_HOURS;
  if (!isWithinWorkingHours(startTime, service.duration, bookWorkingHours, bookTz)) {
    throw new BusinessRuleError(
      'Este horário está fora do expediente da empresa. Use get_available_slots e ofereça apenas os horários retornados.',
    );
  }

  const endTime = new Date(startTime.getTime() + service.duration * 60_000);
  const company = coRes.data;

  let gcalId: string | null = null;
  let gcalFailed = false;
  const bookRefreshToken = await resolveCompanyGCalToken(ctx.companyId, company);
  if (bookRefreshToken) {
    try {
      const gcalBusy = await withTimeout(
        getFreeBusySlots(
          bookRefreshToken,
          company?.google_calendar_id ?? 'primary',
          startTime.toISOString(),
          endTime.toISOString(),
          { noCache: true, companyId: ctx.companyId },
        ),
        5000,
        'GCal double-check timeout (5s)',
      );

      if (gcalBusy.length > 0) {
        throw new BusinessRuleError(
          'Este horário foi ocupado recentemente no calendário externo. Por favor, tente outro.',
        );
      }

      const advanceHours = bookPersona.reminder_advance_hours ?? 2;
      const reminderMinutes = advanceHours * 60;

      gcalId = await createGoogleCalendarEvent(
        bookRefreshToken,
        company?.google_calendar_id ?? 'primary',
        {
          title: `${service.name} - ${lead?.name || 'Cliente'}`,
          start: startTime.toISOString(),
          end: endTime.toISOString(),
          description: args.notes || `Agendamento realizado via Agendra AI.\nLead ID: ${ctx.leadId}`,
          attendeeEmail: lead?.email || undefined,
          timeZone: bookPersona.timezone,
          reminderMinutes,
        },
      );
    } catch (e: unknown) {
      if (e instanceof BusinessRuleError) throw e;
      const msg = e instanceof Error ? e.message : String(e);
      logError('[Tools] GCal double-check or creation failed:', msg);
      gcalFailed = true;
    }
  }

  let event: { id: string } & Record<string, unknown>;
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
      p_buffer_minutes: bufferMinutes,
    });

    if (rpcErr) throw rpcErr;
    const typedRes = rpcRes as { success?: boolean; error?: string; event?: { id: string } & Record<string, unknown> } | null;
    if (!typedRes?.success || !typedRes.event) {
      throw new BusinessRuleError(typedRes?.error ?? 'Não foi possível concluir o agendamento.');
    }

    event = typedRes.event;

    if (gcalFailed) {
      await admin
        .from('events')
        .update({ gcal_sync_status: 'error' })
        .eq('id', event.id)
        .eq('company_id', ctx.companyId);
    }

    try {
      const advanceHours = bookPersona.reminder_advance_hours ?? 2;
      const remindAt = new Date(startTime.getTime() - advanceHours * 60 * 60 * 1000);
      if (remindAt > new Date()) {
        await admin.from('reminders').insert({
          event_id: event.id,
          company_id: ctx.companyId,
          lead_id: ctx.leadId,
          remind_at: remindAt.toISOString(),
          status: 'pending',
        });
      }
    } catch (remErr) {
      logError('[Tools] Falha ao agendar lembrete:', remErr);
    }

    await admin
      .from('leads')
      .update({ followup_count: 0 })
      .eq('id', ctx.leadId)
      .eq('company_id', ctx.companyId);
  } catch (dbErr: unknown) {
    const msg = dbErr instanceof Error ? dbErr.message : String(dbErr);
    logError('[Tools] DB transaction failed in bookAppointment, compensating GCal creation:', msg);
    if (gcalId && bookRefreshToken) {
      try {
        await deleteGCalEvent(
          bookRefreshToken,
          company?.google_calendar_id ?? 'primary',
          gcalId,
        );
      } catch (compensateErr: unknown) {
        const compMsg = compensateErr instanceof Error ? compensateErr.message : String(compensateErr);
        logError('[Tools] Compensation failed (could not delete GCal event):', compMsg);
      }
    }
    throw dbErr;
  }

  const { dateStr, timeStr } = formatDateTime(startTime, bookTz);
  const confirmationMsg = buildBookingConfirmation({
    leadFirstName: lead?.name?.split(' ')[0] ?? 'cliente',
    serviceName: service.name,
    dateStr,
    timeStr,
    businessName: (company?.name as string | undefined) ?? 'nossa empresa',
    notes: args.notes,
  });

  await invalidateGCalFreeBusyCache(ctx.companyId);

  scheduleWebhookDispatch(ctx.companyId, 'booking.created', {
    event_id: event.id,
    lead_id: ctx.leadId,
    service_name: service.name,
    start_time: startTime.toISOString(),
    end_time: endTime.toISOString(),
    gcal_event_id: gcalId,
  });

  return { message: confirmationMsg, event };
}

export async function handleCancelAppointment(
  args: { event_id: string; reason?: string },
  ctx: ToolContext,
) {
  const admin = createAdminClient();

  const { data: event } = await admin
    .from('events')
    .select(
      'gcal_event_id, company_id, companies(google_refresh_token, google_refresh_token_secret_id, google_calendar_id)',
    )
    .eq('id', args.event_id)
    .eq('company_id', ctx.companyId)
    .eq('lead_id', ctx.leadId)
    .single();

  if (!event) {
    throw new BusinessRuleError('Agendamento não encontrado.');
  }

  await admin
    .from('events')
    .update({ status: 'cancelled', notes: args.reason })
    .eq('id', args.event_id)
    .eq('company_id', ctx.companyId);

  await admin
    .from('reminders')
    .update({ status: 'cancelled' })
    .eq('event_id', args.event_id)
    .eq('company_id', ctx.companyId)
    .eq('status', 'pending');

  await admin
    .from('leads')
    .update({ followup_count: 0 })
    .eq('id', ctx.leadId)
    .eq('company_id', ctx.companyId);

  const co = event.companies as {
    google_refresh_token?: string | null;
    google_refresh_token_secret_id?: string | null;
    google_calendar_id?: string | null;
  } | null;

  const cancelRefreshToken = await resolveCompanyGCalToken(ctx.companyId, co);
  if (event.gcal_event_id && cancelRefreshToken) {
    try {
      await deleteGCalEvent(
        cancelRefreshToken,
        co?.google_calendar_id ?? 'primary',
        event.gcal_event_id as string,
      );
    } catch {
      logError('[Tools] Failed to delete GCal event on cancel — marking gcal_sync_status=error');
      await admin
        .from('events')
        .update({ gcal_sync_status: 'error' })
        .eq('id', args.event_id)
        .eq('company_id', ctx.companyId);
    }
  }

  await invalidateGCalFreeBusyCache(ctx.companyId);

  scheduleWebhookDispatch(ctx.companyId, 'booking.cancelled', {
    event_id: args.event_id,
    lead_id: ctx.leadId,
    reason: args.reason ?? null,
  });

  return { message: 'Agendamento cancelado com sucesso.' };
}

export async function handleRescheduleAppointment(
  args: { event_id: string; new_start_time: string },
  ctx: ToolContext,
) {
  const admin = createAdminClient();

  const { data: event } = await admin
    .from('events')
    .select(
      '*, services(duration), companies(google_refresh_token, google_refresh_token_secret_id, google_calendar_id, persona_config)',
    )
    .eq('id', args.event_id)
    .eq('company_id', ctx.companyId)
    .eq('lead_id', ctx.leadId)
    .single();

  if (!event) {
    throw new BusinessRuleError('Agendamento não encontrado.');
  }

  const svcDuration = (event.services as { duration?: number } | null)?.duration;
  const duration: number =
    (event.duration_minutes as number | null) ??
    svcDuration ??
    Math.round(
      (new Date(event.end_time as string).getTime() -
        new Date(event.start_time as string).getTime()) /
        60_000,
    );

  const newStart = new Date(args.new_start_time);
  if (Number.isNaN(newStart.getTime())) {
    throw new BusinessRuleError('Horário inválido. Informe um ISO 8601 válido.');
  }
  if (newStart.getTime() < Date.now()) {
    throw new BusinessRuleError('Não é possível reagendar para o passado.');
  }
  const newEnd = new Date(newStart.getTime() + duration * 60_000);

  const co = event.companies as {
    google_refresh_token?: string | null;
    google_refresh_token_secret_id?: string | null;
    google_calendar_id?: string | null;
    persona_config?: CompanyPersonaSettings | null;
  } | null;

  const reschedPersona = co?.persona_config ?? {};
  const reschedTz = reschedPersona.timezone ?? 'America/Sao_Paulo';
  const reschedWorkingHours = reschedPersona.working_hours ?? DEFAULT_WORKING_HOURS;

  if (!isWithinWorkingHours(newStart, duration, reschedWorkingHours, reschedTz)) {
    throw new BusinessRuleError(
      'Este novo horário está fora do expediente da empresa. Use get_available_slots e ofereça apenas os horários retornados.',
    );
  }

  const reschedBuffer = reschedPersona.buffer_minutes ?? 0;
  const { data: reschedRes, error: reschedErr } = await admin.rpc(
    'reschedule_appointment_atomic',
    {
      p_event_id: args.event_id,
      p_company_id: ctx.companyId,
      p_lead_id: ctx.leadId,
      p_new_start_time: newStart.toISOString(),
      p_new_end_time: newEnd.toISOString(),
      p_buffer_minutes: reschedBuffer,
    },
  );

  if (reschedErr) {
    const code = (reschedErr as { code?: string }).code;
    if (code === 'PGRST202' || /reschedule_appointment_atomic/.test(reschedErr.message ?? '')) {
      const { data: collision } = await admin
        .from('events')
        .select('id')
        .eq('company_id', ctx.companyId)
        .neq('id', args.event_id)
        .neq('status', 'cancelled')
        .lt('start_time', newEnd.toISOString())
        .gt('end_time', newStart.toISOString())
        .maybeSingle();

      if (collision) {
        throw new BusinessRuleError('Infelizmente este novo horário já está ocupado.');
      }

      await admin
        .from('events')
        .update({
          start_time: newStart.toISOString(),
          end_time: newEnd.toISOString(),
          status: 'rescheduled',
        })
        .eq('id', args.event_id)
        .eq('company_id', ctx.companyId);
    } else {
      throw reschedErr;
    }
  } else {
    const typedRes = reschedRes as { success?: boolean; error?: string } | null;
    if (!typedRes?.success) {
      throw new BusinessRuleError(typedRes?.error ?? 'Não foi possível reagendar.');
    }
  }

  const reminderAdvanceHours = reschedPersona.reminder_advance_hours ?? 2;
  const newRemindAt = new Date(newStart.getTime() - reminderAdvanceHours * 60 * 60 * 1000);
  if (newRemindAt > new Date()) {
    await admin
      .from('reminders')
      .update({ remind_at: newRemindAt.toISOString() })
      .eq('event_id', args.event_id)
      .eq('company_id', ctx.companyId)
      .eq('status', 'pending');
  } else {
    await admin
      .from('reminders')
      .update({ status: 'cancelled' })
      .eq('event_id', args.event_id)
      .eq('company_id', ctx.companyId)
      .eq('status', 'pending');
  }

  const reschedRefreshToken = await resolveCompanyGCalToken(ctx.companyId, co);
  if (event.gcal_event_id && reschedRefreshToken) {
    try {
      await updateGCalEvent(
        reschedRefreshToken,
        co?.google_calendar_id ?? 'primary',
        event.gcal_event_id as string,
        {
          title: event.title as string,
          start: newStart.toISOString(),
          end: newEnd.toISOString(),
          timeZone: reschedPersona.timezone,
        },
      );
    } catch {
      logError('[Tools] Failed to update GCal event on reschedule — marking gcal_sync_status=error');
      await admin
        .from('events')
        .update({ gcal_sync_status: 'error' })
        .eq('id', args.event_id)
        .eq('company_id', ctx.companyId);
    }
  }

  await invalidateGCalFreeBusyCache(ctx.companyId);

  scheduleWebhookDispatch(ctx.companyId, 'booking.rescheduled', {
    event_id: args.event_id,
    lead_id: ctx.leadId,
    new_start_time: newStart.toISOString(),
    new_end_time: newEnd.toISOString(),
  });

  return { message: 'Reagendamento concluído com sucesso.' };
}

export async function handleMyAppointments(_args: Record<string, never>, ctx: ToolContext) {
  const admin = createAdminClient();
  const { data: events } = await admin
    .from('events')
    .select('id, title, start_time, status')
    .eq('lead_id', ctx.leadId)
    .eq('company_id', ctx.companyId)
    .neq('status', 'cancelled')
    .gte('start_time', new Date().toISOString())
    .order('start_time', { ascending: true });

  if (!events?.length) return { message: 'Você não possui agendamentos futuros.' };

  const { data: coData } = await admin
    .from('companies')
    .select('persona_config')
    .eq('id', ctx.companyId)
    .single();
  const tz =
    ((coData?.persona_config as CompanyPersonaSettings | null)?.timezone) ??
    'America/Sao_Paulo';

  const list = events
    .map((e) => {
      const localStart = new Intl.DateTimeFormat('pt-BR', {
        timeZone: tz,
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      }).format(new Date(e.start_time as string));
      return `- ${e.title} em ${localStart}`;
    })
    .join('\n');

  return { message: `Seus agendamentos:\n${list}`, appointments: events };
}
