"use server";

import { createClient, getUserProfile } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createNotification } from "@/lib/notifications/create";
import { revalidatePath } from "next/cache";

/**
 * Accept a pending invitation. Caller must be the invited user.
 */
export async function acceptInvitation(invitationId: string) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Unauthorized");

  const admin = createAdminClient();

  // Fetch invitation
  const { data: invite, error: fetchErr } = await admin
    .from("invitations")
    .select("*")
    .eq("id", invitationId)
    .eq("status", "pending")
    .maybeSingle();

  if (fetchErr || !invite) throw new Error("Convite não encontrado ou já processado.");

  // Security: invited_email must match current user
  if (invite.invited_email.toLowerCase() !== user.email?.toLowerCase()) {
    throw new Error("Este convite não pertence à sua conta.");
  }

  // Check expiry
  if (new Date(invite.expires_at) < new Date()) {
    await admin.from("invitations").update({ status: "expired" }).eq("id", invitationId);
    throw new Error("Este convite expirou. Solicite um novo convite.");
  }

  // Check if already a member
  const { data: existing } = await admin
    .from("memberships")
    .select("id")
    .eq("company_id", invite.company_id)
    .eq("user_id", user.id)
    .maybeSingle();

  if (existing) {
    await admin.from("invitations").update({ status: "accepted", accepted_at: new Date().toISOString() }).eq("id", invitationId);
    if (invite.notification_id) {
      await admin.from("notifications").update({ read: true }).eq("id", invite.notification_id);
    }
    revalidatePath("/settings");
    return;
  }

  // Create membership
  const { error: memberErr } = await admin.from("memberships").insert({
    company_id: invite.company_id,
    user_id: user.id,
    role: invite.role,
  });
  if (memberErr) throw new Error("Erro ao criar membership: " + memberErr.message);

  // Mark invitation accepted
  await admin.from("invitations").update({
    status: "accepted",
    accepted_at: new Date().toISOString(),
  }).eq("id", invitationId);

  // Mark invite notification as read
  if (invite.notification_id) {
    await admin.from("notifications").update({ read: true }).eq("id", invite.notification_id);
  }

  // Fetch names for notification
  const { data: company } = await admin
    .from("companies")
    .select("name")
    .eq("id", invite.company_id)
    .maybeSingle();

  const { data: profile } = await admin
    .from("users")
    .select("full_name")
    .eq("id", user.id)
    .maybeSingle();

  const memberName = profile?.full_name ?? user.email ?? "Novo membro";
  const companyName = company?.name ?? "sua empresa";

  // Notify the inviter
  await createNotification({
    company_id: invite.company_id,
    user_id: invite.invited_by,
    type: "member_joined",
    title: "Membro entrou para o time",
    body: `${memberName} aceitou seu convite e agora faz parte de ${companyName}.`,
    action_url: "/settings",
    metadata: { member_id: user.id, member_name: memberName },
    priority: "medium",
  });

  revalidatePath("/settings");
}

/**
 * Decline a pending invitation.
 */
export async function declineInvitation(invitationId: string) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Unauthorized");

  const admin = createAdminClient();

  const { data: invite, error: fetchErr } = await admin
    .from("invitations")
    .select("*")
    .eq("id", invitationId)
    .eq("status", "pending")
    .maybeSingle();

  if (fetchErr || !invite) throw new Error("Convite não encontrado.");

  if (invite.invited_email.toLowerCase() !== user.email?.toLowerCase()) {
    throw new Error("Este convite não pertence à sua conta.");
  }

  await admin.from("invitations").update({ status: "declined" }).eq("id", invitationId);

  if (invite.notification_id) {
    await admin.from("notifications").update({ read: true }).eq("id", invite.notification_id);
  }

  const { data: company } = await admin.from("companies").select("name").eq("id", invite.company_id).maybeSingle();
  const { data: profile } = await admin.from("users").select("full_name").eq("id", user.id).maybeSingle();

  const memberName = profile?.full_name ?? user.email ?? "Usuário";
  const companyName = company?.name ?? "sua empresa";

  await createNotification({
    company_id: invite.company_id,
    user_id: invite.invited_by,
    type: "member_left",
    title: "Convite recusado",
    body: `${memberName} recusou o convite para ${companyName}.`,
    action_url: "/settings",
    metadata: { declined_email: invite.invited_email },
    priority: "medium",
  });

  revalidatePath("/settings");
}

/**
 * Cancel a pending invitation (admin/owner only).
 */
export async function cancelInvitation(invitationId: string) {
  const profile = await getUserProfile();
  if (!profile) throw new Error("Unauthorized");

  const companyId = profile.memberships?.[0]?.company_id;
  if (!companyId) throw new Error("No company");

  const role = profile.memberships?.[0]?.role;
  if (role !== "admin" && role !== "owner") throw new Error("Apenas administradores podem cancelar convites.");

  const admin = createAdminClient();

  const { data: invite, error } = await admin
    .from("invitations")
    .select("id, company_id, notification_id, status")
    .eq("id", invitationId)
    .eq("company_id", companyId)
    .maybeSingle();

  if (error || !invite) throw new Error("Convite não encontrado.");
  if (invite.status !== "pending") throw new Error("Apenas convites pendentes podem ser cancelados.");

  await admin.from("invitations").update({ status: "cancelled" }).eq("id", invitationId);

  if (invite.notification_id) {
    await admin
      .from("notifications")
      .update({ read: true })
      .eq("id", invite.notification_id)
      .eq("read", false);
  }

  revalidatePath("/settings");
}

/**
 * Resend a pending or expired invitation.
 */
export async function resendInvitation(invitationId: string) {
  const profile = await getUserProfile();
  if (!profile) throw new Error("Unauthorized");

  const companyId = profile.memberships?.[0]?.company_id;
  if (!companyId) throw new Error("No company");

  const role = profile.memberships?.[0]?.role;
  if (role !== "admin" && role !== "owner") throw new Error("Apenas administradores podem reenviar convites.");

  const admin = createAdminClient();

  const { data: invite, error } = await admin
    .from("invitations")
    .select("*")
    .eq("id", invitationId)
    .eq("company_id", companyId)
    .maybeSingle();

  if (error || !invite) throw new Error("Convite não encontrado.");
  if (!["pending", "expired"].includes(invite.status)) {
    throw new Error("Apenas convites pendentes ou expirados podem ser reenviados.");
  }

  const ageHours = (Date.now() - new Date(invite.created_at).getTime()) / (1000 * 60 * 60);
  if (invite.status === "pending" && ageHours < 24) {
    throw new Error("Aguarde 24 horas antes de reenviar este convite.");
  }

  await admin.from("invitations").update({
    status: "pending",
    expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
  }).eq("id", invitationId);

  const { data: existingUsers } = await admin.auth.admin.listUsers();
  const targetUser = existingUsers?.users?.find(
    (u) => u.email?.toLowerCase() === invite.invited_email.toLowerCase()
  );

  const { data: company } = await admin.from("companies").select("name").eq("id", companyId).maybeSingle();
  const { data: inviterProfile } = await admin.from("users").select("full_name").eq("id", profile.id).maybeSingle();

  const companyName = company?.name ?? "uma empresa";
  const inviterName = inviterProfile?.full_name ?? "Alguém";

  if (targetUser) {
    const notifId = await createNotification({
      company_id: companyId,
      user_id: targetUser.id,
      type: "invite",
      title: "Convite para equipe",
      body: `${inviterName} convidou você para fazer parte de ${companyName} como ${invite.role === "admin" ? "Administrador" : "Membro"}.`,
      action_url: "/settings",
      metadata: {
        invitation_id: invitationId,
        inviter_name: inviterName,
        company_name: companyName,
        role: invite.role,
      },
      priority: "high",
    });
    if (notifId) {
      await admin.from("invitations").update({ notification_id: notifId }).eq("id", invitationId);
    }
  } else {
    const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://www.agendra.site";
    await admin.auth.admin.inviteUserByEmail(invite.invited_email, {
      redirectTo: `${appUrl}/accept-invite?invitationId=${invitationId}`,
      data: { company_id: companyId, invited_role: invite.role },
    });
  }

  revalidatePath("/settings");
}

/**
 * Get all notifications for the current user (last 20).
 */
export async function getNotifications() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return [];

  const { data, error } = await supabase
    .from("notifications")
    .select("*")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(20);

  if (error) {
    console.error("[getNotifications] error:", error.message);
    return [];
  }
  return data ?? [];
}

/**
 * Mark a single notification as read.
 */
export async function markNotificationRead(notificationId: string) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Unauthorized");

  await supabase
    .from("notifications")
    .update({ read: true })
    .eq("id", notificationId)
    .eq("user_id", user.id);
}

/**
 * Mark all notifications as read.
 */
export async function markAllNotificationsRead() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Unauthorized");

  await supabase
    .from("notifications")
    .update({ read: true })
    .eq("user_id", user.id)
    .eq("read", false);
}
