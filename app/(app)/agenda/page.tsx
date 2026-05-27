import { redirect } from "next/navigation";
import { createClient, getUser, getCachedUserProfile } from "@/lib/supabase/server";
import { AgendaClient } from "./agenda-client";

export default async function AgendaPage() {
  const user = await getUser();
  if (!user) redirect("/login");

  const profile = await getCachedUserProfile(user.id);
  const companyId = profile?.memberships?.[0]?.company_id;
  if (!companyId) redirect("/login");

  const supabase = await createClient();

  const { data: company } = await supabase
    .from("companies")
    .select("google_refresh_token, google_calendar_email, last_synced_at")
    .eq("id", companyId)
    .single();

  const gcalConnected = !!company?.google_refresh_token;
  const gcalEmail: string | null = company?.google_calendar_email ?? null;
  const lastSyncedAt: string | null = company?.last_synced_at ?? null;

  // P1 fix: staleness flag — passed to client so it auto-syncs client-side,
  // avoiding blocking the SSR render for up to 8 seconds.
  const isStale =
    gcalConnected &&
    (!lastSyncedAt ||
      Date.now() - new Date(lastSyncedAt).getTime() > 5 * 60 * 1000);

  const now = new Date();
  // Janela: 3 meses passados → 6 meses futuros. Garante que agendamentos de longa data aparecem.
  const startWindow = new Date(now.getFullYear(), now.getMonth() - 3, 1).toISOString();
  const endWindow = new Date(now.getFullYear(), now.getMonth() + 7, 0, 23, 59, 59).toISOString();

  const [{ data: events, error }, { data: leads }] = await Promise.all([
    supabase
      .from("events")
      .select("*, leads(name, status, phone)")
      .eq("company_id", companyId)
      .neq("status", "cancelled")          // ← P0 fix: never show cancelled events
      .gte("start_time", startWindow)
      .lte("start_time", endWindow)
      .order("start_time", { ascending: true }),
    supabase
      .from("leads")
      .select("id, name, status, phone")
      .eq("company_id", companyId)
      .order("name", { ascending: true })
      .limit(200),
  ]);

  if (error) {
    console.error("[AgendaPage] fetch error:", error.message);
  }

  return (
    <AgendaClient
      events={events ?? []}
      leads={leads ?? []}
      companyId={companyId}
      gcalConnected={gcalConnected}
      gcalEmail={gcalEmail}
      lastSyncedAt={lastSyncedAt}
      autoSync={isStale}
    />
  );
}
