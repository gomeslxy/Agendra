/**
 * lib/billing/plans.ts
 * ─────────────────────────────────────────────────────────────
 * SINGLE SOURCE OF TRUTH para planos, preços e Price IDs do Stripe.
 * Importar AQUI em qualquer lugar que precise de dados de plano.
 * Nunca duplicar Price IDs ou valores fora deste arquivo.
 */

export type PlanType = 'trial' | 'starter' | 'pro' | 'business';
export type BillingPeriod = 'monthly' | 'annual';

// ─── Price IDs (produção, gerados via Stripe MCP) ─────────────────────────────
export const STRIPE_PRICE_IDS: Record<Exclude<PlanType, 'trial'>, Record<BillingPeriod, string>> = {
  starter: {
    monthly: 'price_1TVhRaH6hV4OPdFIzsyU61mj',
    annual:  'price_1TVhRaH6hV4OPdFITnnF2gLW',
  },
  pro: {
    monthly: 'price_1TVhRaH6hV4OPdFI0LbdFuO2',
    annual:  'price_1TVhRbH6hV4OPdFIumxlitWe',
  },
  business: {
    monthly: 'price_1TVhRbH6hV4OPdFINcsGvpIW',
    annual:  'price_1TVhRbH6hV4OPdFI0Zqpxpjo',
  },
};

// Mapa reverso: priceId → planType (para webhook)
export const PRICE_ID_TO_PLAN: Record<string, PlanType> = Object.entries(STRIPE_PRICE_IDS).reduce(
  (acc, [plan, periods]) => {
    acc[periods.monthly] = plan as PlanType;
    acc[periods.annual]  = plan as PlanType;
    return acc;
  },
  {} as Record<string, PlanType>
);

// ─── Limites por plano ────────────────────────────────────────────────────────
export interface PlanLimits {
  maxLeads: number;
  maxChannels: number;
  maxCalendars: number;
  hasWatermark: boolean;
  hasWebhooks: boolean;
  hasFollowUp: boolean;
  hasDedicatedOnboarding: boolean;
}

export const PLAN_LIMITS: Record<PlanType, PlanLimits> = {
  trial: {
    maxLeads: 50,
    maxChannels: 1,
    maxCalendars: 1,
    hasWatermark: true,
    hasWebhooks: false,
    hasFollowUp: false,
    hasDedicatedOnboarding: false,
  },
  starter: {
    maxLeads: 150,
    maxChannels: 1,
    maxCalendars: 1,
    hasWatermark: true,
    hasWebhooks: false,
    hasFollowUp: false,
    hasDedicatedOnboarding: false,
  },
  pro: {
    maxLeads: 1000,
    maxChannels: 3,
    maxCalendars: 3,
    hasWatermark: false,
    hasWebhooks: true,
    hasFollowUp: false,
    hasDedicatedOnboarding: false,
  },
  business: {
    maxLeads: 5000,
    maxChannels: 10,
    maxCalendars: 10,
    hasWatermark: false,
    hasWebhooks: true,
    hasFollowUp: true,
    hasDedicatedOnboarding: true,
  },
};

// ─── Dados de marketing dos planos ───────────────────────────────────────────
export interface PlanMeta {
  id: Exclude<PlanType, 'trial'>;
  name: string;
  desc: string;
  monthly: number;
  annual: number;
  leads: string;
  features: string[];
  recommended: boolean;
}

export const PLANS_META: PlanMeta[] = [
  {
    id: 'starter',
    name: 'Starter',
    desc: 'Perfeito para profissionais autônomos iniciando com IA.',
    monthly: 87,
    annual: 67,
    leads: '150 leads/mês',
    features: [
      '1 WhatsApp conectado',
      '1 Calendário sincronizado',
      'Agendamento automático 24/7',
      "Marca d'água Agendra",
    ],
    recommended: false,
  },
  {
    id: 'pro',
    name: 'Pro',
    desc: 'Para quem já investe em anúncios e precisa de escala.',
    monthly: 197,
    annual: 147,
    leads: '1.000 leads/mês',
    features: [
      'Até 3 WhatsApps conectados',
      'Até 3 Calendários',
      "Sem marca d'água",
      'Webhooks (Zapier/Make)',
      'Suporte prioritário',
    ],
    recommended: true,
  },
  {
    id: 'business',
    name: 'Business',
    desc: 'Clínicas, agências e operações de alto volume.',
    monthly: 497,
    annual: 397,
    leads: '5.000 leads/mês',
    features: [
      'Até 10 WhatsApps conectados',
      'Até 10 Calendários',
      "Sem marca d'água",
      'Prioridade de processamento',
      'Follow-up automatizado',
      'Onboarding dedicado',
    ],
    recommended: false,
  },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Retorna os limites de um plano, com fallback seguro para trial. */
export function getPlanLimits(planType: string | null | undefined): PlanLimits {
  const key = (planType ?? 'trial') as PlanType;
  return PLAN_LIMITS[key] ?? PLAN_LIMITS.trial;
}

/** Dado um priceId do Stripe, retorna o PlanType correspondente. */
export function planFromPriceId(priceId: string): PlanType {
  return PRICE_ID_TO_PLAN[priceId] ?? 'starter';
}

export const TRIAL_DAYS = 7;

/** 
 * Centraliza o cálculo de trial para evitar dessincronia entre componentes.
 */
export function calculateTrialStatus(createdAt: string | null | undefined) {
  if (!createdAt) return { elapsed: 0, remaining: TRIAL_DAYS };
  const start = new Date(createdAt).getTime();
  const now = Date.now();
  const elapsed = Math.floor((now - start) / (1000 * 60 * 60 * 24));
  const remaining = Math.max(0, TRIAL_DAYS - elapsed);
  return { elapsed, remaining };
}

/**
 * Retorna a porcentagem de tempo DECORRIDO (0% no início, 100% no fim).
 */
export function calculateTrialProgress(elapsed: number): number {
  return Math.min(100, Math.max(0, (elapsed / TRIAL_DAYS) * 100));
}
