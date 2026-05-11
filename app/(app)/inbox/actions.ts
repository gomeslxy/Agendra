"use server";

import { createClient, getUserProfile } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { requireOnboarding } from "@/lib/onboarding/guards";
import { sendWhatsAppMessage } from "@/lib/whatsapp/client";

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
  const profile = await getUserProfile();
  if (!profile) throw new Error("Unauthorized");

  const supabase = await createClient();
  const { company_id, phone } = await getLeadInfo(supabase, leadId);
  await requireOnboarding(company_id);

  // 1. Enviar para o WhatsApp primeiro
  try {
    await sendWhatsAppMessage(phone, content);
  } catch (err) {
    console.error("[sendNote] WhatsApp send error:", err);
    throw new Error("Erro ao enviar para o WhatsApp. Verifique as configurações do canal.");
  }

  // 2. Salvar no banco apenas se o envio acima funcionar (ou se você preferir salvar mesmo com erro, inverta a ordem)
  const { error } = await supabase.from("messages").insert({
    lead_id: leadId,
    company_id,
    content,
    role: "agent",
  });

  if (error) throw new Error(error.message);

  revalidatePath("/inbox");
}

export async function takeOverLead(leadId: string) {
  const profile = await getUserProfile();
  if (!profile) throw new Error("Unauthorized");

  const supabase = await createClient();
  const { company_id } = await getLeadInfo(supabase, leadId);
  await requireOnboarding(company_id);

  await supabase
    .from("leads")
    .update({ auto_respond: false })
    .eq("id", leadId);

  const { error } = await supabase.from("messages").insert({
    lead_id: leadId,
    company_id,
    content: "Atendente assumiu a conversa.",
    role: "note",
  });

  if (error) throw new Error(error.message);

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
    .update({ auto_respond: true })
    .eq("id", leadId);

  const { error } = await supabase.from("messages").insert({
    lead_id: leadId,
    company_id,
    content: "Conversa voltou para atendimento automático.",
    role: "note",
  });

  if (error) throw new Error(error.message);

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
