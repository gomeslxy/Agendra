// app/onboarding/actions.ts
"use server";

import { redirect } from "next/navigation";
import { getUser, getCachedUserProfile, createClient } from "@/lib/supabase/server";
import { applyOnboardingConfig } from "@/lib/onboarding/apply";
import type { ApplyResult } from "@/lib/onboarding/apply";
import type { OnboardingData } from "@/lib/onboarding/types";

async function getCompanyId(): Promise<string> {
  const user = await getUser();
  if (!user) redirect("/login");
  const profile = await getCachedUserProfile(user.id);
  const companyId = profile?.memberships?.[0]?.company_id;
  if (!companyId) redirect("/login");
  return companyId;
}

export async function saveOnboardingStep(
  step: number,
  data: Partial<OnboardingData>,
): Promise<void> {
  const companyId = await getCompanyId();
  const supabase = await createClient();

  const { data: existing } = await supabase
    .from("companies")
    .select("onboarding_data, onboarding_step")
    .eq("id", companyId)
    .single();

  const merged = { ...(existing?.onboarding_data ?? {}), ...data };
  const newStep = Math.max(step, existing?.onboarding_step ?? 0);

  const { error } = await supabase
    .from("companies")
    .update({
      onboarding_data: merged,
      onboarding_step: newStep,
      onboarding_status: "in_progress",
    })
    .eq("id", companyId);

  if (error) throw new Error(`Failed to save onboarding step: ${error.message}`);
}

export async function completeOnboarding(
  data: OnboardingData,
): Promise<ApplyResult> {
  const companyId = await getCompanyId();
  const supabase = await createClient();

  const { data: company } = await supabase
    .from("companies")
    .select("onboarding_status")
    .eq("id", companyId)
    .single();

  if (company?.onboarding_status === "completed") {
    return { ok: true };
  }

  const result = await applyOnboardingConfig(companyId, data);

  if (!result.ok) {
    await supabase
      .from("companies")
      .update({ onboarding_status: "needs_review" })
      .eq("id", companyId);
  }

  return result;
}
