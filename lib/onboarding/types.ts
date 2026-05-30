// lib/onboarding/types.ts

export type OnboardingStatus =
  | 'not_started'
  | 'in_progress'
  | 'completed'
  | 'needs_review';

export type BusinessSize = 'solo' | 'small' | 'medium' | 'large';
export type BusinessGoal = 'capture' | 'nurture' | 'qualify' | 'convert' | 'follow';
export type BusinessMaturity = 'beginner' | 'intermediate' | 'advanced';
// Aligned with engine TONE_BLUEPRINTS keys (cold/warm/hot)
export type AiTone = 'cold' | 'warm' | 'hot';
export type PrimaryMetric = 'leads' | 'appointments' | 'conversions' | 'revenue';

export interface OnboardingData {
  // Step 1 — Empresa
  company_name?: string;
  niche?: string;
  size?: BusinessSize;
  phone?: string;
  city?: string;

  // Step 2 — Objetivo
  goal?: BusinessGoal;
  maturity?: BusinessMaturity;

  // Step 3 — Canais
  channels?: Array<'whatsapp' | 'instagram' | 'form'>;
  uses_crm?: boolean;
  crm_name?: string;
  volume_leads_month?: number;

  // Step 4 — Persona da IA
  ai_name?: string;
  ai_tone?: AiTone;
  ai_language?: string;
  timezone?: string;
  working_hours?: Record<string, [string, string]>;
  slot_duration_minutes?: number;
  buffer_minutes?: number;
  extra_instructions?: string;
  ai_forbidden?: string;
  reminder_advance_hours?: number;

  // Step 5 — Metas
  team_size?: number;
  primary_metric?: PrimaryMetric;
  desired_integrations?: string[];
  enable_followup?: boolean;
  followup_delay_hours?: number;
  followup_max_retries?: number;
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
