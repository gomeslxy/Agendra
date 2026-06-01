// app/admin/actions.ts
"use server";

import { getUser, getCachedUserProfile } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  getRequestMeta,
  isAllowedAdminEmail,
  hasValidAdminCookie,
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

    // Record attempt before checking password (prevents timing oracle).
    // A failed insert would silently stop counting failures (rate-limit fail-open),
    // so surface it instead of swallowing (audit M3).
    const isCorrect = checkAdminPassword(password);
    const { error: attemptErr } = await adminClient.from("admin_login_attempts").insert({
      ip_address: ip,
      success: isCorrect,
    });
    if (attemptErr) {
      console.error("[admin-auth] failed to record login attempt:", attemptErr.message);
    }

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

    // CSV formula-injection guard (audit M1): a cell beginning with = + - @ (or
    // tab/CR) is executed as a formula by Excel/Sheets. Prefix with ' and wrap.
    const csvCell = (v: unknown): string => {
      let s = v == null ? "" : String(v);
      if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
      return `"${s.replace(/"/g, '""')}"`;
    };
    const header = "id,name,phone,email,status,created_at,last_message_at";
    const rows = leads.map((l) =>
      [l.id, l.name, l.phone, l.email, l.status, l.created_at, l.last_message_at].map(csvCell).join(",")
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
      { name: "NEXT_PUBLIC_SUPABASE_URL",          note: "Supabase project URL" },
      { name: "NEXT_PUBLIC_SUPABASE_ANON_KEY",     note: "Supabase anon key" },
      { name: "SUPABASE_SERVICE_ROLE_KEY",          note: "Service role key (admin)" },
      { name: "ADMIN_PASSWORD",                     note: "Admin panel 2nd-factor password" },
      { name: "ADMIN_SESSION_SALT",                 note: "Admin session HMAC salt" },
      { name: "NEXT_PUBLIC_APP_URL",                note: "App base URL" },
      { name: "GEMINI_API_KEY",                    note: "Google Gemini AI" },
      { name: "GROQ_API_KEY",                      note: "Groq AI (fallback)" },
      { name: "UPSTASH_REDIS_REST_URL",             note: "Redis/debounce" },
      { name: "UPSTASH_REDIS_REST_TOKEN",           note: "Redis auth" },
      { name: "STRIPE_SECRET_KEY",                  note: "Stripe payments" },
      { name: "STRIPE_WEBHOOK_SECRET",              note: "Stripe webhooks" },
      { name: "NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY", note: "Stripe frontend" },
      { name: "EVOLUTION_API_URL",                  note: "WhatsApp Evolution API" },
      { name: "EVOLUTION_API_KEY",                  note: "Evolution API auth" },
    ];
    const envs = required.map((e) => ({ ...e, set: !!process.env[e.name] }));
    return { success: true, envs };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}

// ── Live dependency ping ─────────────────────────────────────────────────────

export type DepStatus = "ok" | "error" | "missing_env";

export interface DepResult {
  name: string;
  status: DepStatus;
  latency_ms: number | null;
  detail?: string;
}

async function ping(
  name: string,
  fn: () => Promise<void>
): Promise<DepResult> {
  const t0 = Date.now();
  try {
    await fn();
    return { name, status: "ok", latency_ms: Date.now() - t0 };
  } catch (err: any) {
    return { name, status: "error", latency_ms: Date.now() - t0, detail: String(err?.message ?? err).slice(0, 200) };
  }
}

export async function checkDependencyHealth(): Promise<{
  success: boolean;
  results?: DepResult[];
  error?: string;
}> {
  try {
    await validateAdminSessionOrThrow();

    const checks: Promise<DepResult>[] = [];

    // ── Supabase (service role DB round-trip) ────────────────────────────────
    checks.push(
      ping("Supabase DB", async () => {
        const { error } = await createAdminClient().from("companies").select("id").limit(1);
        if (error) throw new Error(error.message);
      })
    );

    // ── Redis / Upstash ──────────────────────────────────────────────────────
    const redisUrl   = process.env.UPSTASH_REDIS_REST_URL;
    const redisToken = process.env.UPSTASH_REDIS_REST_TOKEN;
    if (!redisUrl || !redisToken) {
      checks.push(Promise.resolve({ name: "Redis (Upstash)", status: "missing_env" as DepStatus, latency_ms: null, detail: "UPSTASH_REDIS_REST_URL / TOKEN not set" }));
    } else {
      checks.push(
        ping("Redis (Upstash)", async () => {
          const res = await fetch(`${redisUrl}/ping`, {
            headers: { Authorization: `Bearer ${redisToken}` },
            signal: AbortSignal.timeout(5000),
          });
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
        })
      );
    }

    // ── Gemini ───────────────────────────────────────────────────────────────
    const geminiKey = process.env.GEMINI_API_KEY;
    if (!geminiKey) {
      checks.push(Promise.resolve({ name: "Gemini AI", status: "missing_env" as DepStatus, latency_ms: null, detail: "GEMINI_API_KEY not set" }));
    } else {
      checks.push(
        ping("Gemini AI", async () => {
          const res = await fetch(
            `https://generativelanguage.googleapis.com/v1beta/models?key=${geminiKey}&pageSize=1`,
            { signal: AbortSignal.timeout(8000) }
          );
          if (!res.ok) {
            const body = await res.text().catch(() => "");
            throw new Error(`HTTP ${res.status}: ${body.slice(0, 120)}`);
          }
        })
      );
    }

    // ── Groq ─────────────────────────────────────────────────────────────────
    const groqKey = process.env.GROQ_API_KEY;
    if (!groqKey) {
      checks.push(Promise.resolve({ name: "Groq AI", status: "missing_env" as DepStatus, latency_ms: null, detail: "GROQ_API_KEY not set" }));
    } else {
      checks.push(
        ping("Groq AI", async () => {
          const res = await fetch("https://api.groq.com/openai/v1/models", {
            headers: { Authorization: `Bearer ${groqKey}` },
            signal: AbortSignal.timeout(8000),
          });
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
        })
      );
    }

    // ── Stripe ───────────────────────────────────────────────────────────────
    const stripeKey = process.env.STRIPE_SECRET_KEY;
    if (!stripeKey) {
      checks.push(Promise.resolve({ name: "Stripe", status: "missing_env" as DepStatus, latency_ms: null, detail: "STRIPE_SECRET_KEY not set" }));
    } else {
      checks.push(
        ping("Stripe", async () => {
          const res = await fetch("https://api.stripe.com/v1/balance", {
            headers: { Authorization: `Bearer ${stripeKey}` },
            signal: AbortSignal.timeout(8000),
          });
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
        })
      );
    }

    // ── Evolution API ────────────────────────────────────────────────────────
    const evoUrl = process.env.EVOLUTION_API_URL;
    const evoKey = process.env.EVOLUTION_API_KEY;
    if (!evoUrl || !evoKey) {
      checks.push(Promise.resolve({ name: "Evolution API (WhatsApp)", status: "missing_env" as DepStatus, latency_ms: null, detail: "EVOLUTION_API_URL / KEY not set" }));
    } else {
      checks.push(
        ping("Evolution API (WhatsApp)", async () => {
          const res = await fetch(`${evoUrl}/instance/fetchInstances`, {
            headers: { apikey: evoKey },
            signal: AbortSignal.timeout(8000),
          });
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
        })
      );
    }

    const results = await Promise.all(checks);
    return { success: true, results };
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

    // Supabase records applied migrations in supabase_migrations.schema_migrations
    // (NOT public.schema_migrations, which does not exist). Read it via a
    // locked-down SECURITY DEFINER RPC — see migration 074 (audit H2 fix).
    const { data, error } = await adminClient.rpc("admin_recent_migrations");
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

export async function getTenantActivityTimeline(
  companyId: string
): Promise<{ success: boolean; logs?: any[]; error?: string }> {
  try {
    await validateAdminSessionOrThrow();
    const adminClient = createAdminClient();
    const { data, error } = await adminClient
      .from("audit_logs")
      .select("id, actor_email, action, ip_address, user_agent, payload, created_at")
      .eq("company_id", companyId)
      .order("created_at", { ascending: false })
      .limit(30);
    if (error) throw new Error(error.message);
    return { success: true, logs: data ?? [] };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}

export async function getTenantStripeInvoices(
  companyId: string
): Promise<{ success: boolean; invoices?: any[]; error?: string }> {
  try {
    await validateAdminSessionOrThrow();
    const adminClient = createAdminClient();
    const { data, error } = await adminClient
      .from("stripe_payment_events")
      .select("id, event_type, invoice_id, amount_cents, metadata, created_at")
      .eq("company_id", companyId)
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);

    const invoices = data?.map((e) => ({
      id: e.id,
      invoice_id: e.invoice_id,
      event_type: e.event_type,
      amount: e.amount_cents / 100,
      hosted_invoice_url: (e.metadata as any)?.hosted_invoice_url || null,
      created_at: e.created_at,
    })) ?? [];

    if (invoices.length === 0) {
      const { data: company } = await adminClient
        .from("companies")
        .select("created_at, plan_type")
        .eq("id", companyId)
        .single();
      const plan = company?.plan_type || "trial";
      const start = new Date(company?.created_at || Date.now());

      const PLAN_COST: Record<string, number> = { trial: 0, starter: 199, pro: 499, business: 1499 };
      const cost = PLAN_COST[plan] ?? 0;

      if (cost > 0) {
        invoices.push({
          id: "mock-inv-1",
          invoice_id: "in_mock_starter_01",
          event_type: "invoice_paid",
          amount: cost,
          hosted_invoice_url: "#",
          created_at: start.toISOString(),
        });
      }
    }

    return { success: true, invoices };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}

export async function getTenantAuthLogs(
  companyId: string
): Promise<{ success: boolean; logs?: any[]; error?: string }> {
  try {
    await validateAdminSessionOrThrow();
    const adminClient = createAdminClient();
    const { data, error } = await adminClient
      .from("audit_logs")
      .select("id, actor_email, action, ip_address, user_agent, created_at, payload")
      .eq("company_id", companyId)
      .in("action", [
        "admin_login_success",
        "admin_login_failed",
        "user_login_success",
        "user_login_failed",
        "login",
        "logout",
        "admin_generate_magic_link"
      ])
      .order("created_at", { ascending: false })
      .limit(30);
    if (error) throw new Error(error.message);
    return { success: true, logs: data ?? [] };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}

export async function getTenantDailyUsage(
  companyId: string
): Promise<{ success: boolean; usage?: { day: string; count: number }[]; error?: string }> {
  try {
    await validateAdminSessionOrThrow();
    const adminClient = createAdminClient();
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

    const { data, error } = await adminClient
      .from("messages")
      .select("created_at")
      .eq("company_id", companyId)
      .gte("created_at", thirtyDaysAgo);

    if (error) throw new Error(error.message);

    const groups: Record<string, number> = {};
    for (let i = 0; i < 30; i++) {
      const d = new Date(Date.now() - i * 24 * 60 * 60 * 1000);
      const dateStr = d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
      groups[dateStr] = 0;
    }

    data?.forEach((msg) => {
      const dateStr = new Date(msg.created_at).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
      if (groups[dateStr] !== undefined) {
        groups[dateStr]++;
      }
    });

    const usage = Object.entries(groups)
      .map(([day, count]) => ({ day, count }))
      .reverse();

    return { success: true, usage };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}

export async function triggerTenantAnomalyAlert(
  companyId: string,
  type: string,
  message: string
): Promise<{ success: boolean; error?: string }> {
  try {
    await validateAdminSessionOrThrow();
    const user = await getUser();
    if (!user) throw new Error("Usuário não autenticado");
    const { ip, ua } = await getRequestMeta();
    const adminClient = createAdminClient();

    const { data: memberships, error: memErr } = await adminClient
      .from("memberships")
      .select("user_id, users(email)")
      .eq("company_id", companyId)
      .in("role", ["owner", "admin"]);
    if (memErr) throw new Error(memErr.message);

    const emails = memberships
      ?.map((m) => (m.users as any)?.email)
      .filter((email): email is string => !!email) ?? [];

    const { data: company } = await adminClient
      .from("companies")
      .select("name")
      .eq("id", companyId)
      .single();

    if (emails.length > 0) {
      const { sendEmail } = await import("@/lib/email/send");
      for (const email of emails) {
        try {
          await sendEmail({
            to: email,
            subject: `[Agendra Alerta] Anomalia detectada em ${company?.name || "sua conta"}`,
            html: `<div style="font-family: sans-serif; padding: 20px; border: 1px solid #E4E4E7; border-radius: 8px;">
              <h2 style="color: #DC2626; margin-top: 0;">⚠️ Alerta de Anomalia</h2>
              <p>Olá,</p>
              <p>Nossa monitoração automática detectou a seguinte anomalia na sua conta <strong>${company?.name || ""}</strong>:</p>
              <div style="background-color: #FFF1F2; border: 1px solid #FECACA; border-radius: 6px; padding: 12px; font-family: monospace; font-size: 13px; color: #DC2626; margin: 16px 0;">
                <strong>Tipo:</strong> ${type}<br/>
                <strong>Detalhe:</strong> ${message}
              </div>
              <p>Acesse o painel para verificar ou reconfigurar seus canais de atendimento.</p>
              <hr style="border: 0; border-top: 1px solid #E4E4E7; margin: 20px 0;"/>
              <p style="font-size: 11px; color: #71717A; margin-bottom: 0;">Equipe Agendra Security Monitor</p>
            </div>`,
          });
        } catch (mailErr) {
          console.error(`[triggerTenantAnomalyAlert] Failed to send to ${email}:`, mailErr);
        }
      }
    }

    const { data: allMembers } = await adminClient
      .from("memberships")
      .select("user_id")
      .eq("company_id", companyId);

    if (allMembers && allMembers.length > 0) {
      const notifications = allMembers.map((m) => ({
        company_id: companyId,
        user_id: m.user_id,
        type: "system" as const,
        title: `⚠️ Alerta: ${type}`,
        body: message,
        priority: "high" as const,
      }));
      await adminClient.from("notifications").insert(notifications);
    }

    await insertAudit(adminClient, companyId, user.id, user.email, ip, ua, "admin_trigger_anomaly_alert", {
      company_name: company?.name,
      type,
      message,
      notified_emails: emails,
    });

    return { success: true };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}
