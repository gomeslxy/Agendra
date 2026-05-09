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

  // Limit to last 90 days for performance
  const ninetyDaysAgo = new Date();
  ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);
  const since = ninetyDaysAgo.toISOString();

  const [
    { data: leads },
    { data: events },
    { data: messages },
  ] = await Promise.all([
    supabase
      .from("leads")
      .select("id, status, channel, created_at, heat_score")
      .eq("company_id", companyId)
      .gte("created_at", since),
    supabase
      .from("events")
      .select("id, created_at, start_time")
      .eq("company_id", companyId)
      .gte("created_at", since),
    supabase
      .from("messages")
      .select("id, role, created_at")
      .eq("company_id", companyId)
      .gte("created_at", since),
  ]);

  const allLeads = leads ?? [];
  const allEvents = events ?? [];
  const allMessages = messages ?? [];

  const totalLeads = allLeads.length;
  const totalEvents = allEvents.length;
  const totalMessages = allMessages.length;

  // Single pass over leads: count by status, by channel, accumulate heat_score, daily counts
  // Reduces from O(7n) (5 filters + reduce + dailyLeads inner filter×14) to O(n).
  let hotLeads = 0, warmLeads = 0, coldLeads = 0, converted = 0;
  let chWa = 0, chIg = 0, chForm = 0;
  let heatSum = 0;

  // Build daily bucket map for last 14 days
  const now = new Date();
  const dailyMap = new Map<string, number>();
  const dailyOrder: string[] = [];
  for (let i = 13; i >= 0; i--) {
    const d = new Date(now);
    d.setDate(d.getDate() - i);
    const dateStr = d.toISOString().split("T")[0];
    dailyMap.set(dateStr, 0);
    dailyOrder.push(dateStr);
  }

  for (const l of allLeads) {
    if (l.status === "hot") hotLeads++;
    else if (l.status === "warm") warmLeads++;
    else if (l.status === "cold") coldLeads++;
    else if (l.status === "success") converted++;

    if (l.channel === "whatsapp") chWa++;
    else if (l.channel === "instagram") chIg++;
    else if (l.channel === "form") chForm++;

    heatSum += l.heat_score ?? 0;

    const dayKey = l.created_at.slice(0, 10);
    if (dailyMap.has(dayKey)) dailyMap.set(dayKey, (dailyMap.get(dayKey) ?? 0) + 1);
  }

  const conversionRate = totalLeads > 0 ? Math.round((converted / totalLeads) * 100) : 0;

  let aiMessages = 0;
  for (const m of allMessages) if (m.role === "assistant") aiMessages++;

  const byChannel = [
    { channel: "whatsapp", label: "WhatsApp", count: chWa },
    { channel: "instagram", label: "Instagram", count: chIg },
    { channel: "form", label: "Formulário", count: chForm },
  ];

  const byStatus = [
    { label: "Quente", status: "hot", count: hotLeads, color: "#F97316" },
    { label: "Morno", status: "warm", count: warmLeads, color: "#F59E0B" },
    { label: "Frio", status: "cold", count: coldLeads, color: "#60A5FA" },
    { label: "Convertido", status: "success", count: converted, color: "#14B8A6" },
  ];

  const dailyLeads = dailyOrder.map((date) => ({ date, count: dailyMap.get(date) ?? 0 }));

  const avgHeatScore = totalLeads > 0 ? Math.round(heatSum / totalLeads) : 0;

  return (
    <ReportsClient
      totalLeads={totalLeads}
      hotLeads={hotLeads}
      warmLeads={warmLeads}
      coldLeads={coldLeads}
      converted={converted}
      conversionRate={conversionRate}
      totalEvents={totalEvents}
      totalMessages={totalMessages}
      aiMessages={aiMessages}
      avgHeatScore={avgHeatScore}
      byChannel={byChannel}
      byStatus={byStatus}
      dailyLeads={dailyLeads}
    />
  );
}
