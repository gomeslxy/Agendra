"use server";

import { createClient, getUserProfile } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { exchangeForLongLivedToken, getWhatsAppNumberDetails } from "@/lib/whatsapp/meta-api";
import { validateWhatsAppToken } from "@/lib/whatsapp/validate";
import { getCompanyUsage } from "@/lib/billing/limits";
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

export async function saveWhatsAppChannel(formData: FormData) {
  const profile = await getUserProfile();
  if (!profile) throw new Error("Unauthorized");

  const companyId = profile.memberships?.[0]?.company_id;
  if (!companyId) throw new Error("No company");

  const phoneId = formData.get("phone_number_id") as string;
  const accessToken = formData.get("access_token") as string;
  const name = formData.get("name") as string;

  if (!phoneId || !accessToken) throw new Error("Campos obrigatórios ausentes");

  // ── Gate: maxChannels ──────────────────────────────────────────────────────
  const usage = await getCompanyUsage(companyId);
  const admin = createAdminClient();
  const { count: channelCount } = await admin
    .from("channels")
    .select("id", { count: "exact", head: true })
    .eq("company_id", companyId)
    .eq("status", "active");
  if ((channelCount ?? 0) >= usage.limits.maxChannels) {
    throw new Error(
      `Seu plano ${usage.planType.toUpperCase()} permite até ${usage.limits.maxChannels} canal(is) ativo(s). Faça upgrade para adicionar mais.`
    );
  }

  // ── Validar token via Meta API ANTES de salvar ─────────────────────────────
  const validation = await validateWhatsAppToken(phoneId, accessToken.trim());
  if (!validation.ok) {
    throw new Error(validation.error ?? "Token inválido");
  }

  const supabase = await createClient();

  // 1. Verificar se esse ID já existe em OUTRA empresa
  const { data: existing } = await supabase
    .from("channels")
    .select("company_id")
    .eq("provider", "whatsapp")
    .eq("provider_id", phoneId)
    .maybeSingle();

  if (existing && existing.company_id !== companyId) {
    throw new Error("Este Phone Number ID já está em uso por outra conta Agendra.");
  }

  // 2. Upsert com número formatado retornado pela validação
  const { error } = await supabase
    .from("channels")
    .upsert({
      company_id: companyId,
      provider: "whatsapp",
      provider_id: phoneId,
      access_token: accessToken.trim(),
      name: name || "WhatsApp Business",
      phone: validation.displayPhone ?? null,
      status: "active",
      last_error: null,
      last_seen_at: new Date().toISOString(),
      config: {
        expires_at: validation.expiresAt || null,
        updated_by: profile.id
      }
    }, {
      onConflict: "provider,provider_id"
    });

  if (error) throw new Error(error.message);

  revalidatePath("/settings");
}

/**
 * Desconecta um canal de WhatsApp (Remove do banco)
 */
export async function disconnectWhatsAppChannel(channelId: string) {
  const profile = await getUserProfile();
  if (!profile) throw new Error("Unauthorized");

  const companyId = profile.memberships?.[0]?.company_id;
  if (!companyId) throw new Error("No company");

  const supabase = await createClient();

  const { error } = await supabase
    .from("channels")
    .delete()
    .eq("id", channelId)
    .eq("company_id", companyId); // Segurança extra: garantir que pertence à empresa

  if (error) throw new Error(error.message);

  revalidatePath("/settings");
  return { ok: true };
}

/**
 * Finaliza o Onboarding Automático (Embedded Signup)
 */
export async function completeWhatsAppOnboarding(shortLivedToken: string) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Não autorizado");

  const companyId = user.user_metadata.company_id;
  if (!companyId) throw new Error("Empresa não encontrada no perfil");

  try {
    // Gate: maxChannels
    const usage = await getCompanyUsage(companyId);
    const adminForGate = createAdminClient();
    const { count: chCount } = await adminForGate
      .from("channels")
      .select("id", { count: "exact", head: true })
      .eq("company_id", companyId)
      .eq("status", "active");
    if ((chCount ?? 0) >= usage.limits.maxChannels) {
      return {
        success: false,
        error: `Seu plano ${usage.planType.toUpperCase()} permite até ${usage.limits.maxChannels} canal(is) ativo(s). Faça upgrade para adicionar mais.`,
      };
    }

    // 1. Trocar por token de longa duração
    const longLivedToken = await exchangeForLongLivedToken(shortLivedToken);

    // 2. Descobrir detalhes do número
    const details = await getWhatsAppNumberDetails(longLivedToken);

    // 3. Salvar no banco
    const { error } = await supabase.from("channels").upsert({
      company_id: companyId,
      provider: "whatsapp",
      provider_id: details.phone_number_id,
      access_token: longLivedToken,
      status: "active",
      config: {
        waba_id: details.waba_id,
        display_number: details.display_phone_number,
        onboarded_at: new Date().toISOString(),
        method: "embedded_signup"
      },
      last_error: null
    }, {
      onConflict: 'company_id,provider'
    });

    if (error) throw error;

    revalidatePath("/settings");
    return { success: true, phone: details.display_phone_number };
  } catch (error: any) {
    console.error("[ONBOARDING_ERROR]", error);
    return { success: false, error: error.message };
  }
}
