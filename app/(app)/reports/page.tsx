import { redirect } from "next/navigation";
import { createClient, getUser, getCachedUserProfile } from "@/lib/supabase/server";
import { ReportsClient } from "./reports-client";
import { createAdminClient } from "@/lib/supabase/admin";
import { getPlanLimits, type PlanType } from "@/lib/billing/plans";

// Types for provider and chain stats
export interface ProviderStat {
  provider: 'cerebras' | 'groq' | 'sambanova' | 'gemini';
  requests_24h: number;
  requests_7d: number;
  successes_7d: number;
  avg_latency_ms: number;
  total_cost_7d: number;
}

export interface ChainStat {
  chain_kind: 'conv' | 'tools' | 'bg';
  count: number;
}

export default async function ReportsPage() {
  const user = await getUser();
  if (!user) redirect("/login");
  const profile = await getCachedUserProfile(user.id);
  const companyId = profile?.memberships?.[0]?.company_id;
  if (!companyId) redirect("/login");

  const supabase = await createClient();
  const since90 = new Date();
  since90.setDate(since90.getDate() - 90);

  const [{ data: leads }, { data: events }, { data: messages }, { data: transactions }, { data: recentPaidTxs }] = await Promise.all([
    supabase.from("leads")
      .select("id, status, channel, created_at, heat_score")
      .eq("company_id", companyId).gte("created_at", since90.toISOString()),
    supabase.from("events")
      .select("id, created_at, lead_id")
      .eq("company_id", companyId).gte("created_at", since90.toISOString()),
    supabase.from("messages")
      .select("id, role, created_at, lead_id")
      .eq("company_id", companyId).gte("created_at", since90.toISOString()),
    supabase.from("transactions")
      .select("id, amount, status, created_at, paid_at")
      .eq("company_id", companyId).gte("created_at", since90.toISOString()),
    supabase.from("transactions")
      .select("id, amount, status, paid_at, lead_id, lead:leads(name)")
      .eq("company_id", companyId)
      .eq("status", "paid")
      .order("paid_at", { ascending: false })
      .limit(10),
  ]);

  const allLeads        = leads        ?? [];
  const allEvents       = events       ?? [];
  const allMessages     = messages     ?? [];
  const allTransactions = transactions ?? [];

  // ── Build 90-day map ────────────────────────────────────────────
  const now = new Date();
  type DayBucket = {
    date: string; leads: number; hot: number; warm: number;
    cold: number; converted: number; events: number;
    messages: number; aiMessages: number;
    whatsapp: number; instagram: number; form: number;
    revenue: number; transactionCount: number;
    // Funnel gates (per-lead, bucketed by lead creation day → period-aware funnel).
    // fInteragiu/fAgendou require msg/event joins; qualificados/convertidos derive from hot+warm+converted.
    fInteragiu: number; fAgendou: number;
  };
  const dailyMap = new Map<string, DayBucket>();
  const dailyOrder: string[] = [];
  for (let i = 89; i >= 0; i--) {
    const d = new Date(now); d.setDate(d.getDate() - i);
    const k = d.toISOString().slice(0, 10);
    dailyMap.set(k, { date: k, leads: 0, hot: 0, warm: 0, cold: 0, converted: 0, events: 0, messages: 0, aiMessages: 0, whatsapp: 0, instagram: 0, form: 0, revenue: 0, transactionCount: 0, fInteragiu: 0, fAgendou: 0 });
    dailyOrder.push(k);
  }

  // ── Heatmap 7×24 ──────────────────────────────────────────────
  const heatGrid: number[][] = Array.from({ length: 7 }, () => new Array(24).fill(0));

  // ── Events by lead_id ────────────────────────────────────────
  for (const e of allEvents) {
    const k = e.created_at.slice(0, 10);
    const b = dailyMap.get(k);
    if (b) b.events++;
  }

  // ── Messages ─────────────────────────────────────────────────
  for (const m of allMessages) {
    const k = m.created_at.slice(0, 10);
    const b = dailyMap.get(k);
    if (b) { b.messages++; if (m.role === "assistant") b.aiMessages++; }
  }

  // ── Transactions ─────────────────────────────────────────────
  for (const t of allTransactions) {
    if (t.status !== "paid") continue;
    const k = (t.paid_at ?? t.created_at).slice(0, 10);
    const b = dailyMap.get(k);
    if (b) { b.revenue += Number(t.amount); b.transactionCount++; }
  }

  // ── Leads (main pass) ────────────────────────────────────────
  let heatSum = 0;
  for (const l of allLeads) {
    const k = l.created_at.slice(0, 10);
    const b = dailyMap.get(k);
    if (b) {
      b.leads++;
      if (l.status === "hot") b.hot++;
      else if (l.status === "warm") b.warm++;
      else if (l.status === "cold") b.cold++;
      else if (l.status === "success" || l.status === "converted") b.converted++;
      if (l.channel === "whatsapp") b.whatsapp++;
      else if (l.channel === "instagram") b.instagram++;
      else if (l.channel === "form") b.form++;
    }
    heatSum += l.heat_score ?? 0;
    const dt = new Date(l.created_at);
    heatGrid[dt.getDay()][dt.getHours()]++;
  }

  // ── Per-day funnel gates (period-aware, monotonic subsets) ───────
  // Resolve hasMsg/hasEvent per lead, then bucket cumulative gates by lead creation day.
  // Each gate is a strict superset of the next so the funnel never inverts:
  //   Captados ⊇ Interagiram ⊇ Qualificados ⊇ Agendaram ⊇ Convertidos
  const leadMeta = new Map<string, { hasMsg: boolean; hasEvent: boolean }>();
  for (const l of allLeads) leadMeta.set(l.id, { hasMsg: false, hasEvent: false });
  for (const m of allMessages) {
    const meta = m.lead_id && leadMeta.get(m.lead_id);
    if (meta) meta.hasMsg = true;
  }
  for (const e of allEvents) {
    const meta = e.lead_id && leadMeta.get(e.lead_id);
    if (meta) meta.hasEvent = true;
  }
  for (const l of allLeads) {
    const b = dailyMap.get(l.created_at.slice(0, 10));
    const meta = leadMeta.get(l.id);
    if (!b || !meta) continue;
    const isConv = l.status === "success" || l.status === "converted";
    const isQual = l.status === "hot" || l.status === "warm" || isConv;
    if (meta.hasMsg || isQual) b.fInteragiu++;
    if (isQual && (meta.hasEvent || isConv)) b.fAgendou++;
  }

  const dailyDetails = dailyOrder.map((d) => dailyMap.get(d)!);

  const heatmapData = heatGrid.flatMap((row, wd) =>
    row.map((value, hour) => ({ weekday: wd, hour, value }))
  );
  const avgHeatScore = allLeads.length > 0 ? Math.round(heatSum / allLeads.length) : 0;

  const totalRevenue90d = allTransactions
    .filter((t) => t.status === "paid")
    .reduce((s, t) => s + Number(t.amount), 0);
  const avgTicket = allTransactions.filter((t) => t.status === "paid").length > 0
    ? totalRevenue90d / allTransactions.filter((t) => t.status === "paid").length
    : 0;

    // Provider health analytics
    const adminClient = createAdminClient();
    const { data: companyData } = await adminClient.from('companies').select('plan_type').eq('id', companyId).single();
    const planLimits = getPlanLimits((companyData?.plan_type ?? 'trial') as PlanType);
    const hasAnalytics = planLimits.hasAnalytics ?? false;
    let providerStats: ProviderStat[] = [];
    let chainStats: ChainStat[] = [];
    if (hasAnalytics) {
      const since7d = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
      const since24h = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
      const { data: aiLogs } = await adminClient.from('ai_logs')
        .select('provider, chain_kind, latency_ms, cost, error, created_at')
        .eq('company_id', companyId)
        .gte('created_at', since7d)
        .not('provider', 'is', null);
      const logs = aiLogs ?? [];
      // Aggregate provider stats
      const PROVIDERS = ['cerebras', 'groq', 'sambanova', 'gemini'] as const;
      const providerMap = new Map<string, { req7d: number; req24h: number; successes: number; latencySum: number; latencyCount: number; costSum: number }>();
      for (const p of PROVIDERS) {
        providerMap.set(p, { req7d: 0, req24h: 0, successes: 0, latencySum: 0, latencyCount: 0, costSum: 0 });
      }
      for (const log of logs) {
        if (!log.provider) continue;
        const agg = providerMap.get(log.provider);
        if (!agg) continue;
        agg.req7d++;
        if (log.created_at >= since24h) agg.req24h++;
        if (!log.error) agg.successes++;
        if (log.latency_ms != null) { agg.latencySum += log.latency_ms; agg.latencyCount++; }
        if (log.cost != null) agg.costSum += log.cost;
      }
      providerStats = PROVIDERS.map((p) => {
        const agg = providerMap.get(p)!;
        return {
          provider: p,
          requests_24h: agg.req24h,
          requests_7d: agg.req7d,
          successes_7d: agg.successes,
          avg_latency_ms: agg.latencyCount > 0 ? Math.round(agg.latencySum / agg.latencyCount) : 0,
          total_cost_7d: parseFloat(agg.costSum.toFixed(6)),
        };
      });
      // Chain kind aggregation
      const chainMap = new Map<string, number>([['conv', 0], ['tools', 0], ['bg', 0]]);
      for (const log of logs) {
        if (log.chain_kind && chainMap.has(log.chain_kind)) {
          chainMap.set(log.chain_kind, (chainMap.get(log.chain_kind) ?? 0) + 1);
        }
      }
      chainStats = (['conv', 'tools', 'bg'] as const).map((k) => ({ chain_kind: k, count: chainMap.get(k) ?? 0 }));
    }

  return (
    <ReportsClient
      dailyDetails={dailyDetails}
      heatmapData={heatmapData}
      avgHeatScore={avgHeatScore}
      totalRevenue90d={totalRevenue90d}
      avgTicket={avgTicket}
      recentTransactions={(recentPaidTxs ?? []) as any}
      companyId={companyId}
      providerStats={providerStats}
      chainStats={chainStats}
      hasAnalytics={hasAnalytics}
    />
  );
}
