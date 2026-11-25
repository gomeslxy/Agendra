"use server";

import { z } from "zod";
import { getUser, getCachedUserProfile } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getRequestMeta } from "@/lib/admin/auth";
import { validateAdminSessionOrThrow } from "./auth.actions";
import {
  getErrorMessage,
  insertAudit,
  type CronJobStatus,
  type DepResult,
  type DepStatus,
} from "./_shared";

const InspectLeadSchema = z.object({
  companyId: z.string().trim().min(1, "companyId inválido").max(128),
  phone: z.string().min(4).max(64),
});

const UnlockLeadSchema = z.object({
  leadId: z.string().trim().min(1, "leadId inválido").max(128),
  companyId: z.string().trim().min(1, "companyId inválido").max(128),
});

const UnlockMsgSchema = z.object({
  messageId: z.string().min(1).max(200),
  companyId: z.string().trim().min(1, "companyId inválido").max(128),
});

async function ping(name: string, fn: () => Promise<void>): Promise<DepResult> {
  const t0 = Date.now();
  try {
    await fn();
    return { name, status: "ok", latency_ms: Date.now() - t0 };
  } catch (err: unknown) {
    return {
      name,
      status: "error",
      latency_ms: Date.now() - t0,
      detail: getErrorMessage(err).slice(0, 200),
    };
  }
}

export async function checkEnvHealth(): Promise<{
  success: boolean;
  envs?: { name: string; set: boolean; note?: string }[];
  error?: string;
}> {
  try {
    await validateAdminSessionOrThrow();
    const required = [
      { name: "NEXT_PUBLIC_SUPABASE_URL", note: "Supabase project URL" },
      { name: "NEXT_PUBLIC_SUPABASE_ANON_KEY", note: "Supabase anon key" },
      { name: "SUPABASE_SERVICE_ROLE_KEY", note: "Service role key (admin)" },
      { name: "ADMIN_PASSWORD", note: "Admin panel 2nd-factor password" },
      { name: "ADMIN_SESSION_SALT", note: "Admin session HMAC salt" },
      { name: "NEXT_PUBLIC_APP_URL", note: "App base URL" },
      { name: "GOOGLE_AI_API_KEY", note: "Google Gemini AI" },
      { name: "GROQ_API_KEY", note: "Groq AI (fallback)" },
      { name: "UPSTASH_REDIS_REST_URL", note: "Redis/debounce" },
      { name: "UPSTASH_REDIS_REST_TOKEN", note: "Redis auth" },
      { name: "STRIPE_SECRET_KEY", note: "Stripe payments" },
      { name: "STRIPE_WEBHOOK_SECRET", note: "Stripe webhooks" },
      { name: "NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY", note: "Stripe frontend" },
      { name: "WHATSAPP_APP_SECRET", note: "Meta App Secret" },
      { name: "WHATSAPP_VERIFY_TOKEN", note: "Meta Webhook Verify Token" },
    ];
    return { success: true, envs: required.map((e) => ({ ...e, set: Boolean(process.env[e.name]) })) };
  } catch (err: unknown) {
    return { success: false, error: getErrorMessage(err) };
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

    checks.push(
      ping("Supabase DB", async () => {
        const { error } = await createAdminClient().from("companies").select("id").limit(1);
        if (error) throw new Error(error.message);
      }),
    );

    const redisUrl = process.env.UPSTASH_REDIS_REST_URL;
    const redisToken = process.env.UPSTASH_REDIS_REST_TOKEN;
    if (!redisUrl || !redisToken) {
      checks.push(
        Promise.resolve({
          name: "Redis (Upstash)",
          status: "missing_env" as DepStatus,
          latency_ms: null,
          detail: "UPSTASH_REDIS_REST_URL / TOKEN not set",
        }),
      );
    } else {
      checks.push(
        ping("Redis (Upstash)", async () => {
          const res = await fetch(`${redisUrl}/ping`, {
            headers: { Authorization: `Bearer ${redisToken}` },
            signal: AbortSignal.timeout(5000),
          });
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
        }),
      );
    }

    const geminiKey = process.env.GOOGLE_AI_API_KEY;
    checks.push(
      !geminiKey
        ? Promise.resolve({
            name: "Gemini AI",
            status: "missing_env" as DepStatus,
            latency_ms: null,
            detail: "GOOGLE_AI_API_KEY not set",
          })
        : ping("Gemini AI", async () => {
            const res = await fetch(
              `https://generativelanguage.googleapis.com/v1beta/models?key=${geminiKey}&pageSize=1`,
              { signal: AbortSignal.timeout(8000) },
            );
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
          }),
    );

    const groqKey = process.env.GROQ_API_KEY;
    checks.push(
      !groqKey
        ? Promise.resolve({
            name: "Groq AI",
            status: "missing_env" as DepStatus,
            latency_ms: null,
            detail: "GROQ_API_KEY not set",
          })
        : ping("Groq AI", async () => {
            const res = await fetch("https://api.groq.com/openai/v1/models", {
              headers: { Authorization: `Bearer ${groqKey}` },
              signal: AbortSignal.timeout(8000),
            });
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
          }),
    );

    const stripeKey = process.env.STRIPE_SECRET_KEY;
    checks.push(
      !stripeKey
        ? Promise.resolve({
            name: "Stripe",
            status: "missing_env" as DepStatus,
            latency_ms: null,
            detail: "STRIPE_SECRET_KEY not set",
          })
        : ping("Stripe", async () => {
            const res = await fetch("https://api.stripe.com/v1/balance", {
              headers: { Authorization: `Bearer ${stripeKey}` },
              signal: AbortSignal.timeout(8000),
            });
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
          }),
    );

    const metaToken = process.env.WHATSAPP_TOKEN;
    checks.push(
      !metaToken
        ? Promise.resolve({
            name: "Meta WhatsApp API",
            status: "missing_env" as DepStatus,
            latency_ms: null,
            detail: "WHATSAPP_TOKEN not set",
          })
        : ping("Meta WhatsApp API", async () => {
            const res = await fetch("https://graph.facebook.com/v19.0/me", {
              headers: { Authorization: `Bearer ${metaToken}` },
              signal: AbortSignal.timeout(8000),
            });
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
          }),
    );

    return { success: true, results: await Promise.all(checks) };
  } catch (err: unknown) {
    return { success: false, error: getErrorMessage(err) };
  }
}

export async function inspectLeadByPhone(
  companyId: string,
  phone: string,
): Promise<{
  success: boolean;
  lead?: Record<string, unknown>;
  messages?: Record<string, unknown>[];
  stuckMessages?: Record<string, unknown>[];
  error?: string;
}> {
  try {
    await validateAdminSessionOrThrow();
    const parsed = InspectLeadSchema.safeParse({ companyId, phone });
    if (!parsed.success) throw new Error("Parâmetros inválidos para inspeção");

    const adminClient = createAdminClient();
    const { data: lead, error: leadErr } = await adminClient
      .from("leads")
      .select(
        "id, name, phone, email, status, heat_score, summary, lead_memory, is_processing, processing_started_at, created_at, last_message_at, updated_at, company_id",
      )
      .eq("company_id", parsed.data.companyId)
      .eq("phone", parsed.data.phone)
      .single();

    if (leadErr || !lead) throw new Error(leadErr?.message || "Lead não encontrado");

    const [{ data: messages }, { data: stuckMessages }] = await Promise.all([
      adminClient
        .from("messages")
        .select("id, role, content, created_at, metadata")
        .eq("lead_id", lead.id)
        .eq("company_id", parsed.data.companyId)
        .order("created_at", { ascending: false })
        .limit(20),
      adminClient
        .from("processed_messages")
        .select("provider_message_id, status, created_at")
        .eq("company_id", parsed.data.companyId)
        .eq("status", "processing")
        .or(`lead_id.eq.${lead.id},lead_id.is.null`),
    ]);

    return {
      success: true,
      lead: lead as Record<string, unknown>,
      messages: (messages ?? []) as Record<string, unknown>[],
      stuckMessages: (stuckMessages ?? []) as Record<string, unknown>[],
    };
  } catch (err: unknown) {
    return { success: false, error: getErrorMessage(err) };
  }
}

export async function getCronJobsHealth(): Promise<{
  success: boolean;
  jobs?: CronJobStatus[];
  error?: string;
}> {
  try {
    await validateAdminSessionOrThrow();
    const { data, error } = await createAdminClient().rpc("admin_cron_job_status");
    if (error) throw new Error(error.message);
    return { success: true, jobs: (data ?? []) as CronJobStatus[] };
  } catch (err: unknown) {
    return { success: false, error: getErrorMessage(err) };
  }
}

export async function forceUnlockStaleLead(
  leadId: string,
  companyId: string,
): Promise<{ success: boolean; error?: string }> {
  try {
    await validateAdminSessionOrThrow();
    const parsed = UnlockLeadSchema.safeParse({ leadId, companyId });
    if (!parsed.success) throw new Error("Parâmetros inválidos");

    const user = await getUser();
    if (!user) throw new Error("Usuário não autenticado");
    const { ip, ua } = await getRequestMeta();
    const adminClient = createAdminClient();

    const { error: updateErr } = await adminClient
      .from("leads")
      .update({
        is_processing: false,
        processing_started_at: null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", parsed.data.leadId)
      .eq("company_id", parsed.data.companyId);

    if (updateErr) throw new Error(updateErr.message);

    await insertAudit(
      adminClient,
      parsed.data.companyId,
      user.id,
      user.email,
      ip,
      ua,
      "admin_force_unlock_lead",
      { lead_id: parsed.data.leadId },
    );

    return { success: true };
  } catch (err: unknown) {
    return { success: false, error: getErrorMessage(err) };
  }
}

export async function forceUnlockAllStaleLeads(): Promise<{
  success: boolean;
  unlocked?: number;
  error?: string;
}> {
  try {
    await validateAdminSessionOrThrow();
    const user = await getUser();
    if (!user) throw new Error("Usuário não autenticado");
    const { ip, ua } = await getRequestMeta();
    const adminClient = createAdminClient();

    const staleThreshold = new Date(Date.now() - 5 * 60 * 1000).toISOString();
    const { data, error } = await adminClient
      .from("leads")
      .update({
        is_processing: false,
        processing_started_at: null,
        updated_at: new Date().toISOString(),
      })
      .eq("is_processing", true)
      .lt("processing_started_at", staleThreshold)
      .select("id");

    if (error) throw new Error(error.message);

    const unlocked = data?.length ?? 0;
    const { resolveProfileCompanyId } = await import("@/lib/supabase/server");
    const profile = await getCachedUserProfile(user.id);
    const companyId = await resolveProfileCompanyId(profile);
    if (companyId) {
      await adminClient.from("audit_logs").insert({
        company_id: companyId,
        user_id: user.id,
        actor_email: user.email,
        action: "admin_bulk_unlock_stale_leads",
        ip_address: ip,
        user_agent: ua,
        payload: { unlocked_count: unlocked },
      });
    }
    return { success: true, unlocked };
  } catch (err: unknown) {
    return { success: false, error: getErrorMessage(err) };
  }
}

export async function forceUnlockStaleMessage(
  messageId: string,
  companyId: string,
): Promise<{ success: boolean; error?: string }> {
  try {
    await validateAdminSessionOrThrow();
    const parsed = UnlockMsgSchema.safeParse({ messageId, companyId });
    if (!parsed.success) throw new Error("Parâmetros inválidos");

    const user = await getUser();
    if (!user) throw new Error("Usuário não autenticado");
    const { ip, ua } = await getRequestMeta();
    const adminClient = createAdminClient();

    const { error } = await adminClient
      .from("processed_messages")
      .update({ status: "error", error_message: "admin force-released via painel" })
      .eq("provider_message_id", parsed.data.messageId)
      .eq("company_id", parsed.data.companyId)
      .eq("status", "processing");

    if (error) throw new Error(error.message);

    await insertAudit(
      adminClient,
      parsed.data.companyId,
      user.id,
      user.email,
      ip,
      ua,
      "admin_force_unlock_message",
      { message_id: parsed.data.messageId },
    );
    return { success: true };
  } catch (err: unknown) {
    return { success: false, error: getErrorMessage(err) };
  }
}

export async function getLatestMigrations(): Promise<{
  success: boolean;
  migrations?: { name: string; executed_at: string }[];
  error?: string;
}> {
  try {
    await validateAdminSessionOrThrow();
    const { data, error } = await createAdminClient().rpc("admin_recent_migrations");
    if (error) throw new Error(error.message);
    return {
      success: true,
      migrations: (data ?? []) as { name: string; executed_at: string }[],
    };
  } catch (err: unknown) {
    return { success: false, error: getErrorMessage(err) };
  }
}

export async function searchAdminLeads(query: string): Promise<{
  success: boolean;
  leads?: Array<{
    id: string;
    name: string;
    phone: string;
    status: string;
    heat_score: number;
    company_id: string;
    companies?: { name: string } | null;
    created_at: string;
  }>;
  error?: string;
}> {
  try {
    await validateAdminSessionOrThrow();
    const cleanQuery = query.trim();
    if (!cleanQuery) return { success: true, leads: [] };

    const adminClient = createAdminClient();
    const { data, error } = await adminClient
      .from("leads")
      .select("id, name, phone, status, heat_score, company_id, companies(name), created_at")
      .or(`name.ilike.%${cleanQuery}%,phone.ilike.%${cleanQuery}%`)
      .order("created_at", { ascending: false })
      .limit(30);

    if (error) throw new Error(error.message);
    return {
      success: true,
      leads: (data ?? []) as unknown as Array<{
        id: string;
        name: string;
        phone: string;
        status: string;
        heat_score: number;
        company_id: string;
        companies?: { name: string } | null;
        created_at: string;
      }>,
    };
  } catch (err: unknown) {
    return { success: false, error: getErrorMessage(err) };
  }
}
