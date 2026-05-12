import { createAdminClient } from '@/lib/supabase/admin';
import { getPlanLimits, PLAN_LIMITS, TRIAL_DAYS } from './plans';
import type { PlanType, PlanLimits } from './plans';

// Re-export for backwards compatibility
export type { PlanType, PlanLimits };
export { PLAN_LIMITS };

export interface CompanyUsage {
  planType: PlanType;
  status: 'active' | 'past_due' | 'canceled' | 'trial';
  limits: PlanLimits;
  usage: { leads: number };
  isLimitReached: boolean;
  /** ISO string of company creation (for trial calculation) */
  trialStartedAt: string | null;
  /** Days remaining in trial, null if not on trial */
  trialDaysRemaining: number | null;
  currentPeriodEnd?: string | null;
  cancelAtPeriodEnd: boolean;
}

export async function getCompanyUsage(companyId: string): Promise<CompanyUsage> {
  const admin = createAdminClient();
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
  console.log(`[Billing] 🌐 Usando Supabase URL: ${supabaseUrl.split('//')[1]?.split('.')[0]}...`);
  console.log(`[Billing] 🔍 Buscando uso para companyId: "${companyId}"`);

  // Buscamos apenas o básico primeiro para evitar erro de coluna inexistente
  const { data: company, error: companyError } = await admin
    .from('companies')
    .select('*')
    .eq('id', companyId)
    .single();

  if (companyError || !company) {
    console.error(`[Billing] ❌ Erro ao buscar empresa:`, companyError?.message || 'Data is null');
    throw new Error(`Company not found: ${companyError?.message || 'null'}`);
  }

  // [FIX CRIT-2 + HIGH-4] Fallback seguro: trial, não starter
  const planType = ((company.plan_type as PlanType) || 'trial');
  const limits = getPlanLimits(planType);

  // ── Contagem de leads ──────────────────────────────────────────────────────
  let query = admin
    .from('leads')
    .select('*', { count: 'exact', head: true })
    .eq('company_id', companyId);

  if (company.current_period_start && company.current_period_end) {
    // Assinante Stripe: conta apenas no período de billing atual
    query = query
      .gte('created_at', company.current_period_start)
      .lte('created_at', company.current_period_end);
  } else if (company.created_at) {
    // [FIX M2] Trial: conta desde o cadastro (não desde o início do mês).
    // O trial dura 7 dias desde created_at — o contador deve ser o mesmo intervalo.
    query = query.gte('created_at', company.created_at);
  }

  const { count, error } = await query;
  if (error) console.error('[Billing] Error fetching usage:', error);

  const leadsUsed = count || 0;

  // ── Trial / paid status ────────────────────────────────────────────────────
  // [FIX A1] 'canceled' nunca deve ser tratado como trial — bloqueio imediato.
  const isCanceled = company.subscription_status === 'canceled';
  const isPastDue  = company.subscription_status === 'past_due';
  const isActive   = company.subscription_status === 'active';

  // Considera trial quando não tem assinatura ativa, past_due ou canceled
  const isOnTrial = !isActive && !isPastDue && !isCanceled &&
    (planType === 'trial' || !company.subscription_status || company.subscription_status === 'trial');

  let trialDaysRemaining: number | null = null;
  const trialStartedAt = company.created_at ?? null;

  if (isOnTrial && trialStartedAt) {
    const elapsed = Math.floor(
      (Date.now() - new Date(trialStartedAt).getTime()) / (1000 * 60 * 60 * 24)
    );
    trialDaysRemaining = Math.max(0, TRIAL_DAYS - elapsed);
  }

  // [FIX A2] past_due = sem acesso imediato (inadimplente).
  // [FIX A1] canceled = sem acesso imediato.
  const isTrialExpired  = isOnTrial && trialDaysRemaining === 0;
  const isLeadsExceeded = leadsUsed >= limits.maxLeads;
  const isLimitReached  = isLeadsExceeded || isTrialExpired || isPastDue || isCanceled;

  return {
    planType,
    status: (company.subscription_status || 'trial') as 'active' | 'past_due' | 'canceled' | 'trial',
    limits,
    usage: { leads: leadsUsed },
    isLimitReached,
    trialStartedAt,
    trialDaysRemaining,
    currentPeriodEnd: company.current_period_end,
    cancelAtPeriodEnd: !!company.cancel_at_period_end
  };
}
