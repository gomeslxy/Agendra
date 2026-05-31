// app/admin/page.tsx
import { redirect } from "next/navigation";
import { getUser, getCachedUserProfile } from "@/lib/supabase/server";
import { cookies, headers } from "next/headers";
import crypto from "crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import { AdminDashboardClient } from "./admin-client";
import { PLANS_META } from "@/lib/billing/plans";

const DEFAULT_ADMIN_PASSWORD = "agendra-proprietario-2026";
const ADMIN_EMAILS = ["gmlucazz1@gmail.com", "la181009@gmail.com"];

function computeAdminToken(password: string, ip: string, ua: string): string {
  const fingerprint = `${ip}:${ua.substring(0, 128)}`;
  return crypto
    .createHmac("sha256", "agendra-admin-salt-2026")
    .update(`${password}:${fingerprint}`)
    .digest("hex");
}

/** Compute percentiles from a sorted numeric array */
function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const idx = Math.ceil((p / 100) * sorted.length) - 1;
  return sorted[Math.max(0, Math.min(idx, sorted.length - 1))];
}

export default async function AdminDashboardPage() {
  // Three-layer auth
  const user = await getUser();
  if (!user) redirect("/login?next=/admin");

  const allowedEmails = [
    ...(process.env.ADMIN_EMAIL ? [process.env.ADMIN_EMAIL] : []),
    ...ADMIN_EMAILS,
  ];
  if (!user.email || !allowedEmails.includes(user.email)) redirect("/inbox");

  const cookieStore = await cookies();
  const storedToken = cookieStore.get("agendra_admin_session")?.value;
  if (!storedToken) redirect("/admin/login");

  const headersList = await headers();
  const ip = headersList.get("x-forwarded-for")?.split(",")[0]?.trim() || headersList.get("x-real-ip") || "127.0.0.1";
  const ua = headersList.get("user-agent") || "unknown";
  const adminPassword = process.env.ADMIN_PASSWORD || DEFAULT_ADMIN_PASSWORD;
  const expectedToken = computeAdminToken(adminPassword, ip, ua);
  if (storedToken !== expectedToken) redirect("/admin/login");

  // ── Time windows ────────────────────────────────────────────────────────────
  const now = Date.now();
  const since7d  = new Date(now - 7  * 24 * 60 * 60 * 1000).toISOString();
  const since14d = new Date(now - 14 * 24 * 60 * 60 * 1000).toISOString();
  const since24h = new Date(now - 24 * 60 * 60 * 1000).toISOString();
  const since30d = new Date(now - 30 * 24 * 60 * 60 * 1000).toISOString();
  const staleLeadCutoff    = new Date(now - 10 * 60 * 1000).toISOString(); // 10 min ago
  const staleMsgCutoff     = new Date(now -  5 * 60 * 1000).toISOString(); //  5 min ago
  const startOfThisWeek    = new Date(now - 7  * 24 * 60 * 60 * 1000).toISOString();
  const startOfLastWeek    = new Date(now - 14 * 24 * 60 * 60 * 1000).toISOString();

  const adminClient = createAdminClient();

  // ── Parallel data fetch ──────────────────────────────────────────────────────
  const [
    { data: companies },
    { data: users },
    { data: unhealthyChannels },
    { data: allChannels },
    { data: aiLogs },
    { data: recentAiErrors },
    { data: auditLogs },
    { count: totalLeads },
    { count: totalMessages },
    { data: messages7d },
    { data: activeLeadCounts },
    { data: lastActivities },
    { data: staleLeads },
    { data: staleProcessed },
    { data: tokensByCompany },
    { data: intentDist },
    { count: convertedLast30d },
    { count: trialStart30d },
  ] = await Promise.all([
    adminClient
      .from("companies")
      .select("id, name, plan_type, subscription_status, onboarding_status, onboarding_applied_config, created_at, extra_leads")
      .order("created_at", { ascending: false }),

    adminClient
      .from("users")
      .select("id, email, full_name, created_at, company_id")
      .order("created_at", { ascending: false }),

    adminClient
      .from("channels")
      .select("id, company_id, provider, status, last_error, display_name")
      .eq("status", "error")
      .order("updated_at", { ascending: false }),

    adminClient
      .from("channels")
      .select("id, company_id, status, provider"),

    adminClient
      .from("ai_logs")
      .select("provider, latency_ms, cost, error, created_at, company_id, tokens_input, tokens_output")
      .gte("created_at", since7d),

    adminClient
      .from("ai_logs")
      .select("id, provider, error, created_at, company_id")
      .not("error", "is", null)
      .order("created_at", { ascending: false })
      .limit(10),

    adminClient
      .from("audit_logs")
      .select("id, actor_email, action, ip_address, user_agent, payload, created_at")
      .order("created_at", { ascending: false })
      .limit(50),

    adminClient.from("leads").select("id", { count: "exact", head: true }),

    adminClient.from("messages").select("id", { count: "exact", head: true }),

    // Messages per company in last 7d (for churn risk + tenant table)
    adminClient
      .from("messages")
      .select("company_id, id")
      .gte("created_at", since7d),

    // Active leads per company
    adminClient
      .from("leads")
      .select("company_id")
      .not("status", "eq", "closed"),

    // Last activity per company (latest message)
    adminClient
      .from("messages")
      .select("company_id, created_at")
      .order("created_at", { ascending: false })
      .limit(2000),

    // Stale processing locks: leads.is_processing=true AND updated_at < 10min ago
    adminClient
      .from("leads")
      .select("id, company_id, name, phone, updated_at")
      .eq("is_processing", true)
      .lt("updated_at", staleLeadCutoff),

    // Stale processed_messages (stuck in 'processing' > 5 min)
    adminClient
      .from("processed_messages")
      .select("provider_message_id, company_id, created_at, lead_id")
      .eq("status", "processing")
      .lt("created_at", staleMsgCutoff)
      .limit(20),

    // Tokens consumed per company 7d
    adminClient
      .from("ai_logs")
      .select("company_id, tokens_input, tokens_output")
      .gte("created_at", since7d)
      .not("tokens_input", "is", null),

    // Intent distribution 7d (from ai_decision_logs)
    adminClient
      .from("ai_decision_logs")
      .select("intent_detected")
      .gte("created_at", since7d)
      .not("intent_detected", "is", null),

    // Trial→paid conversions in last 30d
    adminClient
      .from("companies")
      .select("id", { count: "exact", head: true })
      .eq("subscription_status", "active")
      .gte("created_at", since30d),

    // Companies that started as trial in last 30d (denominator for conversion rate)
    adminClient
      .from("companies")
      .select("id", { count: "exact", head: true })
      .gte("created_at", since30d),
  ]);

  // ── Build channel maps ───────────────────────────────────────────────────────
  const channelsByCompany = new Map<string, { statuses: string[]; providers: string[] }>();
  for (const ch of allChannels ?? []) {
    const existing = channelsByCompany.get(ch.company_id) ?? { statuses: [], providers: [] };
    existing.statuses.push(ch.status);
    existing.providers.push(ch.provider);
    channelsByCompany.set(ch.company_id, existing);
  }

  // ── Messages per company (7d) ─────────────────────────────────────────────
  const msgs7dByCompany = new Map<string, number>();
  for (const m of messages7d ?? []) {
    msgs7dByCompany.set(m.company_id, (msgs7dByCompany.get(m.company_id) ?? 0) + 1);
  }

  // ── Active leads per company ──────────────────────────────────────────────
  const activeLeadsByCompany = new Map<string, number>();
  for (const l of activeLeadCounts ?? []) {
    activeLeadsByCompany.set(l.company_id, (activeLeadsByCompany.get(l.company_id) ?? 0) + 1);
  }

  // ── Last activity per company ─────────────────────────────────────────────
  const lastActivityByCompany = new Map<string, string>();
  for (const m of lastActivities ?? []) {
    if (!lastActivityByCompany.has(m.company_id)) {
      lastActivityByCompany.set(m.company_id, m.created_at);
    }
  }

  // ── Plan pricing map ──────────────────────────────────────────────────────
  const PLAN_MRR: Record<string, number> = {
    trial: 0,
    starter: PLANS_META.find((p) => p.id === "starter")?.monthly ?? 87,
    pro: PLANS_META.find((p) => p.id === "pro")?.monthly ?? 197,
    business: PLANS_META.find((p) => p.id === "business")?.monthly ?? 497,
  };

  // ── Safe companies ────────────────────────────────────────────────────────
  const safeCompanies = (companies ?? []).map((c) => {
    const ch = channelsByCompany.get(c.id) ?? { statuses: [], providers: [] };
    const ai_paused = ch.statuses.length > 0 && ch.statuses.every((s) => s === "paused");
    const hasError  = ch.statuses.some((s) => s === "error");
    const channelStatus = ch.statuses.length === 0 ? "none" : hasError ? "error" : ai_paused ? "paused" : "active";
    const ragOverride = (c.onboarding_applied_config as Record<string, unknown>)?.rag_override as boolean | undefined;
    const modelOverride = (c.onboarding_applied_config as Record<string, unknown>)?.model_override as string | undefined;

    return {
      id: c.id,
      name: c.name || "Sem Nome",
      plan_type: c.plan_type || "trial",
      subscription_status: c.subscription_status || "trial",
      onboarding_status: c.onboarding_status || "pending",
      ai_paused,
      channel_status: channelStatus,
      created_at: c.created_at,
      mrr: PLAN_MRR[c.plan_type ?? "trial"] ?? 0,
      msgs_7d: msgs7dByCompany.get(c.id) ?? 0,
      leads_active: activeLeadsByCompany.get(c.id) ?? 0,
      last_activity: lastActivityByCompany.get(c.id) ?? null,
      extra_leads: (c.extra_leads as number) ?? 0,
      rag_override: ragOverride,
      model_override: modelOverride,
    };
  });

  const safeUsers = (users ?? []).map((u) => ({
    id: u.id,
    email: u.email || "sem@email.com",
    full_name: u.full_name || "Sem Nome",
    created_at: u.created_at,
    company_id: u.company_id,
    company_name: safeCompanies.find((c) => c.id === u.company_id)?.name || "Sem Tenant",
  }));

  const safeUnhealthyChannels = (unhealthyChannels ?? []).map((ch) => ({
    id: ch.id,
    provider: ch.provider || "unknown",
    display_name: ch.display_name || "Sem Nome",
    last_error: ch.last_error || "Desconexão silenciosa",
    company_id: ch.company_id,
    company_name: safeCompanies.find((c) => c.id === ch.company_id)?.name || "Sem Tenant",
  }));

  // ── Provider stats with percentiles ──────────────────────────────────────
  const PROVIDERS = ["cerebras", "groq", "sambanova", "gemini"] as const;
  type ProviderKey = (typeof PROVIDERS)[number];
  const latenciesByProvider = new Map<ProviderKey, number[]>();
  for (const p of PROVIDERS) latenciesByProvider.set(p, []);

  const providerAgg = new Map<ProviderKey, { req7d: number; req24h: number; successes: number; costSum: number }>();
  for (const p of PROVIDERS) providerAgg.set(p, { req7d: 0, req24h: 0, successes: 0, costSum: 0 });

  for (const log of aiLogs ?? []) {
    const prov = (log.provider || "gemini") as ProviderKey;
    const agg = providerAgg.get(prov);
    if (!agg) continue;
    agg.req7d++;
    if (log.created_at >= since24h) agg.req24h++;
    if (!log.error) agg.successes++;
    if (log.cost != null) agg.costSum += log.cost;
    if (log.latency_ms != null) latenciesByProvider.get(prov)!.push(log.latency_ms);
  }

  const aggregatedProviders = PROVIDERS.map((p) => {
    const agg = providerAgg.get(p)!;
    const latencies = latenciesByProvider.get(p)!.sort((a, b) => a - b);
    return {
      provider: p,
      requests_24h: agg.req24h,
      requests_7d: agg.req7d,
      successes_7d: agg.successes,
      avg_latency_ms: latencies.length > 0 ? Math.round(latencies.reduce((s, v) => s + v, 0) / latencies.length) : 0,
      p50_ms: percentile(latencies, 50),
      p90_ms: percentile(latencies, 90),
      p99_ms: percentile(latencies, 99),
      total_cost_7d: parseFloat(agg.costSum.toFixed(6)),
    };
  });

  // ── Stale leads ───────────────────────────────────────────────────────────
  const safeStaleLeads = (staleLeads ?? []).map((l) => ({
    id: l.id,
    company_id: l.company_id,
    company_name: safeCompanies.find((c) => c.id === l.company_id)?.name || "Sem Tenant",
    name: l.name || "Lead sem nome",
    phone: l.phone || "—",
    locked_since: l.updated_at,
  }));

  const safeStaleMessages = (staleProcessed ?? []).map((m) => ({
    id: m.provider_message_id,
    company_id: m.company_id,
    company_name: safeCompanies.find((c) => c.id === m.company_id)?.name || "Sem Tenant",
    stuck_since: m.created_at,
    lead_id: m.lead_id,
  }));

  // ── Top 10 token consumers (7d) ───────────────────────────────────────────
  const tokenMap = new Map<string, number>();
  for (const row of tokensByCompany ?? []) {
    const total = (row.tokens_input ?? 0) + (row.tokens_output ?? 0);
    tokenMap.set(row.company_id, (tokenMap.get(row.company_id) ?? 0) + total);
  }
  const topTokenConsumers = Array.from(tokenMap.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([cid, tokens]) => ({
      company_id: cid,
      company_name: safeCompanies.find((c) => c.id === cid)?.name || "Sem Tenant",
      tokens_7d: tokens,
    }));

  // ── Intent distribution (7d) ──────────────────────────────────────────────
  const intentMap = new Map<string, number>();
  for (const row of intentDist ?? []) {
    if (row.intent_detected) {
      intentMap.set(row.intent_detected, (intentMap.get(row.intent_detected) ?? 0) + 1);
    }
  }
  const intentDistribution = Array.from(intentMap.entries())
    .sort((a, b) => b[1] - a[1])
    .map(([intent, count]) => ({ intent, count }));

  // ── Executive summary ─────────────────────────────────────────────────────
  const estimatedMRR = safeCompanies
    .filter((c) => c.subscription_status === "active")
    .reduce((sum, c) => sum + c.mrr, 0);

  const churnRiskCompanies = safeCompanies.filter((c) => {
    const isActive = c.subscription_status === "active" || c.plan_type !== "trial";
    return isActive && (msgs7dByCompany.get(c.id) ?? 0) === 0;
  });

  const newThisWeek = safeCompanies.filter((c) => c.created_at >= startOfThisWeek).length;
  const newLastWeek = safeCompanies.filter(
    (c) => c.created_at >= startOfLastWeek && c.created_at < startOfThisWeek
  ).length;
  const growthWoW = newLastWeek > 0 ? Math.round(((newThisWeek - newLastWeek) / newLastWeek) * 100) : 0;

  const trialConversionRate =
    (trialStart30d ?? 0) > 0
      ? Math.round(((convertedLast30d ?? 0) / (trialStart30d ?? 1)) * 100)
      : 0;

  const safeAuditLogs = (auditLogs ?? []).map((log) => ({
    id: log.id,
    actor_email: log.actor_email || "system@agendra.site",
    action: log.action || "audit_log_missing_action",
    ip_address: log.ip_address || "127.0.0.1",
    user_agent: log.user_agent || "system",
    payload: log.payload || {},
    created_at: log.created_at,
  }));

  const formattedRecentAiErrors = (recentAiErrors ?? []).map((err) => ({
    id: err.id,
    provider: err.provider || "unknown",
    error: err.error || "Desconhecido",
    created_at: err.created_at,
    company_name: safeCompanies.find((c) => c.id === err.company_id)?.name || "Sem Tenant",
  }));

  const since7dStr = since7d;
  const newCompanies7d = safeCompanies.filter((c) => c.created_at >= since7dStr).length;

  return (
    <AdminDashboardClient
      companies={safeCompanies}
      users={safeUsers}
      unhealthyChannels={safeUnhealthyChannels}
      providerStats={aggregatedProviders}
      recentAiErrors={formattedRecentAiErrors}
      auditLogs={safeAuditLogs}
      staleLeads={safeStaleLeads}
      staleMessages={safeStaleMessages}
      topTokenConsumers={topTokenConsumers}
      intentDistribution={intentDistribution}
      churnRiskCompanies={churnRiskCompanies.map((c) => c.id)}
      summary={{
        totalCompanies: safeCompanies.length,
        totalUsers: safeUsers.length,
        totalLeads: totalLeads ?? 0,
        totalMessages: totalMessages ?? 0,
        newCompanies7d,
        estimatedMRR,
        churnRiskCount: churnRiskCompanies.length,
        growthWoW,
        trialConversionRate,
      }}
    />
  );
}
