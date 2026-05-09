import { redirect } from "next/navigation";
import { getUser, getCachedUserProfile, createClient } from "@/lib/supabase/server";
import { SettingsShell } from "./settings-shell";

export default async function SettingsPage() {
  const user = await getUser();
  if (!user) redirect("/login");

  const profile = await getCachedUserProfile(user.id);
  const companyId = profile?.memberships?.[0]?.company_id;
  if (!companyId) redirect("/login");

  const supabase = await createClient();

  const [{ data: company }, { data: memberships }] = await Promise.all([
    supabase
      .from("companies")
      .select("id, name, ai_name, ai_tone, ai_greeting, ai_forbidden")
      .eq("id", companyId)
      .maybeSingle(),
    supabase
      .from("memberships")
      .select("id, role, company_id, users(id, full_name, email)")
      .eq("company_id", companyId),
  ]);

  return (
    <SettingsShell
      company={company ?? null}
      memberships={memberships ?? []}
    />
  );
}
