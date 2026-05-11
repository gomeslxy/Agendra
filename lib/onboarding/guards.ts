// lib/onboarding/guards.ts
import { createClient } from '@/lib/supabase/server';
import type { OnboardingStatus } from './types';

export async function getOnboardingStatus(companyId: string): Promise<OnboardingStatus> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('companies')
    .select('onboarding_status')
    .eq('id', companyId)
    .single();

  if (error || !data) {
    throw new Error(`Company not found or access denied: ${companyId}`);
  }
  return data.onboarding_status as OnboardingStatus;
}

/** Throw-based guard for Server Actions and Route Handlers. */
export async function requireOnboarding(companyId: string): Promise<void> {
  const status = await getOnboardingStatus(companyId);
  if (status !== 'completed') {
    throw new Error(`Onboarding not complete for company ${companyId} (status: ${status})`);
  }
}
