/**
 * /accept-invite — handles new users arriving via Supabase email invite link.
 * After Supabase Auth processes the magic link, user is redirected here with ?invitationId=<uuid>.
 * This page auto-accepts the invitation and redirects to onboarding or dashboard.
 */
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

interface PageProps {
  searchParams: Promise<{ invitationId?: string }>;
}

export default async function AcceptInvitePage({ searchParams }: PageProps) {
  const { invitationId } = await searchParams;

  if (!invitationId) redirect("/login");

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) redirect(`/login?next=/accept-invite?invitationId=${invitationId}`);

  const admin = createAdminClient();

  const { data: invite } = await admin
    .from("invitations")
    .select("*")
    .eq("id", invitationId)
    .maybeSingle();

  if (!invite) redirect("/onboarding?error=invite_not_found");

  if (invite.status === "accepted") redirect("/inbox?welcome=1");

  if (invite.status === "expired") redirect("/login?error=invite_expired");

  if (invite.invited_email.toLowerCase() !== user.email?.toLowerCase()) {
    redirect("/login?error=invite_email_mismatch");
  }

  // Check expiry
  if (new Date(invite.expires_at) < new Date()) {
    await admin.from("invitations").update({ status: "expired" }).eq("id", invitationId);
    redirect("/login?error=invite_expired");
  }

  // Create membership
  const { error: memberErr } = await admin.from("memberships").upsert(
    { company_id: invite.company_id, user_id: user.id, role: invite.role },
    { onConflict: "company_id,user_id" }
  );

  if (memberErr) {
    console.error("[accept-invite] membership error:", memberErr.message);
    redirect("/onboarding?error=invite_failed");
  }

  // Mark accepted
  await admin.from("invitations").update({
    status: "accepted",
    accepted_at: new Date().toISOString(),
  }).eq("id", invitationId);

  // Notify inviter
  const { data: company } = await admin.from("companies").select("name").eq("id", invite.company_id).maybeSingle();
  const { data: profile } = await admin.from("users").select("full_name").eq("id", user.id).maybeSingle();

  const { createNotification } = await import("@/lib/notifications/create");
  await createNotification({
    company_id: invite.company_id,
    user_id: invite.invited_by,
    type: "member_joined",
    title: "Membro entrou para o time",
    body: `${profile?.full_name ?? user.email} aceitou seu convite e agora faz parte de ${company?.name ?? "sua empresa"}.`,
    action_url: "/settings",
    metadata: { member_id: user.id },
    priority: "medium",
  });

  redirect("/inbox?welcome=1");
}
