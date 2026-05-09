"use server";

import { createClient, getUserProfile } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { isValidUuid } from "@/lib/utils";

export async function createEvent(formData: FormData) {
  const profile = await getUserProfile();
  if (!profile) throw new Error("Unauthorized");

  const companyId = profile.memberships?.[0]?.company_id;
  if (!companyId || !isValidUuid(companyId)) throw new Error("No company");

  const leadId = (formData.get("lead_id") as string | null)?.trim() || null;
  const title = (formData.get("title") as string | null)?.trim() ?? "";
  const startTime = (formData.get("start_time") as string | null)?.trim() ?? "";
  const endTime = (formData.get("end_time") as string | null)?.trim() ?? "";

  if (!title || title.length > 300) throw new Error("Título inválido");
  if (leadId && !isValidUuid(leadId)) throw new Error("lead_id inválido");

  const start = new Date(startTime);
  const end = new Date(endTime);

  if (isNaN(start.getTime()) || isNaN(end.getTime())) {
    throw new Error("Data/hora inválida");
  }
  if (end <= start) throw new Error("end_time deve ser posterior a start_time");

  const supabase = await createClient();
  const { error } = await supabase.from("events").insert({
    company_id: companyId,
    lead_id: leadId,
    title,
    start_time: start.toISOString(),
    end_time: end.toISOString(),
  });

  if (error) throw new Error(error.message);

  revalidatePath("/agenda");
}

export async function deleteEvent(eventId: string) {
  if (!isValidUuid(eventId)) throw new Error("eventId inválido");

  const profile = await getUserProfile();
  if (!profile) throw new Error("Unauthorized");

  const companyId = profile.memberships?.[0]?.company_id;
  if (!companyId || !isValidUuid(companyId)) throw new Error("No company");

  const supabase = await createClient();
  const { error } = await supabase
    .from("events")
    .delete()
    .eq("id", eventId)
    .eq("company_id", companyId);

  if (error) throw new Error(error.message);

  revalidatePath("/agenda");
}
