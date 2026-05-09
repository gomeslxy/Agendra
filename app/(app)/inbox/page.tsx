import { redirect } from "next/navigation";
import { getUser, getCachedUserProfile, createClient } from "@/lib/supabase/server";
import { InboxClient } from "./inbox-client";
import type { Lead, Message } from "@/lib/types/database";

interface LeadWithMessages extends Lead {
  messages: Message[];
}

export default async function InboxPage() {
  const user = await getUser();
  if (!user) redirect("/login");

  const profile = await getCachedUserProfile(user.id);
  const companyId = profile?.memberships?.[0]?.company_id;
  if (!companyId) redirect("/login");

  const supabase = await createClient();

  const { data, error } = await supabase
    .from("leads")
    .select(`
      *,
      messages(id, content, role, created_at)
    `)
    .eq("company_id", companyId)
    .order("updated_at", { ascending: false })
    .order("created_at", { foreignTable: "messages", ascending: true })
    .limit(50, { foreignTable: "messages" })
    .limit(30);

  if (error) {
    console.error("[InboxPage] fetch error:", error.message);
  }

  // server already returns messages sorted ascending — no client sort needed
  const leads: LeadWithMessages[] = (data ?? []).map((l) => ({
    ...l,
    messages: (l.messages ?? []) as Message[],
  }));

  return <InboxClient leads={leads} />;
}
