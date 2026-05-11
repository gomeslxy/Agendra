import { createAdminClient } from '@/lib/supabase/admin';
import { getPlanLimits, PLAN_LIMITS, TRIAL_DAYS } from './plans';
import type { PlanType, PlanLimits } from './plans';

// Re-export for backwards compatibility
export type { PlanType, PlanLimits };
export { PLAN_LIMITS };

export interface CompanyUsage {
  planType: PlanType;
  limits: PlanLimits;
  usage: { leads: number };
  isLimitReached: boolean;
  /** ISO string of company creation (for trial calculation) */
  trialStartedAt: string | null;
  /** Days remaining in trial, null if not on trial */
  trialDaysRemaining: number | null;
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
    // Trial: conta desde o início do mês atual (reseta mensalmente)
    const now = new Date();
    const periodStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
    const periodEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59).toISOString();
    query = query.gte('created_at', periodStart).lte('created_at', periodEnd);
  }

  const { count, error } = await query;
  if (error) console.error('[Billing] Error fetching usage:', error);

  const leadsUsed = count || 0;

  // ── Trial calculation ──────────────────────────────────────────────────────
  let trialDaysRemaining: number | null = null;
  const trialStartedAt = company.created_at ?? null;

  const isOnTrial = planType === 'trial' || 
    (company.subscription_status !== 'active' && company.subscription_status !== 'past_due');

  if (isOnTrial && trialStartedAt) {
    const elapsed = Math.floor(
      (Date.now() - new Date(trialStartedAt).getTime()) / (1000 * 60 * 60 * 24)
    );
    trialDaysRemaining = Math.max(0, TRIAL_DAYS - elapsed);
  }

  // [FIX] Atingiu limite se: estourou leads OU se o trial expirou
  const isTrialExpired = isOnTrial && trialDaysRemaining === 0;
  const isLeadsExceeded = leadsUsed >= limits.maxLeads;
  const isLimitReached = isLeadsExceeded || isTrialExpired;

  return {
    planType,
    limits,
    usage: { leads: leadsUsed },
    isLimitReached,
    trialStartedAt,
    trialDaysRemaining,
  };
}
