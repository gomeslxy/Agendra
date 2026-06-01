// app/admin/actions.ts
"use server";

import { getUser, getCachedUserProfile } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  getRequestMeta,
  isAllowedAdminEmail,
  hasValidAdminCookie,
  computeAdminToken,
  checkAdminPassword,
  setAdminCookie,
  clearAdminCookie,
} from "@/lib/admin/auth";

// ── Core auth validation ─────────────────────────────────────────────────────

export async function validateAdminSessionOrThrow(): Promise<void> {
  const user = await getUser();
  if (!user) throw new Error("Acesso negado: não autenticado");

  if (!isAllowedAdminEmail(user.email)) {
    throw new Error("Acesso negado: privilégios insuficientes");
  }

  if (!(await hasValidAdminCookie())) {
    throw new Error("Acesso negado: sessão administrativa inválida ou expirada");
  }
}

// ── Login with rate limiting + fingerprint ───────────────────────────────────

export async function verifyAdminPassword(
  password: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const user = await getUser();
    if (!user) return { success: false, error: "Usuário não está logado no Supabase" };

    if (!isAllowedAdminEmail(user.email)) {
      return { success: false, error: "Privilégios insuficientes" };
    }

    const { ip, ua } = await getRequestMeta();
    const adminClient = createAdminClient();

    // Rate limit: block IP after 5 failures in 15 min. Fail CLOSED — a failed
    // count query must block, never silently allow (audit S3).
    const fifteenMinAgo = new Date(Date.now() - 15 * 60 * 1000).toISOString();
    const { count: recentFailures, error: rlErr } = await adminClient
      .from("admin_login_attempts")
      .select("id", { count: "exact", head: true })
      .eq("ip_address", ip)
      .eq("success", false)
      .gte("attempted_at", fifteenMinAgo);

    if (rlErr) {
      return { success: false, error: "Falha ao verificar limite de tentativas. Tente novamente." };
    }
    if ((recentFailures ?? 99) >= 5) {
      return {
        success: false,
        error: "IP bloqueado por excesso de tentativas. Aguarde 15 minutos.",
      };
    }

    const profile = await getCachedUserProfile(user.id);
    const companyId = profile?.memberships?.[0]?.company_id;

    // Record attempt before checking password (prevents timing oracle)
    const isCorrect = checkAdminPassword(password);
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

    await setAdminCookie();

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
  await clearAdminCookie();
}

// ── Shared audit helper ──────────────────────────────────────────────────────
// Logs are written under the ADMIN's own company_id (not the target tenant) so
// the audit trail survives a tenant deletion (cascade). The target tenant is
// recorded inside the payload as `target_company_id` (audit fix).

async function insertAudit(
  adminClient: ReturnType<typeof createAdminClient>,
  targetCompanyId: string,
  userId: string,
  email: string | undefined,
  ip: string,
  ua: string,
  action: string,
  payload: object
) {
  let auditCompanyId = targetCompanyId;
  try {
    const adminProfile = await getCachedUserProfile(userId);
    const adminCompanyId = adminProfile?.memberships?.[0]?.company_id;
    if (adminCompanyId) auditCompanyId = adminCompanyId;
  } catch {
    /* fall back to target company if admin company can't be resolved */
  }
  await adminClient.from("audit_logs").insert({
    company_id: auditCompanyId,
    user_id: userId,
    actor_email: email ?? "admin@agendra.site",
    action,
    ip_address: ip,
    user_agent: ua,
    payload: { ...payload, target_company_id: targetCompanyId },
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

    // Log before deleting. insertAudit writes under the admin's own company, so
    // the record survives the tenant cascade.
    await insertAudit(adminClient, companyId, user.id, user.email, ip, ua, "admin_delete_tenant", {
      deleted_company_id: companyId,
      deleted_company_name: company.name,
    });

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

// ── Debug actions ────────────────────────────────────────────────────────────

export async function checkEnvHealth(): Promise<{
  success: boolean;
  envs?: { name: string; set: boolean; note?: string }[];
  error?: string;
}> {
  try {
    await validateAdminSessionOrThrow();
    const required = [
      { name: "NEXT_PUBLIC_SUPABASE_URL",     note: "Supabase project URL" },
      { name: "NEXT_PUBLIC_SUPABASE_ANON_KEY",note: "Supabase anon key" },
      { name: "SUPABASE_SERVICE_ROLE_KEY",     note: "Service role key (admin)" },
      { name: "ADMIN_PASSWORD_HASH",           note: "Admin panel password hash" },
      { name: "ADMIN_COOKIE_SECRET",           note: "Cookie signing secret" },
      { name: "NEXT_PUBLIC_APP_URL",           note: "App base URL" },
      { name: "GEMINI_API_KEY",               note: "Google Gemini AI" },
      { name: "GROQ_API_KEY",                 note: "Groq AI (fallback)" },
      { name: "UPSTASH_REDIS_REST_URL",        note: "Redis/debounce" },
      { name: "UPSTASH_REDIS_REST_TOKEN",      note: "Redis auth" },
      { name: "STRIPE_SECRET_KEY",             note: "Stripe payments" },
      { name: "STRIPE_WEBHOOK_SECRET",         note: "Stripe webhooks" },
      { name: "NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY", note: "Stripe frontend" },
      { name: "EVOLUTION_API_URL",             note: "WhatsApp Evolution API" },
      { name: "EVOLUTION_API_KEY",             note: "Evolution API auth" },
    ];
    const envs = required.map((e) => ({ ...e, set: !!process.env[e.name] }));
    return { success: true, envs };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}

export async function inspectLeadByPhone(
  companyId: string,
  phone: string
): Promise<{
  success: boolean;
  lead?: Record<string, unknown>;
  messages?: Record<string, unknown>[];
  stuckMessages?: Record<string, unknown>[];
  error?: string;
}> {
  try {
    await validateAdminSessionOrThrow();
    const adminClient = createAdminClient();

    const { data: lead, error: leadErr } = await adminClient
      .from("leads")
      .select("id, name, phone, email, status, intent, lead_score, is_processing, created_at, last_message_at, updated_at, company_id")
      .eq("company_id", companyId)
      .eq("phone", phone)
      .single();
    if (leadErr || !lead) throw new Error(leadErr?.message || "Lead não encontrado");

    const [{ data: messages }, { data: stuckMessages }] = await Promise.all([
      adminClient
        .from("messages")
        .select("id, role, content, created_at, metadata")
        .eq("lead_id", lead.id)
        .eq("company_id", companyId)
        .order("created_at", { ascending: false })
        .limit(20),
      adminClient
        .from("processed_messages")
        .select("provider_message_id, status, created_at")
        .eq("lead_id", lead.id)
        .eq("company_id", companyId)
        .eq("status", "processing"),
    ]);

    return {
      success: true,
      lead: lead as unknown as Record<string, unknown>,
      messages: (messages ?? []) as unknown as Record<string, unknown>[],
      stuckMessages: (stuckMessages ?? []) as unknown as Record<string, unknown>[],
    };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}

export async function getLatestMigrations(): Promise<{
  success: boolean;
  migrations?: { name: string; executed_at: string }[];
  error?: string;
}> {
  try {
    await validateAdminSessionOrThrow();
    const adminClient = createAdminClient();

    const { data, error } = await adminClient
      .from("schema_migrations")
      .select("name, executed_at")
      .order("executed_at", { ascending: false })
      .limit(30);
    if (error) throw new Error(error.message);

    return { success: true, migrations: (data ?? []) as { name: string; executed_at: string }[] };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}

export async function getCompanyChannelDetails(
  companyId: string
): Promise<{
  success: boolean;
  channels?: Record<string, unknown>[];
  error?: string;
}> {
  try {
    await validateAdminSessionOrThrow();
    const adminClient = createAdminClient();

    const { data, error } = await adminClient
      .from("channels")
      .select("id, provider, status, display_name, phone_number, last_error, created_at, updated_at")
      .eq("company_id", companyId)
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);

    return { success: true, channels: (data ?? []) as unknown as Record<string, unknown>[] };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}

export async function getCompanyQuotaStatus(
  companyId: string
): Promise<{
  success: boolean;
  quota?: {
    lead_count: number;
    message_count: number;
    extra_leads: number;
    plan_type: string;
    plan_max_leads: number;
  };
  error?: string;
}> {
  try {
    await validateAdminSessionOrThrow();
    const adminClient = createAdminClient();

    const [
      { count: leadCount },
      { count: msgCount },
      { data: company },
    ] = await Promise.all([
      adminClient.from("leads").select("id", { count: "exact", head: true }).eq("company_id", companyId),
      adminClient.from("messages").select("id", { count: "exact", head: true }).eq("company_id", companyId),
      adminClient.from("companies").select("plan_type, extra_leads").eq("id", companyId).single(),
    ]);

    if (!company) throw new Error("Empresa não encontrada");

    const PLAN_MAX: Record<string, number> = { trial: 50, starter: 500, pro: 2000, business: 10000 };
    const planMax = PLAN_MAX[company.plan_type ?? "trial"] ?? 50;

    return {
      success: true,
      quota: {
        lead_count: leadCount ?? 0,
        message_count: msgCount ?? 0,
        extra_leads: (company.extra_leads as number) ?? 0,
        plan_type: company.plan_type ?? "trial",
        plan_max_leads: planMax + ((company.extra_leads as number) ?? 0),
      },
    };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}

export async function forceBypassOnboarding(
  companyId: string
): Promise<{ success: boolean; link?: string; error?: string }> {
  try {
    await validateAdminSessionOrThrow();
    const user = await getUser();
    if (!user) throw new Error("Usuário não autenticado");
    const { ip, ua } = await getRequestMeta();
    const adminClient = createAdminClient();

    // Reset onboarding so layout won't redirect to /inbox
    const { error: updateErr } = await adminClient
      .from("companies")
      .update({
        onboarding_status: "not_started",
        onboarding_step: 0,
        updated_at: new Date().toISOString(),
      })
      .eq("id", companyId);
    if (updateErr) throw new Error(updateErr.message);

    // Magic link pointing to /onboarding
    const { data: membership, error: memErr } = await adminClient
      .from("memberships")
      .select("user_id, users(email)")
      .eq("company_id", companyId)
      .eq("role", "owner")
      .single();
    if (memErr || !membership) throw new Error("Owner não encontrado");

    const ownerEmail = (membership.users as any)?.email as string;
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
      .eq("id", companyId)
      .single();

    await insertAudit(adminClient, companyId, user.id, user.email, ip, ua, "admin_bypass_onboarding", {
      company_name: company?.name,
      target_email: ownerEmail,
    });

    return { success: true, link: data.properties.action_link };
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
