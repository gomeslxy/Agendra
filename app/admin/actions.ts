// app/admin/actions.ts
"use server";

import { cookies, headers } from "next/headers";
import { getUser, getCachedUserProfile } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import crypto from "crypto";

const DEFAULT_ADMIN_PASSWORD = "agendra-proprietario-2026";
const ADMIN_EMAILS = ["gmlucazz1@gmail.com", "la181009@gmail.com"];

// ── Session token helpers (with session fingerprinting) ──────────────────────

function computeAdminToken(password: string, ip: string, ua: string): string {
  // Fingerprint binds session to the specific IP + User-Agent combo
  const fingerprint = `${ip}:${ua.substring(0, 128)}`;
  return crypto
    .createHmac("sha256", "agendra-admin-salt-2026")
    .update(`${password}:${fingerprint}`)
    .digest("hex");
}

async function getRequestMeta(): Promise<{ ip: string; ua: string }> {
  const h = await headers();
  const ip = h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip") || "127.0.0.1";
  const ua = h.get("user-agent") || "unknown";
  return { ip, ua };
}

// ── Core auth validation ─────────────────────────────────────────────────────

export async function validateAdminSessionOrThrow(): Promise<void> {
  const user = await getUser();
  if (!user) throw new Error("Acesso negado: não autenticado");

  const allowedEmails = [
    ...(process.env.ADMIN_EMAIL ? [process.env.ADMIN_EMAIL] : []),
    ...ADMIN_EMAILS,
  ];
  if (!user.email || !allowedEmails.includes(user.email)) {
    throw new Error("Acesso negado: privilégios insuficientes");
  }

  const cookieStore = await cookies();
  const storedToken = cookieStore.get("agendra_admin_session")?.value;
  if (!storedToken) throw new Error("Acesso negado: sessão administrativa inválida ou expirada");

  const { ip, ua } = await getRequestMeta();
  const adminPassword = process.env.ADMIN_PASSWORD || DEFAULT_ADMIN_PASSWORD;
  const expectedToken = computeAdminToken(adminPassword, ip, ua);

  if (storedToken !== expectedToken) {
    throw new Error("Acesso negado: fingerprint de sessão inválido");
  }
}

// ── Login with rate limiting + fingerprint ───────────────────────────────────

export async function verifyAdminPassword(
  password: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const user = await getUser();
    if (!user) return { success: false, error: "Usuário não está logado no Supabase" };

    const allowedEmails = [
      ...(process.env.ADMIN_EMAIL ? [process.env.ADMIN_EMAIL] : []),
      ...ADMIN_EMAILS,
    ];
    if (!user.email || !allowedEmails.includes(user.email)) {
      return { success: false, error: "Privilégios insuficientes" };
    }

    const { ip, ua } = await getRequestMeta();
    const adminClient = createAdminClient();

    // Rate limit: block IP after 5 failures in 15 min
    const fifteenMinAgo = new Date(Date.now() - 15 * 60 * 1000).toISOString();
    const { count: recentFailures } = await adminClient
      .from("admin_login_attempts")
      .select("id", { count: "exact", head: true })
      .eq("ip_address", ip)
      .eq("success", false)
      .gte("attempted_at", fifteenMinAgo);

    if ((recentFailures ?? 0) >= 5) {
      return {
        success: false,
        error: "IP bloqueado por excesso de tentativas. Aguarde 15 minutos.",
      };
    }

    const adminPassword = process.env.ADMIN_PASSWORD || DEFAULT_ADMIN_PASSWORD;
    const profile = await getCachedUserProfile(user.id);
    const companyId = profile?.memberships?.[0]?.company_id;

    // Record attempt before checking password (prevents timing oracle)
    const isCorrect = password === adminPassword;
    await adminClient.from("admin_login_attempts").insert({
      ip_address: ip,
      success: isCorrect,
    });

    if (!isCorrect) {
      if (companyId) {
        await adminClient.from("audit_logs").insert({
          company_id: companyId,
          user_id: user.id,
          actor_email: user.email,
          action: "admin_login_failed",
          ip_address: ip,
          user_agent: ua,
          payload: { detail: "Senha secundária incorreta" },
        });
      }
      return { success: false, error: "Chave de segurança admin incorreta" };
    }

    // Set fingerprinted HttpOnly session cookie
    const token = computeAdminToken(adminPassword, ip, ua);
    const cookieStore = await cookies();
    cookieStore.set("agendra_admin_session", token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "strict",
      path: "/",
      maxAge: 60 * 60 * 2, // 2 hours
    });

    if (companyId) {
      await adminClient.from("audit_logs").insert({
        company_id: companyId,
        user_id: user.id,
        actor_email: user.email,
        action: "admin_login_success",
        ip_address: ip,
        user_agent: ua,
        payload: { detail: "Login administrativo com sucesso" },
      });
    }

    return { success: true };
  } catch (err: any) {
    return { success: false, error: err.message || "Erro interno de autenticação" };
  }
}

export async function logoutAdmin(): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.delete("agendra_admin_session");
}

// ── Shared audit helper ──────────────────────────────────────────────────────

async function insertAudit(
  adminClient: ReturnType<typeof createAdminClient>,
  companyId: string,
  userId: string,
  email: string | undefined,
  ip: string,
  ua: string,
  action: string,
  payload: object
) {
  await adminClient.from("audit_logs").insert({
    company_id: companyId,
    user_id: userId,
    actor_email: email ?? "admin@agendra.site",
    action,
    ip_address: ip,
    user_agent: ua,
    payload,
  });
}

// ── Existing actions ─────────────────────────────────────────────────────────

export async function updateTenantPlan(
  companyId: string,
  newPlan: string
): Promise<{ success: boolean; error?: string }> {
  try {
    await validateAdminSessionOrThrow();
    const user = await getUser();
    if (!user) throw new Error("Usuário não autenticado");
    const { ip, ua } = await getRequestMeta();
    const adminClient = createAdminClient();

    const { data: company, error: getErr } = await adminClient
      .from("companies")
      .select("name, plan_type")
      .eq("id", companyId)
      .single();
    if (getErr || !company) throw new Error(`Empresa não encontrada: ${getErr?.message}`);

    const { error: updateErr } = await adminClient
      .from("companies")
      .update({
        plan_type: newPlan,
        subscription_status: newPlan === "trial" ? "trial" : "active",
        updated_at: new Date().toISOString(),
      })
      .eq("id", companyId);
    if (updateErr) throw new Error(updateErr.message);

    await insertAudit(adminClient, companyId, user.id, user.email, ip, ua, "admin_update_plan", {
      company_name: company.name,
      old_plan: company.plan_type,
      new_plan: newPlan,
    });

    return { success: true };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}

export async function toggleCompanyAI(
  companyId: string,
  pause: boolean
): Promise<{ success: boolean; error?: string }> {
  try {
    await validateAdminSessionOrThrow();
    const user = await getUser();
    if (!user) throw new Error("Usuário não autenticado");
    const { ip, ua } = await getRequestMeta();
    const adminClient = createAdminClient();

    const { data: company, error: getErr } = await adminClient
      .from("companies")
      .select("name")
      .eq("id", companyId)
      .single();
    if (getErr || !company) throw new Error(`Empresa não encontrada: ${getErr?.message}`);

    const newStatus = pause ? "paused" : "active";
    const { error: updateErr } = await adminClient
      .from("channels")
      .update({ status: newStatus, updated_at: new Date().toISOString() })
      .eq("company_id", companyId);
    if (updateErr) throw new Error(updateErr.message);

    await insertAudit(adminClient, companyId, user.id, user.email, ip, ua, "admin_toggle_ai", {
      company_name: company.name,
      ai_paused: pause,
      channel_status_set: newStatus,
    });

    return { success: true };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}

// ── New actions ──────────────────────────────────────────────────────────────

export async function generateTenantMagicLink(
  companyId: string
): Promise<{ success: boolean; link?: string; error?: string }> {
  try {
    await validateAdminSessionOrThrow();
    const user = await getUser();
    if (!user) throw new Error("Usuário não autenticado");
    const { ip, ua } = await getRequestMeta();
    const adminClient = createAdminClient();

    // Find owner email for the company
    const { data: membership, error: memErr } = await adminClient
      .from("memberships")
      .select("user_id, users(email)")
      .eq("company_id", companyId)
      .eq("role", "owner")
      .single();
    if (memErr || !membership) throw new Error("Owner não encontrado para a empresa");

    const ownerEmail = (membership.users as any)?.email as string;
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
      .eq("id", companyId)
      .single();

    await insertAudit(adminClient, companyId, user.id, user.email, ip, ua, "admin_generate_magic_link", {
      company_name: company?.name,
      target_email: ownerEmail,
    });

    return { success: true, link: data.properties.action_link };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}

export async function resetTenantOnboarding(
  companyId: string
): Promise<{ success: boolean; error?: string }> {
  try {
    await validateAdminSessionOrThrow();
    const user = await getUser();
    if (!user) throw new Error("Usuário não autenticado");
    const { ip, ua } = await getRequestMeta();
    const adminClient = createAdminClient();

    const { data: company } = await adminClient
      .from("companies")
      .select("name, onboarding_status")
      .eq("id", companyId)
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
      .eq("id", companyId);
    if (updateErr) throw new Error(updateErr.message);

    await insertAudit(adminClient, companyId, user.id, user.email, ip, ua, "admin_reset_onboarding", {
      company_name: company?.name,
      prev_status: company?.onboarding_status,
    });

    return { success: true };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}

export async function sendTenantNotification(
  companyId: string,
  title: string,
  body: string
): Promise<{ success: boolean; error?: string }> {
  try {
    await validateAdminSessionOrThrow();
    const user = await getUser();
    if (!user) throw new Error("Usuário não autenticado");
    const { ip, ua } = await getRequestMeta();
    const adminClient = createAdminClient();

    // Fetch all user IDs in the company
    const { data: memberships, error: memErr } = await adminClient
      .from("memberships")
      .select("user_id")
      .eq("company_id", companyId);
    if (memErr) throw new Error(memErr.message);
    if (!memberships?.length) throw new Error("Nenhum usuário encontrado nesta empresa");

    const notifications = memberships.map((m) => ({
      company_id: companyId,
      user_id: m.user_id,
      type: "system" as const,
      title: title.trim(),
      body: body.trim(),
      priority: "high" as const,
    }));

    const { error: insertErr } = await adminClient.from("notifications").insert(notifications);
    if (insertErr) throw new Error(insertErr.message);

    const { data: company } = await adminClient
      .from("companies")
      .select("name")
      .eq("id", companyId)
      .single();

    await insertAudit(adminClient, companyId, user.id, user.email, ip, ua, "admin_send_notification", {
      company_name: company?.name,
      title,
      recipients: memberships.length,
    });

    return { success: true };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}

export async function extendTenantMessageLimit(
  companyId: string,
  extra: number
): Promise<{ success: boolean; error?: string }> {
  try {
    await validateAdminSessionOrThrow();
    const user = await getUser();
    if (!user) throw new Error("Usuário não autenticado");
    const { ip, ua } = await getRequestMeta();
    const adminClient = createAdminClient();

    const { data: company, error: getErr } = await adminClient
      .from("companies")
      .select("name, extra_leads")
      .eq("id", companyId)
      .single();
    if (getErr || !company) throw new Error("Empresa não encontrada");

    const prevExtra = (company.extra_leads as number) ?? 0;
    const newExtra = prevExtra + extra;

    const { error: updateErr } = await adminClient
      .from("companies")
      .update({ extra_leads: newExtra, updated_at: new Date().toISOString() })
      .eq("id", companyId);
    if (updateErr) throw new Error(updateErr.message);

    await insertAudit(adminClient, companyId, user.id, user.email, ip, ua, "admin_extend_limit", {
      company_name: company.name,
      added: extra,
      prev_extra: prevExtra,
      new_extra: newExtra,
    });

    return { success: true };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}

export async function injectTestMessage(
  companyId: string,
  message: string,
  phone: string
): Promise<{ success: boolean; error?: string }> {
  try {
    await validateAdminSessionOrThrow();
    const user = await getUser();
    if (!user) throw new Error("Usuário não autenticado");
    const { ip, ua } = await getRequestMeta();
    const adminClient = createAdminClient();

    // Find the lead by phone in the company
    const { data: lead, error: leadErr } = await adminClient
      .from("leads")
      .select("id, name")
      .eq("company_id", companyId)
      .eq("phone", phone)
      .single();
    if (leadErr || !lead) throw new Error(`Lead com telefone ${phone} não encontrado`);

    // Find the company's active channel
    const { data: channel, error: chanErr } = await adminClient
      .from("channels")
      .select("id")
      .eq("company_id", companyId)
      .eq("status", "active")
      .limit(1)
      .single();
    if (chanErr || !channel) throw new Error("Nenhum canal ativo encontrado para injetar mensagem");

    // Insert the test message directly (role: user, no actual WhatsApp send)
    const { error: msgErr } = await adminClient.from("messages").insert({
      company_id: companyId,
      lead_id: lead.id,
      channel_id: channel.id,
      content: message,
      role: "user",
      direction: "inbound",
      metadata: { injected_by_admin: true, injected_at: new Date().toISOString() },
    });
    if (msgErr) throw new Error(msgErr.message);

    const { data: company } = await adminClient
      .from("companies")
      .select("name")
      .eq("id", companyId)
      .single();

    await insertAudit(adminClient, companyId, user.id, user.email, ip, ua, "admin_inject_message", {
      company_name: company?.name,
      lead_id: lead.id,
      lead_name: lead.name,
      message_preview: message.substring(0, 100),
    });

    return { success: true };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}

export async function forceUnlockStaleLead(
  leadId: string,
  companyId: string
): Promise<{ success: boolean; error?: string }> {
  try {
    await validateAdminSessionOrThrow();
    const user = await getUser();
    if (!user) throw new Error("Usuário não autenticado");
    const { ip, ua } = await getRequestMeta();
    const adminClient = createAdminClient();

    const { error: updateErr } = await adminClient
      .from("leads")
      .update({ is_processing: false, updated_at: new Date().toISOString() })
      .eq("id", leadId)
      .eq("company_id", companyId);
    if (updateErr) throw new Error(updateErr.message);

    await insertAudit(adminClient, companyId, user.id, user.email, ip, ua, "admin_force_unlock_lead", {
      lead_id: leadId,
    });

    return { success: true };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}

export async function exportTenantDataCSV(
  companyId: string
): Promise<{ success: boolean; csv?: string; error?: string }> {
  try {
    await validateAdminSessionOrThrow();
    const user = await getUser();
    if (!user) throw new Error("Usuário não autenticado");
    const { ip, ua } = await getRequestMeta();
    const adminClient = createAdminClient();

    const [{ data: leads }, { data: company }] = await Promise.all([
      adminClient
        .from("leads")
        .select("id, name, phone, email, status, created_at, last_message_at")
        .eq("company_id", companyId)
        .order("created_at", { ascending: false })
        .limit(5000),
      adminClient.from("companies").select("name").eq("id", companyId).single(),
    ]);

    if (!leads) throw new Error("Falha ao buscar leads da empresa");

    const header = "id,name,phone,email,status,created_at,last_message_at";
    const rows = leads.map((l) =>
      [l.id, `"${(l.name || "").replace(/"/g, '""')}"`, l.phone || "", l.email || "", l.status || "", l.created_at || "", l.last_message_at || ""].join(",")
    );
    const csv = [header, ...rows].join("\n");

    await insertAudit(adminClient, companyId, user.id, user.email, ip, ua, "admin_export_csv", {
      company_name: company?.name,
      rows_exported: leads.length,
    });

    return { success: true, csv };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}

export async function deleteTenant(
  companyId: string,
  confirmationName: string
): Promise<{ success: boolean; error?: string }> {
  try {
    await validateAdminSessionOrThrow();
    const user = await getUser();
    if (!user) throw new Error("Usuário não autenticado");
    const { ip, ua } = await getRequestMeta();
    const adminClient = createAdminClient();

    const { data: company, error: getErr } = await adminClient
      .from("companies")
      .select("name")
      .eq("id", companyId)
      .single();
    if (getErr || !company) throw new Error("Empresa não encontrada");

    if (company.name !== confirmationName) {
      throw new Error("Nome de confirmação não corresponde ao nome da empresa");
    }

    // Log before deleting (cascade will remove the log too, so log to admin company)
    const adminProfile = await getCachedUserProfile(user.id);
    const adminCompanyId = adminProfile?.memberships?.[0]?.company_id;
    if (adminCompanyId) {
      await insertAudit(adminClient, adminCompanyId, user.id, user.email, ip, ua, "admin_delete_tenant", {
        deleted_company_id: companyId,
        deleted_company_name: company.name,
      });
    }

    const { error: deleteErr } = await adminClient
      .from("companies")
      .delete()
      .eq("id", companyId);
    if (deleteErr) throw new Error(deleteErr.message);

    return { success: true };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}

export async function toggleTenantRAG(
  companyId: string,
  enabled: boolean
): Promise<{ success: boolean; error?: string }> {
  try {
    await validateAdminSessionOrThrow();
    const user = await getUser();
    if (!user) throw new Error("Usuário não autenticado");
    const { ip, ua } = await getRequestMeta();
    const adminClient = createAdminClient();

    // RAG is plan-based but we can override via onboarding_applied_config
    const { data: company } = await adminClient
      .from("companies")
      .select("name, onboarding_applied_config")
      .eq("id", companyId)
      .single();

    const currentConfig = (company?.onboarding_applied_config as Record<string, unknown>) ?? {};
    const { error: updateErr } = await adminClient
      .from("companies")
      .update({
        onboarding_applied_config: { ...currentConfig, rag_override: enabled },
        updated_at: new Date().toISOString(),
      })
      .eq("id", companyId);
    if (updateErr) throw new Error(updateErr.message);

    await insertAudit(adminClient, companyId, user.id, user.email, ip, ua, "admin_toggle_rag", {
      company_name: company?.name,
      rag_enabled: enabled,
    });

    return { success: true };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}

export async function forceCompanyModel(
  companyId: string,
  model: string | null
): Promise<{ success: boolean; error?: string }> {
  try {
    await validateAdminSessionOrThrow();
    const user = await getUser();
    if (!user) throw new Error("Usuário não autenticado");
    const { ip, ua } = await getRequestMeta();
    const adminClient = createAdminClient();

    const { data: company } = await adminClient
      .from("companies")
      .select("name, onboarding_applied_config")
      .eq("id", companyId)
      .single();

    const currentConfig = (company?.onboarding_applied_config as Record<string, unknown>) ?? {};
    const newConfig = model
      ? { ...currentConfig, model_override: model }
      : Object.fromEntries(Object.entries(currentConfig).filter(([k]) => k !== "model_override"));

    const { error: updateErr } = await adminClient
      .from("companies")
      .update({ onboarding_applied_config: newConfig, updated_at: new Date().toISOString() })
      .eq("id", companyId);
    if (updateErr) throw new Error(updateErr.message);

    await insertAudit(adminClient, companyId, user.id, user.email, ip, ua, "admin_force_model", {
      company_name: company?.name,
      model_override: model,
    });

    return { success: true };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}
