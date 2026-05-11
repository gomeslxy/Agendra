// app/(onboarding)/onboarding-wizard.tsx
// STUB — full implementation in Task 9
"use client";

import type { OnboardingData } from "@/lib/onboarding/types";

interface OnboardingWizardProps {
  initialStep: number;
  initialData: Partial<OnboardingData>;
  companyId: string;
}

export function OnboardingWizard(_props: OnboardingWizardProps) {
  return <div>Loading onboarding...</div>;
}
