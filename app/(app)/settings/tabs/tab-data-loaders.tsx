import { createClient } from "@/lib/supabase/server";
import { getCompanyUsage } from "@/lib/billing/limits";
import { FeatureGate } from "../components/settings-shared";
import { Billing } from "../settings-billing";
import { LogsView } from "../settings-logs";
import { AccountTeamTab } from "./account-team-tab";
import { AiBrainTab } from "./ai-brain-tab";
import { AutomationTab } from "./automation-tab";
import { ChannelsTab } from "./channels-tab";
import { RulesHoursTab } from "./rules-hours-tab";
import { ServicesTab } from "./services-tab";
import type {
  AiDecisionLog,
  AuditLogRow,
  AutomationEvent,
  ChannelRow,
  Member,
  PendingInvitation,
  PromptVersion,
  SettingsCompany,
  SettingsService,
  SettingsTabId,
  WebhookSubscription,
} from "../types";

const COMPANY_FIELDS =
  "id, name, ai_name, ai_tone, ai_greeting, ai_forbidden, persona_config, google_calendar_email, google_calendar_id, plan_type, subscription_status, stripe_customer_id, cancel_at_period_end, current_period_end";

export async function SettingsTabLoader({
  tab,
  companyId,
  userRole,
}: {
  tab: SettingsTabId;
  companyId: string;
  userRole: string;
}) {
  const supabase = await createClient();
  const isReadOnly = userRole === "member";
  const isOwnerOrAdmin = userRole === "owner" || userRole === "admin";

  const { data: companyData } = await supabase
    .from("companies")
    .select(COMPANY_FIELDS)
    .eq("id", companyId)
    .maybeSingle();

  const company = (companyData as SettingsCompany | null) ?? null;

  if (tab === "account") {
    const [{ data: memberships }, { data: pendingInvitations }, { data: auditLogs }] = await Promise.all([
      supabase
        .from("memberships")
        .select("id, role, company_id, users(id, full_name, email)")
        .eq("company_id", companyId),
      supabase
        .from("invitations")
        .select("id, invited_email, role, status, expires_at, created_at, invited_by")
        .eq("company_id", companyId)
        .eq("status", "pending")
        .order("created_at", { ascending: false }),
      isOwnerOrAdmin
        ? supabase
            .from("audit_logs")
            .select("id, actor_email, action, ip_address, user_agent, payload, created_at")
            .eq("company_id", companyId)
            .order("created_at", { ascending: false })
            .limit(50)
        : Promise.resolve({ data: [] as AuditLogRow[] }),
    ]);

    return (
      <AccountTeamTab
        memberships={(memberships as Member[]) ?? []}
        company={company}
        pendingInvitations={(pendingInvitations as PendingInvitation[]) ?? []}
        isReadOnly={isReadOnly}
        currentUserRole={userRole}
        auditLogs={(auditLogs as AuditLogRow[]) ?? []}
      />
    );
  }

  if (tab === "rules") {
    return <RulesHoursTab company={company} isReadOnly={isReadOnly} />;
  }

  if (tab === "services") {
    const { data: services } = await supabase
      .from("services")
      .select("id, company_id, name, description, duration, price, active, is_paused, created_at, updated_at")
      .eq("company_id", companyId)
      .eq("active", true)
      .order("name");

    return (
      <ServicesTab
        companyId={company?.id}
        services={(services as SettingsService[]) ?? []}
        businessType={company?.persona_config?.business_type}
        isReadOnly={isReadOnly}
      />
    );
  }

  if (tab === "brain") {
    const [{ data: services }, { data: promptVersions }] = await Promise.all([
      supabase
        .from("services")
        .select("id, company_id, name, description, duration, price, active, is_paused, created_at, updated_at")
        .eq("company_id", companyId)
        .eq("active", true)
        .order("name"),
      supabase
        .from("prompt_versions")
        .select("id, version, ai_name, ai_tone, system_instructions, ai_forbidden, created_at, created_by")
        .eq("company_id", companyId)
        .order("version", { ascending: false })
        .limit(20),
    ]);

    return (
      <AiBrainTab
        company={company}
        services={(services as SettingsService[]) ?? []}
        planType={company?.plan_type}
        isReadOnly={isReadOnly}
        promptVersions={(promptVersions as PromptVersion[]) ?? []}
      />
    );
  }

  if (tab === "channels") {
    const [{ data: channels }, usage] = await Promise.all([
      supabase
        .from("channels")
        .select("id, provider, provider_id, status, last_error")
        .eq("company_id", companyId),
      getCompanyUsage(companyId).catch(() => null),
    ]);

    return (
      <ChannelsTab
        company={company}
        channels={(channels as ChannelRow[]) ?? []}
        usage={usage}
        isReadOnly={isReadOnly}
      />
    );
  }

  if (tab === "automation") {
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

    const [{ count: remindersToday }, { count: followupsWeek }, { data: automationEvents }, { data: webhooks }] =
      await Promise.all([
        supabase
          .from("reminders")
          .select("id", { count: "exact", head: true })
          .eq("company_id", companyId)
          .eq("status", "sent")
          .gte("created_at", todayStart.toISOString()),
        supabase
          .from("automation_events")
          .select("id", { count: "exact", head: true })
          .eq("company_id", companyId)
          .eq("type", "followup_sent")
          .gte("created_at", weekAgo.toISOString()),
        supabase
          .from("automation_events")
          .select("id, type, detail, lead_id, created_at")
          .eq("company_id", companyId)
          .order("created_at", { ascending: false })
          .limit(15),
        supabase
          .from("webhook_subscriptions")
          .select("id, url, event_types, label, is_active, created_at, last_fired_at, last_error")
          .eq("company_id", companyId),
      ]);

    return (
      <AutomationTab
        company={company}
        automationStats={{ remindersToday: remindersToday ?? 0, followupsWeek: followupsWeek ?? 0 }}
        automationEvents={(automationEvents as AutomationEvent[]) ?? []}
        webhooks={(webhooks as WebhookSubscription[]) ?? []}
        isReadOnly={isReadOnly}
      />
    );
  }

  if (tab === "logs") {
    const usage = await getCompanyUsage(companyId).catch(() => null);
    const aiLogsLimit = usage?.planType === "business" ? 50 : 30;
    const { data: aiLogsData } = usage?.limits?.hasAnalytics
      ? await supabase
          .from("ai_decision_logs")
          .select("id, lead_id, intent_detected, sentiment_score, urgency_detected, objection_handled, rationale, created_at, leads(name)")
          .eq("company_id", companyId)
          .order("created_at", { ascending: false })
          .limit(aiLogsLimit)
      : { data: [] as AiDecisionLog[] };

    return (
      <FeatureGate
        planType={company?.plan_type}
        requiredPlan="pro"
        title="Mente da IA (Explainability)"
        desc="Acompanhe em tempo real por que a IA tomou determinadas decisões e refine as orientações."
      >
        <LogsView
          logs={(aiLogsData as AiDecisionLog[]) ?? []}
          companyId={company?.id ?? null}
          planType={company?.plan_type}
        />
      </FeatureGate>
    );
  }

  // tab === "billing"
  const usage = await getCompanyUsage(companyId).catch(() => null);
  return <Billing company={company} usage={usage} isReadOnly={isReadOnly} />;
}
