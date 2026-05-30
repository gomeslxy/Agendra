"use server";

import { createClient, getUserProfile } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { requireOnboarding } from "@/lib/onboarding/guards";
import { activateTakeover, deactivateTakeover } from "@/lib/ai/takeover";
import { sendChannelMessage, sendChannelMedia } from "@/lib/channels/send";
import { createAdminClient } from "@/lib/supabase/admin";
import { persistAITrace } from "@/lib/ai/observability";
import crypto from "crypto";

async function getLeadInfo(supabase: Awaited<ReturnType<typeof createClient>>, leadId: string, companyId: string) {
  const { data, error } = await supabase
    .from("leads")
    .select("company_id, phone")
    .eq("id", leadId)
    .eq("company_id", companyId)
    .single();
  if (error || !data) throw new Error("Lead não encontrado");
  return { company_id: data.company_id as string, phone: data.phone as string };
}

export async function sendNote(leadId: string, content: string) {
  const trimmed = content?.trim() ?? "";
  if (!trimmed) throw new Error("Mensagem vazia");
  if (trimmed.length > 4096) throw new Error("Mensagem muito longa (máx 4096 chars)");

  try {
    const profile = await getUserProfile();
    if (!profile) throw new Error("Não autorizado");
    const companyId = profile.memberships?.[0]?.company_id;
    if (!companyId) throw new Error("Não autorizado");

    const supabase = await createClient();
    const { company_id, phone } = await getLeadInfo(supabase, leadId, companyId);
    
    await requireOnboarding(company_id);

    // 1. Salvar no banco
    const { error: dbError } = await supabase.from("messages").insert({
      lead_id: leadId,
      company_id,
      content: trimmed,
      role: "agent",
    });

    if (dbError) throw new Error(`Erro no Banco: ${dbError.message}`);

    // 2. Enviar WhatsApp / Canal unificado
    await sendChannelMessage(phone, trimmed, company_id);

    revalidatePath("/inbox");
    return { success: true };
  } catch (err) {
    const msg = (err as Error).message;
    console.error("[Action:sendNote] ❌ Falha crítica:", msg);
    return { success: false, error: msg };
  }
}

export async function takeOverLead(leadId: string) {
  const profile = await getUserProfile();
  if (!profile) throw new Error("Unauthorized");

  const companyId = profile.memberships?.[0]?.company_id;
  if (!companyId) throw new Error("Unauthorized");

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
    content: "Atendente assumiu a conversa (Modo Manual).",
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
  const profile = await getUserProfile();
  if (!profile) throw new Error("Unauthorized");

  const companyId = profile.memberships?.[0]?.company_id;
  if (!companyId) throw new Error("Unauthorized");

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
  const profile = await getUserProfile();
  if (!profile) throw new Error("Unauthorized");

  const companyId = profile.memberships?.[0]?.company_id;
  if (!companyId) throw new Error("No company");

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
  const profile = await getUserProfile();
  if (!profile) throw new Error("Unauthorized");

  const companyId = profile.memberships?.[0]?.company_id;
  if (!companyId) throw new Error("Unauthorized");

  const supabase = await createClient();
  const { company_id } = await getLeadInfo(supabase, leadId, companyId);
  await requireOnboarding(company_id);

  // Use takeover helpers for supported modes
  if (mode === 'manual') {
    await activateTakeover({ companyId: company_id, leadId, userId: profile.id });
  } else if (mode === 'autonomous') {
    await deactivateTakeover({ companyId: company_id, leadId });
  } else {
    // For 'shadow' fallback to direct DB update
    const isPaused = false; // shadow does not pause the lead
    await supabase
      .from("leads")
      .update({ control_mode: mode, is_paused: isPaused })
      .eq("id", leadId)
      .eq("company_id", company_id); // IDOR guard — must always filter by company_id
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
  const profile = await getUserProfile();
  if (!profile) throw new Error("Unauthorized");

  const companyId = profile.memberships?.[0]?.company_id;
  if (!companyId) throw new Error("No company");

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

  const profile = await getUserProfile();
  if (!profile) throw new Error("Unauthorized");

  const companyId = profile.memberships?.[0]?.company_id;
  if (!companyId) throw new Error("No company");

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

  await sendChannelMessage(phone, editedText.trim(), msg.company_id);

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
  const profile = await getUserProfile();
  if (!profile) throw new Error("Unauthorized");

  const companyId = profile.memberships?.[0]?.company_id;
  if (!companyId) throw new Error("No company");

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

  const profile = await getUserProfile();
  if (!profile) throw new Error('Não autorizado');
  const companyId = profile.memberships?.[0]?.company_id;
  if (!companyId) throw new Error('Não autorizado');

  const supabase = await createClient();
  const { company_id, phone } = await getLeadInfo(supabase, leadId, companyId);
  await requireOnboarding(company_id);

  const admin = createAdminClient();
  await admin.storage.createBucket('inbox-media', { public: true }).catch(() => {});

  const ext = file.name.split('.').pop() ?? 'bin';
  // Unguessable object key: the bucket is public, so a predictable path
  // (company_id/leadId/timestamp) is enumerable across tenants. A random segment
  // makes the URL effectively a capability token. (Follow-up: move to a private
  // bucket + signed read URLs — tracked in backlog.)
  const rand = crypto.randomBytes(12).toString('hex');
  const path = `${company_id}/${leadId}/${Date.now()}-${rand}.${ext}`;
  const bytes = await file.arrayBuffer();

  const { data: uploadData, error: uploadError } = await admin.storage
    .from('inbox-media')
    .upload(path, bytes, { contentType: file.type, upsert: false });

  if (uploadError || !uploadData) {
    return { success: false, error: `Upload falhou: ${uploadError?.message}` };
  }

  const { data: { publicUrl } } = admin.storage.from('inbox-media').getPublicUrl(uploadData.path);

  const { error: dbError } = await supabase.from('messages').insert({
    lead_id: leadId,
    company_id,
    content: caption || file.name,
    role: 'agent',
    metadata: { media_url: publicUrl, media_type: waType, filename: file.name, file_size: file.size },
  });
  if (dbError) return { success: false, error: `DB: ${dbError.message}` };

  await sendChannelMedia(phone, publicUrl, waType, file.name, caption, company_id);

  revalidatePath('/inbox');
  return { success: true };
}
