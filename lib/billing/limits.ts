import { createAdminClient } from '@/lib/supabase/admin';
import { redis } from '@/lib/infra/redis';
import { getPlanLimits, PLAN_LIMITS, TRIAL_DAYS } from './plans';
import type { PlanType, PlanLimits } from './plans';

// Re-export for backwards compatibility
export type { PlanType, PlanLimits };
export { PLAN_LIMITS };

export interface CompanyUsage {
  planType: PlanType;
  status: 'active' | 'trialing' | 'past_due' | 'canceled' | 'trial' | 'incomplete' | 'incomplete_expired';
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

// Short-lived cache for the usage object. getCompanyUsage runs on the hot path of
// EVERY inbound message (webhook → before the debounce timer even starts) and does
// a companies SELECT + a leads COUNT(exact) — the count is an O(n) scan that becomes
// the dominant DB cost under load (many messages from the same company). A 45s TTL
// removes both queries from the repeat path while staying fresh enough for billing:
// the hard cancellation guard in the webhook reads `companies.subscription_status`
// FRESH and separately, so a canceled tenant is still blocked immediately; the cache
// only softens lead-count / trial-day limits by ≤45s (soft limits, self-healing).
const USAGE_CACHE_TTL_SEC = 45;
const usageCacheKey = (companyId: string) => `cache:usage:${companyId}`;

/** Invalidate the cached usage for a company (call after plan/subscription changes). */
export async function invalidateUsageCache(companyId: string): Promise<void> {
  try { await redis.del(usageCacheKey(companyId)); } catch { /* fail-open */ }
}

export async function getCompanyUsage(companyId: string): Promise<CompanyUsage> {
  const cacheKey = usageCacheKey(companyId);
  try {
    const cached = await redis.get(cacheKey);
    if (cached) return JSON.parse(cached) as CompanyUsage;
  } catch { /* fail-open: fall through to a fresh compute */ }

  const usage = await computeCompanyUsage(companyId);

  try {
    await redis.set(cacheKey, JSON.stringify(usage), USAGE_CACHE_TTL_SEC);
  } catch { /* ignore cache write failures */ }

  return usage;
}

async function computeCompanyUsage(companyId: string): Promise<CompanyUsage> {
  const admin = createAdminClient();

  const { data: company, error: companyError } = await admin
    .from('companies')
    .select('id, plan_type, subscription_status, created_at, current_period_start, current_period_end, cancel_at_period_end, extra_leads')
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
  const isCanceled   = company.subscription_status === 'canceled';
  const isPastDue    = company.subscription_status === 'past_due';
  const isActive     = company.subscription_status === 'active' || company.subscription_status === 'trialing';
  // incomplete: pagamento inicial pendente — acesso bloqueado (23h até expirar)
  const isIncomplete = company.subscription_status === 'incomplete' || company.subscription_status === 'incomplete_expired';

  // Considera trial quando não tem assinatura ativa, past_due, canceled ou incomplete
  const isOnTrial = !isActive && !isPastDue && !isCanceled && !isIncomplete &&
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
  // [MED-1 FIX] incomplete/incomplete_expired = sem acesso (pagamento inicial pendente).
  const isTrialExpired  = isOnTrial && trialDaysRemaining === 0;
  // Admin-granted overage (migration 072) lifts the plan cap without a plan change.
  const extraLeads        = Math.max(0, Number(company.extra_leads) || 0);
  const effectiveMaxLeads = limits.maxLeads + extraLeads;
  const isLeadsExceeded   = leadsUsed >= effectiveMaxLeads;
  const isLimitReached  = isLeadsExceeded || isTrialExpired || isPastDue || isCanceled || isIncomplete;

  return {
    planType,
    status: (company.subscription_status || 'trial') as CompanyUsage['status'],
    // Spread (not mutate) — getPlanLimits returns the shared PLAN_LIMITS constant.
    limits: extraLeads > 0 ? { ...limits, maxLeads: effectiveMaxLeads } : limits,
    usage: { leads: leadsUsed },
    isLimitReached,
    trialStartedAt,
    trialDaysRemaining,
    currentPeriodEnd: company.current_period_end,
    cancelAtPeriodEnd: !!company.cancel_at_period_end
  };
}
