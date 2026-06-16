import { SupabaseClient } from '@supabase/supabase-js';
import { sendChannelMessage } from '@/lib/channels/send';
import { isTimeInQuietHours } from './service';

export interface ReminderProcessResult {
  sent: number;
  failed: number;
  expired: number;
  rescheduled: number;
  skipped: number;
}

/**
 * Helper to calculate the UTC ISO timestamp representing the end of quiet hours in the target timezone.
 */
export function getEndOfQuietHoursUtc(tz: string, quietHoursEndStr: string): string {
  const [endHour, endMin] = quietHoursEndStr.split(':').map(Number);
  const now = new Date();
  
  const datePartsFmt = new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  const parts = datePartsFmt.formatToParts(now);
  const getVal = (type: string) => parts.find(p => p.type === type)?.value ?? '';
  
  const year = Number(getVal('year'));
  const month = Number(getVal('month')) - 1;
  const day = Number(getVal('day'));
  
  const targetLocalStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}T${String(endHour).padStart(2, '0')}:${String(endMin).padStart(2, '0')}:00`;
  
  const localDate = new Date(targetLocalStr + 'Z');
  const tzTime = new Date(now.toLocaleString('en-US', { timeZone: tz }));
  const diffMs = tzTime.getTime() - now.getTime();
  
  let targetUtc = new Date(localDate.getTime() - diffMs);
  
  if (targetUtc.getTime() <= now.getTime()) {
    targetUtc = new Date(targetUtc.getTime() + 24 * 60 * 60 * 1000);
  }
  return targetUtc.toISOString();
}

/**
 * Core processor for company reminders.
 * Scoped by company and respects atomic state claim, quiet hours, and expiry thresholds.
 */
export async function processCompanyReminders(
  admin: SupabaseClient,
  company: {
    id: string;
    name: string;
    persona_config: any;
    reminders_quiet_hours_enabled?: boolean;
    reminders_quiet_hours_start?: string;
    reminders_quiet_hours_end?: string;
  },
  now: string,
  expiryThreshold: string,
  limit: number = 10
): Promise<ReminderProcessResult> {
  const result: ReminderProcessResult = { sent: 0, failed: 0, expired: 0, rescheduled: 0, skipped: 0 };

  const { data: reminders, error: remErr } = await admin
    .from('reminders')
    .select('id, lead_id, event_id, company_id, remind_at, leads(phone, name), events!inner(start_time, title, status)')
    .eq('company_id', company.id)
    .eq('status', 'pending')
    .lte('remind_at', now)
    .neq('events.status', 'cancelled')
    .limit(limit);

  if (remErr) {
    console.error(`[processCompanyReminders] Query error for company ${company.id}:`, remErr.message);
    return result;
  }

  const tz = company.persona_config?.timezone ?? 'America/Sao_Paulo';
  
  // Evaluate if quiet hours are currently active
  let quietHoursActive = false;
  if (company.reminders_quiet_hours_enabled) {
    const fmt = new Intl.DateTimeFormat('pt-BR', {
      timeZone: tz,
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    });
    const localTimeStr = fmt.format(new Date());
    quietHoursActive = isTimeInQuietHours(
      localTimeStr,
      company.reminders_quiet_hours_start ?? '22:00',
      company.reminders_quiet_hours_end ?? '08:00'
    );
  }

  for (const rem of reminders ?? []) {
    const event = rem.events as any;
    const lead = rem.leads as any;

    // Expiry guard: cancel if event already started more than threshold
    if (event?.start_time && new Date(event.start_time) < new Date(expiryThreshold)) {
      await admin
        .from('reminders')
        .update({ status: 'cancelled', error_log: 'Evento expirado', updated_at: new Date().toISOString() })
        .eq('id', rem.id)
        .eq('status', 'pending');
      result.expired++;
      continue;
    }

    if (!lead?.phone || !event?.start_time) {
      result.skipped++;
      continue;
    }

    // If quiet hours are active, reschedule the reminder to the end of quiet hours
    if (quietHoursActive) {
      const nextAllowedTime = getEndOfQuietHoursUtc(tz, company.reminders_quiet_hours_end ?? '08:00');
      await admin
        .from('reminders')
        .update({
          remind_at: nextAllowedTime,
          updated_at: new Date().toISOString(),
        })
        .eq('id', rem.id)
        .eq('status', 'pending');
      result.rescheduled++;
      console.log(`[processCompanyReminders] Rescheduled reminder ${rem.id} to ${nextAllowedTime} due to Quiet Hours`);
      continue;
    }

    // Atomic claim: Transition to 'sending' first to prevent concurrent grabs
    const { data: claimed } = await admin
      .from('reminders')
      .update({ status: 'sending', updated_at: new Date().toISOString() })
      .eq('id', rem.id)
      .eq('status', 'pending')
      .select('id')
      .maybeSingle();

    if (!claimed) {
      result.skipped++;
      continue;
    }

    try {
      const dateObj = new Date(event.start_time);
      const fmt = new Intl.DateTimeFormat('pt-BR', {
        timeZone: tz,
        hour: '2-digit',
        minute: '2-digit',
        day: '2-digit',
        month: '2-digit',
      });
      const parts = fmt.formatToParts(dateObj);
      const get = (t: string) => parts.find(p => p.type === t)?.value ?? '';
      const timeStr = `${get('hour')}:${get('minute')} do dia ${get('day')}/${get('month')}`;

      const firstName = lead.name?.split(' ')[0] ?? lead.name ?? 'cliente';
      const message = `Olá ${firstName}! Passando para lembrar do seu agendamento de "${event.title}" às ${timeStr}. Nos vemos em breve! 🗓`;

      await sendChannelMessage(lead.phone, message, rem.company_id);

      // Log to message history
      await admin.from('messages').insert({
        lead_id: rem.lead_id,
        company_id: rem.company_id,
        role: 'assistant',
        content: message,
        metadata: { type: 'reminder', event_id: rem.event_id },
      });

      // Log to automation events feed
      await admin.from('automation_events').insert({
        company_id: rem.company_id,
        lead_id: rem.lead_id,
        type: 'reminder_sent',
        detail: `Lembrete enviado para ${firstName} — ${event.title}`,
        payload: { event_id: rem.event_id, remind_at: rem.remind_at },
      });

      // Finalize transaction
      await admin
        .from('reminders')
        .update({ status: 'sent', updated_at: new Date().toISOString() })
        .eq('id', rem.id)
        .eq('status', 'sending');

      result.sent++;
    } catch (err: any) {
      // Revert status to failed so manual recovery is possible
      await admin
        .from('reminders')
        .update({ status: 'failed', error_log: err.message, updated_at: new Date().toISOString() })
        .eq('id', rem.id)
        .eq('status', 'sending');
      result.failed++;
      console.error(`[processCompanyReminders] Failed to send reminder ${rem.id}:`, err.message);
    }
  }

  return result;
}
