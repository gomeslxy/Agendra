import { Suspense } from "react";
import { redirect } from "next/navigation";
import { getUser, getCachedUserProfile, createClient, resolveProfileCompanyId } from "@/lib/supabase/server";
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
  const companyId = await resolveProfileCompanyId(profile);
  if (!companyId) redirect("/login");

  const supabase = await createClient();

  const [{ data, error }, { data: events }] = await Promise.all([
    supabase
      .from("leads")
      .select(`*, messages(id, lead_id, company_id, content, role, metadata, created_at)`)
      .eq("company_id", companyId)
      .order("last_message_at", { ascending: false, nullsFirst: false })
      .order("updated_at", { ascending: false })
      .order("created_at", { referencedTable: "messages", ascending: false })
      .limit(50, { referencedTable: "messages" })
      .limit(100),
    supabase
      .from("events")
      .select("id, lead_id, title, start_time, end_time")
      .eq("company_id", companyId)
      .gte("start_time", new Date().toISOString())
      .order("start_time", { ascending: true })
      .limit(200),
  ]);

  // Batch-sign media URLs in a single Storage request via RLS-bound client.
  const mediaPaths = new Set<string>();
  for (const lead of data ?? []) {
    for (const msg of lead.messages ?? []) {
      const meta = msg.metadata as Record<string, unknown> | null;
      if (meta && typeof meta.media_path === "string" && meta.media_path.length > 0) {
        mediaPaths.add(meta.media_path);
      }
    }
  }

  if (mediaPaths.size > 0) {
    const { data: signedList } = await supabase.storage
      .from("inbox-media")
      .createSignedUrls(Array.from(mediaPaths), 86400);

    const signedByPath = new Map<string, string>();
    for (const item of signedList ?? []) {
      if (item.path && item.signedUrl) {
        signedByPath.set(item.path, item.signedUrl);
      }
    }

    for (const lead of data ?? []) {
      for (const msg of lead.messages ?? []) {
        const meta = msg.metadata as Record<string, unknown> | null;
        if (meta && typeof meta.media_path === "string") {
          const url = signedByPath.get(meta.media_path);
          if (url) {
            meta.media_url = url;
          }
        }
      }
    }
  }

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

  return (
    <Suspense fallback={<div className="h-full w-full animate-pulse bg-[#FAFAFA]" />}>
      <InboxClient leads={leads} companyId={companyId} fetchError={error?.message ?? null} />
    </Suspense>
  );
}
