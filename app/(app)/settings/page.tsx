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
export default async function SettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const user = await getUser();
  if (!user) redirect("/login");

  const profile = await getCachedUserProfile(user.id);
  const companyId = profile?.memberships?.[0]?.company_id;
  if (!companyId) redirect("/login");

  // Active tab drives which datasets we fetch — every panel renders client-side
  // from its own slice, so the inactive panels' queries are pure waste on TTFB.
  const tab = (await searchParams).tab || "account";

  const supabase = await createClient();

  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

  const usage = await getCompanyUsage(companyId).catch(() => null);

  // Per-tab data requirements. `company` + `usage` are always needed (plan gating).
  const needsMemberships = tab === "account";
  const needsChannels = tab === "channels";
  const needsServices = tab === "brain" || tab === "services";
  const needsLogs = tab === "logs";
  const needsAutomation = tab === "automation";
  const needsBrain = tab === "brain";

  const empty = Promise.resolve({ data: [] as any[] });
  const emptyCount = Promise.resolve({ count: 0 });

  const promptVersionsQuery = needsBrain
    ? supabase
        .from('prompt_versions')
        .select('id, version, ai_name, ai_tone, system_instructions, ai_forbidden, created_at, created_by')
        .eq('company_id', companyId)
        .order('version', { ascending: false })
        .limit(20)
    : empty;

  // Mente da IA fetch — Pro: 30 latest, Business: 50 latest (realtime augments client-side)
  const aiLogsLimit = usage?.planType === 'business' ? 50 : 30;
  const aiLogsQuery = needsLogs && usage?.limits?.hasAnalytics
    ? supabase
        .from('ai_decision_logs')
        .select('id, lead_id, intent_detected, sentiment_score, urgency_detected, objection_handled, rationale, created_at, leads(name)')
        .eq('company_id', companyId)
        .order('created_at', { ascending: false })
        .limit(aiLogsLimit)
    : empty;

  const userRole = profile?.memberships?.[0]?.role;
  const isOwnerOrAdmin = userRole === "owner" || userRole === "admin";
  const auditLogsQuery = needsMemberships && isOwnerOrAdmin
    ? supabase
        .from('audit_logs')
        .select('id, actor_email, action, ip_address, user_agent, payload, created_at')
        .eq('company_id', companyId)
        .order('created_at', { ascending: false })
        .limit(50)
    : empty;

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
    { data: auditLogsData },
    { data: promptVersionsData },
  ] = await Promise.all([
    supabase
      .from("companies")
      .select("id, name, ai_name, ai_tone, ai_greeting, ai_forbidden, persona_config, google_calendar_email, google_calendar_id, plan_type, subscription_status, stripe_customer_id, cancel_at_period_end, current_period_end")
      .eq("id", companyId)
      .maybeSingle(),
    needsMemberships
      ? supabase
          .from("memberships")
          .select("id, role, company_id, users(id, full_name, email)")
          .eq("company_id", companyId)
      : empty,
    needsChannels
      ? supabase
          .from("channels")
          .select("id, provider, provider_id, status, last_error")
          .eq("company_id", companyId)
      : empty,
    needsServices
      ? supabase
          .from("services")
          .select("id, company_id, name, description, duration, price, active, is_paused, created_at, updated_at")
          .eq("company_id", companyId)
          .eq("active", true)
          .order("name")
      : empty,
    aiLogsQuery,
    // Lembretes enviados hoje
    needsAutomation
      ? supabase
          .from('reminders')
          .select('id', { count: 'exact', head: true })
          .eq('company_id', companyId)
          .eq('status', 'sent')
          .gte('created_at', todayStart.toISOString())
      : emptyCount,
    // Follow-ups enviados na semana (via automation_events)
    needsAutomation
      ? supabase
          .from('automation_events')
          .select('id', { count: 'exact', head: true })
          .eq('company_id', companyId)
          .eq('type', 'followup_sent')
          .gte('created_at', weekAgo.toISOString())
      : emptyCount,
    // Feed de atividade recente
    needsAutomation
      ? supabase
          .from('automation_events')
          .select('id, type, detail, lead_id, created_at')
          .eq('company_id', companyId)
          .order('created_at', { ascending: false })
          .limit(15)
      : empty,
    needsAutomation
      ? supabase
          .from("webhook_subscriptions")
          .select("id, url, event_types, secret, label, is_active, created_at, last_fired_at, last_error")
          .eq("company_id", companyId)
      : empty,
    needsMemberships
      ? supabase
          .from("invitations")
          .select("id, invited_email, role, status, expires_at, created_at, invited_by")
          .eq("company_id", companyId)
          .eq("status", "pending")
          .order("created_at", { ascending: false })
      : empty,
    auditLogsQuery,
    promptVersionsQuery,
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
          currentUserRole={userRole ?? "member"}
          auditLogs={auditLogsData ?? []}
          promptVersions={promptVersionsData ?? []}
        />
      </Suspense>
  );

}

function SettingsSkeleton() {
  return (
    <div className="h-full overflow-y-auto px-4 pt-7 pb-[calc(72px+env(safe-area-inset-bottom,12px))] lg:px-8 lg:py-7 flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <div className="h-8 w-48 animate-pulse rounded-lg bg-[#F4F4F5]" />
        <div className="h-4 w-64 animate-pulse rounded-md bg-[#F4F4F5]" />
      </div>
      <div className="flex flex-col lg:flex-row gap-8 lg:gap-12 items-start">
        {/* Mobile tabs skeleton */}
        <div className="lg:hidden flex gap-1.5 w-full overflow-x-hidden">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-10 w-24 shrink-0 animate-pulse rounded-xl bg-[#F4F4F5]" />
          ))}
        </div>
        {/* Desktop sidebar skeleton */}
        <div className="hidden lg:flex flex-col w-64 shrink-0 gap-1.5">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="h-11 w-full animate-pulse rounded-xl bg-[#F4F4F5]" />
          ))}
        </div>
        {/* Content skeleton */}
        <div className="flex-1 w-full max-w-3xl flex flex-col gap-4">
          <div className="h-64 animate-pulse rounded-2xl bg-[#F4F4F5]" />
          <div className="h-40 animate-pulse rounded-2xl bg-[#F4F4F5]" />
        </div>
      </div>
    </div>
  );
}
