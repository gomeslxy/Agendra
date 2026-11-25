"use server";

import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { requireTenantContext } from "@/lib/tenant/context";
import { revalidatePath } from "next/cache";
import { logAuditAction } from "@/lib/security/audit";

const AutomationConfigSchema = z.object({
  reminder_advance_hours: z
    .number()
    .int()
    .min(0, "reminder_advance_hours deve ser inteiro entre 0 e 48")
    .max(48, "reminder_advance_hours deve ser inteiro entre 0 e 48")
    .optional(),
  followup_delay_hours: z
    .number()
    .int()
    .min(1, "followup_delay_hours deve ser inteiro entre 1 e 168")
    .max(168, "followup_delay_hours deve ser inteiro entre 1 e 168")
    .optional(),
  followup_max_retries: z
    .number()
    .int()
    .min(0, "followup_max_retries deve ser inteiro entre 0 e 10")
    .max(10, "followup_max_retries deve ser inteiro entre 0 e 10")
    .optional(),
});

const ReactivationConfigSchema = z.object({
  reactivation_days: z
    .number()
    .int()
    .min(1, "reactivation_days deve ser inteiro entre 1 e 365")
    .max(365, "reactivation_days deve ser inteiro entre 1 e 365"),
  reactivation_hook: z.string().trim().max(1000, "reactivation_hook inválido (máx 1000 chars)"),
});

const timeRegex = /^([01]\d|2[0-3]):([0-5]\d)$/;

const UserNotificationSettingsSchema = z
  .object({
    email_enabled: z.boolean(),
    in_app_enabled: z.boolean(),
    whatsapp_enabled: z.boolean(),
    enabled_types: z.array(z.string()),
    quiet_hours_enabled: z.boolean(),
    quiet_hours_start: z.string(),
    quiet_hours_end: z.string(),
  })
  .refine(
    (s) =>
      !s.quiet_hours_enabled ||
      (timeRegex.test(s.quiet_hours_start) && timeRegex.test(s.quiet_hours_end)),
    { message: "Formato de horário silencioso inválido (use HH:MM)." },
  );

const CompanyReminderSettingsSchema = z
  .object({
    reminders_quiet_hours_enabled: z.boolean(),
    reminders_quiet_hours_start: z.string(),
    reminders_quiet_hours_end: z.string(),
  })
  .refine(
    (s) =>
      !s.reminders_quiet_hours_enabled ||
      (timeRegex.test(s.reminders_quiet_hours_start) &&
        timeRegex.test(s.reminders_quiet_hours_end)),
    { message: "Formato de horário silencioso inválido (use HH:MM)." },
  );

export async function saveAutomationConfig(data: {
  reminder_advance_hours?: number;
  followup_delay_hours?: number;
  followup_max_retries?: number;
}) {
  const { companyId } = await requireTenantContext({ requireAdmin: true });

  const parsed = AutomationConfigSchema.safeParse(data);
  if (!parsed.success) {
    throw new Error(parsed.error.issues[0]?.message ?? "Configuração inválida");
  }

  const supabase = await createClient();
  const { data: existing } = await supabase
    .from("companies")
    .select("persona_config")
    .eq("id", companyId)
    .single();

  const current = (existing?.persona_config ?? {}) as Record<string, unknown>;
  const patch: Record<string, unknown> = { ...current };
  if (parsed.data.reminder_advance_hours !== undefined) {
    patch.reminder_advance_hours = parsed.data.reminder_advance_hours;
  }
  if (parsed.data.followup_delay_hours !== undefined) {
    patch.followup_delay_hours = parsed.data.followup_delay_hours;
  }
  if (parsed.data.followup_max_retries !== undefined) {
    patch.followup_max_retries = parsed.data.followup_max_retries;
  }

  const { error } = await supabase
    .from("companies")
    .update({ persona_config: patch })
    .eq("id", companyId);
  if (error) throw new Error(error.message);

  await logAuditAction({
    action: "automation.update",
    companyId,
    payload: parsed.data,
  });

  revalidatePath("/settings");
}

export async function saveReactivationConfig(data: {
  reactivation_days: number;
  reactivation_hook: string;
}) {
  const { companyId } = await requireTenantContext({ requireAdmin: true });

  const parsed = ReactivationConfigSchema.safeParse(data);
  if (!parsed.success) {
    throw new Error(parsed.error.issues[0]?.message ?? "Configuração inválida");
  }

  const supabase = await createClient();
  const { data: existing } = await supabase
    .from("companies")
    .select("persona_config")
    .eq("id", companyId)
    .single();

  const current = (existing?.persona_config ?? {}) as Record<string, unknown>;

  const { error } = await supabase
    .from("companies")
    .update({
      persona_config: {
        ...current,
        reactivation_days: parsed.data.reactivation_days,
        reactivation_hook: parsed.data.reactivation_hook,
      },
    })
    .eq("id", companyId);

  if (error) throw new Error(error.message);

  await logAuditAction({
    action: "reactivation.update",
    companyId,
    payload: parsed.data,
  });

  revalidatePath("/settings");
}

export async function getUserNotificationSettings(companyId: string) {
  const validCompanyId = z.string().uuid().parse(companyId);
  const { userId } = await requireTenantContext({ targetCompanyId: validCompanyId });

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("user_notification_settings")
    .select("*")
    .eq("user_id", userId)
    .eq("company_id", validCompanyId)
    .maybeSingle();

  if (error) throw new Error(error.message);

  return (
    data || {
      user_id: userId,
      company_id: validCompanyId,
      email_enabled: true,
      in_app_enabled: true,
      whatsapp_enabled: false,
      enabled_types: [
        "invite",
        "member_joined",
        "member_left",
        "channel_error",
        "payment_failed",
        "lead_hot",
        "system",
      ],
      quiet_hours_enabled: false,
      quiet_hours_start: "22:00",
      quiet_hours_end: "08:00",
    }
  );
}

export async function saveUserNotificationSettings(
  companyId: string,
  settings: {
    email_enabled: boolean;
    in_app_enabled: boolean;
    whatsapp_enabled: boolean;
    enabled_types: string[];
    quiet_hours_enabled: boolean;
    quiet_hours_start: string;
    quiet_hours_end: string;
  },
) {
  const validCompanyId = z.string().uuid().parse(companyId);
  const { userId } = await requireTenantContext({ targetCompanyId: validCompanyId });
  const parsed = UserNotificationSettingsSchema.safeParse(settings);
  if (!parsed.success) {
    throw new Error(parsed.error.issues[0]?.message ?? "Configurações inválidas");
  }

  const supabase = await createClient();
  const { error } = await supabase.from("user_notification_settings").upsert(
    {
      user_id: userId,
      company_id: validCompanyId,
      ...parsed.data,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id,company_id" },
  );

  if (error) throw new Error(error.message);

  await logAuditAction({
    action: "user.notification_preferences_update",
    companyId: validCompanyId,
    payload: {
      email_enabled: parsed.data.email_enabled,
      in_app_enabled: parsed.data.in_app_enabled,
      quiet_hours_enabled: parsed.data.quiet_hours_enabled,
    },
  });

  revalidatePath("/settings");
  return { success: true };
}

export async function saveCompanyReminderSettings(
  companyId: string,
  settings: {
    reminders_quiet_hours_enabled: boolean;
    reminders_quiet_hours_start: string;
    reminders_quiet_hours_end: string;
  },
) {
  const validCompanyId = z.string().uuid().parse(companyId);
  await requireTenantContext({ requireAdmin: true, targetCompanyId: validCompanyId });

  const parsed = CompanyReminderSettingsSchema.safeParse(settings);
  if (!parsed.success) {
    throw new Error(parsed.error.issues[0]?.message ?? "Configurações inválidas");
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("companies")
    .update({
      ...parsed.data,
      updated_at: new Date().toISOString(),
    })
    .eq("id", validCompanyId);

  if (error) throw new Error(error.message);

  await logAuditAction({
    action: "company.reminders_quiet_hours_update",
    companyId: validCompanyId,
    payload: {
      reminders_quiet_hours_enabled: parsed.data.reminders_quiet_hours_enabled,
    },
  });

  revalidatePath("/settings");
  return { success: true };
}
