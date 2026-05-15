import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { sendWhatsAppMessage } from '@/lib/whatsapp/client';

/**
 * Cron Job: Disparar Lembretes de Agendamento
 * 
 * Execução recomendada: a cada 5 ou 10 minutos.
 */
export async function GET(req: NextRequest) {
  // Accept both Vercel-injected Authorization header and legacy ?secret= query param
  const authHeader = req.headers.get('authorization');
  const querySecret = new URL(req.url).searchParams.get('secret');
  const cronSecret = process.env.CRON_SECRET;

  const isAuthorized =
    (authHeader && cronSecret && authHeader === `Bearer ${cronSecret}`) ||
    (querySecret && cronSecret && querySecret === cronSecret);

  if (!isAuthorized) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const admin = createAdminClient();
  const now = new Date().toISOString();

  // 1. Buscar lembretes pendentes
  const { data: reminders, error } = await admin
    .from('reminders')
    .select(`
      *,
      leads (phone, name),
      events (start_time, title),
      companies (persona_config)
    `)
    .eq('status', 'pending')
    .lte('remind_at', now)
    .limit(20);

  if (error) {
    console.error('[Cron Reminders] Erro ao buscar lembretes:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  console.log(`[Cron Reminders] Processando ${reminders?.length ?? 0} lembretes.`);

  const results = await Promise.allSettled(
    (reminders ?? []).map(async (rem) => {
      try {
        const lead = rem.leads as any;
        const event = rem.events as any;

        if (!lead?.phone || !event?.start_time) {
          throw new Error('Dados incompletos para o lembrete.');
        }

        const company = rem.companies as any;
        const timezone = (company?.persona_config as any)?.timezone ?? 'America/Sao_Paulo';

        const dateObj = new Date(event.start_time);
        // Use Intl explicitly so Node/Vercel server doesn't default to UTC
        const fmt = new Intl.DateTimeFormat('pt-BR', {
          timeZone: timezone,
          hour: '2-digit',
          minute: '2-digit',
          day: '2-digit',
          month: '2-digit',
        });
        const parts = fmt.formatToParts(dateObj);
        const get = (t: string) => parts.find(p => p.type === t)?.value ?? '';
        const timeStr = `${get('hour')}:${get('minute')} do dia ${get('day')}/${get('month')}`;

        const message = `Olá ${lead.name.split(' ')[0]}! Passando para lembrar do seu agendamento de "${event.title}" às ${timeStr}. Nos vemos em breve! 🗓`;

        await sendWhatsAppMessage(lead.phone, message, rem.company_id);

        await admin.from('reminders').update({ status: 'sent' }).eq('id', rem.id);
        
        return { id: rem.id, success: true };
      } catch (err: any) {
        console.error(`[Cron Reminders] Erro no lembrete ${rem.id}:`, err.message);
        await admin.from('reminders').update({ status: 'failed', error_log: err.message }).eq('id', rem.id);
        return { id: rem.id, success: false, error: err.message };
      }
    })
  );

  return NextResponse.json({ processed: reminders?.length ?? 0, details: results });
}
