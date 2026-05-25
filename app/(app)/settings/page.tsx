import { Suspense } from "react";
import { redirect } from "next/navigation";
import { getUser, getCachedUserProfile, createClient } from "@/lib/supabase/server";
import { SettingsShell } from "./settings-shell";
import { getCompanyUsage } from "@/lib/billing/limits";
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: "Settings",
  description: "Configure your account, manage memberships, and view usage statistics.",
  robots: { index: false, follow: false }
};
export default async function SettingsPage() {
  const user = await getUser();
  if (!user) redirect("/login");

  const profile = await getCachedUserProfile(user.id);
  const companyId = profile?.memberships?.[0]?.company_id;
  if (!companyId) redirect("/login");

  const supabase = await createClient();

  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

  const usage = await getCompanyUsage(companyId).catch(() => null);

  const aiLogsQuery = usage?.limits?.hasAnalytics
    ? supabase
        .from('ai_decision_logs')
        .select('id, lead_id, intent_detected, sentiment_score, urgency_detected, objection_handled, rationale, created_at, leads(name)')
        .eq('company_id', companyId)
        .order('created_at', { ascending: false })
        .limit(20)
    : Promise.resolve({ data: [] as any[] });

  const [
    { data: company },
    { data: memberships },
    { data: channels },
    { data: servicesData },
    { data: aiLogsData },
    { count: remindersToday },
    { count: followupsWeek },
    { data: automationEventsData },
    { data: webhooksData },
    { data: pendingInvitationsData },
  ] = await Promise.all([
    supabase
      .from("companies")
      .select("id, name, ai_name, ai_tone, ai_greeting, ai_forbidden, persona_config, google_calendar_email, google_calendar_id, plan_type, subscription_status, stripe_customer_id, cancel_at_period_end, current_period_end")
      .eq("id", companyId)
      .maybeSingle(),
    supabase
      .from("memberships")
      .select("id, role, company_id, users(id, full_name, email)")
      .eq("company_id", companyId),
    supabase
      .from("channels")
      .select("id, provider, provider_id, status, last_error")
      .eq("company_id", companyId),
    supabase
      .from("services")
      .select("id, company_id, name, description, duration, price, active, is_paused, created_at, updated_at")
      .eq("company_id", companyId)
      .eq("active", true)
      .order("name"),
    aiLogsQuery,
    // Lembretes enviados hoje
    supabase
      .from('reminders')
      .select('id', { count: 'exact', head: true })
      .eq('company_id', companyId)
      .eq('status', 'sent')
      .gte('created_at', todayStart.toISOString()),
    // Follow-ups enviados na semana (via automation_events)
    supabase
      .from('automation_events')
      .select('id', { count: 'exact', head: true })
      .eq('company_id', companyId)
      .eq('type', 'followup_sent')
      .gte('created_at', weekAgo.toISOString()),
    // Feed de atividade recente
    supabase
      .from('automation_events')
      .select('id, type, detail, lead_id, created_at')
      .eq('company_id', companyId)
      .order('created_at', { ascending: false })
      .limit(15),
    supabase
      .from("webhook_subscriptions")
      .select("id, url, event_types, secret, label, is_active, created_at, last_fired_at, last_error")
      .eq("company_id", companyId),
    supabase
      .from("invitations")
      .select("id, invited_email, role, status, expires_at, created_at, invited_by")
      .eq("company_id", companyId)
      .eq("status", "pending")
      .order("created_at", { ascending: false }),
  ]);

  const services = servicesData ?? [];



  return (
    <Suspense fallback={<SettingsSkeleton />}>
      <SettingsShell
        company={company ?? null}
        memberships={memberships ?? []}
        channels={channels ?? []}
        services={services}
        usage={usage}
        aiLogs={aiLogsData ?? []}
        automationStats={{ remindersToday: remindersToday ?? 0, followupsWeek: followupsWeek ?? 0 }}
        automationEvents={automationEventsData ?? []}
        webhooks={webhooksData ?? []}
        pendingInvitations={pendingInvitationsData ?? []}
      />
    </Suspense>
  );
}

function SettingsSkeleton() {
  return (
    <div className="h-full overflow-y-auto px-4 pt-7 pb-[calc(72px+env(safe-area-inset-bottom,12px))] lg:px-8 lg:py-7 flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <div className="h-8 w-48 animate-pulse rounded-lg bg-white/[0.07]" />
        <div className="h-4 w-64 animate-pulse rounded-md bg-white/[0.04]" />
      </div>
      <div className="flex flex-col lg:flex-row gap-8 lg:gap-12 items-start">
        {/* Mobile tabs skeleton */}
        <div className="lg:hidden flex gap-1.5 w-full overflow-x-hidden">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-10 w-24 shrink-0 animate-pulse rounded-xl bg-white/[0.05]" />
          ))}
        </div>
        {/* Desktop sidebar skeleton */}
        <div className="hidden lg:flex flex-col w-64 shrink-0 gap-1.5">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="h-11 w-full animate-pulse rounded-xl bg-white/[0.05]" />
          ))}
        </div>
        {/* Content skeleton */}
        <div className="flex-1 w-full max-w-3xl flex flex-col gap-4">
          <div className="h-64 animate-pulse rounded-2xl bg-white/[0.04]" />
          <div className="h-40 animate-pulse rounded-2xl bg-white/[0.04]" />
        </div>
      </div>
    </div>
  );
}
