"use server";

import { createClient, getUserProfile } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { exchangeForLongLivedToken, getWhatsAppNumberDetails } from "@/lib/whatsapp/meta-api";
import { validateWhatsAppToken } from "@/lib/whatsapp/validate";
import { getCompanyUsage } from "@/lib/billing/limits";
import { revalidatePath } from "next/cache";
import { assertSafeWebhookUrl } from "@/lib/security/url-guard";

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

  // Length + bounds guards
  if (aiName !== undefined && aiName !== null && aiName.length > 100)
    throw new Error("ai_name muito longo (máx 100 chars)");
  if (aiGreeting !== undefined && aiGreeting !== null && aiGreeting.length > 500)
    throw new Error("ai_greeting muito longo (máx 500 chars)");
  if (aiForbidden !== undefined && aiForbidden !== null && aiForbidden.length > 2000)
    throw new Error("ai_forbidden muito longo (máx 2000 chars)");
  if (!isNaN(escalationThreshold) && (escalationThreshold < 1 || escalationThreshold > 100))
    throw new Error("escalation_threshold deve ser entre 1 e 100");
  if (!isNaN(slotDuration) && (slotDuration < 5 || slotDuration > 480))
    throw new Error("slot_duration_minutes deve ser entre 5 e 480");
  if (formData.has("timezone") && formData.get("timezone")) {
    const tz = formData.get("timezone") as string;
    try { Intl.DateTimeFormat(undefined, { timeZone: tz }); } catch {
      throw new Error("Timezone inválida");
    }
  }
  const extraInstructions = formData.has("extra_instructions")
    ? (formData.get("extra_instructions") as string).trim()
    : undefined;
  if (extraInstructions !== undefined && extraInstructions.length > 3000)
    throw new Error("extra_instructions muito longo (máx 3000 chars)");

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
  if (extraInstructions !== undefined) personaConfigPatch.extra_instructions = extraInstructions || null;

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

  // Bounds: prevent logic abuse or DoS via extreme values
  if (data.reminder_advance_hours !== undefined) {
    if (!Number.isInteger(data.reminder_advance_hours) || data.reminder_advance_hours < 0 || data.reminder_advance_hours > 48)
      throw new Error("reminder_advance_hours deve ser inteiro entre 0 e 48");
  }
  if (data.followup_delay_hours !== undefined) {
    if (!Number.isInteger(data.followup_delay_hours) || data.followup_delay_hours < 1 || data.followup_delay_hours > 168)
      throw new Error("followup_delay_hours deve ser inteiro entre 1 e 168");
  }
  if (data.followup_max_retries !== undefined) {
    if (!Number.isInteger(data.followup_max_retries) || data.followup_max_retries < 0 || data.followup_max_retries > 10)
      throw new Error("followup_max_retries deve ser inteiro entre 0 e 10");
  }

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
 * Invite a team member. Creates invitation row and either:
 * - Creates in-app notification (if user already has account)
 * - Sends email invite via Supabase Auth (new users)
 */
export async function inviteTeamMember(email: string, role: "admin" | "member") {
  const profile = await getUserProfile();
  if (!profile) throw new Error("Unauthorized");

  const companyId = profile.memberships?.[0]?.company_id;
  if (!companyId) throw new Error("No company");

  const currentRole = profile.memberships?.[0]?.role;
  if (currentRole !== "admin" && currentRole !== "owner") {
    throw new Error("Apenas administradores podem convidar membros.");
  }

  const normalizedEmail = email.toLowerCase().trim();
  if (!normalizedEmail || !normalizedEmail.includes("@")) throw new Error("E-mail inválido.");

  const admin = createAdminClient();

  // Rate limit: max 5 pending invites per company
  const { count: pendingCount } = await admin
    .from("invitations")
    .select("id", { count: "exact", head: true })
    .eq("company_id", companyId)
    .eq("status", "pending");

  if ((pendingCount ?? 0) >= 5) {
    throw new Error("Limite de 5 convites pendentes atingido. Cancele um convite existente primeiro.");
  }

  // Check for duplicate active invite
  const { data: duplicate } = await admin
    .from("invitations")
    .select("id")
    .eq("company_id", companyId)
    .eq("invited_email", normalizedEmail)
    .eq("status", "pending")
    .maybeSingle();

  if (duplicate) {
    throw new Error("Já existe um convite pendente para este e-mail.");
  }

  // Look up if user already exists in auth
  const { data: allUsers } = await admin.auth.admin.listUsers();
  const existingUser = allUsers?.users?.find(
    (u) => u.email?.toLowerCase() === normalizedEmail
  );

  if (existingUser) {
    // Check if already member
    const { data: alreadyMember } = await admin
      .from("memberships")
      .select("id")
      .eq("company_id", companyId)
      .eq("user_id", existingUser.id)
      .maybeSingle();

    if (alreadyMember) {
      throw new Error("Este usuário já faz parte da equipe.");
    }
  }

  // Fetch company and inviter names for notification
  const { data: company } = await admin.from("companies").select("name").eq("id", companyId).maybeSingle();
  const { data: inviterProfile } = await admin.from("users").select("full_name").eq("id", profile.id).maybeSingle();

  const companyName = company?.name ?? "uma empresa";
  const inviterName = inviterProfile?.full_name ?? "Alguém";

  // Create invitation record
  const { data: invitation, error: inviteErr } = await admin
    .from("invitations")
    .insert({
      company_id: companyId,
      invited_email: normalizedEmail,
      invited_by: profile.id,
      role,
    })
    .select("id")
    .single();

  if (inviteErr) throw new Error("Erro ao criar convite: " + inviteErr.message);

  const invitationId = invitation.id;
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://www.agendra.site";

  if (existingUser) {
    // In-app notification — Realtime delivers immediately
    const { createNotification } = await import("@/lib/notifications/create");
    const notifId = await createNotification({
      company_id: companyId,
      user_id: existingUser.id,
      type: "invite",
      title: "Convite para equipe",
      body: `${inviterName} convidou você para fazer parte de ${companyName} como ${role === "admin" ? "Administrador" : "Membro"}.`,
      action_url: "/settings",
      metadata: {
        invitation_id: invitationId,
        inviter_name: inviterName,
        company_name: companyName,
        role,
      },
      priority: "high",
    });

    if (notifId) {
      await admin.from("invitations").update({ notification_id: notifId }).eq("id", invitationId);
    }
  } else {
    // New user — send email invite with deep link
    const { error: emailErr } = await admin.auth.admin.inviteUserByEmail(normalizedEmail, {
      redirectTo: `${appUrl}/accept-invite?invitationId=${invitationId}`,
      data: { company_id: companyId, invited_role: role },
    });

    if (emailErr) {
      // Roll back invitation row
      await admin.from("invitations").delete().eq("id", invitationId);
      if (emailErr.message.includes("already registered")) {
        throw new Error("Este e-mail já possui uma conta. O usuário pode fazer login e aceitar o convite.");
      }
      throw new Error(emailErr.message);
    }
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

  assertSafeWebhookUrl(data.url);
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

  if (!Number.isInteger(data.reactivation_days) || data.reactivation_days < 1 || data.reactivation_days > 365)
    throw new Error("reactivation_days deve ser inteiro entre 1 e 365");
  if (typeof data.reactivation_hook !== "string" || data.reactivation_hook.trim().length > 1000)
    throw new Error("reactivation_hook inválido (máx 1000 chars)");

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
        reactivation_hook: data.reactivation_hook.trim(),
      },
    })
    .eq("id", companyId);

  if (error) throw new Error(error.message);
  revalidatePath("/settings");
}

