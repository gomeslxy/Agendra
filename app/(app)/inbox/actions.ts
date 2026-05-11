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

  // 1. Salvar no banco primeiro (registro histórico garantido)
  const { error: dbError } = await supabase.from("messages").insert({
    lead_id: leadId,
    company_id,
    content,
    role: "agent",
  });

  if (dbError) throw new Error(dbError.message);

  // 2. Tentar enviar para o WhatsApp
  try {
    await sendWhatsAppMessage(phone, content);
  } catch (err) {
    console.error("[sendNote] WhatsApp send error:", err);
    throw err; // Re-throw to be caught by the client
  }

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
