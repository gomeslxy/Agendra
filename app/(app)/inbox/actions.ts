"use server";

import { createClient, getUserProfile, resolveProfileCompanyId } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { requireOnboarding } from "@/lib/onboarding/guards";
import { activateTakeover, deactivateTakeover, extendTakeoverOnHumanMessage, isUnderHumanTakeover } from "@/lib/ai/takeover";
import { buildControlModePatch } from "./control-mode";
import { sendChannelMessage, sendChannelMedia } from "@/lib/channels/send";
import { createAdminClient } from "@/lib/supabase/admin";
import { persistAITrace } from "@/lib/ai/observability";
import { logError } from "@/lib/logging";
import crypto from "crypto";
import type { Message } from "@/lib/types/database";

async function requireInboxSession() {
  const profile = await getUserProfile();
  if (!profile) throw new Error("Unauthorized");
  const companyId = await resolveProfileCompanyId(profile);
  if (!companyId) throw new Error("Unauthorized");
  return { profile, companyId };
}

async function getLeadInfo(supabase: Awaited<ReturnType<typeof createClient>>, leadId: string, companyId: string) {
  const { data, error } = await supabase
    .from("leads")
    .select("company_id, phone, control_mode, human_takeover_until")
    .eq("id", leadId)
    .eq("company_id", companyId)
    .single();
  if (error || !data) throw new Error("Lead não encontrado");
  return {
    company_id: data.company_id as string,
    phone: data.phone as string,
    control_mode: (data.control_mode as "autonomous" | "shadow" | "manual" | null) ?? "autonomous",
    human_takeover_until: (data.human_takeover_until as string | null) ?? null,
  };
}

export async function sendNote(leadId: string, content: string, clientTempId?: string) {
  const trimmed = content?.trim() ?? "";
  if (!trimmed) throw new Error("Mensagem vazia");
  if (trimmed.length > 4096) throw new Error("Mensagem muito longa (máx 4096 chars)");

  try {
    const { profile, companyId } = await requireInboxSession();

    const supabase = await createClient();
    const { company_id, phone, control_mode, human_takeover_until } = await getLeadInfo(supabase, leadId, companyId);
    
    await requireOnboarding(company_id);

    // 1. Send FIRST. Persisting before the send left "ghost" messages: a manual
    //    text that WhatsApp rejected (e.g. lead outside the 24h window) still
    //    appeared in the inbox as if delivered. Send-then-persist guarantees the
    //    bubble only exists for messages WhatsApp actually accepted; on failure we
    //    surface the (now humanized) reason and persist nothing.
    const sendResult = await sendChannelMessage(phone, trimmed, company_id, {
      isHumanOperator: true,
    });

    const metadata: Record<string, unknown> = {};
    if (sendResult?.providerMessageId) metadata.provider_message_id = sendResult.providerMessageId;
    if (clientTempId) metadata.client_temp_id = clientTempId;

    // 2. Persist only after a confirmed send.
    const { data: insertedMessage, error: dbError } = await supabase
      .from("messages")
      .insert({
        lead_id: leadId,
        company_id,
        content: trimmed,
        role: "agent",
        metadata: Object.keys(metadata).length > 0 ? metadata : null,
      })
      .select("id, lead_id, company_id, content, role, metadata, created_at")
      .single();

    if (dbError) throw new Error(`Erro no Banco: ${dbError.message}`);

    // 3. P0-UX-02: Ativar takeover se o lead estava em modo autônomo ou estender takeover ativo
    if (control_mode === "autonomous") {
      await activateTakeover({ companyId: company_id, leadId, userId: profile.id });
    } else if (isUnderHumanTakeover({ human_takeover_until })) {
      await extendTakeoverOnHumanMessage({ companyId: company_id, leadId, userId: profile.id });
    }

    // 4. Manter last_message_at atualizado para ordenação correta
    await supabase
      .from("leads")
      .update({ last_message_at: new Date().toISOString() })
      .eq("id", leadId)
      .eq("company_id", company_id);

    revalidatePath("/inbox");
    return { success: true, message: insertedMessage as Message };
  } catch (err) {
    const msg = (err as Error).message;
    logError("[Action:sendNote] Falha crítica:", msg);
    return { success: false, error: msg };
  }
}

export async function takeOverLead(leadId: string) {
  const { profile, companyId } = await requireInboxSession();

  const supabase = await createClient();
  const { company_id } = await getLeadInfo(supabase, leadId, companyId);
  await requireOnboarding(company_id);

  // Use centralized takeover helper
  await activateTakeover({
    companyId: company_id,
    leadId,
    userId: profile.id,
  });

  // Persist a note for UI visibility (optional)
  const { error } = await supabase.from("messages").insert({
    lead_id: leadId,
    company_id,
    content: "Você assumiu o atendimento.",
    role: "note",
  });
  if (error) throw new Error(error.message);

  // Observabilidade: log de handoff manual
  persistAITrace({
    company_id,
    lead_id: leadId,
    trace_type: 'system',
    request_data: { action: 'human_takeover' },
    response_data: { info: 'Atendente assumiu a conversa' },
    duration_ms: null,
    tokens_used: null,
  });

  revalidatePath("/inbox");
}

export async function automatizeLead(leadId: string) {
  const { companyId } = await requireInboxSession();

  const supabase = await createClient();
  const { company_id } = await getLeadInfo(supabase, leadId, companyId);
  await requireOnboarding(company_id);

  // Use centralized takeover helper to deactivate human takeover
  await deactivateTakeover({ companyId: company_id, leadId });

  // Persist a note for UI visibility (optional)
  const { error } = await supabase.from("messages").insert({
    lead_id: leadId,
    company_id,
    content: "Conversa voltou para atendimento automático (Modo Autônomo).",
    role: "note",
  });
  if (error) throw new Error(error.message);

  // Observabilidade: log de retorno à automação
  persistAITrace({
    company_id,
    lead_id: leadId,
    trace_type: 'system',
    request_data: { action: 'ai_automatize' },
    response_data: { info: 'Atendente devolveu para automação da IA' },
    duration_ms: null,
    tokens_used: null,
  });

  revalidatePath("/inbox");
}

export async function setConversationTone(leadId: string, tone: "cold" | "warm" | "hot") {
  const { companyId } = await requireInboxSession();

  const supabase = await createClient();

  const { error } = await supabase
    .from("leads")
    .update({ conversation_tone: tone })
    .eq("id", leadId)
    .eq("company_id", companyId); // IDOR guard

  if (error) throw new Error(error.message);

  revalidatePath("/inbox");
}

export async function setControlMode(leadId: string, mode: 'autonomous' | 'shadow' | 'manual') {
  const { profile, companyId } = await requireInboxSession();

  const supabase = await createClient();
  const { company_id } = await getLeadInfo(supabase, leadId, companyId);
  await requireOnboarding(company_id);

  // Use takeover helpers for supported modes
  if (mode === 'manual') {
    await activateTakeover({ companyId: company_id, leadId, userId: profile.id });
  } else if (mode === 'autonomous') {
    await deactivateTakeover({ companyId: company_id, leadId });
  } else {
    const patch = buildControlModePatch('shadow', profile.id);
    const { error: shadowErr } = await supabase
      .from("leads")
      .update(patch)
      .eq("id", leadId)
      .eq("company_id", company_id);
    if (shadowErr) throw new Error(shadowErr.message);
  }

  const modeLabels = {
    autonomous: "automático (Modo Autônomo)",
    shadow: "Copiloto / Shadow (rascunhos inteligentes)",
    manual: "manual (Modo Manual)"
  };

  const { error } = await supabase.from("messages").insert({
    lead_id: leadId,
    company_id,
    content: `Modo de controle alterado para ${modeLabels[mode]}.`,
    role: "note",
  });

  if (error) throw new Error(error.message);

  revalidatePath("/inbox");
}

export async function approveDraftMessage(messageId: string) {
  const { companyId } = await requireInboxSession();

  const supabase = await createClient();

  // 1. Buscar a mensagem de rascunho — company_id guard prevents IDOR
  const { data: msg, error: fetchError } = await supabase
    .from("messages")
    .select("*, lead:leads(phone)")
    .eq("id", messageId)
    .eq("company_id", companyId)
    .single();

  if (fetchError || !msg) throw new Error("Mensagem não encontrada");
  const phone = (msg.lead as any)?.phone;
  if (!phone) throw new Error("Telefone do lead não encontrado");

  // Guard: prevent double-send if race condition (user clicked Approve 2x)
  // If is_draft was already removed by a previous call, abort silently.
  if (!(msg.metadata as any)?.is_draft) {
    console.warn(`[approveDraftMessage] Message ${messageId} already approved — skipping duplicate send.`);
    return { success: true };
  }

  // 2. Enviar mensagem via Canal unificado no backend
  await sendChannelMessage(phone, msg.content, msg.company_id);

  // 3. Atualizar metadados do rascunho (remover is_draft)
  const newMetadata = msg.metadata ? { ...msg.metadata } : {};
  delete newMetadata.is_draft;

  const { error: updateError } = await supabase
    .from("messages")
    .update({
      metadata: newMetadata,
    })
    .eq("id", messageId)
    .eq("company_id", companyId); // IDOR guard — defense in depth

  if (updateError) throw new Error(updateError.message);

  revalidatePath("/inbox");
  return { success: true };
}

export async function editAndSendDraft(messageId: string, editedText: string) {
  if (!editedText.trim()) throw new Error("Texto não pode ser vazio");
  if (editedText.length > 4096) throw new Error("Mensagem muito longa (máx 4096 chars)");

  const { companyId } = await requireInboxSession();

  const supabase = await createClient();

  const { data: msg, error: fetchError } = await supabase
    .from("messages")
    .select("*, lead:leads(phone)")
    .eq("id", messageId)
    .eq("company_id", companyId)
    .single();

  if (fetchError || !msg) throw new Error("Mensagem não encontrada");
  const phone = (msg.lead as any)?.phone;
  if (!phone) throw new Error("Telefone do lead não encontrado");

  await sendChannelMessage(phone, editedText.trim(), msg.company_id, {
    isHumanOperator: true,
  });

  const newMetadata = msg.metadata ? { ...msg.metadata } : {};
  delete newMetadata.is_draft;

  const { error: updateError } = await supabase
    .from("messages")
    .update({ content: editedText.trim(), metadata: newMetadata })
    .eq("id", messageId)
    .eq("company_id", companyId); // IDOR guard — defense in depth

  if (updateError) throw new Error(updateError.message);

  revalidatePath("/inbox");
  return { success: true };
}

export async function deleteDraftMessage(messageId: string) {
  const { companyId } = await requireInboxSession();

  const supabase = await createClient();

  const { error } = await supabase
    .from("messages")
    .delete()
    .eq("id", messageId)
    .eq("company_id", companyId); // IDOR guard

  if (error) throw new Error(error.message);

  revalidatePath("/inbox");
  return { success: true };
}

const ALLOWED_MIME: Record<string, 'image' | 'document' | 'video' | 'audio'> = {
  'image/jpeg': 'image', 'image/png': 'image', 'image/webp': 'image', 'image/gif': 'image',
  'application/pdf': 'document',
  'video/mp4': 'video', 'video/3gpp': 'video',
  'audio/mpeg': 'audio', 'audio/ogg': 'audio', 'audio/mp4': 'audio', 'audio/aac': 'audio', 'audio/amr': 'audio',
};
const MAX_SIZE = 16 * 1024 * 1024; // 16 MB

export async function sendFileAttachment(leadId: string, formData: FormData) {
  const file = formData.get('file') as File | null;
  if (!file || file.size === 0) return { success: false, error: 'Arquivo inválido' };
  if (file.size > MAX_SIZE) return { success: false, error: 'Arquivo muito grande (máx 16 MB)' };

  const waType = ALLOWED_MIME[file.type];
  if (!waType) return { success: false, error: `Tipo não suportado: ${file.type}` };

  const caption = ((formData.get('caption') as string) ?? '').trim();
  const clientTempId = ((formData.get('client_temp_id') as string) ?? '').trim() || undefined;

  const { profile, companyId } = await requireInboxSession();

  const supabase = await createClient();
  const { company_id, phone, control_mode, human_takeover_until } = await getLeadInfo(supabase, leadId, companyId);
  await requireOnboarding(company_id);

  const admin = createAdminClient();
  await admin.storage.createBucket('inbox-media', { public: false }).catch(() => {});

  const ext = file.name.split('.').pop() ?? 'bin';
  const rand = crypto.randomBytes(12).toString('hex');
  const path = `${company_id}/${leadId}/${Date.now()}-${rand}.${ext}`;
  const bytes = await file.arrayBuffer();

  const { data: uploadData, error: uploadError } = await admin.storage
    .from('inbox-media')
    .upload(path, bytes, { contentType: file.type, upsert: false });

  if (uploadError || !uploadData) {
    return { success: false, error: `Upload falhou: ${uploadError?.message}` };
  }

  // Generate a signed URL valid for 24 hours so channels can fetch the file immediately
  // and the message payload is hydrated on-creation for instant feedback.
  const { data: signedData, error: signedError } = await admin.storage
    .from('inbox-media')
    .createSignedUrl(uploadData.path, 86400);

  if (signedError || !signedData?.signedUrl) {
    return { success: false, error: `Falha ao gerar link assinado: ${signedError?.message}` };
  }

  const mediaUrl = signedData.signedUrl;

  // Send FIRST, persist only on success (same ghost-message guard as sendNote).
  let sendResult;
  try {
    sendResult = await sendChannelMedia(phone, mediaUrl, waType, file.name, caption, company_id);
  } catch (err) {
    return { success: false, error: (err as Error).message };
  }

  const { data: insertedMessage, error: dbError } = await supabase
    .from('messages')
    .insert({
      lead_id: leadId,
      company_id,
      content: caption || file.name,
      role: 'agent',
      metadata: {
        media_path: uploadData.path,
        media_url: mediaUrl,
        media_type: waType,
        filename: file.name,
        file_size: file.size,
        ...(clientTempId ? { client_temp_id: clientTempId } : {}),
        ...(sendResult?.providerMessageId ? { provider_message_id: sendResult.providerMessageId } : {}),
      },
    })
    .select('id, lead_id, company_id, content, role, metadata, created_at')
    .single();
  if (dbError) return { success: false, error: `DB: ${dbError.message}` };

  // P0-UX-02: Ativar takeover se o lead estava em modo autônomo ou estender takeover ativo
  if (control_mode === 'autonomous') {
    await activateTakeover({ companyId: company_id, leadId, userId: profile.id });
  } else if (isUnderHumanTakeover({ human_takeover_until })) {
    await extendTakeoverOnHumanMessage({ companyId: company_id, leadId, userId: profile.id });
  }

  await supabase
    .from('leads')
    .update({ last_message_at: new Date().toISOString() })
    .eq('id', leadId)
    .eq('company_id', company_id);

  revalidatePath('/inbox');
  return { success: true, message: insertedMessage as Message };
}

export async function getSignedMediaUrl(mediaPath: string): Promise<string | null> {
  const { companyId } = await requireInboxSession();
  if (!mediaPath || !mediaPath.startsWith(`${companyId}/`)) {
    throw new Error('Acesso negado à mídia solicitada');
  }
  const admin = createAdminClient();
  const { data, error } = await admin.storage
    .from('inbox-media')
    .createSignedUrl(mediaPath, 86400);
  if (error || !data?.signedUrl) return null;
  return data.signedUrl;
}

export async function fetchOlderMessages(leadId: string, beforeDate: string): Promise<Message[]> {
  const { companyId } = await requireInboxSession();

  const supabase = await createClient();

  const { data, error } = await supabase
    .from("messages")
    .select("id, lead_id, company_id, content, role, metadata, created_at")
    .eq("lead_id", leadId)
    .eq("company_id", companyId)
    .lt("created_at", beforeDate)
    .order("created_at", { ascending: false })
    .limit(30);

  if (error) throw new Error(error.message);

  return ((data ?? []) as Message[]).reverse();
}
