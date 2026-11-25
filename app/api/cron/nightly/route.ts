/**
 * /api/cron/nightly — Vercel unified nightly cron (20:00 BRT)
 */
import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { sendChannelMessage } from '@/lib/channels/send';
import { routeGenerate } from '@/lib/ai/providers/router';
import { ACTIVE_SUBSCRIPTION_STATUSES } from '@/lib/billing/active-statuses';
import { flushMessageBuffer } from '@/lib/ai/buffer-flush';
import { processCompanyReminders } from '@/lib/notifications/reminders';
import { verifyBearerSecret } from '@/lib/security/crypto-compare';
import { mapWithConcurrency } from '@/lib/infra/concurrency';
import { logError, logInfo } from '@/lib/logging';

export const maxDuration = 300;

export async function GET(req: NextRequest): Promise<NextResponse> {
  if (!verifyBearerSecret(req.headers.get('authorization'), process.env.CRON_SECRET)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const startedAt = Date.now();
  const admin = createAdminClient();
  const summary: Record<string, unknown> = {};

  const { data: companies, error: companiesError } = await admin
    .from('companies')
    .select(
      'id, plan_type, subscription_status, persona_config, name, ai_name, ai_tone, reminders_quiet_hours_enabled, reminders_quiet_hours_start, reminders_quiet_hours_end',
    )
    .in('subscription_status', ACTIVE_SUBSCRIPTION_STATUSES)
    .not('subscription_status', 'eq', 'canceled');

  if (companiesError) {
    logError('[nightly-cron] Failed to fetch companies:', companiesError.message);
    return NextResponse.json({ error: companiesError.message }, { status: 500 });
  }

  const activeCompanies = companies ?? [];
  logInfo(`[nightly-cron] Processing ${activeCompanies.length} active companies`);

  // ── 1. Cold Lead Reactivation ────────────────────────────────────────────────
  try {
    const reactivationResults: Array<{ company: string; leads_processed: number; errors: number }> = [];
    const businessCompanies = activeCompanies.filter((c) => c.plan_type === 'business');

    await mapWithConcurrency(
      businessCompanies,
      5,
      async (company) => {
        const pc = (company.persona_config ?? {}) as {
          reactivation_days?: number;
          reactivation_hook?: string;
        };
        const inactivityDays = pc.reactivation_days ?? 30;
        const cutoffDate = new Date(
          Date.now() - inactivityDays * 24 * 60 * 60 * 1000,
        ).toISOString();
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

          const { data: leads } = (await admin
            .from('leads')
            .select(
              'id, name, phone, summary, lead_memory, heat_score, last_message_at, last_sentiment, last_sentiment_at',
            )
            .eq('company_id', company.id)
            .in('status', ['cold', 'warm'])
            .not('is_paused', 'eq', true)
            .eq('followup_in_progress', false)
            .lt('last_message_at', cutoffDate)
            .not('phone', 'is', null)
            .order('last_message_at', { ascending: true })
            .limit(20)) as unknown as { data: ReactivateLead[] | null; error: unknown };

          if (!leads?.length) return;

          const eligibleLeads = leads.filter((l) => {
            if (typeof l.last_sentiment === 'number' && l.last_sentiment < -0.5) return false;
            return true;
          });

          if (!eligibleLeads.length) return;

          const { data: channel } = await admin
            .from('channels')
            .select('provider_id')
            .eq('company_id', company.id)
            .eq('provider', 'whatsapp')
            .eq('status', 'active')
            .maybeSingle();

          if (!channel) return;

          const aiName = company.ai_name ?? 'Agendra';
          const businessName = company.name ?? 'nossa empresa';
          const customHook = pc.reactivation_hook ?? '';

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

              const firstName = lead.name?.split(' ')[0] ?? lead.name ?? 'cliente';
              const lastSummary = lead.summary ?? 'Demonstrou interesse em nossos serviços.';
              const daysSilent = Math.floor(
                (Date.now() - new Date(lead.last_message_at ?? Date.now()).getTime()) /
                  (1000 * 60 * 60 * 24),
              );

              const sentimentHint =
                typeof lead.last_sentiment === 'number'
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

              await sendChannelMessage(lead.phone!, message, company.id);

              await admin.from('messages').insert({
                lead_id: lead.id,
                company_id: company.id,
                role: 'assistant',
                content: message,
                metadata: { type: 'reactivation' },
              });

              await admin.from('automation_events').insert({
                company_id: company.id,
                lead_id: lead.id,
                type: 'reactivation_sent',
                detail: `Reativação enviada para ${lead.name} após ${daysSilent} dias`,
              });

              await admin
                .from('leads')
                .update({ last_message_at: new Date().toISOString() })
                .eq('id', lead.id)
                .eq('company_id', company.id);

              leadsProcessed++;
            } catch (leadErr: unknown) {
              const msg = leadErr instanceof Error ? leadErr.message : String(leadErr);
              logError(`[nightly-cron] [Reactivation] Erro no lead ${lead.id}:`, msg);
              errors++;
            }
          }
        } catch (companyErr: unknown) {
          const msg = companyErr instanceof Error ? companyErr.message : String(companyErr);
          logError(`[nightly-cron] [Reactivation] Erro na empresa ${company.id}:`, msg);
          errors++;
        }

        reactivationResults.push({
          company: company.id,
          leads_processed: leadsProcessed,
          errors,
        });
      },
      { deadlineMs: startedAt + 160_000 },
    );
    summary.reactivation = reactivationResults;
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    summary.reactivation = { error: msg };
    logError('[nightly-cron] reactivation failed:', msg);
  }

  // ── 2. Reminders (evening sweep) ──────────────────────────────────────────────
  try {
    const now = new Date().toISOString();
    const expiryThreshold = new Date(Date.now() - 30 * 60 * 1000).toISOString();
    let totalSent = 0;
    let totalFailed = 0;
    let totalExpired = 0;
    let totalRescheduled = 0;

    await mapWithConcurrency(
      activeCompanies,
      5,
      async (company) => {
        const r = await processCompanyReminders(admin, company, now, expiryThreshold, 10);
        totalSent += r.sent;
        totalFailed += r.failed;
        totalExpired += r.expired;
        totalRescheduled += r.rescheduled;
      },
      { deadlineMs: startedAt + 220_000 },
    );

    summary.reminders_evening = {
      sent: totalSent,
      failed: totalFailed,
      expired: totalExpired,
      rescheduled: totalRescheduled,
    };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    summary.reminders_evening = { error: msg };
    logError('[nightly-cron] reminders_evening failed:', msg);
  }

  // ── 3. Flush Buffer ───────────────────────────────────────────────────────────
  try {
    summary.flush_buffer = await flushMessageBuffer(admin);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    summary.flush_buffer = { error: msg };
    logError('[nightly-cron] flush_buffer failed:', msg);
  }

  return NextResponse.json({ ok: true, ...summary });
}
