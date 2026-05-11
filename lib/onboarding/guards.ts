// lib/onboarding/guards.ts
import { createClient } from '@/lib/supabase/server';
import type { OnboardingStatus } from './types';

export async function getOnboardingStatus(companyId: string): Promise<OnboardingStatus> {
  const supabase = await createClient();
  const { data } = await supabase
    .from('companies')
    .select('onboarding_status')
    .eq('id', companyId)
    .single();
  return (data?.onboarding_status as OnboardingStatus) ?? 'not_started';
}

/** Throw-based guard for Server Actions and Route Handlers. */
export async function requireOnboarding(companyId: string): Promise<void> {
  const status = await getOnboardingStatus(companyId);
  if (status !== 'completed') {
    throw new Error('ONBOARDING_REQUIRED');
  }
}
