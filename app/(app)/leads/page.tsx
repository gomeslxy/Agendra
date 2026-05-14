import { redirect } from "next/navigation";
import { createClient, getUser, getCachedUserProfile } from "@/lib/supabase/server";
import { LeadsClient } from "./leads-client";
import type { LeadWithLastMessage } from "@/lib/types/database";

export default async function LeadsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const user = await getUser();
  if (!user) redirect("/login");

  const profile = await getCachedUserProfile(user.id);
  const companyId = profile?.memberships?.[0]?.company_id;
  if (!companyId) redirect("/login");

  const { q } = await searchParams;
  const supabase = await createClient();

  let query = supabase
    .from("leads")
    .select(`
      id, name, email, phone, status, channel, heat_score,
      source, summary, city,
      conversation_tone, is_paused,
      is_processing, last_message_id,
      created_at, updated_at, company_id,
      messages(content, created_at, role)
    `)
    .eq("company_id", companyId)
    .order("updated_at", { ascending: false })
    .order("created_at", { foreignTable: "messages", ascending: false })
    .limit(1, { foreignTable: "messages" })
    .limit(100);

  if (q) {
    query = query.or(`name.ilike.%${q}%,phone.ilike.%${q}%,email.ilike.%${q}%`);
  }

  const { data: leads, error } = await query;

  if (error) {
    console.error("[LeadsPage] fetch error:", error.message);
  }

  const leadsWithLast: LeadWithLastMessage[] = (leads ?? []).map((l) => {
    const msgs = (l.messages ?? []) as { content: string; created_at: string; role: string }[];
    // server already returns only the latest message via foreignTable limit
    const latest = msgs[0];
    const { messages: _, ...rest } = l;
    return {
      ...rest,
      last_message: latest
        ? {
            content: latest.content,
            created_at: latest.created_at,
            role: latest.role as "user" | "assistant" | "note",
          }
        : undefined,
    };
  });

  return <LeadsClient leads={leadsWithLast} />;
}
