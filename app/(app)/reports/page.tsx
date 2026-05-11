import { redirect } from "next/navigation";
import { createClient, getUser, getCachedUserProfile } from "@/lib/supabase/server";
import { ReportsClient } from "./reports-client";

export default async function ReportsPage() {
  const user = await getUser();
  if (!user) redirect("/login");
  const profile = await getCachedUserProfile(user.id);
  const companyId = profile?.memberships?.[0]?.company_id;
  if (!companyId) redirect("/login");

  const supabase = await createClient();
  const since90 = new Date();
  since90.setDate(since90.getDate() - 90);

  const [{ data: leads }, { data: events }, { data: messages }] = await Promise.all([
    supabase.from("leads")
      .select("id, status, channel, created_at, heat_score")
      .eq("company_id", companyId).gte("created_at", since90.toISOString()),
    supabase.from("events")
      .select("id, created_at, lead_id")
      .eq("company_id", companyId).gte("created_at", since90.toISOString()),
    supabase.from("messages")
      .select("id, role, created_at, lead_id")
      .eq("company_id", companyId).gte("created_at", since90.toISOString()),
  ]);

  const allLeads   = leads    ?? [];
  const allEvents  = events   ?? [];
  const allMessages = messages ?? [];

  // ── Build 90-day map ────────────────────────────────────────────
  const now = new Date();
  type DayBucket = {
    date: string; leads: number; hot: number; warm: number;
    cold: number; converted: number; events: number;
    messages: number; aiMessages: number;
    whatsapp: number; instagram: number; form: number;
  };
  const dailyMap = new Map<string, DayBucket>();
  const dailyOrder: string[] = [];
  for (let i = 89; i >= 0; i--) {
    const d = new Date(now); d.setDate(d.getDate() - i);
    const k = d.toISOString().slice(0, 10);
    dailyMap.set(k, { date: k, leads: 0, hot: 0, warm: 0, cold: 0, converted: 0, events: 0, messages: 0, aiMessages: 0, whatsapp: 0, instagram: 0, form: 0 });
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

  const dailyDetails = dailyOrder.map((d) => dailyMap.get(d)!);

  // ── Funnel computed from full 90d data (passed to client for per-period slicing) ──
  // Client receives dailyDetails with per-day lead IDs not tracked here, so we pass
  // a funnelBuilder map instead: lead_id → { hasMsg, hasEvent, status }
  const leadMeta = new Map<string, { hasMsg: boolean; hasEvent: boolean; status: string; date: string }>();
  for (const l of allLeads) {
    leadMeta.set(l.id, { hasMsg: false, hasEvent: false, status: l.status, date: l.created_at.slice(0, 10) });
  }
  for (const m of allMessages) {
    if (m.lead_id && leadMeta.has(m.lead_id)) leadMeta.get(m.lead_id)!.hasMsg = true;
  }
  for (const e of allEvents) {
    if (e.lead_id && leadMeta.has(e.lead_id)) leadMeta.get(e.lead_id)!.hasEvent = true;
  }

  // Build 90d funnel (all-time within window) — client will recompute per period using dailyDetails
  const tot  = allLeads.length;
  const withMsg   = [...leadMeta.values()].filter((l) => l.hasMsg).length;
  const qualified = allLeads.filter((l) => l.status === "hot" || l.status === "warm").length;
  const withEvent = [...leadMeta.values()].filter((l) => l.hasEvent).length;
  const conv = allLeads.filter((l) => l.status === "success" || l.status === "converted").length;

  const funnelStages = [
    { label: "Captados",     value: tot,        color: "#3B82F6" },
    { label: "Interagiram",  value: withMsg,    color: "#8B5CF6" },
    { label: "Qualificados", value: qualified,  color: "#14B8A6" },
    { label: "Agendaram",    value: withEvent,  color: "#F59E0B" },
    { label: "Convertidos",  value: conv,       color: "#10B981" },
  ];

  const heatmapData = heatGrid.flatMap((row, wd) =>
    row.map((value, hour) => ({ weekday: wd, hour, value }))
  );
  const avgHeatScore = tot > 0 ? Math.round(heatSum / tot) : 0;

  return (
    <ReportsClient
      dailyDetails={dailyDetails}
      funnelStages={funnelStages}
      heatmapData={heatmapData}
      avgHeatScore={avgHeatScore}
    />
  );
}
