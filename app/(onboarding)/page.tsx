// app/(onboarding)/page.tsx
import { getUser, getCachedUserProfile, createClient } from "@/lib/supabase/server";
import { buildPrefillFromLegacy } from "@/lib/onboarding/prefill";
import { OnboardingWizard } from "./onboarding-wizard";
import type { OnboardingData } from "@/lib/onboarding/types";

export default async function OnboardingPage() {
  const user = await getUser();
  const profile = await getCachedUserProfile(user!.id);
  const companyId = profile!.memberships![0].company_id;

  const supabase = await createClient();
  const { data: company } = await supabase
    .from("companies")
    .select("name, ai_name, ai_tone, persona_config, onboarding_step, onboarding_data")
    .eq("id", companyId)
    .single();

  const savedStep = company?.onboarding_step ?? 0;
  const savedData = (company?.onboarding_data ?? {}) as Partial<OnboardingData>;

  const prefill = buildPrefillFromLegacy({
    name: company?.name,
    ai_name: company?.ai_name,
    ai_tone: company?.ai_tone,
    persona_config: company?.persona_config,
    onboarding_data: Object.keys(savedData).length > 0 ? savedData : null,
  });

  return (
    <OnboardingWizard
      initialStep={savedStep}
      initialData={prefill}
      companyId={companyId}
    />
  );
}
