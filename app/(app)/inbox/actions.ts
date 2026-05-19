"use server";

import { createClient, getUserProfile } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { requireOnboarding } from "@/lib/onboarding/guards";
import { sendWhatsAppMessage } from "@/lib/whatsapp/client";
import { persistAITrace } from "@/lib/ai/observability";

async function getLeadInfo(supabase: Awaited<ReturnType<typeof createClient>>, leadId: string) {
  const { data, error } = await supabase
    .from("leads")
    .select("company_id, phone")
    .eq("id", leadId)
    .single();
  if (error || !data) throw new Error("Lead não encontrado");
  return { company_id: data.company_id as string, phone: data.phone as string };
}

export async function sendNote(leadId: string, content: string) {
  console.log(`[Action:sendNote] 🚀 Iniciando envio manual para leadId=${leadId}`);
  try {
    const profile = await getUserProfile();
    if (!profile) throw new Error("Não autorizado");

    const supabase = await createClient();
    const { company_id, phone } = await getLeadInfo(supabase, leadId);
    console.log(`[Action:sendNote] 📱 Lead encontrado: ${phone} (Empresa: ${company_id})`);
    
    await requireOnboarding(company_id);

    // 1. Salvar no banco
    const { error: dbError } = await supabase.from("messages").insert({
      lead_id: leadId,
      company_id,
      content,
      role: "agent",
    });

    if (dbError) throw new Error(`Erro no Banco: ${dbError.message}`);
    console.log(`[Action:sendNote] ✅ Mensagem salva no banco`);

    // 2. Enviar WhatsApp
    await sendWhatsAppMessage(phone, content, company_id);
    console.log(`[Action:sendNote] ✉️ Mensagem enviada para WhatsApp com sucesso`);

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

  const supabase = await createClient();
  const { company_id } = await getLeadInfo(supabase, leadId);
  await requireOnboarding(company_id);

  await supabase
    .from("leads")
    .update({ is_paused: true, control_mode: 'manual' })
    .eq("id", leadId);

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

  const supabase = await createClient();
  const { company_id } = await getLeadInfo(supabase, leadId);
  await requireOnboarding(company_id);

  await supabase
    .from("leads")
    .update({ is_paused: false, control_mode: 'autonomous' })
    .eq("id", leadId);

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

  const supabase = await createClient();

  const { error } = await supabase
    .from("leads")
    .update({ conversation_tone: tone })
    .eq("id", leadId);

  if (error) throw new Error(error.message);

  revalidatePath("/inbox");
}

export async function setControlMode(leadId: string, mode: 'autonomous' | 'shadow' | 'manual') {
  const profile = await getUserProfile();
  if (!profile) throw new Error("Unauthorized");

  const supabase = await createClient();
  const { company_id } = await getLeadInfo(supabase, leadId);
  await requireOnboarding(company_id);

  const isPaused = mode !== 'autonomous';

  await supabase
    .from("leads")
    .update({ 
      control_mode: mode,
      is_paused: isPaused
    })
    .eq("id", leadId);

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

  const supabase = await createClient();

  // 1. Buscar a mensagem de rascunho
  const { data: msg, error: fetchError } = await supabase
    .from("messages")
    .select("*, lead:leads(phone)")
    .eq("id", messageId)
    .single();

  if (fetchError || !msg) throw new Error("Mensagem não encontrada");
  const phone = (msg.lead as any)?.phone;
  if (!phone) throw new Error("Telefone do lead não encontrado");

  // 2. Enviar WhatsApp via API no backend
  await sendWhatsAppMessage(phone, msg.content, msg.company_id);

  // 3. Atualizar metadados do rascunho (remover is_draft)
  const newMetadata = msg.metadata ? { ...msg.metadata } : {};
  delete newMetadata.is_draft;

  const { error: updateError } = await supabase
    .from("messages")
    .update({
      metadata: newMetadata,
    })
    .eq("id", messageId);

  if (updateError) throw new Error(updateError.message);

  revalidatePath("/inbox");
  return { success: true };
}

export async function deleteDraftMessage(messageId: string) {
  const profile = await getUserProfile();
  if (!profile) throw new Error("Unauthorized");

  const supabase = await createClient();

  const { error } = await supabase
    .from("messages")
    .delete()
    .eq("id", messageId);

  if (error) throw new Error(error.message);

  revalidatePath("/inbox");
  return { success: true };
}
