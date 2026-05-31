// app/admin/page.tsx
import { redirect } from "next/navigation";
import { getUser } from "@/lib/supabase/server";
import { isAllowedAdminEmail, hasValidAdminCookie } from "@/lib/admin/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { AdminDashboardClient } from "./admin-client";
import { PLANS_META } from "@/lib/billing/plans";
import type { DailyPoint } from "./types";

/** Resolve a settled promise to its value or a fallback (audit P2 — one failing
 *  query must not take the whole dashboard down). */
function settled<T>(r: PromiseSettledResult<T>, fallback: T): T {
  return r.status === "fulfilled" ? r.value : fallback;
}
const num = (v: unknown): number => (v == null ? 0 : Number(v));

export default async function AdminDashboardPage() {
  // ── Auth (Supabase session + email allowlist + fingerprinted cookie) ─────────
  const user = await getUser();
  if (!user) redirect("/login?next=/admin");
  if (!isAllowedAdminEmail(user.email)) redirect("/inbox");
  if (!(await hasValidAdminCookie())) redirect("/admin/login");

  // ── Time windows ─────────────────────────────────────────────────────────────
  const now = Date.now();
  const since7d  = new Date(now - 7  * 24 * 60 * 60 * 1000).toISOString();
  const since14d = new Date(now - 14 * 24 * 60 * 60 * 1000).toISOString();
  const since24h = new Date(now - 24 * 60 * 60 * 1000).toISOString();
  const since30d = new Date(now - 30 * 24 * 60 * 60 * 1000).toISOString();
  const startOfToday = new Date(new Date().setHours(0, 0, 0, 0)).toISOString();
  const staleLeadCutoff = new Date(now - 10 * 60 * 1000).toISOString();
  const staleMsgCutoff  = new Date(now -  5 * 60 * 1000).toISOString();
  const startOfThisWeek = since7d;
  const startOfLastWeek = since14d;

  const adminClient = createAdminClient();

  // ── Parallel data fetch — aggregations pushed to SQL RPCs (audit P1) ─────────
  const results = await Promise.allSettled([
    /* 0 */ adminClient
      .from("companies")
      .select("id, name, plan_type, subscription_status, onboarding_status, onboarding_applied_config, created_at, extra_leads, stripe_subscription_id, cancel_at_period_end, current_period_end"),
    /* 1 */ adminClient
      .from("users")
      .select("id, email, full_name, created_at, company_id")
      .order("created_at", { ascending: false })
      .limit(1000),
    /* 2 */ adminClient
      .from("channels")
      .select("id, company_id, provider, status, last_error, display_name")
      .eq("status", "error")
      .order("updated_at", { ascending: false }),
    /* 3 */ adminClient.from("channels").select("id, company_id, status, provider"),
    /* 4 */ adminClient
      .from("ai_logs")
      .select("id, provider, error, created_at, company_id")
      .not("error", "is", null)
      .order("created_at", { ascending: false })
      .limit(10),
    /* 5 */ adminClient
      .from("audit_logs")
      .select("id, actor_email, action, ip_address, user_agent, payload, created_at")
      .order("created_at", { ascending: false })
      .limit(200),
    /* 6 */ adminClient.from("leads").select("id", { count: "exact", head: true }),
    /* 7 */ adminClient.from("messages").select("id", { count: "exact", head: true }),
    /* 8 */ adminClient
      .from("leads")
      .select("id, company_id, name, phone, updated_at")
      .eq("is_processing", true)
      .lt("updated_at", staleLeadCutoff),
    /* 9 */ adminClient
      .from("processed_messages")
      .select("provider_message_id, company_id, created_at, lead_id")
      .eq("status", "processing")
      .lt("created_at", staleMsgCutoff)
      .limit(20),
    /* 10 */ adminClient.rpc("admin_msgs_per_company", { p_since: since7d }),
    /* 11 */ adminClient.rpc("admin_active_leads_per_company"),
    /* 12 */ adminClient.rpc("admin_last_activity_per_company"),
    /* 13 */ adminClient.rpc("admin_tokens_per_company", { p_since: since7d }),
    /* 14 */ adminClient.rpc("admin_intent_distribution", { p_since: since7d }),
    /* 15 */ adminClient.rpc("admin_provider_stats", { p_since: since7d, p_since_24h: since24h }),
    /* 16 */ adminClient.rpc("admin_ai_error_daily", { p_since: since7d }),
  ]);

  const companies      = settled(results[0] as any, { data: [] }).data ?? [];
  const users          = settled(results[1] as any, { data: [] }).data ?? [];
  const unhealthyRows  = settled(results[2] as any, { data: [] }).data ?? [];
  const allChannels    = settled(results[3] as any, { data: [] }).data ?? [];
  const recentAiErrors = settled(results[4] as any, { data: [] }).data ?? [];
  const auditLogs      = settled(results[5] as any, { data: [] }).data ?? [];
  const totalLeads     = settled(results[6] as any, { count: 0 }).count ?? 0;
  const totalMessages  = settled(results[7] as any, { count: 0 }).count ?? 0;
  const staleLeads     = settled(results[8] as any, { data: [] }).data ?? [];
  const staleProcessed = settled(results[9] as any, { data: [] }).data ?? [];
  const msgsAgg        = settled(results[10] as any, { data: [] }).data ?? [];
  const leadsAgg       = settled(results[11] as any, { data: [] }).data ?? [];
  const lastActAgg     = settled(results[12] as any, { data: [] }).data ?? [];
  const tokensAgg      = settled(results[13] as any, { data: [] }).data ?? [];
  const intentAgg      = settled(results[14] as any, { data: [] }).data ?? [];
  const providerAgg    = settled(results[15] as any, { data: [] }).data ?? [];
  const aiErrorDailyR  = settled(results[16] as any, { data: [] }).data ?? [];

  // ── Maps from aggregations ────────────────────────────────────────────────────
  const msgs7dByCompany      = new Map<string, number>((msgsAgg as any[]).map((r) => [r.company_id, num(r.cnt)]));
  const activeLeadsByCompany = new Map<string, number>((leadsAgg as any[]).map((r) => [r.company_id, num(r.cnt)]));
  const lastActivityByCompany = new Map<string, string>((lastActAgg as any[]).map((r) => [r.company_id, r.last_at]));
  const tokenMap             = new Map<string, number>((tokensAgg as any[]).map((r) => [r.company_id, num(r.tokens)]));

  // ── Channel maps ──────────────────────────────────────────────────────────────
  const channelsByCompany = new Map<string, { statuses: string[]; providers: string[] }>();
  for (const ch of allChannels as any[]) {
    const e = channelsByCompany.get(ch.company_id) ?? { statuses: [], providers: [] };
    e.statuses.push(ch.status);
    e.providers.push(ch.provider);
    channelsByCompany.set(ch.company_id, e);
  }

  // ── Plan pricing ──────────────────────────────────────────────────────────────
  const PLAN_MRR: Record<string, number> = {
    trial: 0,
    starter: PLANS_META.find((p) => p.id === "starter")?.monthly ?? 87,
    pro: PLANS_META.find((p) => p.id === "pro")?.monthly ?? 197,
    business: PLANS_META.find((p) => p.id === "business")?.monthly ?? 497,
  };

  // ── Safe companies ────────────────────────────────────────────────────────────
  const safeCompanies = (companies as any[]).map((c) => {
    const ch = channelsByCompany.get(c.id) ?? { statuses: [], providers: [] };
    const ai_paused = ch.statuses.length > 0 && ch.statuses.every((s: string) => s === "paused");
    const hasError  = ch.statuses.some((s: string) => s === "error");
    const channelStatus = ch.statuses.length === 0 ? "none" : hasError ? "error" : ai_paused ? "paused" : "active";
    const cfg = (c.onboarding_applied_config as Record<string, unknown>) ?? {};
    const mrr = PLAN_MRR[c.plan_type ?? "trial"] ?? 0;
    // Revenue is only "real" when backed by a Stripe subscription (audit M1).
    const mrr_real = c.subscription_status === "active" && !!c.stripe_subscription_id;
    return {
      id: c.id,
      name: c.name || "Sem Nome",
      plan_type: c.plan_type || "trial",
      subscription_status: c.subscription_status || "trial",
      onboarding_status: c.onboarding_status || "pending",
      ai_paused,
      channel_status: channelStatus,
      created_at: c.created_at,
      mrr,
      mrr_real,
      msgs_7d: msgs7dByCompany.get(c.id) ?? 0,
      leads_active: activeLeadsByCompany.get(c.id) ?? 0,
      last_activity: lastActivityByCompany.get(c.id) ?? null,
      extra_leads: (c.extra_leads as number) ?? 0,
      rag_override: cfg.rag_override as boolean | undefined,
      model_override: cfg.model_override as string | undefined,
      _cancel_at_period_end: !!c.cancel_at_period_end,
    };
  });
  const nameById = new Map<string, string>(safeCompanies.map((c) => [c.id, c.name]));

  const safeUsers = (users as any[]).map((u) => ({
    id: u.id,
    email: u.email || "sem@email.com",
    full_name: u.full_name || "Sem Nome",
    created_at: u.created_at,
    company_id: u.company_id,
    company_name: nameById.get(u.company_id) || "Sem Tenant",
  }));

  const safeUnhealthyChannels = (unhealthyRows as any[]).map((ch) => ({
    id: ch.id,
    provider: ch.provider || "unknown",
    display_name: ch.display_name || "Sem Nome",
    last_error: ch.last_error || "Desconexão silenciosa",
    company_id: ch.company_id,
    company_name: nameById.get(ch.company_id) || "Sem Tenant",
  }));

  // ── Provider stats (percentiles already computed in SQL) ──────────────────────
  const aggregatedProviders = (providerAgg as any[]).map((p) => ({
    provider: p.provider,
    requests_24h: num(p.requests_24h),
    requests_7d: num(p.requests_7d),
    successes_7d: num(p.successes_7d),
    avg_latency_ms: Math.round(num(p.avg_latency)),
    p50_ms: Math.round(num(p.p50_ms)),
    p90_ms: Math.round(num(p.p90_ms)),
    p99_ms: Math.round(num(p.p99_ms)),
    total_cost_7d: parseFloat(num(p.cost_7d).toFixed(6)),
  }));

  // ── Stale ─────────────────────────────────────────────────────────────────────
  const safeStaleLeads = (staleLeads as any[]).map((l) => ({
    id: l.id,
    company_id: l.company_id,
    company_name: nameById.get(l.company_id) || "Sem Tenant",
    name: l.name || "Lead sem nome",
    phone: l.phone || "—",
    locked_since: l.updated_at,
  }));
  const safeStaleMessages = (staleProcessed as any[]).map((m) => ({
    id: m.provider_message_id,
    company_id: m.company_id,
    company_name: nameById.get(m.company_id) || "Sem Tenant",
    stuck_since: m.created_at,
    lead_id: m.lead_id,
  }));

  // ── Top token consumers ───────────────────────────────────────────────────────
  const topTokenConsumers = Array.from(tokenMap.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([cid, tokens]) => ({ company_id: cid, company_name: nameById.get(cid) || "Sem Tenant", tokens_7d: tokens }));

  // ── Intent distribution ───────────────────────────────────────────────────────
  const intentDistribution = (intentAgg as any[]).map((r) => ({ intent: r.intent, count: num(r.cnt) }));

  // ── AI error daily ────────────────────────────────────────────────────────────
  const aiErrorDaily: DailyPoint[] = (aiErrorDailyR as any[]).map((r) => ({
    day: r.day, total: num(r.total), errors: num(r.errors),
  }));

  // ── Executive metrics (from the authoritative companies list) ─────────────────
  // MRR: recognized revenue only (Stripe-backed active subs).
  const estimatedMRR = safeCompanies.filter((c) => c.mrr_real).reduce((s, c) => s + c.mrr, 0);
  // Manual overrides (active w/o Stripe) tracked separately — NOT counted as MRR.
  const unverified = safeCompanies.filter((c) => c.subscription_status === "active" && !c.mrr_real);
  const unverifiedMRR = unverified.reduce((s, c) => s + c.mrr, 0);

  const churnRiskCompanies = safeCompanies.filter((c) => {
    const isActive = c.mrr_real || c.plan_type !== "trial";
    return isActive && (msgs7dByCompany.get(c.id) ?? 0) === 0;
  });

  const canceledCount = safeCompanies.filter((c) =>
    ["canceled", "incomplete_expired", "past_due"].includes(c.subscription_status)
  ).length;
  const pendingCancelCount = safeCompanies.filter((c) => c.mrr_real && c._cancel_at_period_end).length;

  const newToday = safeCompanies.filter((c) => c.created_at >= startOfToday).length;
  const newThisWeek = safeCompanies.filter((c) => c.created_at >= startOfThisWeek).length;
  const newLastWeek = safeCompanies.filter((c) => c.created_at >= startOfLastWeek && c.created_at < startOfThisWeek).length;
  const growthWoW = newLastWeek > 0 ? Math.round(((newThisWeek - newLastWeek) / newLastWeek) * 100) : 0;

  // 30d cohort conversion: of companies created in the last 30d, how many are
  // now paying (Stripe-backed) — honest denominator (audit M2).
  const cohort30d = safeCompanies.filter((c) => c.created_at >= since30d);
  const cohortConverted = cohort30d.filter((c) => c.mrr_real).length;
  const trialConversionRate = cohort30d.length > 0 ? Math.round((cohortConverted / cohort30d.length) * 100) : 0;

  const newCompanies7d = newThisWeek;

  const safeAuditLogs = (auditLogs as any[]).map((log) => ({
    id: log.id,
    actor_email: log.actor_email || "system@agendra.site",
    action: log.action || "audit_log_missing_action",
    ip_address: log.ip_address || "—",
    user_agent: log.user_agent || "system",
    payload: log.payload || {},
    created_at: log.created_at,
  }));

  const formattedRecentAiErrors = (recentAiErrors as any[]).map((err) => ({
    id: err.id,
    provider: err.provider || "unknown",
    error: err.error || "Desconhecido",
    created_at: err.created_at,
    company_name: nameById.get(err.company_id) || "Sem Tenant",
  }));

  // Strip internal-only field before sending to the client.
  const clientCompanies = safeCompanies.map(({ _cancel_at_period_end, ...c }) => c);

  return (
    <AdminDashboardClient
      companies={clientCompanies}
      users={safeUsers}
      unhealthyChannels={safeUnhealthyChannels}
      providerStats={aggregatedProviders}
      recentAiErrors={formattedRecentAiErrors}
      auditLogs={safeAuditLogs}
      staleLeads={safeStaleLeads}
      staleMessages={safeStaleMessages}
      topTokenConsumers={topTokenConsumers}
      intentDistribution={intentDistribution}
      aiErrorDaily={aiErrorDaily}
      churnRiskCompanies={churnRiskCompanies.map((c) => c.id)}
      summary={{
        totalCompanies: safeCompanies.length,
        totalUsers: safeUsers.length,
        totalLeads: totalLeads ?? 0,
        totalMessages: totalMessages ?? 0,
        newCompanies7d,
        newToday,
        estimatedMRR,
        unverifiedMRR,
        unverifiedMRRCount: unverified.length,
        churnRiskCount: churnRiskCompanies.length,
        canceledCount,
        pendingCancelCount,
        growthWoW,
        trialConversionRate,
        generatedAt: new Date().toISOString(),
      }}
    />
  );
}
