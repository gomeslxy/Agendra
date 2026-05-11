// lib/onboarding/apply.ts
import { createAdminClient } from '@/lib/supabase/admin';
import type { OnboardingData } from './types';

export interface ApplyResult {
  ok: boolean;
  error?: string;
}

const DEFAULT_WORKING_HOURS: Record<string, [string, string]> = {
  mon: ['09:00', '18:00'],
  tue: ['09:00', '18:00'],
  wed: ['09:00', '18:00'],
  thu: ['09:00', '18:00'],
  fri: ['09:00', '18:00'],
};

export function buildPersonaConfig(data: OnboardingData): Record<string, unknown> {
  return {
    name: data.ai_name ?? 'Assistente',
    business_name: data.company_name ?? '',
    business_type: data.niche ?? '',
    tone: data.ai_tone ?? 'friendly',
    timezone: data.timezone ?? 'America/Sao_Paulo',
    working_hours: data.working_hours ?? DEFAULT_WORKING_HOURS,
    slot_duration_minutes: 60,
  };
}

export function buildAiGreeting(data: OnboardingData): string {
  const name = data.ai_name ?? 'Assistente';
  const company = data.company_name ?? 'nossa empresa';
  return `Olá! Sou ${name}, assistente virtual de ${company}. Como posso ajudar?`;
}

export async function applyOnboardingConfig(
  companyId: string,
  data: OnboardingData,
): Promise<ApplyResult> {
  const admin = createAdminClient();

  try {
    const persona_config = buildPersonaConfig(data);
    const ai_greeting = buildAiGreeting(data);

    const applied_config = {
      persona_config_set: true,
      ai_settings_set: true,
      pipeline_created: false,
      automations_created: false,
      applied_at: new Date().toISOString(),
      applied_version: 1,
    };

    const { error } = await admin
      .from('companies')
      .update({
        name: data.company_name ?? undefined,
        persona_config,
        ai_name: data.ai_name ?? null,
        ai_tone: data.ai_tone ?? null,
        ai_greeting,
        onboarding_status: 'completed',
        onboarding_completed_at: new Date().toISOString(),
        onboarding_data: data,
        onboarding_applied_config: applied_config,
      })
      .eq('id', companyId);

    if (error) return { ok: false, error: error.message };
    return { ok: true };
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Unknown error';
    return { ok: false, error: msg };
  }
}
