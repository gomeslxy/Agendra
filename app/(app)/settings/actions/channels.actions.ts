"use server";

import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireTenantContext } from "@/lib/tenant/context";
import { exchangeForLongLivedToken, getWhatsAppNumberDetails } from "@/lib/whatsapp/meta-api";
import { validateWhatsAppToken } from "@/lib/whatsapp/validate";
import { getCompanyUsage } from "@/lib/billing/limits";
import { revalidatePath } from "next/cache";
import { logAuditAction } from "@/lib/security/audit";
import { clearChannelConfigCache } from "@/lib/channels/send";
import { invalidateChannelCache } from "@/lib/channels/channel-cache";
import { logError } from "@/lib/logging";

const ChannelIdSchema = z.string().uuid("channelId inválido");
const SaveWhatsAppSchema = z.object({
  phoneId: z.string().min(1, "Campos obrigatórios ausentes").max(128),
  accessToken: z.string().min(1, "Campos obrigatórios ausentes").max(2048),
  name: z.string().max(120).optional(),
});

export async function saveWhatsAppChannel(formData: FormData) {
  const { companyId, userId } = await requireTenantContext({ requireAdmin: true });

  const parsed = SaveWhatsAppSchema.safeParse({
    phoneId: String(formData.get("phone_number_id") ?? "").trim(),
    accessToken: String(formData.get("access_token") ?? "").trim(),
    name: String(formData.get("name") ?? "").trim() || undefined,
  });
  if (!parsed.success) {
    throw new Error(parsed.error.issues[0]?.message ?? "Campos obrigatórios ausentes");
  }
  const { phoneId, accessToken, name } = parsed.data;

  const { enforceLimits } = await import("@/lib/billing/gate");
  await enforceLimits(companyId);

  const validation = await validateWhatsAppToken(phoneId, accessToken);
  if (!validation.ok) {
    throw new Error(validation.error ?? "Token inválido");
  }

  const supabase = await createClient();

  const { data: existing } = await supabase
    .from("channels")
    .select("company_id")
    .eq("provider", "whatsapp")
    .eq("provider_id", phoneId)
    .maybeSingle();

  if (existing && existing.company_id !== companyId) {
    throw new Error("Este Phone Number ID já está em uso por outra conta Agendra.");
  }

  const { data: channel, error } = await supabase
    .from("channels")
    .upsert(
      {
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
          updated_by: userId,
        },
      },
      { onConflict: "provider,provider_id" },
    )
    .select("id")
    .single();

  if (error) throw new Error(error.message);

  const adminForVault = createAdminClient();
  try {
    const { setChannelAccessToken } = await import("@/lib/supabase/vault");
    await setChannelAccessToken(channel.id, accessToken);
  } catch (err) {
    logError("[Onboarding] Vault write failed, mantendo plaintext temporário:", err);
    await adminForVault
      .from("channels")
      .update({ access_token: accessToken })
      .eq("id", channel.id);
  }

  await logAuditAction({
    action: "channel.connect",
    companyId,
    payload: { channel_id: channel.id, provider: "whatsapp", phone_number_id: phoneId },
  });

  clearChannelConfigCache();
  await invalidateChannelCache("whatsapp", phoneId);
  revalidatePath("/settings");
}

export async function disconnectChannel(channelId: string) {
  const { companyId } = await requireTenantContext({ requireAdmin: true });

  const validChannelId = ChannelIdSchema.parse(channelId);
  const supabase = await createClient();

  const { data: channel } = await supabase
    .from("channels")
    .select("id, provider, provider_id, access_token_secret_id")
    .eq("id", validChannelId)
    .eq("company_id", companyId)
    .maybeSingle();

  if (!channel) throw new Error("Canal não encontrado ou não pertence a esta empresa.");

  const { error } = await supabase
    .from("channels")
    .delete()
    .eq("id", validChannelId)
    .eq("company_id", companyId);

  if (error) throw new Error(error.message);

  if (channel.access_token_secret_id) {
    try {
      const admin = createAdminClient();
      await admin.from("vault.secrets").delete().eq("id", channel.access_token_secret_id);
    } catch {
      // silent best-effort cleanup
    }
  }

  await logAuditAction({
    action: "channel.disconnect",
    companyId,
    payload: { channel_id: validChannelId, provider_id: channel.provider_id },
  });

  clearChannelConfigCache();
  if (channel.provider && channel.provider_id) {
    await invalidateChannelCache(channel.provider as "whatsapp" | "instagram", channel.provider_id);
  }
  revalidatePath("/settings");
  return { ok: true };
}

export async function disconnectWhatsAppChannel(channelId: string) {
  return disconnectChannel(channelId);
}

export async function completeWhatsAppOnboarding(shortLivedToken: string) {
  const { companyId } = await requireTenantContext({ requireAdmin: true });

  const token = z.string().min(10, "Token inválido").parse(shortLivedToken);
  const supabase = await createClient();

  try {
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

    const longLivedToken = await exchangeForLongLivedToken(token);
    const details = await getWhatsAppNumberDetails(longLivedToken);

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

    const { data: channel, error } = await supabase
      .from("channels")
      .upsert(
        {
          company_id: companyId,
          provider: "whatsapp",
          provider_id: details.phone_number_id,
          status: "active",
          config: {
            waba_id: details.waba_id,
            display_number: details.display_phone_number,
            onboarded_at: new Date().toISOString(),
            method: "embedded_signup",
          },
          last_error: null,
        },
        { onConflict: "provider,provider_id" },
      )
      .select("id")
      .single();

    if (error) throw new Error(error.message);

    const adminForVault = createAdminClient();
    const { error: vaultError } = await adminForVault.rpc("channel_set_access_token", {
      p_channel_id: channel.id,
      p_token: longLivedToken,
    });

    if (vaultError) {
      logError("[Onboarding] Vault write failed, mantendo plaintext temporário:", vaultError);
      await adminForVault
        .from("channels")
        .update({ access_token: longLivedToken })
        .eq("id", channel.id);
    }

    await logAuditAction({
      action: "channel.connect",
      companyId,
      payload: {
        channel_id: channel.id,
        provider: "whatsapp",
        method: "embedded_signup",
        phone: details.display_phone_number,
      },
    });

    clearChannelConfigCache();
    await invalidateChannelCache("whatsapp", details.phone_number_id);
    revalidatePath("/settings");
    return { success: true, phone: details.display_phone_number };
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    logError("[ONBOARDING_ERROR]", msg);
    return { success: false, error: msg };
  }
}
