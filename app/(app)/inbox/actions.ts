"use server";

import { createClient, getUserProfile } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";

export async function sendNote(leadId: string, content: string) {
  const profile = await getUserProfile();
  if (!profile) throw new Error("Unauthorized");

  const supabase = await createClient();

  const { error } = await supabase.from("messages").insert({
    lead_id: leadId,
    content,
    role: "note",
  });

  if (error) throw new Error(error.message);

  revalidatePath("/inbox");
}

export async function takeOverLead(leadId: string) {
  const profile = await getUserProfile();
  if (!profile) throw new Error("Unauthorized");

  const supabase = await createClient();

  // Try to update assigned_to — graceful fallback if column doesn't exist
  try {
    await supabase
      .from("leads")
      .update({ assigned_to: profile.id })
      .eq("id", leadId);
  } catch {
    // column may not exist yet — continue
  }

  const { error } = await supabase.from("messages").insert({
    lead_id: leadId,
    content: "Atendente assumiu a conversa.",
    role: "note",
  });

  if (error) throw new Error(error.message);

  revalidatePath("/inbox");
}
