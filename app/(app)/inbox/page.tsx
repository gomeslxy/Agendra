import { redirect } from "next/navigation";
import { getUser, getCachedUserProfile, createClient } from "@/lib/supabase/server";
import { InboxClient } from "./inbox-client";
import type { Lead, Message, Event } from "@/lib/types/database";

export interface LeadWithMessages extends Lead {
  messages: Message[];
  next_event?: Pick<Event, 'id' | 'title' | 'start_time' | 'end_time'> | null;
}

export default async function InboxPage() {
  const user = await getUser();
  if (!user) redirect("/login");

  const profile = await getCachedUserProfile(user.id);
  const companyId = profile?.memberships?.[0]?.company_id;
  if (!companyId) redirect("/login");

  const supabase = await createClient();

  const [{ data, error }, { data: events }] = await Promise.all([
    supabase
      .from("leads")
      .select(`*, messages(id, lead_id, company_id, content, role, metadata, created_at)`)
      .eq("company_id", companyId)
      .order("updated_at", { ascending: false })
      .order("created_at", { foreignTable: "messages", ascending: false })
      .limit(50, { foreignTable: "messages" })
      .limit(30),
    supabase
      .from("events")
      .select("id, lead_id, title, start_time, end_time")
      .eq("company_id", companyId)
      .gte("start_time", new Date().toISOString())
      .order("start_time", { ascending: true }),
  ]);

  // Forward any fetch error to the client UI

  // Index upcoming events by lead_id (first/nearest one per lead)
  const eventByLead = new Map<string, { id: string; title: string; start_time: string; end_time: string }>();
  for (const e of events ?? []) {
    if (e.lead_id && !eventByLead.has(e.lead_id)) {
      eventByLead.set(e.lead_id, { id: e.id, title: e.title, start_time: e.start_time, end_time: e.end_time });
    }
  }

  const leads: LeadWithMessages[] = (data ?? []).map((l) => {
    const reversedMessages = ((l.messages ?? []) as Message[]).reverse();
    return {
      ...l,
      messages: reversedMessages,
      next_event: eventByLead.get(l.id) ?? null,
    };
  });

  return <InboxClient leads={leads} companyId={companyId} fetchError={error?.message ?? null} />;
}
