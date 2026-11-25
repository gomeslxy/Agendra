"use server";

import { z } from "zod";
import { getUser } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { invalidateUsageCache } from "@/lib/billing/limits";
import { getRequestMeta } from "@/lib/admin/auth";
import { logError } from "@/lib/logging";
import { validateAdminSessionOrThrow } from "./auth.actions";
import { getErrorMessage, insertAudit } from "./_shared";

const CompanyIdSchema = z.string().trim().min(1, "companyId inválido").max(128);
const PlanSchema = z.enum(["trial", "starter", "pro", "business", "enterprise"]);

export async function updateTenantPlan(
  companyId: string,
  newPlan: string,
): Promise<{ success: boolean; error?: string }> {
  try {
    await validateAdminSessionOrThrow();
    const cid = CompanyIdSchema.parse(companyId);
    const plan = PlanSchema.parse(newPlan);

    const user = await getUser();
    if (!user) throw new Error("Usuário não autenticado");
    const { ip, ua } = await getRequestMeta();
    const adminClient = createAdminClient();

    const { data: company, error: getErr } = await adminClient
      .from("companies")
      .select("name, plan_type")
      .eq("id", cid)
      .single();
    if (getErr || !company) throw new Error(`Empresa não encontrada: ${getErr?.message}`);

    const { error: updateErr } = await adminClient
      .from("companies")
      .update({
        plan_type: plan,
        subscription_status: plan === "trial" ? "trial" : "active",
        updated_at: new Date().toISOString(),
      })
      .eq("id", cid);
    if (updateErr) throw new Error(updateErr.message);

    await invalidateUsageCache(cid);

    await insertAudit(adminClient, cid, user.id, user.email, ip, ua, "admin_update_plan", {
      company_name: company.name,
      old_plan: company.plan_type,
      new_plan: plan,
    });

    return { success: true };
  } catch (err: unknown) {
    return { success: false, error: getErrorMessage(err) };
  }
}

export async function toggleCompanyAI(
  companyId: string,
  pause: boolean,
): Promise<{ success: boolean; error?: string }> {
  try {
    await validateAdminSessionOrThrow();
    const cid = CompanyIdSchema.parse(companyId);
    const user = await getUser();
    if (!user) throw new Error("Usuário não autenticado");
    const { ip, ua } = await getRequestMeta();
    const adminClient = createAdminClient();

    const { data: company, error: getErr } = await adminClient
      .from("companies")
      .select("name")
      .eq("id", cid)
      .single();
    if (getErr || !company) throw new Error(`Empresa não encontrada: ${getErr?.message}`);

    const newStatus = pause ? "paused" : "active";
    const { error: updateErr } = await adminClient
      .from("channels")
      .update({ status: newStatus, updated_at: new Date().toISOString() })
      .eq("company_id", cid);
    if (updateErr) throw new Error(updateErr.message);

    await insertAudit(adminClient, cid, user.id, user.email, ip, ua, "admin_toggle_ai", {
      company_name: company.name,
      ai_paused: pause,
      channel_status_set: newStatus,
    });

    return { success: true };
  } catch (err: unknown) {
    return { success: false, error: getErrorMessage(err) };
  }
}

export async function generateTenantMagicLink(
  companyId: string,
): Promise<{ success: boolean; link?: string; error?: string }> {
  try {
    await validateAdminSessionOrThrow();
    const cid = CompanyIdSchema.parse(companyId);
    const user = await getUser();
    if (!user) throw new Error("Usuário não autenticado");
    const { ip, ua } = await getRequestMeta();
    const adminClient = createAdminClient();

    const { data: membership, error: memErr } = await adminClient
      .from("memberships")
      .select("user_id, users(email)")
      .eq("company_id", cid)
      .eq("role", "owner")
      .single();
    if (memErr || !membership) throw new Error("Owner não encontrado para a empresa");

    const ownerEmail = (membership.users as { email?: string } | null)?.email;
    if (!ownerEmail) throw new Error("Email do owner não disponível");

    const appUrl = process.env.NEXT_PUBLIC_APP_URL || "https://app.agendra.site";
    const { data, error: linkErr } = await adminClient.auth.admin.generateLink({
      type: "magiclink",
      email: ownerEmail,
      options: { redirectTo: `${appUrl}/inbox` },
    });
    if (linkErr || !data?.properties?.action_link) {
      throw new Error(linkErr?.message || "Falha ao gerar magic link");
    }

    const { data: company } = await adminClient
      .from("companies")
      .select("name")
      .eq("id", cid)
      .single();

    await insertAudit(
      adminClient,
      cid,
      user.id,
      user.email,
      ip,
      ua,
      "admin_generate_magic_link",
      { company_name: company?.name, target_email: ownerEmail },
    );

    return { success: true, link: data.properties.action_link };
  } catch (err: unknown) {
    return { success: false, error: getErrorMessage(err) };
  }
}

export async function resetTenantOnboarding(
  companyId: string,
): Promise<{ success: boolean; error?: string }> {
  try {
    await validateAdminSessionOrThrow();
    const cid = CompanyIdSchema.parse(companyId);
    const user = await getUser();
    if (!user) throw new Error("Usuário não autenticado");
    const { ip, ua } = await getRequestMeta();
    const adminClient = createAdminClient();

    const { data: company } = await adminClient
      .from("companies")
      .select("name, onboarding_status")
      .eq("id", cid)
      .single();

    const { error: updateErr } = await adminClient
      .from("companies")
      .update({
        onboarding_status: "not_started",
        onboarding_step: 0,
        onboarding_data: {},
        onboarding_completed_at: null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", cid);
    if (updateErr) throw new Error(updateErr.message);

    await insertAudit(adminClient, cid, user.id, user.email, ip, ua, "admin_reset_onboarding", {
      company_name: company?.name,
      prev_status: company?.onboarding_status,
    });

    return { success: true };
  } catch (err: unknown) {
    return { success: false, error: getErrorMessage(err) };
  }
}

export async function forceBypassOnboarding(
  companyId: string,
): Promise<{ success: boolean; link?: string; error?: string }> {
  try {
    await validateAdminSessionOrThrow();
    const cid = CompanyIdSchema.parse(companyId);
    const user = await getUser();
    if (!user) throw new Error("Usuário não autenticado");
    const { ip, ua } = await getRequestMeta();
    const adminClient = createAdminClient();

    const { error: updateErr } = await adminClient
      .from("companies")
      .update({
        onboarding_status: "not_started",
        onboarding_step: 0,
        updated_at: new Date().toISOString(),
      })
      .eq("id", cid);
    if (updateErr) throw new Error(updateErr.message);

    const { data: membership, error: memErr } = await adminClient
      .from("memberships")
      .select("user_id, users(email)")
      .eq("company_id", cid)
      .eq("role", "owner")
      .single();
    if (memErr || !membership) throw new Error("Owner não encontrado");

    const ownerEmail = (membership.users as { email?: string } | null)?.email;
    if (!ownerEmail) throw new Error("Email do owner não disponível");

    const appUrl = process.env.NEXT_PUBLIC_APP_URL || "https://app.agendra.site";
    const { data, error: linkErr } = await adminClient.auth.admin.generateLink({
      type: "magiclink",
      email: ownerEmail,
      options: { redirectTo: `${appUrl}/onboarding` },
    });
    if (linkErr || !data?.properties?.action_link) {
      throw new Error(linkErr?.message || "Falha ao gerar link");
    }

    const { data: company } = await adminClient
      .from("companies")
      .select("name")
      .eq("id", cid)
      .single();

    await insertAudit(adminClient, cid, user.id, user.email, ip, ua, "admin_bypass_onboarding", {
      company_name: company?.name,
      target_email: ownerEmail,
    });

    return { success: true, link: data.properties.action_link };
  } catch (err: unknown) {
    return { success: false, error: getErrorMessage(err) };
  }
}

export async function sendTenantNotification(
  companyId: string,
  title: string,
  body: string,
): Promise<{ success: boolean; error?: string }> {
  try {
    await validateAdminSessionOrThrow();
    const cid = CompanyIdSchema.parse(companyId);
    const cleanTitle = z.string().min(1).max(200).parse(title.trim());
    const cleanBody = z.string().min(1).max(2000).parse(body.trim());

    const user = await getUser();
    if (!user) throw new Error("Usuário não autenticado");
    const { ip, ua } = await getRequestMeta();
    const adminClient = createAdminClient();

    const { data: memberships, error: memErr } = await adminClient
      .from("memberships")
      .select("user_id")
      .eq("company_id", cid);
    if (memErr) throw new Error(memErr.message);
    if (!memberships?.length) throw new Error("Nenhum usuário encontrado nesta empresa");

    const notifications = memberships.map((m) => ({
      company_id: cid,
      user_id: m.user_id,
      type: "system" as const,
      title: cleanTitle,
      body: cleanBody,
      priority: "high" as const,
    }));

    const { error: insertErr } = await adminClient.from("notifications").insert(notifications);
    if (insertErr) throw new Error(insertErr.message);

    const { data: company } = await adminClient
      .from("companies")
      .select("name")
      .eq("id", cid)
      .single();

    await insertAudit(adminClient, cid, user.id, user.email, ip, ua, "admin_send_notification", {
      company_name: company?.name,
      title: cleanTitle,
      recipients: memberships.length,
    });

    return { success: true };
  } catch (err: unknown) {
    return { success: false, error: getErrorMessage(err) };
  }
}

export async function deleteTenant(
  companyId: string,
  confirmationName: string,
): Promise<{ success: boolean; error?: string }> {
  try {
    await validateAdminSessionOrThrow();
    const cid = CompanyIdSchema.parse(companyId);
    const user = await getUser();
    if (!user) throw new Error("Usuário não autenticado");
    const { ip, ua } = await getRequestMeta();
    const adminClient = createAdminClient();

    const { data: company, error: getErr } = await adminClient
      .from("companies")
      .select("name")
      .eq("id", cid)
      .single();
    if (getErr || !company) throw new Error("Empresa não encontrada");

    if (company.name !== confirmationName) {
      throw new Error("Nome de confirmação não corresponde ao nome da empresa");
    }

    await insertAudit(adminClient, cid, user.id, user.email, ip, ua, "admin_delete_tenant", {
      deleted_company_id: cid,
      deleted_company_name: company.name,
    });

    const { error: deleteErr } = await adminClient.from("companies").delete().eq("id", cid);
    if (deleteErr) throw new Error(deleteErr.message);

    return { success: true };
  } catch (err: unknown) {
    return { success: false, error: getErrorMessage(err) };
  }
}

export async function toggleTenantRAG(
  companyId: string,
  enabled: boolean,
): Promise<{ success: boolean; error?: string }> {
  try {
    await validateAdminSessionOrThrow();
    const cid = CompanyIdSchema.parse(companyId);
    const user = await getUser();
    if (!user) throw new Error("Usuário não autenticado");
    const { ip, ua } = await getRequestMeta();
    const adminClient = createAdminClient();

    const { data: company } = await adminClient
      .from("companies")
      .select("name, onboarding_applied_config")
      .eq("id", cid)
      .single();

    const currentConfig = (company?.onboarding_applied_config as Record<string, unknown>) ?? {};
    const { error: updateErr } = await adminClient
      .from("companies")
      .update({
        onboarding_applied_config: { ...currentConfig, rag_override: enabled },
        updated_at: new Date().toISOString(),
      })
      .eq("id", cid);
    if (updateErr) throw new Error(updateErr.message);

    await insertAudit(adminClient, cid, user.id, user.email, ip, ua, "admin_toggle_rag", {
      company_name: company?.name,
      rag_enabled: enabled,
    });

    return { success: true };
  } catch (err: unknown) {
    return { success: false, error: getErrorMessage(err) };
  }
}

export async function forceCompanyModel(
  companyId: string,
  model: string | null,
): Promise<{ success: boolean; error?: string }> {
  try {
    await validateAdminSessionOrThrow();
    const cid = CompanyIdSchema.parse(companyId);
    const user = await getUser();
    if (!user) throw new Error("Usuário não autenticado");
    const { ip, ua } = await getRequestMeta();
    const adminClient = createAdminClient();

    const { data: company } = await adminClient
      .from("companies")
      .select("name, onboarding_applied_config")
      .eq("id", cid)
      .single();

    const currentConfig = (company?.onboarding_applied_config as Record<string, unknown>) ?? {};
    const newConfig = model
      ? { ...currentConfig, model_override: model }
      : Object.fromEntries(Object.entries(currentConfig).filter(([k]) => k !== "model_override"));

    const { error: updateErr } = await adminClient
      .from("companies")
      .update({ onboarding_applied_config: newConfig, updated_at: new Date().toISOString() })
      .eq("id", cid);
    if (updateErr) throw new Error(updateErr.message);

    await insertAudit(adminClient, cid, user.id, user.email, ip, ua, "admin_force_model", {
      company_name: company?.name,
      model_override: model,
    });

    return { success: true };
  } catch (err: unknown) {
    return { success: false, error: getErrorMessage(err) };
  }
}

export async function triggerTenantAnomalyAlert(
  companyId: string,
  type: string,
  message: string,
): Promise<{ success: boolean; error?: string }> {
  try {
    await validateAdminSessionOrThrow();
    const cid = CompanyIdSchema.parse(companyId);
    const user = await getUser();
    if (!user) throw new Error("Usuário não autenticado");
    const { ip, ua } = await getRequestMeta();
    const adminClient = createAdminClient();

    const { data: memberships, error: memErr } = await adminClient
      .from("memberships")
      .select("user_id, users(email)")
      .eq("company_id", cid)
      .in("role", ["owner", "admin"]);
    if (memErr) throw new Error(memErr.message);

    const emails =
      memberships
        ?.map((m) => (m.users as { email?: string } | null)?.email)
        .filter((email): email is string => Boolean(email)) ?? [];

    const { data: company } = await adminClient
      .from("companies")
      .select("name")
      .eq("id", cid)
      .single();

    if (emails.length > 0) {
      const { sendEmail } = await import("@/lib/email/send");
      const { anomalyAlertEmail } = await import("@/lib/email/templates/anomaly");
      const companyName = company?.name || "sua conta";
      for (const email of emails) {
        try {
          await sendEmail({
            to: email,
            subject: `[Agendra Alerta] Anomalia detectada em ${companyName}`,
            html: anomalyAlertEmail({ companyName, type, message }),
          });
        } catch (mailErr) {
          logError(`[triggerTenantAnomalyAlert] Failed to send to ${email}:`, mailErr);
        }
      }
    }

    const { data: allMembers } = await adminClient
      .from("memberships")
      .select("user_id")
      .eq("company_id", cid);

    if (allMembers && allMembers.length > 0) {
      const notifications = allMembers.map((m) => ({
        company_id: cid,
        user_id: m.user_id,
        type: "system" as const,
        title: `⚠️ Alerta: ${type}`,
        body: message,
        priority: "high" as const,
      }));
      await adminClient.from("notifications").insert(notifications);
    }

    await insertAudit(
      adminClient,
      cid,
      user.id,
      user.email,
      ip,
      ua,
      "admin_trigger_anomaly_alert",
      {
        company_name: company?.name,
        type,
        message,
        notified_emails: emails,
      },
    );

    return { success: true };
  } catch (err: unknown) {
    return { success: false, error: getErrorMessage(err) };
  }
}
