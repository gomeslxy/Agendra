"use server";

import { z } from "zod";
import { getUser } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { invalidateUsageCache } from "@/lib/billing/limits";
import { getPlanLimits } from "@/lib/billing/plans";
import { getRequestMeta } from "@/lib/admin/auth";
import { validateAdminSessionOrThrow } from "./auth.actions";
import { getErrorMessage, insertAudit } from "./_shared";

const CompanyIdSchema = z.string().trim().min(1, "companyId inválido").max(128);
const ExtendLimitSchema = z.object({
  companyId: CompanyIdSchema,
  extra: z.number().int().min(1).max(100_000),
});
const InjectTestSchema = z.object({
  companyId: CompanyIdSchema,
  message: z.string().min(1).max(4096),
  phone: z.string().min(4).max(64),
});

export async function extendTenantMessageLimit(
  companyId: string,
  extra: number,
): Promise<{ success: boolean; error?: string }> {
  try {
    await validateAdminSessionOrThrow();
    const parsed = ExtendLimitSchema.safeParse({ companyId, extra });
    if (!parsed.success) throw new Error("Parâmetros inválidos para extensão de limite");

    const user = await getUser();
    if (!user) throw new Error("Usuário não autenticado");
    const { ip, ua } = await getRequestMeta();
    const adminClient = createAdminClient();

    const { data: company, error: getErr } = await adminClient
      .from("companies")
      .select("name, extra_leads")
      .eq("id", parsed.data.companyId)
      .single();
    if (getErr || !company) throw new Error("Empresa não encontrada");

    const prevExtra = (company.extra_leads as number) ?? 0;
    const newExtra = prevExtra + parsed.data.extra;

    const { error: updateErr } = await adminClient
      .from("companies")
      .update({ extra_leads: newExtra, updated_at: new Date().toISOString() })
      .eq("id", parsed.data.companyId);
    if (updateErr) throw new Error(updateErr.message);

    await invalidateUsageCache(parsed.data.companyId);

    await insertAudit(
      adminClient,
      parsed.data.companyId,
      user.id,
      user.email,
      ip,
      ua,
      "admin_extend_limit",
      {
        company_name: company.name,
        added: parsed.data.extra,
        prev_extra: prevExtra,
        new_extra: newExtra,
      },
    );

    return { success: true };
  } catch (err: unknown) {
    return { success: false, error: getErrorMessage(err) };
  }
}

export async function getCompanyChannelDetails(companyId: string): Promise<{
  success: boolean;
  channels?: Record<string, unknown>[];
  error?: string;
}> {
  try {
    await validateAdminSessionOrThrow();
    const parsed = CompanyIdSchema.safeParse(companyId);
    if (!parsed.success) throw new Error("companyId inválido");

    const adminClient = createAdminClient();
    const { data, error } = await adminClient
      .from("channels")
      .select(
        "id, provider, status, display_name, phone, provider_id, last_error, created_at, updated_at",
      )
      .eq("company_id", parsed.data)
      .order("created_at", { ascending: false });

    if (error) throw new Error(error.message);
    return { success: true, channels: (data ?? []) as Record<string, unknown>[] };
  } catch (err: unknown) {
    return { success: false, error: getErrorMessage(err) };
  }
}

export async function getCompanyQuotaStatus(companyId: string): Promise<{
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
    const parsed = CompanyIdSchema.safeParse(companyId);
    if (!parsed.success) throw new Error("companyId inválido");

    const adminClient = createAdminClient();
    const [{ count: leadCount }, { count: msgCount }, { data: company }] = await Promise.all([
      adminClient
        .from("leads")
        .select("id", { count: "exact", head: true })
        .eq("company_id", parsed.data),
      adminClient
        .from("messages")
        .select("id", { count: "exact", head: true })
        .eq("company_id", parsed.data),
      adminClient
        .from("companies")
        .select("plan_type, extra_leads")
        .eq("id", parsed.data)
        .single(),
    ]);

    if (!company) throw new Error("Empresa não encontrada");

    const planType = (company.plan_type as string | null) ?? "trial";
    const planMax = getPlanLimits(planType).maxLeads;
    const extraLeads = (company.extra_leads as number) ?? 0;

    return {
      success: true,
      quota: {
        lead_count: leadCount ?? 0,
        message_count: msgCount ?? 0,
        extra_leads: extraLeads,
        plan_type: planType,
        plan_max_leads: planMax + extraLeads,
      },
    };
  } catch (err: unknown) {
    return { success: false, error: getErrorMessage(err) };
  }
}

export async function getTenantActivityTimeline(
  companyId: string,
): Promise<{ success: boolean; logs?: Record<string, unknown>[]; error?: string }> {
  try {
    await validateAdminSessionOrThrow();
    const parsed = CompanyIdSchema.safeParse(companyId);
    if (!parsed.success) throw new Error("companyId inválido");

    const { data, error } = await createAdminClient()
      .from("audit_logs")
      .select("id, actor_email, action, ip_address, user_agent, payload, created_at")
      .eq("company_id", parsed.data)
      .order("created_at", { ascending: false })
      .limit(30);

    if (error) throw new Error(error.message);
    return { success: true, logs: (data ?? []) as Record<string, unknown>[] };
  } catch (err: unknown) {
    return { success: false, error: getErrorMessage(err) };
  }
}

export async function getTenantStripeInvoices(
  companyId: string,
): Promise<{ success: boolean; invoices?: Record<string, unknown>[]; error?: string }> {
  try {
    await validateAdminSessionOrThrow();
    const parsed = CompanyIdSchema.safeParse(companyId);
    if (!parsed.success) throw new Error("companyId inválido");

    const { data, error } = await createAdminClient()
      .from("stripe_payment_events")
      .select("id, event_type, invoice_id, amount_cents, metadata, created_at")
      .eq("company_id", parsed.data)
      .order("created_at", { ascending: false });

    if (error) throw new Error(error.message);

    const invoices =
      data?.map((e) => ({
        id: e.id,
        invoice_id: e.invoice_id,
        event_type: e.event_type,
        amount: (e.amount_cents as number) / 100,
        hosted_invoice_url:
          ((e.metadata as Record<string, unknown> | null)?.hosted_invoice_url as string) || null,
        created_at: e.created_at,
      })) ?? [];

    return { success: true, invoices };
  } catch (err: unknown) {
    return { success: false, error: getErrorMessage(err) };
  }
}

export async function getTenantAuthLogs(
  companyId: string,
): Promise<{ success: boolean; logs?: Record<string, unknown>[]; error?: string }> {
  try {
    await validateAdminSessionOrThrow();
    const parsed = CompanyIdSchema.safeParse(companyId);
    if (!parsed.success) throw new Error("companyId inválido");

    const { data, error } = await createAdminClient()
      .from("audit_logs")
      .select("id, actor_email, action, ip_address, user_agent, created_at, payload")
      .eq("company_id", parsed.data)
      .in("action", [
        "admin_login_success",
        "admin_login_failed",
        "user_login_success",
        "user_login_failed",
        "login",
        "logout",
        "admin_generate_magic_link",
      ])
      .order("created_at", { ascending: false })
      .limit(30);

    if (error) throw new Error(error.message);
    return { success: true, logs: (data ?? []) as Record<string, unknown>[] };
  } catch (err: unknown) {
    return { success: false, error: getErrorMessage(err) };
  }
}

export async function getTenantDailyUsage(
  companyId: string,
): Promise<{ success: boolean; usage?: { day: string; count: number }[]; error?: string }> {
  try {
    await validateAdminSessionOrThrow();
    const parsed = CompanyIdSchema.safeParse(companyId);
    if (!parsed.success) throw new Error("companyId inválido");

    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
    const { data, error } = await createAdminClient()
      .from("messages")
      .select("created_at")
      .eq("company_id", parsed.data)
      .gte("created_at", thirtyDaysAgo);

    if (error) throw new Error(error.message);

    const groups: Record<string, number> = {};
    for (let i = 0; i < 30; i++) {
      const d = new Date(Date.now() - i * 24 * 60 * 60 * 1000);
      const dateStr = d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
      groups[dateStr] = 0;
    }

    data?.forEach((msg) => {
      const dateStr = new Date(msg.created_at as string).toLocaleDateString("pt-BR", {
        day: "2-digit",
        month: "2-digit",
      });
      if (groups[dateStr] !== undefined) {
        groups[dateStr]++;
      }
    });

    const usage = Object.entries(groups)
      .map(([day, count]) => ({ day, count }))
      .reverse();

    return { success: true, usage };
  } catch (err: unknown) {
    return { success: false, error: getErrorMessage(err) };
  }
}

export async function exportTenantDataCSV(
  companyId: string,
): Promise<{ success: boolean; csv?: string; error?: string }> {
  try {
    await validateAdminSessionOrThrow();
    const parsed = CompanyIdSchema.safeParse(companyId);
    if (!parsed.success) throw new Error("companyId inválido");

    const user = await getUser();
    if (!user) throw new Error("Usuário não autenticado");
    const { ip, ua } = await getRequestMeta();
    const adminClient = createAdminClient();

    const [{ data: leads }, { data: company }] = await Promise.all([
      adminClient
        .from("leads")
        .select("id, name, phone, email, status, created_at, last_message_at")
        .eq("company_id", parsed.data)
        .order("created_at", { ascending: false })
        .limit(5000),
      adminClient.from("companies").select("name").eq("id", parsed.data).single(),
    ]);

    if (!leads) throw new Error("Falha ao buscar leads da empresa");

    const csvCell = (v: unknown): string => {
      let s = v == null ? "" : String(v);
      if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
      return `"${s.replace(/"/g, '""')}"`;
    };
    const header = "id,name,phone,email,status,created_at,last_message_at";
    const rows = leads.map((l) =>
      [l.id, l.name, l.phone, l.email, l.status, l.created_at, l.last_message_at]
        .map(csvCell)
        .join(","),
    );
    const csv = [header, ...rows].join("\n");

    await insertAudit(adminClient, parsed.data, user.id, user.email, ip, ua, "admin_export_csv", {
      company_name: company?.name,
      rows_exported: leads.length,
    });

    return { success: true, csv };
  } catch (err: unknown) {
    return { success: false, error: getErrorMessage(err) };
  }
}

export async function injectTestMessage(
  companyId: string,
  message: string,
  phone: string,
): Promise<{ success: boolean; error?: string }> {
  try {
    await validateAdminSessionOrThrow();
    const parsed = InjectTestSchema.safeParse({ companyId, message, phone });
    if (!parsed.success) throw new Error("Parâmetros inválidos");

    const user = await getUser();
    if (!user) throw new Error("Usuário não autenticado");
    const { ip, ua } = await getRequestMeta();
    const adminClient = createAdminClient();

    const { data: lead, error: leadErr } = await adminClient
      .from("leads")
      .select("id, name")
      .eq("company_id", parsed.data.companyId)
      .eq("phone", parsed.data.phone)
      .single();
    if (leadErr || !lead) throw new Error(`Lead com telefone ${parsed.data.phone} não encontrado`);

    const { data: channel, error: chanErr } = await adminClient
      .from("channels")
      .select("id")
      .eq("company_id", parsed.data.companyId)
      .eq("status", "active")
      .limit(1)
      .single();
    if (chanErr || !channel) throw new Error("Nenhum canal ativo encontrado para injetar mensagem");

    const { error: msgErr } = await adminClient.from("messages").insert({
      company_id: parsed.data.companyId,
      lead_id: lead.id,
      channel_id: channel.id,
      content: parsed.data.message,
      role: "user",
      metadata: { injected_by_admin: true, injected_at: new Date().toISOString() },
    });
    if (msgErr) throw new Error(msgErr.message);

    const { data: company } = await adminClient
      .from("companies")
      .select("name")
      .eq("id", parsed.data.companyId)
      .single();

    await insertAudit(
      adminClient,
      parsed.data.companyId,
      user.id,
      user.email,
      ip,
      ua,
      "admin_inject_message",
      {
        company_name: company?.name,
        lead_id: lead.id,
        lead_name: lead.name,
        message_preview: parsed.data.message.substring(0, 100),
      },
    );

    return { success: true };
  } catch (err: unknown) {
    return { success: false, error: getErrorMessage(err) };
  }
}
