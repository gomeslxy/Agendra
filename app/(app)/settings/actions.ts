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

  // Use formData.has() — if field absent (e.g. Rules form), value stays undefined and is excluded
  // from the update object, preventing the Rules tab from wiping ai_name/ai_tone/etc.
  const aiName     = formData.has("ai_name")     ? (formData.get("ai_name")     as string).trim() || null : undefined;
  const aiTone     = formData.has("ai_tone")     ? (formData.get("ai_tone")     as string).trim() || null : undefined;
  const aiGreeting = formData.has("ai_greeting") ? (formData.get("ai_greeting") as string).trim() || null : undefined;
  const aiForbidden= formData.has("ai_forbidden")? (formData.get("ai_forbidden") as string).trim() || null : undefined;

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
  const autoEscalateRaw = formData.get("auto_escalate");
  const slotDuration = parseInt(formData.get("slot_duration_minutes") as string, 10);

  // Read current persona_config to merge (single round-trip)
  const { data: existing } = await supabase
    .from("companies")
    .select("persona_config")
    .eq("id", companyId)
    .single();

  const currentConfig = (existing?.persona_config ?? {}) as Record<string, unknown>;

  const personaConfigPatch: Record<string, unknown> = {
    ...currentConfig,
    // Keep denormalized fields in sync with direct columns — single source of truth
    name: aiName ?? currentConfig.name,
    tone: aiTone ?? currentConfig.tone,
  };

  // business_type: has() check so empty string clears correctly
  if (formData.has("business_type")) personaConfigPatch.business_type = (formData.get("business_type") as string).trim() || null;
  if (formData.has("ai_name")) personaConfigPatch.tts_enabled = formData.has("tts_enabled");
  if (services.length > 0) personaConfigPatch.services = services;
  if (!isNaN(escalationThreshold)) personaConfigPatch.escalation_threshold = escalationThreshold;
  if (autoEscalateRaw !== null) personaConfigPatch.auto_escalate = autoEscalateRaw === "true";
  if (!isNaN(slotDuration)) personaConfigPatch.slot_duration_minutes = slotDuration;
  if (formData.has("timezone") && formData.get("timezone")) personaConfigPatch.timezone = formData.get("timezone") as string;
  if (working_hours) personaConfigPatch.working_hours = working_hours;
  // extra_instructions: has() = field present; empty string = user cleared → set null
  if (formData.has("extra_instructions")) personaConfigPatch.extra_instructions = (formData.get("extra_instructions") as string).trim() || null;

  // Build update object — omit undefined fields so Rules form doesn't wipe identity columns
  const updatePayload: Record<string, unknown> = { persona_config: personaConfigPatch };
  if (aiName     !== undefined) updatePayload.ai_name     = aiName;
  if (aiTone     !== undefined) updatePayload.ai_tone     = aiTone;
  if (aiGreeting !== undefined) updatePayload.ai_greeting = aiGreeting;
  if (aiForbidden!== undefined) updatePayload.ai_forbidden= aiForbidden;

  const { error } = await supabase
    .from("companies")
    .update(updatePayload)
    .eq("id", companyId);

  if (error) throw new Error(error.message);

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
  // Enforce billing limits before creating a channel
  const { enforceLimits } = await import('@/lib/billing/gate');
  await enforceLimits(companyId);

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
  const { data: channel, error } = await supabase
    .from("channels")
    .upsert({
      company_id: companyId,
      provider: "whatsapp",
      provider_id: phoneId,
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
    })
    .select("id")
    .single();

  if (error) throw new Error(error.message);

  const adminForVault = createAdminClient();
  // Store access token securely using Supabase Vault wrapper
  try {
    const { setChannelAccessToken } = await import('@/lib/supabase/vault');
    await setChannelAccessToken(channel.id, accessToken.trim());
  } catch (err) {
    console.error('[Onboarding] Vault write failed, mantendo plaintext temporário:', err);
    // Fallback to plaintext if vault fails
    await adminForVault.from('channels').update({ access_token: accessToken.trim() }).eq('id', channel.id);
  }

  revalidatePath("/settings");
}

/**
 * Desconecta um canal de WhatsApp (Remove do banco)
 */
export async function disconnectWhatsAppChannel(channelId: string) {
  const profile = await getUserProfile();
  if (!profile) throw new Error("Unauthorized");

  if (profile.memberships?.[0]?.role !== "admin") {
    throw new Error("Apenas administradores podem desconectar canais.");
  }

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

export async function updateCompany(data: { name: string }) {
  const profile = await getUserProfile();
  if (!profile) throw new Error("Unauthorized");

  const companyId = profile.memberships?.[0]?.company_id;
  if (!companyId) throw new Error("No company");

  const name = data.name.trim();
  if (!name) throw new Error("Nome da empresa não pode ser vazio");

  const supabase = await createClient();
  const { error } = await supabase
    .from("companies")
    .update({ name })
    .eq("id", companyId);

  if (error) throw new Error(error.message);
  revalidatePath("/settings");
}

export async function saveAutomationConfig(data: {
  reminder_advance_hours?: number;
  followup_delay_hours?: number;
  followup_max_retries?: number;
}) {
  const profile = await getUserProfile();
  if (!profile) throw new Error("Unauthorized");

  const companyId = profile.memberships?.[0]?.company_id;
  if (!companyId) throw new Error("No company");

  const supabase = await createClient();

  const { data: existing } = await supabase
    .from("companies")
    .select("persona_config")
    .eq("id", companyId)
    .single();

  const current = (existing?.persona_config ?? {}) as Record<string, unknown>;

  const patch: Record<string, unknown> = { ...current };
  if (data.reminder_advance_hours !== undefined) patch.reminder_advance_hours = data.reminder_advance_hours;
  if (data.followup_delay_hours !== undefined) patch.followup_delay_hours = data.followup_delay_hours;
  if (data.followup_max_retries !== undefined) patch.followup_max_retries = data.followup_max_retries;

  const { error } = await supabase
    .from("companies")
    .update({ persona_config: patch })
    .eq("id", companyId);

  if (error) throw new Error(error.message);

  revalidatePath("/settings");
}

/**
 * Finaliza o Onboarding Automático (Embedded Signup)
 */
export async function completeWhatsAppOnboarding(shortLivedToken: string) {
  const profile = await getUserProfile();
  if (!profile) throw new Error("Não autorizado");

  const companyId = profile.memberships?.[0]?.company_id;
  if (!companyId) throw new Error("Empresa não encontrada no perfil");

  const supabase = await createClient();

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

    // Cross-tenant guard: garantir que esse phone_number_id não pertence a outra empresa
    const { data: existingCross } = await supabase
      .from("channels")
      .select("company_id")
      .eq("provider", "whatsapp")
      .eq("provider_id", details.phone_number_id)
      .maybeSingle();

    if (existingCross && existingCross.company_id !== companyId) {
      return {
        success: false,
        error: "Este número de WhatsApp já está vinculado a outra conta Agendra. Contate o suporte.",
      };
    }

    // 3. Salvar no banco
    const { data: channel, error } = await supabase.from("channels").upsert({
      company_id: companyId,
      provider: "whatsapp",
      provider_id: details.phone_number_id,
      status: "active",
      config: {
        waba_id: details.waba_id,
        display_number: details.display_phone_number,
        onboarded_at: new Date().toISOString(),
        method: "embedded_signup"
      },
      last_error: null
    }, {
      onConflict: 'provider,provider_id'
    }).select("id").single();

    if (error) throw new Error(error.message);

    const adminForVault = createAdminClient();
    const { error: vaultError } = await adminForVault.rpc('channel_set_access_token', {
      p_channel_id: channel.id,
      p_token: longLivedToken,
    });

    if (vaultError) {
      console.error('[Onboarding] Vault write failed, mantendo plaintext temporário:', vaultError);
      await adminForVault.from('channels').update({ access_token: longLivedToken }).eq('id', channel.id);
    }
  revalidatePath("/settings");
  return { success: true, phone: details.display_phone_number };
  } catch (error: any) {
    console.error("[ONBOARDING_ERROR]", error);
    return { success: false, error: error.message };
  }
}

/**
 * Convida um membro do time via Supabase Auth Admin.
 * Apenas admins podem convidar. Cria linha pendente em memberships.
 */
export async function inviteTeamMember(email: string, role: "admin" | "member") {
  const profile = await getUserProfile();
  if (!profile) throw new Error("Unauthorized");

  const companyId = profile.memberships?.[0]?.company_id;
  if (!companyId) throw new Error("No company");

  // Verificar se o usuário atual é admin
  const currentRole = profile.memberships?.[0]?.role;
  if (currentRole !== "admin") throw new Error("Apenas administradores podem convidar membros.");

  if (!email || !email.includes("@")) throw new Error("E-mail inválido.");

  const admin = createAdminClient();

  // Enviar convite via Supabase Auth
  const { data: inviteData, error: inviteError } = await admin.auth.admin.inviteUserByEmail(email, {
    redirectTo: `${process.env.NEXT_PUBLIC_APP_URL ?? "https://app.agendra.com.br"}/accept-invite`,
    data: {
      company_id: companyId,
      invited_role: role,
    },
  });

  if (inviteError) {
    // Tratar caso onde usuário já existe
    if (inviteError.message.includes("already registered")) {
      throw new Error("Este e-mail já possui uma conta. Peça para o usuário fazer login.");
    }
    throw new Error(inviteError.message);
  }

  // Criar linha pendente em memberships (sem user_id até aceitação)
  const { error: memberError } = await admin.from("memberships").upsert(
    {
      company_id: companyId,
      user_id: inviteData.user.id,
      role,
    },
    { onConflict: "company_id,user_id" }
  );

  if (memberError) {
    console.error("[INVITE] Erro ao criar membership pendente:", memberError);
    // Não lança erro — o convite por e-mail já foi enviado
  }

  revalidatePath("/settings");
}

/**
 * Salva (cria ou atualiza) uma assinatura de webhook para a empresa.
 */
export async function saveWebhookConfig(data: {
  url: string;
  event_types: string[];
  label?: string;
  id?: string;
}) {
  const profile = await getUserProfile();
  if (!profile) throw new Error("Unauthorized");

  const companyId = profile.memberships?.[0]?.company_id;
  if (!companyId) throw new Error("No company");

  if (!data.url || !data.url.startsWith("http")) throw new Error("URL inválida. Use https://...");
  if (!data.event_types.length) throw new Error("Selecione ao menos um tipo de evento.");

  const supabase = await createClient();

  if (data.id) {
    // Update existente
    const { error } = await supabase
      .from("webhook_subscriptions")
      .update({
        url: data.url,
        event_types: data.event_types,
        label: data.label ?? null,
      })
      .eq("id", data.id)
      .eq("company_id", companyId);

    if (error) throw new Error(error.message);
  } else {
    // Criar novo com secret HMAC gerado aleatoriamente
    const crypto = (await import("crypto")).default;
    const secret = crypto.randomBytes(32).toString("hex");

    const { error } = await supabase.from("webhook_subscriptions").insert({
      company_id: companyId,
      url: data.url,
      event_types: data.event_types,
      label: data.label ?? null,
      secret,
    });

    if (error) throw new Error(error.message);
  }

  revalidatePath("/settings");
}

/**
 * Remove uma assinatura de webhook.
 */
export async function deleteWebhook(webhookId: string) {
  const profile = await getUserProfile();
  if (!profile) throw new Error("Unauthorized");

  if (profile.memberships?.[0]?.role !== "admin") {
    throw new Error("Apenas administradores podem excluir webhooks.");
  }

  const companyId = profile.memberships?.[0]?.company_id;
  if (!companyId) throw new Error("No company");

  const supabase = await createClient();
  const { error } = await supabase
    .from("webhook_subscriptions")
    .delete()
    .eq("id", webhookId)
    .eq("company_id", companyId);

  if (error) throw new Error(error.message);
  revalidatePath("/settings");
}

/**
 * Salva as configurações de reativação de leads frios.
 */
export async function saveReactivationConfig(data: {
  reactivation_days: number;
  reactivation_hook: string;
}) {
  const profile = await getUserProfile();
  if (!profile) throw new Error("Unauthorized");

  const companyId = profile.memberships?.[0]?.company_id;
  if (!companyId) throw new Error("No company");

  const supabase = await createClient();

  const { data: existing } = await supabase
    .from("companies")
    .select("persona_config")
    .eq("id", companyId)
    .single();

  const current = (existing?.persona_config ?? {}) as Record<string, unknown>;

  const { error } = await supabase
    .from("companies")
    .update({
      persona_config: {
        ...current,
        reactivation_days: data.reactivation_days,
        reactivation_hook: data.reactivation_hook,
      },
    })
    .eq("id", companyId);

  if (error) throw new Error(error.message);
  revalidatePath("/settings");
}

