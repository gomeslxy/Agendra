import { Suspense } from "react";
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
      .select("id, name, ai_name, ai_tone, ai_greeting, ai_forbidden, google_calendar_email, google_calendar_id, plan_type, subscription_status, stripe_customer_id")
      .eq("id", companyId)
      .maybeSingle(),
    supabase
      .from("memberships")
      .select("id, role, company_id, users(id, full_name, email)")
      .eq("company_id", companyId),
  ]);

  return (
    <Suspense fallback={<SettingsSkeleton />}>
      <SettingsShell
        company={company ?? null}
        memberships={memberships ?? []}
      />
    </Suspense>
  );
}

function SettingsSkeleton() {
  return (
    <div className="h-full overflow-y-auto px-8 py-7 flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <div className="h-8 w-48 animate-pulse rounded-lg bg-white/[0.07]" />
        <div className="h-4 w-64 animate-pulse rounded-md bg-white/[0.04]" />
      </div>
      <div className="flex gap-1.5">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="h-10 w-24 animate-pulse rounded-xl bg-white/[0.05]" />
        ))}
      </div>
      <div className="grid gap-6 lg:grid-cols-2">
        <div className="h-80 animate-pulse rounded-2xl bg-white/[0.04]" />
        <div className="h-64 animate-pulse rounded-2xl bg-white/[0.04]" />
      </div>
    </div>
  );
}
