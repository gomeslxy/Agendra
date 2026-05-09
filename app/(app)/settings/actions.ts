"use server";

import { createClient, getUserProfile } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";

export async function updatePersona(formData: FormData) {
  const profile = await getUserProfile();
  if (!profile) throw new Error("Unauthorized");

  const companyId = profile.memberships?.[0]?.company_id;
  if (!companyId) throw new Error("No company");

  const supabase = await createClient();

  const { error } = await supabase
    .from("companies")
    .update({
      ai_name: formData.get("ai_name") as string,
      ai_tone: formData.get("ai_tone") as string,
      ai_greeting: formData.get("ai_greeting") as string,
      ai_forbidden: formData.get("ai_forbidden") as string,
    })
    .eq("id", companyId);

  if (error) throw new Error(error.message);

  revalidatePath("/settings");
}
