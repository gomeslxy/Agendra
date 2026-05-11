// lib/onboarding/types.ts

export type OnboardingStatus =
  | 'not_started'
  | 'in_progress'
  | 'completed'
  | 'needs_review';

export type BusinessSize = 'solo' | 'small' | 'medium' | 'large';
export type BusinessGoal = 'capture' | 'nurture' | 'qualify' | 'convert' | 'follow';
export type BusinessMaturity = 'beginner' | 'intermediate' | 'advanced';
export type AiTone = 'formal' | 'friendly' | 'direct' | 'warm';
export type PrimaryMetric = 'leads' | 'appointments' | 'conversions' | 'revenue';

export interface OnboardingData {
  // Step 1 — Empresa
  company_name?: string;
  niche?: string;
  size?: BusinessSize;

  // Step 2 — Objetivo
  goal?: BusinessGoal;
  maturity?: BusinessMaturity;

  // Step 3 — Canais
  channels?: Array<'whatsapp' | 'instagram' | 'form'>;
  uses_crm?: boolean;
  crm_name?: string;

  // Step 4 — Persona da IA
  ai_name?: string;
  ai_tone?: AiTone;
  ai_language?: string;
  timezone?: string;
  working_hours?: Record<string, [string, string]>;

  // Step 5 — Metas
  team_size?: number;
  primary_metric?: PrimaryMetric;
  desired_integrations?: string[];
}

export interface OnboardingState {
  status: OnboardingStatus;
  step: number;
  data: OnboardingData;
  completed_at: string | null;
}

export const ONBOARDING_TOTAL_STEPS = 5;

export function isOnboardingComplete(status: OnboardingStatus): boolean {
  return status === 'completed';
}
