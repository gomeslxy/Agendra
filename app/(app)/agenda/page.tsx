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

  const now = new Date();
  const startOfPrevMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1).toISOString();
  const endOfNextMonth = new Date(now.getFullYear(), now.getMonth() + 2, 0, 23, 59, 59).toISOString();

  // Parallel fetch — events and leads don't depend on each other
  const [{ data: events, error }, { data: leads }] = await Promise.all([
    supabase
      .from("events")
      .select("*, leads(name, status, phone)")
      .eq("company_id", companyId)
      .gte("start_time", startOfPrevMonth)
      .lte("start_time", endOfNextMonth)
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

  return <AgendaClient events={events ?? []} leads={leads ?? []} companyId={companyId} />;
}
