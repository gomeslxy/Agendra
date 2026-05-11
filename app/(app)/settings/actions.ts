"use server";

import { createClient, getUserProfile } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";

export async function updatePersona(formData: FormData) {
  const profile = await getUserProfile();
  if (!profile) throw new Error("Unauthorized");

  const companyId = profile.memberships?.[0]?.company_id;
  if (!companyId) throw new Error("No company");

  const supabase = await createClient();

  // Parse services from comma-separated string
  const servicesRaw = formData.get("services") as string | null;
  const services = servicesRaw
    ? servicesRaw.split(",").map((s) => s.trim()).filter(Boolean)
    : [];

  // Parse working_hours from JSON string submitted by the client
  let working_hours: Record<string, [string, string]> | undefined;
  const whRaw = formData.get("working_hours") as string | null;
  if (whRaw) {
    try { working_hours = JSON.parse(whRaw); } catch { /* keep undefined */ }
  }

  const escalationThreshold = parseInt(formData.get("escalation_threshold") as string, 10);
  const autoEscalate = formData.get("auto_escalate") === "true";
  const slotDuration = parseInt(formData.get("slot_duration_minutes") as string, 10);

  const personaConfigPatch = {
    business_type: (formData.get("business_type") as string) || undefined,
    services: services.length > 0 ? services : undefined,
    escalation_threshold: !isNaN(escalationThreshold) ? escalationThreshold : undefined,
    auto_escalate: autoEscalate,
    slot_duration_minutes: !isNaN(slotDuration) ? slotDuration : undefined,
    timezone: (formData.get("timezone") as string) || undefined,
    working_hours: working_hours || undefined,
    extra_instructions: (formData.get("extra_instructions") as string) || undefined,
  };

  // Remove undefined keys before merging
  const patch = Object.fromEntries(
    Object.entries(personaConfigPatch).filter(([, v]) => v !== undefined)
  );

  const { error } = await supabase
    .from("companies")
    .update({
      ai_name: formData.get("ai_name") as string,
      ai_tone: formData.get("ai_tone") as string,
      ai_greeting: formData.get("ai_greeting") as string,
      ai_forbidden: formData.get("ai_forbidden") as string,
    })
    .eq("id", companyId);

  if (error) throw new Error(error.message);

  // Merge persona_config: read current value, merge patch, write back
  if (Object.keys(patch).length > 0) {
    const { data: existing } = await supabase
      .from("companies")
      .select("persona_config")
      .eq("id", companyId)
      .single();
    const merged = { ...(existing?.persona_config ?? {}), ...patch };
    const { error: pcError } = await supabase
      .from("companies")
      .update({ persona_config: merged })
      .eq("id", companyId);
    if (pcError) throw new Error(pcError.message);
  }

  revalidatePath("/settings");
}
