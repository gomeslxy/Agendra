/**
 * /api/cron/nightly — Vercel Free Tier unified cron (runs once daily at 20:00 BRT)
 *
 * Executes in sequence:
 *   1. Cold Lead Reactivation — re-engages cold/warm leads (Business plan logic)
 *   2. Reminders (evening sweep) — catches any reminders missed by morning run
 *   3. Flush Buffer — flushes pending SQL message buffers (safety fallback)
 *
 * Multi-tenant: all queries scoped by company_id — no cross-tenant data access.
 */
import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { sendWhatsAppMessage } from '@/lib/whatsapp/client';
import { handleIncomingMessage } from '@/lib/ai/engine';
import { routeGenerate } from '@/lib/ai/providers/router';
import { getPlanLimits } from '@/lib/billing/plans';
import { getCompanyUsage } from '@/lib/billing/limits';

function isAuthorized(req: NextRequest): boolean {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) return false;
  const header = req.headers.get('authorization') ?? '';
  return header === `Bearer ${cronSecret}`;
}

export async function GET(req: NextRequest): Promise<NextResponse> {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const admin = createAdminClient();
  const summary: Record<string, any> = {};

  // Fetch all active companies once — both tasks iterate over this list
  const { data: companies, error: companiesError } = await admin
    .from('companies')
    .select('id, plan_type, subscription_status, persona_config, name, ai_name, ai_tone')
    .in('subscription_status', ['active', 'trial', 'trialing'])
    .not('subscription_status', 'eq', 'canceled');

  if (companiesError) {
    console.error('[nightly-cron] Failed to fetch companies:', companiesError.message);
    return NextResponse.json({ error: companiesError.message }, { status: 500 });
  }

  const activeCompanies = companies ?? [];
  console.log(`[nightly-cron] Processing ${activeCompanies.length} active companies`);

  // ── 1. Cold Lead Reactivation ────────────────────────────────────────────────
  try {
    const reactivationResults: Array<{ company: string; leads_processed: number; errors: number }> = [];

    // Filter only companies that qualify for Business (where followup / reactivation is active)
    for (const company of activeCompanies) {
      if (company.plan_type !== 'business') continue;

      const pc = (company.persona_config ?? {}) as Record<string, any>;
      const inactivityDays: number = pc.reactivation_days ?? 30;
      const cutoffDate = new Date(Date.now() - inactivityDays * 24 * 60 * 60 * 1000).toISOString();
      let leadsProcessed = 0;
      let errors = 0;

      try {
        type ReactivateLead = {
          id: string;
          name: string;
          phone: string | null;
          summary: string | null;
          lead_memory: unknown;
          heat_score: number;
          last_message_at: string | null;
          last_sentiment: number | null;
          last_sentiment_at: string | null;
        };

        // Fetch eligible cold/warm leads
        const { data: leads } = await admin
          .from('leads')
          .select('id, name, phone, summary, lead_memory, heat_score, last_message_at, last_sentiment, last_sentiment_at')
          .eq('company_id', company.id)
          .in('status', ['cold', 'warm'])
          .not('is_paused', 'eq', true)
          .eq('followup_in_progress', false) // Avoid reactivating leads mid-followup
          .lt('last_message_at', cutoffDate)
          .not('phone', 'is', null)
          .order('last_message_at', { ascending: true })
          .limit(20) as unknown as { data: ReactivateLead[] | null; error: unknown };

        if (!leads?.length) continue;

        // Sentiment guard: skip leads that had very negative last interactions (< -0.5)
        const eligibleLeads = leads.filter((l) => {
          if (typeof l.last_sentiment === 'number' && l.last_sentiment < -0.5) return false;
          return true;
        });

        if (!eligibleLeads.length) continue;

        // Fetch active WhatsApp channel
        const { data: channel } = await admin
          .from('channels')
          .select('provider_id')
          .eq('company_id', company.id)
          .eq('provider', 'whatsapp')
          .eq('status', 'active')
          .maybeSingle();

        if (!channel) continue;

        const aiName = company.ai_name ?? 'Agendra';
        const businessName = company.name ?? 'nossa empresa';
        const customHook = pc.reactivation_hook ?? '';

        // Batch: fetch all leads reactivated in the last 72h in a single query (avoids N+1)
        const recentCutoff = new Date(Date.now() - 72 * 60 * 60 * 1000).toISOString();
        const eligibleLeadIds = eligibleLeads.map((l) => l.id);
        const { data: recentReactivations } = await admin
          .from('automation_events')
          .select('lead_id')
          .eq('company_id', company.id)
          .eq('type', 'reactivation_sent')
          .gte('created_at', recentCutoff)
          .in('lead_id', eligibleLeadIds);
        const recentlyReactivatedSet = new Set(recentReactivations?.map((r) => r.lead_id) ?? []);

        for (const lead of eligibleLeads) {
          try {
            if (recentlyReactivatedSet.has(lead.id)) continue;

            // Generate personalized re-engagement message via multi-provider BG chain
            const firstName = lead.name?.split(' ')[0] ?? lead.name ?? 'cliente';
            const lastSummary = lead.summary ?? 'Demonstrou interesse em nossos serviços.';
            const daysSilent = Math.floor(
              (Date.now() - new Date(lead.last_message_at ?? Date.now()).getTime()) /
              (1000 * 60 * 60 * 24)
            );

            const sentimentHint = typeof lead.last_sentiment === 'number'
              ? `Última interação teve sentimento ${lead.last_sentiment > 0 ? 'positivo' : 'neutro/cauteloso'} (${lead.last_sentiment.toFixed(2)}). Adapte o tom.`
              : '';

            const prompt = `Você é ${aiName}, assistente de ${businessName}.
Escreva UMA mensagem curta e amigável de reativação para o lead "${firstName}".
Contexto: ${lastSummary}
Silêncio: ${daysSilent} dias sem resposta.
${sentimentHint}
${customHook ? `Oferta/gancho especial: ${customHook}` : ''}
Regras:
- Máximo 2 frases curtas.
- Tom amigável, sem pressão.
- Use formato WhatsApp (sem markdown com ##, **, etc.).
- NÃO use "Olá" ou cumprimentos formais longos.
- Seja direto e pessoal.
Escreva APENAS a mensagem, sem aspas ou explicações adicionais.`;

            const { text: message } = await routeGenerate({ prompt }, { chain: 'bg' });
            if (!message?.trim()) continue;

            // Send via WhatsApp client
            await sendWhatsAppMessage(lead.phone!, message, company.id);

            // Record in message history
            await admin.from('messages').insert({
              lead_id: lead.id,
              company_id: company.id,
              role: 'assistant',
              content: message,
              metadata: { type: 'reactivation' },
            });

            // Log activity event
            await admin.from('automation_events').insert({
              company_id: company.id,
              lead_id: lead.id,
              type: 'reactivation_sent',
              detail: `Reativação enviada para ${lead.name} após ${daysSilent} dias`,
            });

            // Update lead interaction date
            await admin
              .from('leads')
              .update({ last_message_at: new Date().toISOString() })
              .eq('id', lead.id)
              .eq('company_id', company.id);

            leadsProcessed++;
          } catch (leadErr: any) {
            console.error(`[nightly-cron] [Reactivation] Erro no lead ${lead.id}:`, leadErr.message);
            errors++;
          }
        }
      } catch (companyErr: any) {
        console.error(`[nightly-cron] [Reactivation] Erro na empresa ${company.id}:`, companyErr.message);
        errors++;
      }

      reactivationResults.push({ company: company.id, leads_processed: leadsProcessed, errors });
    }
    summary.reactivation = reactivationResults;
    console.log('[nightly-cron] reactivation:', summary.reactivation);
  } catch (err: any) {
    summary.reactivation = { error: err.message };
    console.error('[nightly-cron] reactivation failed:', err.message);
  }

  // ── 2. Reminders (evening sweep) ─────────────────────────────────────────────
  try {
    const now = new Date().toISOString();
    let totalSent = 0;
    let totalFailed = 0;

    for (const company of activeCompanies) {
      // Fetch reminders with an active event (not cancelled)
      const { data: reminders, error: remErr } = await admin
        .from('reminders')
        .select('*, leads(phone, name), events!inner(start_time, title, status)')
        .eq('company_id', company.id)
        .eq('status', 'pending')
        .lte('remind_at', now)
        .neq('events.status', 'cancelled')
        .limit(10);

      if (remErr) {
        console.error(`[nightly-cron] reminders error for company ${company.id}:`, remErr.message);
        continue;
      }

      const tz = (company.persona_config as any)?.timezone ?? 'America/Sao_Paulo';

      for (const rem of reminders ?? []) {
        try {
          // Atomic claim
          const { data: claimed } = await admin
            .from('reminders')
            .update({ status: 'sent' })
            .eq('id', rem.id)
            .eq('status', 'pending')
            .select('id')
            .maybeSingle();

          if (!claimed) continue;

          const lead = rem.leads as any;
          const event = rem.events as any;
          if (!lead?.phone || !event?.start_time) throw new Error('Dados incompletos');

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

          const message = `Olá ${lead.name.split(' ')[0]}! Passando para lembrar do seu agendamento de "${event.title}" às ${timeStr}. Nos vemos em breve! 🗓`;

          await sendWhatsAppMessage(lead.phone, message, rem.company_id);

          // Log message history to lead
          await admin.from('messages').insert({
            lead_id: rem.lead_id,
            company_id: rem.company_id,
            role: 'assistant',
            content: message,
            metadata: { type: 'reminder', event_id: rem.event_id },
          });

          // Insert into automation events feed
          await admin.from('automation_events').insert({
            company_id: rem.company_id,
            lead_id: rem.lead_id,
            type: 'reminder_sent',
            detail: `Lembrete enviado para ${lead.name.split(' ')[0]} — ${event.title}`,
            payload: { event_id: rem.event_id, remind_at: rem.remind_at },
          });

          totalSent++;
        } catch (err: any) {
          await admin.from('reminders').update({ status: 'failed', error_log: err.message }).eq('id', rem.id);
          totalFailed++;
        }
      }
    }

    summary.reminders_evening = { sent: totalSent, failed: totalFailed };
    console.log('[nightly-cron] reminders_evening:', summary.reminders_evening);
  } catch (err: any) {
    summary.reminders_evening = { error: err.message };
    console.error('[nightly-cron] reminders_evening failed:', err.message);
  }

  // ── 3. Flush Buffer ──────────────────────────────────────────────────────────
  try {
    const { data: rows } = await admin.from('message_buffer')
      .select('*').eq('flushed', false).lte('flush_after', new Date().toISOString())
      .order('created_at', { ascending: true }).limit(100);

    if (!rows?.length) {
      summary.flush_buffer = { flushed: 0 };
    } else {
      const groups = new Map<string, typeof rows>();
      for (const r of rows) {
        const k = `${r.company_id}:${r.lead_phone}`;
        if (!groups.has(k)) groups.set(k, []);
        groups.get(k)!.push(r);
      }

      let flushed = 0;
      for (const items of groups.values()) {
        try {
          const usage = await getCompanyUsage(items[0].company_id);
          const consolidated = items.map(i => i.body).join('\n');
          const mergedMetadata = items.reduce((acc, i) => ({ ...acc, ...(i.metadata ?? {}) }), {});

          await handleIncomingMessage(
            items[0].company_id, items[0].lead_phone,
            items[0].lead_name ?? '', consolidated,
            items[0].provider_message_id, usage,
            { ...mergedMetadata, debounce_batch_size: items.length, via_sql_fallback: true }
          );

          await admin.from('message_buffer').update({ flushed: true })
            .in('provider_message_id', items.map(i => i.provider_message_id));
          flushed += items.length;
        } catch (err: any) {
          console.error('[nightly-cron] [flush-buffer] err:', err.message);
        }
      }
      summary.flush_buffer = { flushed };
      console.log('[nightly-cron] flush_buffer:', summary.flush_buffer);
    }
  } catch (err: any) {
    summary.flush_buffer = { error: err.message };
    console.error('[nightly-cron] flush_buffer failed:', err.message);
  }

  return NextResponse.json({ ok: true, ...summary });
}
