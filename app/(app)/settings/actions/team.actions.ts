"use server";

import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireTenantContext } from "@/lib/tenant/context";
import { revalidatePath } from "next/cache";
import { logAuditAction } from "@/lib/security/audit";

const UpdateCompanySchema = z.object({
  name: z.string().trim().min(1, "Nome da empresa não pode ser vazio").max(120),
});

const InviteSchema = z.object({
  email: z.string().trim().toLowerCase().email("E-mail inválido."),
  role: z.enum(["admin", "member"]),
});

const UpdateProfileSchema = z.object({
  full_name: z.string().trim().max(120, "Nome muito longo (máximo 120 caracteres).").optional(),
  phone: z.string().trim().max(40).optional(),
});

export async function updateCompany(data: { name: string }) {
  const { companyId } = await requireTenantContext({ requireAdmin: true });

  const parsed = UpdateCompanySchema.safeParse(data);
  if (!parsed.success) {
    throw new Error(parsed.error.issues[0]?.message ?? "Nome inválido");
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("companies")
    .update({ name: parsed.data.name })
    .eq("id", companyId);

  if (error) throw new Error(error.message);

  await logAuditAction({
    action: "company.update",
    companyId,
    payload: { new_name: parsed.data.name },
  });

  revalidatePath("/settings");
}

export async function inviteTeamMember(email: string, role: "admin" | "member") {
  const { companyId, userId } = await requireTenantContext({ requireAdmin: true });

  const parsed = InviteSchema.safeParse({ email, role });
  if (!parsed.success) {
    throw new Error(parsed.error.issues[0]?.message ?? "Dados inválidos");
  }
  const normalizedEmail = parsed.data.email;
  const targetRole = parsed.data.role;

  const admin = createAdminClient();

  const { count: pendingCount } = await admin
    .from("invitations")
    .select("id", { count: "exact", head: true })
    .eq("company_id", companyId)
    .eq("status", "pending");

  if ((pendingCount ?? 0) >= 5) {
    throw new Error("Limite de 5 convites pendentes atingido. Cancele um convite existente primeiro.");
  }

  const { data: duplicate } = await admin
    .from("invitations")
    .select("id")
    .eq("company_id", companyId)
    .eq("invited_email", normalizedEmail)
    .eq("status", "pending")
    .maybeSingle();

  if (duplicate) {
    throw new Error("Já existe um convite pendente para este e-mail.");
  }

  const { data: existingUser } = await admin
    .from("users")
    .select("id, email")
    .eq("email", normalizedEmail)
    .maybeSingle();

  if (existingUser) {
    const { data: alreadyMember } = await admin
      .from("memberships")
      .select("id")
      .eq("company_id", companyId)
      .eq("user_id", existingUser.id)
      .maybeSingle();

    if (alreadyMember) {
      throw new Error("Este usuário já faz parte da equipe.");
    }
  }

  const { data: company } = await admin
    .from("companies")
    .select("name")
    .eq("id", companyId)
    .maybeSingle();
  const { data: inviterProfile } = await admin
    .from("users")
    .select("full_name")
    .eq("id", userId)
    .maybeSingle();

  const companyName = company?.name ?? "uma empresa";
  const inviterName = inviterProfile?.full_name ?? "Alguém";

  const { data: invitation, error: inviteErr } = await admin
    .from("invitations")
    .insert({
      company_id: companyId,
      invited_email: normalizedEmail,
      invited_by: userId,
      role: targetRole,
    })
    .select("id")
    .single();

  if (inviteErr) {
    if ((inviteErr as { code?: string }).code === "23505") {
      throw new Error("Já existe um convite pendente para este e-mail.");
    }
    throw new Error("Erro ao criar convite: " + inviteErr.message);
  }

  const invitationId = invitation.id as string;
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://www.agendra.site";

  if (existingUser) {
    try {
      const { createNotification } = await import("@/lib/notifications/create");
      const notifId = await createNotification({
        company_id: companyId,
        user_id: existingUser.id,
        type: "invite",
        title: "Convite para equipe",
        body: `${inviterName} convidou você para fazer parte de ${companyName} como ${targetRole === "admin" ? "Administrador" : "Membro"}.`,
        action_url: "/settings",
        metadata: {
          invitation_id: invitationId,
          inviter_name: inviterName,
          company_name: companyName,
          role: targetRole,
        },
        priority: "high",
      });

      if (notifId) {
        await admin.from("invitations").update({ notification_id: notifId }).eq("id", invitationId);
      } else {
        throw new Error("Falha ao gerar o ID da notificação.");
      }
    } catch (notifErr: unknown) {
      await admin.from("invitations").delete().eq("id", invitationId);
      const msg = notifErr instanceof Error ? notifErr.message : String(notifErr);
      throw new Error("Erro ao criar notificação de convite: " + msg);
    }
  } else {
    const { error: emailErr } = await admin.auth.admin.inviteUserByEmail(normalizedEmail, {
      redirectTo: `${appUrl}/accept-invite?invitationId=${invitationId}`,
      data: {
        invited_company_id: companyId,
        company_id: companyId,
        invited_role: targetRole,
      },
    });

    if (emailErr) {
      await admin.from("invitations").delete().eq("id", invitationId);
      if (emailErr.message.includes("already registered")) {
        throw new Error(
          "Este e-mail já possui uma conta. O usuário pode fazer login e aceitar o convite.",
        );
      }
      throw new Error(emailErr.message);
    }
  }

  await logAuditAction({
    action: "member.invite",
    companyId,
    payload: { invited_email: normalizedEmail, invited_role: targetRole },
  });

  revalidatePath("/settings");
}

export async function updateUserProfile(data: { full_name?: string; phone?: string }) {
  const { companyId, userId } = await requireTenantContext();

  const parsed = UpdateProfileSchema.safeParse(data);
  if (!parsed.success) {
    throw new Error(parsed.error.issues[0]?.message ?? "Dados inválidos");
  }

  const patch: { updated_at: string; full_name?: string | null; phone?: string | null } = {
    updated_at: new Date().toISOString(),
  };
  if (parsed.data.full_name !== undefined) patch.full_name = parsed.data.full_name || null;
  if (parsed.data.phone !== undefined) patch.phone = parsed.data.phone || null;

  const supabase = await createClient();
  const { error } = await supabase.from("users").update(patch).eq("id", userId);
  if (error) throw new Error(error.message);

  if (companyId) {
    await logAuditAction({
      action: "user.profile_update",
      companyId,
      payload: { user_id: userId, updated_fields: Object.keys(patch) },
    });
  }

  revalidatePath("/settings");
  return { success: true };
}
