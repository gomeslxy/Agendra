"use server";

import { z } from "zod";
import { createClient, getUserProfile, resolveProfileMembership } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { logAuditAction } from "@/lib/security/audit";
import { logError } from "@/lib/logging";

const UpdatePersonaBoundsSchema = z.object({
  aiName: z.string().max(100, "ai_name muito longo (máx 100 chars)").nullable().optional(),
  aiGreeting: z.string().max(500, "ai_greeting muito longo (máx 500 chars)").nullable().optional(),
  aiForbidden: z.string().max(2000, "ai_forbidden muito longo (máx 2000 chars)").nullable().optional(),
  extraInstructions: z.string().max(3000, "extra_instructions muito longo (máx 3000 chars)").optional(),
  escalationThreshold: z.number().int().min(1).max(100).optional(),
  slotDuration: z.number().int().min(5).max(480).optional(),
});

const CompanyIdSchema = z.string().uuid("companyId inválido");
const VersionIdSchema = z.string().uuid("versionId inválido");

export async function updatePersona(formData: FormData) {
  const profile = await getUserProfile();
  if (!profile) throw new Error("Unauthorized");

  const activeMembership = await resolveProfileMembership(profile);
  if (!activeMembership) throw new Error("No company");

  const role = activeMembership.role;
  if (role !== "admin" && role !== "owner") {
    throw new Error("Apenas administradores podem atualizar as orientações da IA.");
  }

  const companyId = activeMembership.company_id;
  const supabase = await createClient();

  const aiName = formData.has("ai_name")
    ? (formData.get("ai_name") as string).trim() || null
    : undefined;
  const aiTone = formData.has("ai_tone")
    ? (formData.get("ai_tone") as string).trim() || null
    : undefined;
  const aiGreeting = formData.has("ai_greeting")
    ? (formData.get("ai_greeting") as string).trim() || null
    : undefined;
  const aiForbidden = formData.has("ai_forbidden")
    ? (formData.get("ai_forbidden") as string).trim() || null
    : undefined;

  const servicesRaw = formData.get("services") as string | null;
  const services = servicesRaw
    ? servicesRaw
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean)
    : [];

  let working_hours: Record<string, [string, string]> | undefined;
  const whRaw = formData.get("working_hours") as string | null;
  if (whRaw) {
    try {
      working_hours = JSON.parse(whRaw) as Record<string, [string, string]>;
    } catch {
      // keep undefined
    }
  }

  const parsedEsc = parseInt(formData.get("escalation_threshold") as string, 10);
  const escalationThreshold = Number.isNaN(parsedEsc) ? undefined : parsedEsc;
  const autoEscalateRaw = formData.get("auto_escalate");
  const parsedSlot = parseInt(formData.get("slot_duration_minutes") as string, 10);
  const slotDuration = Number.isNaN(parsedSlot) ? undefined : parsedSlot;

  const extraInstructions = formData.has("extra_instructions")
    ? (formData.get("extra_instructions") as string).trim()
    : undefined;

  const boundsCheck = UpdatePersonaBoundsSchema.safeParse({
    aiName,
    aiGreeting,
    aiForbidden,
    extraInstructions,
    escalationThreshold,
    slotDuration,
  });
  if (!boundsCheck.success) {
    throw new Error(boundsCheck.error.issues[0]?.message ?? "Dados inválidos");
  }

  if (formData.has("timezone") && formData.get("timezone")) {
    const tz = formData.get("timezone") as string;
    try {
      Intl.DateTimeFormat(undefined, { timeZone: tz });
    } catch {
      throw new Error("Timezone inválida");
    }
  }

  const { data: existing } = await supabase
    .from("companies")
    .select("persona_config")
    .eq("id", companyId)
    .single();

  const currentConfig = (existing?.persona_config ?? {}) as Record<string, unknown>;

  const personaConfigPatch: Record<string, unknown> = {
    ...currentConfig,
    name: aiName ?? currentConfig.name,
    tone: aiTone ?? currentConfig.tone,
  };

  if (formData.has("business_type")) {
    personaConfigPatch.business_type = (formData.get("business_type") as string).trim() || null;
  }
  if (formData.has("ai_name")) personaConfigPatch.tts_enabled = formData.has("tts_enabled");
  if (services.length > 0) personaConfigPatch.services = services;
  if (escalationThreshold !== undefined) personaConfigPatch.escalation_threshold = escalationThreshold;
  if (autoEscalateRaw !== null) personaConfigPatch.auto_escalate = autoEscalateRaw === "true";
  if (slotDuration !== undefined) personaConfigPatch.slot_duration_minutes = slotDuration;
  if (formData.has("timezone") && formData.get("timezone")) {
    personaConfigPatch.timezone = formData.get("timezone") as string;
  }
  if (working_hours) personaConfigPatch.working_hours = working_hours;
  if (extraInstructions !== undefined) {
    personaConfigPatch.extra_instructions = extraInstructions || null;
  }

  const updatePayload: Record<string, unknown> = { persona_config: personaConfigPatch };
  if (aiName !== undefined) updatePayload.ai_name = aiName;
  if (aiTone !== undefined) updatePayload.ai_tone = aiTone;
  if (aiGreeting !== undefined) updatePayload.ai_greeting = aiGreeting;
  if (aiForbidden !== undefined) updatePayload.ai_forbidden = aiForbidden;

  const { error } = await supabase.from("companies").update(updatePayload).eq("id", companyId);
  if (error) throw new Error(error.message);

  try {
    const { data: maxRow } = await supabase
      .from("prompt_versions")
      .select("version")
      .eq("company_id", companyId)
      .order("version", { ascending: false })
      .limit(1)
      .maybeSingle();

    const nextVersion = ((maxRow?.version as number | undefined) ?? 0) + 1;

    await supabase.from("prompt_versions").insert({
      company_id: companyId,
      version: nextVersion,
      ai_name: (personaConfigPatch.name as string) ?? "Agendra",
      ai_tone: (personaConfigPatch.tone as string) ?? "Amigável",
      system_instructions: (personaConfigPatch.extra_instructions as string) ?? "",
      ai_forbidden: aiForbidden !== undefined ? aiForbidden : null,
      created_by: profile.id,
    });
  } catch (pvErr) {
    logError("[updatePersona] Error creating prompt_version:", pvErr);
  }

  await logAuditAction({
    action: "persona.update",
    companyId,
    payload: {
      has_ai_name: aiName !== undefined,
      has_ai_tone: aiTone !== undefined,
      has_ai_greeting: aiGreeting !== undefined,
      has_ai_forbidden: aiForbidden !== undefined,
      has_extra_instructions: extraInstructions !== undefined,
    },
  });

  revalidatePath("/settings");
}

export async function getPromptVersions(companyId: string) {
  const profile = await getUserProfile();
  if (!profile) throw new Error("Unauthorized");

  const validCompanyId = CompanyIdSchema.parse(companyId);
  const activeMembership = await resolveProfileMembership(profile, validCompanyId);
  if (!activeMembership) throw new Error("Unauthorized");

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("prompt_versions")
    .select("id, version, ai_name, ai_tone, system_instructions, ai_forbidden, created_at, created_by")
    .eq("company_id", activeMembership.company_id)
    .order("version", { ascending: false })
    .limit(20);

  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function rollbackPromptVersion(versionId: string) {
  const profile = await getUserProfile();
  if (!profile) throw new Error("Unauthorized");

  const validVersionId = VersionIdSchema.parse(versionId);
  const activeMembership = await resolveProfileMembership(profile);
  if (!activeMembership) throw new Error("Unauthorized");

  const role = activeMembership.role;
  if (role !== "admin" && role !== "owner") {
    throw new Error("Apenas administradores podem restaurar versões do prompt.");
  }

  const companyId = activeMembership.company_id;
  const supabase = await createClient();

  const { data: targetVersion, error: fetchErr } = await supabase
    .from("prompt_versions")
    .select("*")
    .eq("id", validVersionId)
    .eq("company_id", companyId)
    .single();

  if (fetchErr || !targetVersion) throw new Error("Versão do prompt não encontrada.");

  const { data: existing } = await supabase
    .from("companies")
    .select("persona_config")
    .eq("id", companyId)
    .single();

  const currentConfig = (existing?.persona_config ?? {}) as Record<string, unknown>;
  const personaConfigPatch = {
    ...currentConfig,
    name: targetVersion.ai_name,
    tone: targetVersion.ai_tone,
    extra_instructions: targetVersion.system_instructions || null,
  };

  const { error: updateErr } = await supabase
    .from("companies")
    .update({
      persona_config: personaConfigPatch,
      ai_name: targetVersion.ai_name,
      ai_tone: targetVersion.ai_tone,
      ai_forbidden: targetVersion.ai_forbidden,
    })
    .eq("id", companyId);

  if (updateErr) throw new Error(updateErr.message);

  const { data: maxRow } = await supabase
    .from("prompt_versions")
    .select("version")
    .eq("company_id", companyId)
    .order("version", { ascending: false })
    .limit(1)
    .maybeSingle();

  const nextVersion = ((maxRow?.version as number | undefined) ?? 0) + 1;

  await supabase.from("prompt_versions").insert({
    company_id: companyId,
    version: nextVersion,
    ai_name: targetVersion.ai_name,
    ai_tone: targetVersion.ai_tone,
    system_instructions: targetVersion.system_instructions || "",
    ai_forbidden: targetVersion.ai_forbidden,
    created_by: profile.id,
  });

  await logAuditAction({
    action: "persona.rollback",
    companyId,
    payload: { restored_version: targetVersion.version, new_version: nextVersion },
  });

  revalidatePath("/settings");
  return { success: true, restoredVersion: targetVersion.version };
}
