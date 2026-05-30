// lib/onboarding/prefill.ts
import type { OnboardingData, AiTone } from './types';

interface LegacyCompany {
  name?: string | null;
  ai_name?: string | null;
  ai_tone?: string | null;
  persona_config?: Record<string, unknown> | null;
  onboarding_data?: Partial<OnboardingData> | null;
}

const VALID_TONES: AiTone[] = ['cold', 'warm', 'hot'];

// Map legacy tone strings (formal/friendly/direct) to the engine-aligned keys.
const TONE_MIGRATION: Record<string, AiTone> = {
  formal: 'cold',
  direct: 'cold',
  friendly: 'warm',
  warm: 'warm',
  hot: 'hot',
  cold: 'cold',
};

function toAiTone(raw: unknown): AiTone | undefined {
  if (typeof raw !== 'string') return undefined;
  const mapped = TONE_MIGRATION[raw.toLowerCase()];
  if (mapped) return mapped;
  if (VALID_TONES.includes(raw as AiTone)) return raw as AiTone;
  return undefined;
}

export function buildPrefillFromLegacy(company: LegacyCompany): Partial<OnboardingData> {
  // Already has onboarding_data from a previous incomplete session — use it,
  // but re-map tone in case the session was saved with old keys.
  if (company.onboarding_data && Object.keys(company.onboarding_data).length > 0) {
    const d = company.onboarding_data;
    const migratedTone = toAiTone(d.ai_tone);
    return { ...d, ...(migratedTone ? { ai_tone: migratedTone } : {}) };
  }

  const config = (company.persona_config ?? {}) as Record<string, unknown>;
  const result: Partial<OnboardingData> = {};

  // Step 1
  if (company.name) result.company_name = company.name;
  if (typeof config.business_type === 'string') result.niche = config.business_type;

  // Step 4 — AI persona
  const aiName = company.ai_name ?? (typeof config.name === 'string' ? config.name : undefined);
  if (aiName) result.ai_name = aiName;

  const aiTone = toAiTone(company.ai_tone) ?? toAiTone(config.tone);
  if (aiTone) result.ai_tone = aiTone;

  if (typeof config.timezone === 'string') result.timezone = config.timezone;

  if (config.working_hours && typeof config.working_hours === 'object' && !Array.isArray(config.working_hours)) {
    result.working_hours = config.working_hours as Record<string, [string, string]>;
  }

  if (typeof config.slot_duration_minutes === 'number') {
    result.slot_duration_minutes = config.slot_duration_minutes;
  }
  if (typeof config.buffer_minutes === 'number') {
    result.buffer_minutes = config.buffer_minutes;
  }
  if (typeof config.reminder_advance_hours === 'number') {
    result.reminder_advance_hours = config.reminder_advance_hours;
  }
  if (typeof config.extra_instructions === 'string') {
    result.extra_instructions = config.extra_instructions;
  }
  if (typeof config.ai_forbidden === 'string') {
    result.ai_forbidden = config.ai_forbidden;
  }
  if (typeof config.followup_delay_hours === 'number') {
    result.followup_delay_hours = config.followup_delay_hours;
  }
  if (typeof config.followup_max_retries === 'number') {
    result.followup_max_retries = config.followup_max_retries;
  }

  return result;
}
